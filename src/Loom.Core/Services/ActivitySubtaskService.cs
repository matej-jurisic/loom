using Microsoft.EntityFrameworkCore;
using Loom.Core.Common;
using Loom.Core.Data;
using Loom.Core.Dtos;
using Loom.Core.Entities;
using Loom.Core.Enums;

namespace Loom.Core.Services;

public class ActivitySubtaskService(LoomDbContext db)
{
    public async Task<Result<ActivitySubtaskDto>> CreateAsync(Guid activityId, Guid userId, CreateActivitySubtaskRequest req)
    {
        var err = Validators.ValidateTitle(req.Title, "Title");
        if (err is not null) return Result<ActivitySubtaskDto>.Fail(err);

        var activity = await db.Activities.FirstOrDefaultAsync(a => a.Id == activityId && a.UserId == userId);
        if (activity is null) return Result<ActivitySubtaskDto>.Fail(new Error(ErrorType.NotFound, "Activity not found."));

        var subtask = new ActivitySubtask { ActivityId = activityId, Title = req.Title.Trim() };
        db.ActivitySubtasks.Add(subtask);
        await db.SaveChangesAsync();
        return Result<ActivitySubtaskDto>.Success(ActivitySubtaskDto.FromEntity(subtask));
    }

    public async Task<Result<ActivitySubtaskDto>> UpdateAsync(Guid id, Guid activityId, Guid userId, UpdateActivitySubtaskRequest req)
    {
        var err = Validators.ValidateTitle(req.Title, "Title");
        if (err is not null) return Result<ActivitySubtaskDto>.Fail(err);

        var subtask = await db.ActivitySubtasks
            .Include(s => s.Activity)
            .FirstOrDefaultAsync(s => s.Id == id && s.ActivityId == activityId && s.Activity.UserId == userId);
        if (subtask is null) return Result<ActivitySubtaskDto>.Fail(new Error(ErrorType.NotFound, "Subtask not found."));

        subtask.Title = req.Title.Trim();
        await db.SaveChangesAsync();
        return Result<ActivitySubtaskDto>.Success(ActivitySubtaskDto.FromEntity(subtask));
    }

    public async Task<Result> DeleteAsync(Guid id, Guid activityId, Guid userId)
    {
        var subtask = await db.ActivitySubtasks
            .Include(s => s.Activity)
            .FirstOrDefaultAsync(s => s.Id == id && s.ActivityId == activityId && s.Activity.UserId == userId);
        if (subtask is null) return Result.Fail(new Error(ErrorType.NotFound, "Subtask not found."));

        db.ActivitySubtasks.Remove(subtask);
        await db.SaveChangesAsync();
        return Result.Success();
    }
    // Template subtasks are copied once, when an occurrence is created. These two let the user push
    // titles added to the template later onto the activity's pending occurrences. Additive only:
    // existing occurrence subtasks may be ticked or edited on purpose, so nothing is renamed or
    // removed, and done / skipped occurrences keep the checklist they were done with.
    public async Task<Result<ApplySubtasksDto>> CountApplicableAsync(Guid activityId, Guid userId)
    {
        var plan = await PlanApplyAsync(activityId, userId);
        return plan.IsSuccess
            ? Result<ApplySubtasksDto>.Success(new ApplySubtasksDto(plan.Value!.Count))
            : Result<ApplySubtasksDto>.Fail(plan.Error!);
    }

    public async Task<Result<ApplySubtasksDto>> ApplyToPendingAsync(Guid activityId, Guid userId)
    {
        var plan = await PlanApplyAsync(activityId, userId);
        if (!plan.IsSuccess) return Result<ApplySubtasksDto>.Fail(plan.Error!);

        var now = DateTimeOffset.UtcNow;
        foreach (var (occurrenceId, titles) in plan.Value!)
        {
            // Occurrence subtasks are ordered by CreatedAt; a tick apart keeps the template's order.
            db.OccurrenceSubtasks.AddRange(titles.Select((t, i) =>
                new OccurrenceSubtask { OccurrenceId = occurrenceId, Title = t, CreatedAt = now.AddTicks(i) }));
        }
        await db.SaveChangesAsync();
        return Result<ApplySubtasksDto>.Success(new ApplySubtasksDto(plan.Value.Count));
    }

    // Pending occurrences of the activity that lack at least one template title (compared trimmed and
    // case-insensitively), each with the titles it would gain in template order.
    private async Task<Result<List<(Guid OccurrenceId, List<string> Titles)>>> PlanApplyAsync(Guid activityId, Guid userId)
    {
        var activity = await db.Activities
            .AsNoTracking()
            .Include(a => a.Subtasks)
            .FirstOrDefaultAsync(a => a.Id == activityId && a.UserId == userId);
        if (activity is null)
            return Result<List<(Guid, List<string>)>>.Fail(new Error(ErrorType.NotFound, "Activity not found."));

        var template = activity.Subtasks
            .OrderBy(s => s.CreatedAt)
            .Select(s => s.Title.Trim())
            .DistinctBy(t => t.ToLowerInvariant())
            .ToList();
        if (template.Count == 0) return Result<List<(Guid, List<string>)>>.Success([]);

        var occurrences = await db.Occurrences
            .AsNoTracking()
            .Where(o => o.ActivityId == activityId && o.UserId == userId && o.Status == EventStatus.pending)
            .Select(o => new { o.Id, Titles = o.Subtasks.Select(s => s.Title).ToList() })
            .ToListAsync();

        var plan = new List<(Guid, List<string>)>();
        foreach (var o in occurrences)
        {
            var have = o.Titles.Select(t => t.Trim().ToLowerInvariant()).ToHashSet();
            var missing = template.Where(t => !have.Contains(t.ToLowerInvariant())).ToList();
            if (missing.Count > 0) plan.Add((o.Id, missing));
        }
        return Result<List<(Guid, List<string>)>>.Success(plan);
    }
}
