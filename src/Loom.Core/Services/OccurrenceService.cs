using Microsoft.EntityFrameworkCore;
using Loom.Core.Common;
using Loom.Core.Data;
using Loom.Core.Dtos;
using Loom.Core.Entities;
using Loom.Core.Enums;

namespace Loom.Core.Services;

public class OccurrenceService(LoomDbContext db, UserSettingsService settings)
{
    public async Task<Result<OccurrenceDto>> CreateAsync(Guid userId, CreateOccurrenceRequest req)
    {
        var err = ValidateOptionalTitle(req.Title)
            ?? ValidateWindowAndStartAt(req.StartAt, req.WindowStart)
            ?? Validators.ValidateDateRange(req.StartAt, req.EndAt);
        if (err is not null) return Result<OccurrenceDto>.Fail(err);

        var activity = await FindActivityAsync(req.ActivityId, userId);
        if (activity is null) return Result<OccurrenceDto>.Fail(new Error(ErrorType.NotFound, "Activity not found."));
        if (req.DeadlineOccurrenceId is { } deadlineId)
        {
            var deadlineErr = await ValidateDeadlineAsync(userId, null, deadlineId, null);
            if (deadlineErr is not null) return Result<OccurrenceDto>.Fail(deadlineErr);
        }
        // An event's activity is a backing row owned by exactly one occurrence, so it is never a
        // target here: CreateEventAsync is the only thing allowed to attach one.
        if (activity.Kind == ActivityKind.@event)
            return Result<OccurrenceDto>.Fail(new Error(ErrorType.Validation,
                "An occurrence cannot be created on an event."));

        var o = new Occurrence
        {
            UserId = userId,
            ActivityId = activity.Id,
            Activity = activity,
            Title = string.IsNullOrWhiteSpace(req.Title) ? null : req.Title.Trim(),
            StartAt = req.StartAt,
            EndAt = req.EndAt,
            IsAllDay = req.IsAllDay,
            IsPlanned = req.IsPlanned,
            WindowStart = req.WindowStart,
            WindowEnd = req.WindowEnd,
            WindowDurationMinutes = req.WindowDurationMinutes,
            DeadlineOccurrenceId = req.DeadlineOccurrenceId,
        };

        var subtaskCopies = activity.Subtasks
            .OrderBy(s => s.CreatedAt)
            .Select(s => new OccurrenceSubtask { OccurrenceId = o.Id, Title = s.Title })
            .ToList();

        db.Occurrences.Add(o);
        db.OccurrenceSubtasks.AddRange(subtaskCopies);
        o.Subtasks = subtaskCopies;

        await db.SaveChangesAsync();
        return Result<OccurrenceDto>.Success(await ToDtoAsync(o, userId));
    }

    public async Task<Result<OccurrenceDto>> GetAsync(Guid id, Guid userId)
    {
        var o = await WithFullIncludes()
            .AsNoTracking()
            .FirstOrDefaultAsync(o => o.Id == id && o.UserId == userId);
        if (o is null) return Result<OccurrenceDto>.Fail(new Error(ErrorType.NotFound, "Occurrence not found."));
        return Result<OccurrenceDto>.Success(await ToDtoAsync(o, userId));
    }

    public async Task<List<OccurrenceDto>> ListAsync(
        Guid userId,
        EventStatus? status = null,
        DateTimeOffset? startFrom = null,
        DateTimeOffset? endBefore = null,
        bool floatingOnly = false,
        Guid? goalId = null,
        Guid? activityId = null)
    {
        var query = WithFullIncludes()
            .AsNoTracking()
            .AsSplitQuery()
            .Where(o => o.UserId == userId);

        if (status.HasValue) query = query.Where(o => o.Status == status.Value);
        if (floatingOnly) query = query.Where(o => o.StartAt == null && o.EndAt == null && o.WindowStart == null && !o.IsAllDay
            && (o.Activity.GoalId == null || o.Activity.Goal!.Status != GoalStatus.bench));
        if (goalId.HasValue) query = query.Where(o => o.Activity.GoalId == goalId.Value);
        if (activityId.HasValue) query = query.Where(o => o.ActivityId == activityId.Value);

        // A ranged query never returns fully-floating (all-null anchor) occurrences: the exact
        // in-memory filter below always drops them. Excluding them in SQL is safe because it is a
        // pure null check. We cannot go further and date-bound the query itself: SQLite stores
        // DateTimeOffset as offset-bearing text, so EF cannot translate an instant-correct range
        // comparison (it throws), which is why the precise windowing stays in memory.
        if (!floatingOnly && (startFrom.HasValue || endBefore.HasValue))
            query = query.Where(o => o.WindowStart != null || o.StartAt != null || o.EndAt != null);

        var all = await query.ToListAsync();

        IEnumerable<Occurrence> occurrences = all;
        if (startFrom.HasValue || endBefore.HasValue)
        {
            occurrences = occurrences.Where(o =>
            {
                if (o.WindowStart is not null)
                {
                    var wStart = o.WindowStart.Value;
                    var wEnd = o.WindowEnd ?? o.WindowStart.Value;
                    return (!endBefore.HasValue || wStart < endBefore.Value)
                        && (!startFrom.HasValue || wEnd > startFrom.Value);
                }
                if (o.StartAt is not null && o.EndAt is not null)
                    return (!endBefore.HasValue || o.StartAt < endBefore.Value)
                        && (!startFrom.HasValue || o.EndAt > startFrom.Value);
                if (o.StartAt is not null)
                    return (!startFrom.HasValue || o.StartAt >= startFrom.Value)
                        && (!endBefore.HasValue || o.StartAt < endBefore.Value);
                if (o.EndAt is not null)
                    return (!startFrom.HasValue || o.EndAt >= startFrom.Value)
                        && (!endBefore.HasValue || o.EndAt < endBefore.Value);
                return false;
            });
        }

        var ctx = await settings.GetDayContextAsync(userId);
        var now = DateTimeOffset.UtcNow;
        var dtos = occurrences
            .OrderBy(o => o.StartAt ?? o.EndAt ?? DateTimeOffset.MaxValue)
            .ThenBy(o => o.CreatedAt)
            .Select(o => OccurrenceDto.FromEntity(o, ctx, now))
            .ToList();
        return await WithLinksAsync(dtos, userId);
    }

    public async Task<Result<OccurrenceDto>> UpdateAsync(Guid id, Guid userId, UpdateOccurrenceRequest req)
    {
        var err = ValidateOptionalTitle(req.Title)
            ?? Validators.ValidateDateRange(req.StartAt, req.EndAt)
            ?? ValidateSubtaskInputs(req.Subtasks);
        if (err is not null) return Result<OccurrenceDto>.Fail(err);

        var o = await WithFullIncludes()
            .FirstOrDefaultAsync(o => o.Id == id && o.UserId == userId);
        if (o is null) return Result<OccurrenceDto>.Fail(new Error(ErrorType.NotFound, "Occurrence not found."));

        // Re-pointing at a different activity. Both ends must be activity-kind: an event's activity
        // is a backing row this occurrence owns outright (DeleteAsync removes it, UpdateEventAsync
        // edits it in place), so moving either end of that pair would orphan a row on one side or
        // give a backing activity two occurrences on the other.
        if (req.ActivityId is { } targetId && targetId != o.ActivityId)
        {
            if (o.Activity.Kind == ActivityKind.@event)
                return Result<OccurrenceDto>.Fail(new Error(ErrorType.Validation,
                    "An event cannot be moved to another activity."));

            var target = await FindActivityAsync(targetId, userId);
            if (target is null)
                return Result<OccurrenceDto>.Fail(new Error(ErrorType.NotFound, "Activity not found."));
            if (target.Kind == ActivityKind.@event)
                return Result<OccurrenceDto>.Fail(new Error(ErrorType.Validation,
                    "An occurrence cannot be moved onto an event."));

            o.ActivityId = target.Id;
            o.Activity = target;
        }

        o.Title = string.IsNullOrWhiteSpace(req.Title) ? null : req.Title.Trim();
        o.StartAt = req.StartAt;
        o.EndAt = req.EndAt;
        o.IsAllDay = req.IsAllDay;
        o.IsPlanned = req.IsPlanned;

        var linkErr = await ApplyDeadlineAsync(o, userId, req.DeadlineOccurrenceId, req.ClearDeadline);
        if (linkErr is not null) return Result<OccurrenceDto>.Fail(linkErr);

        var subtaskErr = ApplySubtasks(o, req.Subtasks);
        if (subtaskErr is not null) return Result<OccurrenceDto>.Fail(subtaskErr);

        await db.SaveChangesAsync();
        return Result<OccurrenceDto>.Success(await ToDtoAsync(o, userId));
    }

    /// <summary>
    /// Wipes the user's history: every occurrence, and every event (an event's activity is a
    /// backing row owned by its single occurrence, so it goes with it). Real activities, categories,
    /// goals and checkpoints stay. With <paramref name="pastOnly"/>, only occurrences dated before
    /// today are removed; today, upcoming and undated (floating) ones are kept. Returns the number
    /// of occurrences removed.
    /// </summary>
    public async Task<int> ClearAllAsync(Guid userId, bool pastOnly = false)
    {
        var rows = await db.Occurrences
            .Where(o => o.UserId == userId)
            .Select(o => new { o.Id, o.ActivityId, o.StartAt, o.EndAt, IsEvent = o.Activity.Kind == ActivityKind.@event })
            .ToListAsync();

        if (pastOnly)
        {
            // Date filtering has to run in memory (SQLite can't compare DateTimeOffset).
            var ctx = await settings.GetDayContextAsync(userId);
            var today = DayMath.Today(ctx, DateTimeOffset.UtcNow);
            // Same reference as the calendar's DUE row: a deadline-only occurrence counts by its end.
            rows = rows.Where(o => (o.StartAt ?? o.EndAt) is { } at && DayMath.DayOf(at, ctx) < today).ToList();
        }

        await using var tx = await db.Database.BeginTransactionAsync();
        // Deleting an event's activity cascades to its occurrence (and subtasks).
        foreach (var chunk in rows.Where(o => o.IsEvent).Select(o => o.ActivityId).Distinct().Chunk(500))
            await db.Activities.Where(a => chunk.Contains(a.Id)).ExecuteDeleteAsync();
        foreach (var chunk in rows.Select(o => o.Id).Chunk(500))
        {
            await db.OccurrenceSubtasks.Where(s => chunk.Contains(s.OccurrenceId)).ExecuteDeleteAsync();
            await db.Occurrences.Where(o => chunk.Contains(o.Id)).ExecuteDeleteAsync();
        }
        await tx.CommitAsync();
        return rows.Count;
    }

    public async Task<Result> DeleteAsync(Guid id, Guid userId)
    {
        var o = await db.Occurrences
            .Include(o => o.Activity)
            .FirstOrDefaultAsync(o => o.Id == id && o.UserId == userId);
        if (o is null) return Result.Fail(new Error(ErrorType.NotFound, "Occurrence not found."));

        // For event-kind, delete the backing activity (cascade removes the occurrence).
        if (o.Activity.Kind == ActivityKind.@event)
            db.Activities.Remove(o.Activity);
        else
            db.Occurrences.Remove(o);

        await db.SaveChangesAsync();
        return Result.Success();
    }

    public async Task<Result<OccurrenceDto>> CreateEventAsync(Guid userId, CreateEventRequest req)
    {
        var err = Validators.ValidateTitle(req.Title, "Title")
            ?? Validators.ValidateDateRange(req.StartAt, req.EndAt);
        if (err is not null) return Result<OccurrenceDto>.Fail(err);

        var a = new Activity
        {
            UserId = userId,
            Title = req.Title.Trim(),
            Kind = ActivityKind.@event,
        };

        if (req.CategoryId.HasValue)
        {
            var cat = await db.Categories.FirstOrDefaultAsync(c => c.Id == req.CategoryId.Value && c.UserId == userId);
            if (cat is null) return Result<OccurrenceDto>.Fail(new Error(ErrorType.NotFound, "Category not found."));
            a.CategoryId = req.CategoryId.Value;
            a.Category = cat;
        }

        if (req.GoalId.HasValue)
        {
            var goal = await db.Goals.FirstOrDefaultAsync(g => g.Id == req.GoalId.Value && g.UserId == userId);
            if (goal is null) return Result<OccurrenceDto>.Fail(new Error(ErrorType.NotFound, "Goal not found."));
            a.GoalId = req.GoalId.Value;
            a.Goal = goal;
        }

        if (req.DeadlineOccurrenceId is { } deadlineId)
        {
            var deadlineErr = await ValidateDeadlineAsync(userId, null, deadlineId, null);
            if (deadlineErr is not null) return Result<OccurrenceDto>.Fail(deadlineErr);
        }

        db.Activities.Add(a);

        var o = new Occurrence
        {
            UserId = userId,
            ActivityId = a.Id,
            Activity = a,
            StartAt = req.StartAt,
            EndAt = req.EndAt,
            IsAllDay = req.IsAllDay,
            IsPlanned = req.IsPlanned,
            DeadlineOccurrenceId = req.DeadlineOccurrenceId,
        };
        db.Occurrences.Add(o);
        await db.SaveChangesAsync();
        return Result<OccurrenceDto>.Success(await ToDtoAsync(o, userId));
    }

    public async Task<Result<OccurrenceDto>> UpdateEventAsync(Guid id, Guid userId, UpdateEventRequest req)
    {
        var err = Validators.ValidateTitle(req.Title, "Title")
            ?? Validators.ValidateDateRange(req.StartAt, req.EndAt)
            ?? ValidateSubtaskInputs(req.Subtasks);
        if (err is not null) return Result<OccurrenceDto>.Fail(err);

        var o = await WithFullIncludes()
            .FirstOrDefaultAsync(o => o.Id == id && o.UserId == userId);
        if (o is null) return Result<OccurrenceDto>.Fail(new Error(ErrorType.NotFound, "Occurrence not found."));
        if (o.Activity.Kind != ActivityKind.@event)
            return Result<OccurrenceDto>.Fail(new Error(ErrorType.Validation, "Use the standard update endpoint for activity-based occurrences."));

        o.Activity.Title = req.Title.Trim();

        if (req.CategoryId.HasValue)
        {
            var cat = await db.Categories.FirstOrDefaultAsync(c => c.Id == req.CategoryId.Value && c.UserId == userId);
            if (cat is null) return Result<OccurrenceDto>.Fail(new Error(ErrorType.NotFound, "Category not found."));
            o.Activity.CategoryId = req.CategoryId.Value;
            o.Activity.Category = cat;
        }
        else
        {
            o.Activity.CategoryId = null;
            o.Activity.Category = null;
        }

        if (req.GoalId.HasValue)
        {
            var goal = await db.Goals.FirstOrDefaultAsync(g => g.Id == req.GoalId.Value && g.UserId == userId);
            if (goal is null) return Result<OccurrenceDto>.Fail(new Error(ErrorType.NotFound, "Goal not found."));
            o.Activity.GoalId = req.GoalId.Value;
            o.Activity.Goal = goal;
        }
        else
        {
            o.Activity.GoalId = null;
            o.Activity.Goal = null;
        }

        o.StartAt = req.StartAt;
        o.EndAt = req.EndAt;
        o.IsAllDay = req.IsAllDay;
        o.IsPlanned = req.IsPlanned;

        var linkErr = await ApplyDeadlineAsync(o, userId, req.DeadlineOccurrenceId, req.ClearDeadline);
        if (linkErr is not null) return Result<OccurrenceDto>.Fail(linkErr);

        var subtaskErr = ApplySubtasks(o, req.Subtasks);
        if (subtaskErr is not null) return Result<OccurrenceDto>.Fail(subtaskErr);

        await db.SaveChangesAsync();
        return Result<OccurrenceDto>.Success(await ToDtoAsync(o, userId));
    }

    public async Task<Result<OccurrenceDto>> SetStatusAsync(Guid id, Guid userId, EventStatus status)
    {
        var o = await WithFullIncludes()
            .FirstOrDefaultAsync(o => o.Id == id && o.UserId == userId);
        if (o is null) return Result<OccurrenceDto>.Fail(new Error(ErrorType.NotFound, "Occurrence not found."));
        o.Status = status;
        if (status == EventStatus.done) o.IsPlanned = false;
        await db.SaveChangesAsync();
        return Result<OccurrenceDto>.Success(await ToDtoAsync(o, userId));
    }

    public async Task<Result<OccurrenceDto>> ToggleSubtaskAsync(Guid id, Guid subtaskId, Guid userId)
    {
        var o = await WithFullIncludes()
            .FirstOrDefaultAsync(o => o.Id == id && o.UserId == userId);
        if (o is null) return Result<OccurrenceDto>.Fail(new Error(ErrorType.NotFound, "Occurrence not found."));

        var subtask = o.Subtasks.FirstOrDefault(s => s.Id == subtaskId);
        if (subtask is null) return Result<OccurrenceDto>.Fail(new Error(ErrorType.NotFound, "Subtask not found."));

        subtask.IsDone = !subtask.IsDone;
        await db.SaveChangesAsync();
        return Result<OccurrenceDto>.Success(await ToDtoAsync(o, userId));
    }

    public async Task<Result<OccurrenceDto>> CreateSubtaskAsync(Guid id, Guid userId, CreateOccurrenceSubtaskRequest req)
    {
        var err = Validators.ValidateTitle(req.Title, "Title");
        if (err is not null) return Result<OccurrenceDto>.Fail(err);

        var o = await WithFullIncludes()
            .FirstOrDefaultAsync(o => o.Id == id && o.UserId == userId);
        if (o is null) return Result<OccurrenceDto>.Fail(new Error(ErrorType.NotFound, "Occurrence not found."));

        // Explicit Add forces the Added state (the pre-set Guid key would otherwise make
        // change detection treat it as an existing row); fixup then puts it into o.Subtasks.
        var subtask = new OccurrenceSubtask { OccurrenceId = id, Title = req.Title.Trim() };
        db.OccurrenceSubtasks.Add(subtask);
        await db.SaveChangesAsync();
        return Result<OccurrenceDto>.Success(await ToDtoAsync(o, userId));
    }

    public async Task<Result<OccurrenceDto>> UpdateSubtaskAsync(Guid id, Guid subtaskId, Guid userId, UpdateOccurrenceSubtaskRequest req)
    {
        var err = Validators.ValidateTitle(req.Title, "Title");
        if (err is not null) return Result<OccurrenceDto>.Fail(err);

        var o = await WithFullIncludes()
            .FirstOrDefaultAsync(o => o.Id == id && o.UserId == userId);
        if (o is null) return Result<OccurrenceDto>.Fail(new Error(ErrorType.NotFound, "Occurrence not found."));

        var subtask = o.Subtasks.FirstOrDefault(s => s.Id == subtaskId);
        if (subtask is null) return Result<OccurrenceDto>.Fail(new Error(ErrorType.NotFound, "Subtask not found."));

        subtask.Title = req.Title.Trim();
        await db.SaveChangesAsync();
        return Result<OccurrenceDto>.Success(await ToDtoAsync(o, userId));
    }

    public async Task<Result<OccurrenceDto>> DeleteSubtaskAsync(Guid id, Guid subtaskId, Guid userId)
    {
        var o = await WithFullIncludes()
            .FirstOrDefaultAsync(o => o.Id == id && o.UserId == userId);
        if (o is null) return Result<OccurrenceDto>.Fail(new Error(ErrorType.NotFound, "Occurrence not found."));

        var subtask = o.Subtasks.FirstOrDefault(s => s.Id == subtaskId);
        if (subtask is null) return Result<OccurrenceDto>.Fail(new Error(ErrorType.NotFound, "Subtask not found."));

        o.Subtasks.Remove(subtask);
        db.OccurrenceSubtasks.Remove(subtask);
        await db.SaveChangesAsync();
        return Result<OccurrenceDto>.Success(await ToDtoAsync(o, userId));
    }

    private async Task<OccurrenceDto> ToDtoAsync(Occurrence o, Guid userId)
    {
        var ctx = await settings.GetDayContextAsync(userId);
        var dto = OccurrenceDto.FromEntity(o, ctx, DateTimeOffset.UtcNow);
        return (await WithLinksAsync([dto], userId))[0];
    }

    private async Task<List<OccurrenceDto>> WithLinksAsync(List<OccurrenceDto> dtos, Guid userId)
    {
        var links = await db.Occurrences
            .AsNoTracking()
            .Where(o => o.UserId == userId && o.DeadlineOccurrenceId != null)
            .Select(o => new { o.DeadlineOccurrenceId, o.Status, o.StartAt, o.EndAt })
            .ToListAsync();

        var stats = links
            .Where(l => l.Status == EventStatus.done)
            .GroupBy(l => l.DeadlineOccurrenceId!.Value)
            .ToDictionary(
                g => g.Key,
                g => (Count: g.Count(), Minutes: g.Sum(l => LinkedMinutes(l.StartAt, l.EndAt))));

        var targetIds = dtos.Where(d => d.DeadlineOccurrenceId.HasValue)
            .Select(d => d.DeadlineOccurrenceId!.Value)
            .Distinct()
            .ToList();
        var refs = targetIds.Count == 0
            ? []
            : (await db.Occurrences
                .AsNoTracking()
                .Include(o => o.Activity)
                .Where(o => o.UserId == userId && targetIds.Contains(o.Id))
                .ToListAsync())
                .ToDictionary(o => o.Id, DeadlineRefDto.FromEntity);

        return dtos.Select(d =>
        {
            var deadline = d.DeadlineOccurrenceId is { } id && refs.TryGetValue(id, out var r) ? r : null;
            return stats.TryGetValue(d.Id, out var s)
                ? d with { Deadline = deadline, LinkedDoneCount = s.Count, LinkedDoneMinutes = s.Minutes }
                : d with { Deadline = deadline };
        }).ToList();
    }

    private static int LinkedMinutes(DateTimeOffset? startAt, DateTimeOffset? endAt)
    {
        if (!startAt.HasValue || !endAt.HasValue) return 0;
        return Math.Max(0, (int)(endAt.Value - startAt.Value).TotalMinutes);
    }

    private async Task<Error?> ApplyDeadlineAsync(Occurrence o, Guid userId, Guid? targetId, bool clear)
    {
        if (clear)
        {
            o.DeadlineOccurrenceId = null;
            return null;
        }
        if (targetId is not { } id || id == o.DeadlineOccurrenceId) return null;

        var err = await ValidateDeadlineAsync(userId, o.Id, id, o.DeadlineOccurrenceId);
        if (err is not null) return err;
        o.DeadlineOccurrenceId = id;
        return null;
    }

    private async Task<Error?> ValidateDeadlineAsync(Guid userId, Guid? selfId, Guid targetId, Guid? currentId)
    {
        if (targetId == selfId)
            return new Error(ErrorType.Validation, "An occurrence cannot be its own deadline.");

        var target = await db.Occurrences
            .AsNoTracking()
            .Where(o => o.Id == targetId && o.UserId == userId)
            .Select(o => new { o.Status, o.DeadlineOccurrenceId, IsEvent = o.Activity.Kind == ActivityKind.@event })
            .FirstOrDefaultAsync();
        if (target is null) return new Error(ErrorType.NotFound, "Deadline not found.");
        if (!target.IsEvent)
            return new Error(ErrorType.Validation, "A deadline must be an event.");
        if (target.Status != EventStatus.pending && targetId != currentId)
            return new Error(ErrorType.Validation, "A deadline must be pending.");

        var next = target.DeadlineOccurrenceId;
        for (var hops = 0; selfId.HasValue && next.HasValue && hops < 100; hops++)
        {
            if (next == selfId)
                return new Error(ErrorType.Validation, "That link would make the deadlines loop.");
            next = await db.Occurrences
                .AsNoTracking()
                .Where(o => o.Id == next.Value)
                .Select(o => o.DeadlineOccurrenceId)
                .FirstOrDefaultAsync();
        }
        return null;
    }

    /// <summary>
    /// The activity an occurrence hangs off, with everything <see cref="ToDtoAsync"/> needs loaded.
    /// Shared by create and by re-pointing, so both paths return an equally complete DTO.
    /// </summary>
    private Task<Activity?> FindActivityAsync(Guid activityId, Guid userId) =>
        db.Activities
            .Include(a => a.Category)
            .Include(a => a.Goal)
            .Include(a => a.Subtasks)
            .FirstOrDefaultAsync(a => a.Id == activityId && a.UserId == userId);

    private IQueryable<Occurrence> WithFullIncludes() =>
        db.Occurrences
            .Include(o => o.Activity).ThenInclude(a => a.Category)
            .Include(o => o.Activity).ThenInclude(a => a.Goal)
            .Include(o => o.Activity).ThenInclude(a => a.Subtasks)
            .Include(o => o.Subtasks);

    private static Error? ValidateSubtaskInputs(List<OccurrenceSubtaskInput>? inputs)
    {
        if (inputs is null) return null;
        foreach (var input in inputs)
        {
            var err = Validators.ValidateTitle(input.Title, "Subtask title");
            if (err is not null) return err;
        }
        return null;
    }

    // Reconciles the occurrence's subtasks with the full set from the request:
    // known ids are kept (title updated, IsDone preserved), missing ids are deleted,
    // null-id entries are created. A null list leaves subtasks untouched.
    private Error? ApplySubtasks(Occurrence o, List<OccurrenceSubtaskInput>? inputs)
    {
        if (inputs is null) return null;

        var existing = o.Subtasks.ToDictionary(s => s.Id);
        var keptIds = inputs.Where(i => i.Id.HasValue).Select(i => i.Id!.Value).ToHashSet();

        if (!keptIds.All(existing.ContainsKey))
            return new Error(ErrorType.NotFound, "Subtask not found.");

        foreach (var removed in o.Subtasks.Where(s => !keptIds.Contains(s.Id)).ToList())
        {
            o.Subtasks.Remove(removed);
            db.OccurrenceSubtasks.Remove(removed);
        }

        foreach (var input in inputs)
        {
            if (input.Id.HasValue)
                existing[input.Id.Value].Title = input.Title.Trim();
            else
                // Explicit Add forces the Added state (the pre-set Guid key would otherwise
                // make change detection treat it as an existing row); fixup adds it to o.Subtasks.
                db.OccurrenceSubtasks.Add(new OccurrenceSubtask { OccurrenceId = o.Id, Title = input.Title.Trim() });
        }

        return null;
    }

    private static Error? ValidateWindowAndStartAt(DateTimeOffset? startAt, DateTimeOffset? windowStart) =>
        startAt.HasValue && windowStart.HasValue
            ? new Error(ErrorType.Validation, "StartAt and WindowStart cannot both be set.")
            : null;

    private static Error? ValidateOptionalTitle(string? title) =>
        !string.IsNullOrWhiteSpace(title) && title.Length > 255
            ? new Error(ErrorType.Validation, "Title cannot exceed 255 characters.")
            : null;
}
