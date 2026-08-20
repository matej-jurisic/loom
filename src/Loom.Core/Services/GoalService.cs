using Microsoft.EntityFrameworkCore;
using Loom.Core.Common;
using Loom.Core.Data;
using Loom.Core.Dtos;
using Loom.Core.Entities;
using Loom.Core.Enums;

namespace Loom.Core.Services;

public class GoalService(LoomDbContext db, UserSettingsService settingsService)
{
    public async Task<Result<GoalDto>> CreateAsync(Guid userId, CreateGoalRequest req)
    {
        var err = Validators.ValidateTitle(req.Title, "Title");
        if (err is not null) return Result<GoalDto>.Fail(err);

        var goal = new Goal
        {
            UserId = userId,
            Title = req.Title.Trim(),
            Description = req.Description?.Trim(),
            Notes = req.Notes?.Trim(),
            Kind = req.Kind,
        };
        db.Goals.Add(goal);
        await db.SaveChangesAsync();
        return Result<GoalDto>.Success(GoalDto.FromEntity(goal));
    }

    public async Task<Result<GoalDto>> GetAsync(Guid id, Guid userId, DateTimeOffset? nowUtc = null)
    {
        var goal = await db.Goals
            .AsNoTracking()
            .Include(g => g.Checkpoints)
            .FirstOrDefaultAsync(g => g.Id == id && g.UserId == userId);
        if (goal is null) return Result<GoalDto>.Fail(new Error(ErrorType.NotFound, "Goal not found."));
        var progress = goal.Kind == GoalKind.ongoing
            ? await GetOngoingProgressAsync([goal.Id], userId, nowUtc ?? DateTimeOffset.UtcNow)
            : [];
        var lastAt = await GetLastOccurrenceAtAsync([goal.Id], userId);
        var p = progress.GetValueOrDefault(goal.Id);
        return Result<GoalDto>.Success(GoalDto.FromEntity(
            goal,
            p.Stats,
            lastAt.TryGetValue(goal.Id, out var lat) ? lat : null,
            p.Heatmap));
    }

    public async Task<List<GoalDto>> ListAsync(Guid userId, GoalStatus? status = null, DateTimeOffset? nowUtc = null)
    {
        var query = db.Goals
            .AsNoTracking()
            .Include(g => g.Checkpoints)
            .Where(g => g.UserId == userId);

        if (status.HasValue)
            query = query.Where(g => g.Status == status.Value);

        var goals = await query.ToListAsync();

        var ongoingIds = goals.Where(g => g.Kind == GoalKind.ongoing).Select(g => g.Id).ToList();
        var progress = ongoingIds.Count > 0
            ? await GetOngoingProgressAsync(ongoingIds, userId, nowUtc ?? DateTimeOffset.UtcNow)
            : [];

        var allGoalIds = goals.Select(g => g.Id).ToList();
        var lastAt = allGoalIds.Count > 0 ? await GetLastOccurrenceAtAsync(allGoalIds, userId) : [];

        return goals
            .OrderBy(g => g.Status)
            .ThenBy(g => g.CreatedAt)
            .Select(g =>
            {
                var p = progress.GetValueOrDefault(g.Id);
                return GoalDto.FromEntity(
                    g,
                    p.Stats,
                    lastAt.TryGetValue(g.Id, out var lat) ? lat : null,
                    p.Heatmap);
            })
            .ToList();
    }

    private async Task<Dictionary<Guid, DateTimeOffset>> GetLastOccurrenceAtAsync(List<Guid> goalIds, Guid userId)
    {
        var activityGoalMap = await db.Activities
            .Where(a => a.UserId == userId && a.GoalId != null && goalIds.Contains(a.GoalId.Value))
            .Select(a => new { a.Id, GoalId = a.GoalId!.Value })
            .ToListAsync();

        if (activityGoalMap.Count == 0) return [];

        var activityIds = activityGoalMap.Select(a => a.Id).ToList();
        var doneOccs = await db.Occurrences
            .Where(o => activityIds.Contains(o.ActivityId) && o.Status == EventStatus.done)
            .Select(o => new { o.ActivityId, o.StartAt, o.CreatedAt })
            .ToListAsync();

        var lookup = activityGoalMap.ToDictionary(a => a.Id, a => a.GoalId);
        var result = new Dictionary<Guid, DateTimeOffset>();

        foreach (var occ in doneOccs)
        {
            var goalId = lookup[occ.ActivityId];
            var at = occ.StartAt ?? occ.CreatedAt;
            if (!result.TryGetValue(goalId, out var current) || at > current)
                result[goalId] = at;
        }

        return result;
    }

    /// <summary>
    /// How wide the heatmap window is. 40 weeks covers the widest grid a goal card draws (39 columns,
    /// plus the part-week the first column starts in); narrow layouts render a suffix of the same
    /// window, so one payload serves every breakpoint.
    /// </summary>
    private const int HeatmapDays = 280;

    /// <summary>
    /// Lifetime done/skipped/pending counts and the trailing per-day history for ongoing goals, from
    /// one pass over their occurrences. Goals with no linked occurrence at all are absent from the
    /// result, so the card renders no progress section rather than an empty one.
    /// </summary>
    private async Task<Dictionary<Guid, (GoalOccurrenceStats? Stats, GoalHeatmap? Heatmap)>> GetOngoingProgressAsync(
        List<Guid> goalIds, Guid userId, DateTimeOffset nowUtc)
    {
        var activityGoalMap = await db.Activities
            .Where(a => a.UserId == userId && a.GoalId != null && goalIds.Contains(a.GoalId.Value))
            .Select(a => new { a.Id, GoalId = a.GoalId!.Value })
            .ToListAsync();

        if (activityGoalMap.Count == 0) return [];

        var activityIds = activityGoalMap.Select(a => a.Id).ToList();
        var rows = await db.Occurrences
            .AsNoTracking()
            .Where(o => activityIds.Contains(o.ActivityId))
            .Select(o => new { o.ActivityId, o.Status, o.StartAt })
            .ToListAsync();

        var ctx = await settingsService.GetDayContextAsync(userId);
        var today = DayMath.Today(ctx, nowUtc);
        var windowStart = today.AddDays(-(HeatmapDays - 1));

        var lookup = activityGoalMap.ToDictionary(a => a.Id, a => a.GoalId);
        var totals = new Dictionary<Guid, (int Done, int Skipped, int Pending)>();
        var byDay = new Dictionary<Guid, Dictionary<DateOnly, (int Done, int Skipped)>>();

        foreach (var row in rows)
        {
            var goalId = lookup[row.ActivityId];
            totals.TryAdd(goalId, (0, 0, 0));
            var cur = totals[goalId];
            totals[goalId] = row.Status switch
            {
                EventStatus.done    => cur with { Done    = cur.Done    + 1 },
                EventStatus.skipped => cur with { Skipped = cur.Skipped + 1 },
                _                   => cur with { Pending = cur.Pending + 1 },
            };

            // Only settled occurrences land on the grid, and a floating one lands on no day at all.
            if (row.Status == EventStatus.pending || row.StartAt is null) continue;
            var day = DayMath.DayOf(row.StartAt.Value, ctx);
            if (day < windowStart || day > today) continue;

            if (!byDay.TryGetValue(goalId, out var days)) byDay[goalId] = days = [];
            days.TryAdd(day, (0, 0));
            var d = days[day];
            days[day] = row.Status == EventStatus.done
                ? d with { Done = d.Done + 1 }
                : d with { Skipped = d.Skipped + 1 };
        }

        return totals.ToDictionary(
            kv => kv.Key,
            kv => ((GoalOccurrenceStats?)new GoalOccurrenceStats(kv.Value.Done, kv.Value.Skipped, kv.Value.Pending),
                   (GoalHeatmap?)new GoalHeatmap(windowStart, today, byDay.TryGetValue(kv.Key, out var days)
                       ? days.OrderBy(d => d.Key).Select(d => new GoalHeatmapDay(d.Key, d.Value.Done, d.Value.Skipped)).ToList()
                       : [])));
    }

    /// <summary>
    /// One combined heatmap across every activity linked to any goal, regardless of the goal's kind
    /// or status - "did I do something toward a goal today", not "did I do something toward this
    /// goal". Same 280-day window and day-bucketing as <see cref="GetOngoingProgressAsync"/>, just not
    /// split per goal. Used by the Daily Plan page rather than the goal cards.
    /// </summary>
    public async Task<GoalHeatmap> GetAggregateHeatmapAsync(Guid userId, DateTimeOffset nowUtc)
    {
        var ctx = await settingsService.GetDayContextAsync(userId);
        var today = DayMath.Today(ctx, nowUtc);
        var windowStart = today.AddDays(-(HeatmapDays - 1));

        var activityIds = await db.Activities
            .Where(a => a.UserId == userId && a.GoalId != null)
            .Select(a => a.Id)
            .ToListAsync();
        if (activityIds.Count == 0) return new GoalHeatmap(windowStart, today, []);

        // Pending occurrences never land on the grid, so filtering them out here (rather than after
        // the fetch, like GetOngoingProgressAsync does) keeps the row set down to what's settled.
        var rows = await db.Occurrences
            .AsNoTracking()
            .Where(o => activityIds.Contains(o.ActivityId) && o.Status != EventStatus.pending)
            .Select(o => new { o.Status, o.StartAt })
            .ToListAsync();

        var byDay = new Dictionary<DateOnly, (int Done, int Skipped)>();
        foreach (var row in rows)
        {
            if (row.StartAt is null) continue;
            var day = DayMath.DayOf(row.StartAt.Value, ctx);
            if (day < windowStart || day > today) continue;

            byDay.TryAdd(day, (0, 0));
            var d = byDay[day];
            byDay[day] = row.Status == EventStatus.done ? d with { Done = d.Done + 1 } : d with { Skipped = d.Skipped + 1 };
        }

        return new GoalHeatmap(windowStart, today,
            byDay.OrderBy(d => d.Key).Select(d => new GoalHeatmapDay(d.Key, d.Value.Done, d.Value.Skipped)).ToList());
    }

    public async Task<Result<GoalDto>> UpdateAsync(Guid id, Guid userId, UpdateGoalRequest req)
    {
        var err = Validators.ValidateTitle(req.Title, "Title");
        if (err is not null) return Result<GoalDto>.Fail(err);

        var goal = await db.Goals
            .Include(g => g.Checkpoints)
            .FirstOrDefaultAsync(g => g.Id == id && g.UserId == userId);
        if (goal is null) return Result<GoalDto>.Fail(new Error(ErrorType.NotFound, "Goal not found."));

        goal.Title = req.Title.Trim();
        goal.Description = req.Description?.Trim();
        goal.Notes = req.Notes?.Trim();
        goal.Kind = req.Kind;
        await db.SaveChangesAsync();
        return Result<GoalDto>.Success(GoalDto.FromEntity(goal));
    }

    public async Task<Result> DeleteAsync(Guid id, Guid userId)
    {
        var goal = await db.Goals.FirstOrDefaultAsync(g => g.Id == id && g.UserId == userId);
        if (goal is null) return Result.Fail(new Error(ErrorType.NotFound, "Goal not found."));
        db.Goals.Remove(goal);
        await db.SaveChangesAsync();
        return Result.Success();
    }

    public async Task<Result<GoalDto>> SetStatusAsync(Guid id, Guid userId, GoalStatus status)
    {
        var goal = await db.Goals
            .Include(g => g.Checkpoints)
            .FirstOrDefaultAsync(g => g.Id == id && g.UserId == userId);
        if (goal is null) return Result<GoalDto>.Fail(new Error(ErrorType.NotFound, "Goal not found."));

        if (status == GoalStatus.focus && goal.Status != GoalStatus.focus)
        {
            var settings = await settingsService.GetOrCreateAsync(userId);
            var focusCount = await db.Goals.CountAsync(g => g.UserId == userId && g.Status == GoalStatus.focus);
            if (focusCount >= settings.MaxFocusGoals)
                return Result<GoalDto>.Fail(new Error(ErrorType.Conflict,
                    $"Focus limit reached ({settings.MaxFocusGoals}). Move another goal out of Focus first."));
        }

        goal.Status = status;
        await db.SaveChangesAsync();
        return Result<GoalDto>.Success(GoalDto.FromEntity(goal));
    }
}
