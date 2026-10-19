using Microsoft.EntityFrameworkCore;
using Loom.Core.Common;
using Loom.Core.Data;
using Loom.Core.Dtos;
using Loom.Core.Entities;
using Loom.Core.Enums;

namespace Loom.Core.Services;

public class GoalService(LoomDbContext db, UserSettingsService settingsService)
{
    // Icon names are the client's (categoryIcons.tsx); the server only bounds the length, as for categories.
    private const int MaxIconLength = 50;

    public async Task<Result<GoalDto>> CreateAsync(Guid userId, CreateGoalRequest req)
    {
        var goal = new Goal { UserId = userId, Title = "" };
        var err = Apply(goal, req.Title, req.Description, req.Notes, req.Kind, req.EndDate, req.Color, req.Icon);
        if (err is not null) return Result<GoalDto>.Fail(err);
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
        var progress = await GetProgressAsync([goal.Id], userId, nowUtc ?? DateTimeOffset.UtcNow);
        var lastAt = await GetLastOccurrenceAtAsync([goal.Id], userId);
        var ctx = await settingsService.GetDayContextAsync(userId);
        var p = progress.GetValueOrDefault(goal.Id);
        DateTimeOffset? last = lastAt.TryGetValue(goal.Id, out var lat) ? lat : null;
        var now = nowUtc ?? DateTimeOffset.UtcNow;
        return Result<GoalDto>.Success(GoalDto.FromEntity(
            goal,
            p.Stats,
            last,
            p.Heatmap,
            DaysSince(last, ctx, now),
            DaysUntilEnd(goal, ctx, now)));
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

        var allGoalIds = goals.Select(g => g.Id).ToList();
        var progress = allGoalIds.Count > 0
            ? await GetProgressAsync(allGoalIds, userId, nowUtc ?? DateTimeOffset.UtcNow)
            : [];
        var lastAt = allGoalIds.Count > 0 ? await GetLastOccurrenceAtAsync(allGoalIds, userId) : [];
        var ctx = await settingsService.GetDayContextAsync(userId);
        var now = nowUtc ?? DateTimeOffset.UtcNow;

        // A goal past its end date sinks to the bottom of its status, still open until the user closes it.
        return goals
            .OrderBy(g => g.Status)
            .ThenBy(g => DaysUntilEnd(g, ctx, now) < 0)
            .ThenByDescending(g => lastAt.TryGetValue(g.Id, out var lat) ? lat : DateTimeOffset.MinValue)
            .ThenBy(g => g.CreatedAt)
            .Select(g =>
            {
                var p = progress.GetValueOrDefault(g.Id);
                DateTimeOffset? last = lastAt.TryGetValue(g.Id, out var lat) ? lat : null;
                return GoalDto.FromEntity(g, p.Stats, last, p.Heatmap, DaysSince(last, ctx, now), DaysUntilEnd(g, ctx, now));
            })
            .ToList();
    }

    private static int? DaysSince(DateTimeOffset? last, DayContext ctx, DateTimeOffset nowUtc) =>
        last is null ? null : Math.Max(0, DayMath.Today(ctx, nowUtc).DayNumber - DayMath.DayOf(last.Value, ctx).DayNumber);

    private static int? DaysUntilEnd(Goal g, DayContext ctx, DateTimeOffset nowUtc) =>
        g.EndDate is { } end ? end.DayNumber - DayMath.Today(ctx, nowUtc).DayNumber : null;

    private async Task<Dictionary<Guid, DateTimeOffset>> GetLastOccurrenceAtAsync(List<Guid> goalIds, Guid userId)
    {
        var activityGoalMap = await db.Activities
            .Where(a => a.UserId == userId)
            .SelectMany(a => a.Goals, (a, g) => new { a.Id, GoalId = g.Id })
            .Where(x => goalIds.Contains(x.GoalId))
            .ToListAsync();

        if (activityGoalMap.Count == 0) return [];

        var activityIds = activityGoalMap.Select(a => a.Id).Distinct().ToList();
        var doneOccs = await db.Occurrences
            .Where(o => activityIds.Contains(o.ActivityId) && o.Status == EventStatus.done)
            .Select(o => new { o.ActivityId, o.StartAt, o.CreatedAt })
            .ToListAsync();

        var lookup = activityGoalMap.ToLookup(a => a.Id, a => a.GoalId);
        var result = new Dictionary<Guid, DateTimeOffset>();

        foreach (var occ in doneOccs)
        {
            var at = occ.StartAt ?? occ.CreatedAt;
            foreach (var goalId in lookup[occ.ActivityId])
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
    /// Lifetime done/skipped/pending counts and the trailing per-day history for goals, from
    /// one pass over their occurrences. Goals with no linked occurrence at all are absent from the
    /// result, so the card renders no progress section rather than an empty one.
    /// </summary>
    private async Task<Dictionary<Guid, (GoalOccurrenceStats? Stats, GoalHeatmap? Heatmap)>> GetProgressAsync(
        List<Guid> goalIds, Guid userId, DateTimeOffset nowUtc)
    {
        var activityGoalMap = await db.Activities
            .Where(a => a.UserId == userId)
            .SelectMany(a => a.Goals, (a, g) => new { a.Id, GoalId = g.Id })
            .Where(x => goalIds.Contains(x.GoalId))
            .ToListAsync();

        if (activityGoalMap.Count == 0) return [];

        var activityIds = activityGoalMap.Select(a => a.Id).Distinct().ToList();
        var rows = await db.Occurrences
            .AsNoTracking()
            .Where(o => activityIds.Contains(o.ActivityId))
            .Select(o => new { o.ActivityId, o.Status, o.StartAt })
            .ToListAsync();

        var ctx = await settingsService.GetDayContextAsync(userId);
        var today = DayMath.Today(ctx, nowUtc);
        var windowStart = today.AddDays(-(HeatmapDays - 1));

        var lookup = activityGoalMap.ToLookup(a => a.Id, a => a.GoalId);
        var totals = new Dictionary<Guid, (int Done, int Skipped, int Pending)>();
        var byDay = new Dictionary<Guid, Dictionary<DateOnly, (int Done, int Skipped)>>();

        foreach (var row in rows)
        foreach (var goalId in lookup[row.ActivityId])
        {
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
    /// One combined heatmap across every activity linked to any goal, regardless of the goal's
    /// status - "did I do something toward a goal today", not "did I do something toward this
    /// goal". Tracks don't count: an activity linked only to tracks (a course's lectures) is routine,
    /// not goal work, and would otherwise fill the strip. Only <c>done</c> occurrences count: a skipped one isn't progress toward a goal, so unlike
    /// <see cref="GetProgressAsync"/>'s per-goal grid it never puts a day on this one. Same
    /// 280-day window and day-bucketing otherwise, just not split per goal. Used by the Daily Plan page
    /// rather than the goal cards.
    /// </summary>
    public async Task<GoalHeatmap> GetAggregateHeatmapAsync(Guid userId, DateTimeOffset nowUtc)
    {
        var ctx = await settingsService.GetDayContextAsync(userId);
        var today = DayMath.Today(ctx, nowUtc);
        var windowStart = today.AddDays(-(HeatmapDays - 1));

        var activityIds = await db.Activities
            .Where(a => a.UserId == userId && a.Goals.Any(g => g.Kind == GoalKind.goal))
            .Select(a => a.Id)
            .ToListAsync();
        if (activityIds.Count == 0) return new GoalHeatmap(windowStart, today, []);

        // Only done occurrences land on the grid - skipped ones aren't progress toward a goal, and
        // pending ones aren't settled yet.
        var rows = await db.Occurrences
            .AsNoTracking()
            .Where(o => activityIds.Contains(o.ActivityId) && o.Status == EventStatus.done)
            .Select(o => o.StartAt)
            .ToListAsync();

        var byDay = new Dictionary<DateOnly, (int Done, int Skipped)>();
        foreach (var startAt in rows)
        {
            if (startAt is null) continue;
            var day = DayMath.DayOf(startAt.Value, ctx);
            if (day < windowStart || day > today) continue;

            byDay.TryAdd(day, (0, 0));
            var d = byDay[day];
            byDay[day] = d with { Done = d.Done + 1 };
        }

        return new GoalHeatmap(windowStart, today,
            byDay.OrderBy(d => d.Key).Select(d => new GoalHeatmapDay(d.Key, d.Value.Done, d.Value.Skipped)).ToList());
    }

    public async Task<Result<GoalDto>> UpdateAsync(Guid id, Guid userId, UpdateGoalRequest req)
    {
        var goal = await db.Goals
            .Include(g => g.Checkpoints)
            .FirstOrDefaultAsync(g => g.Id == id && g.UserId == userId);
        if (goal is null) return Result<GoalDto>.Fail(new Error(ErrorType.NotFound, "Goal not found."));

        var err = Apply(goal, req.Title, req.Description, req.Notes, req.Kind, req.EndDate, req.Color, req.Icon);
        if (err is not null) return Result<GoalDto>.Fail(err);
        await db.SaveChangesAsync();
        return Result<GoalDto>.Success(GoalDto.FromEntity(goal));
    }

    /// <summary>
    /// The create/update field rules, validated before anything is written to <paramref name="goal"/>.
    /// Turning a focus or bench goal into a track moves it to active, the one open status a track has.
    /// </summary>
    private static Error? Apply(
        Goal goal, string title, string? description, string? notes,
        GoalKind kind, DateOnly? endDate, string? color, string? icon)
    {
        var err = Validators.ValidateTitle(title, "Title");
        if (err is not null) return err;
        if (!Enum.IsDefined(kind)) return new Error(ErrorType.Validation, "Unknown goal kind.");

        color = string.IsNullOrWhiteSpace(color) ? null : color.Trim();
        if (color is not null && Validators.ValidateColor(color) is { } colorErr) return colorErr;
        icon = string.IsNullOrWhiteSpace(icon) ? null : icon.Trim();
        if (icon is { Length: > MaxIconLength })
            return new Error(ErrorType.Validation, $"Icon cannot exceed {MaxIconLength} characters.");

        goal.Title = title.Trim();
        goal.Description = description?.Trim();
        goal.Notes = notes?.Trim();
        goal.Kind = kind;
        goal.EndDate = endDate;
        goal.Color = color;
        goal.Icon = icon;
        if (kind == GoalKind.track && goal.Status is GoalStatus.focus or GoalStatus.bench)
            goal.Status = GoalStatus.active;
        return null;
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

        if (goal.Kind == GoalKind.track && status is GoalStatus.focus or GoalStatus.bench)
            return Result<GoalDto>.Fail(new Error(ErrorType.Validation, "A track is either active or closed."));

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
