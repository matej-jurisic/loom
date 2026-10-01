using Microsoft.EntityFrameworkCore;
using Loom.Core.Common;
using Loom.Core.Data;
using Loom.Core.Dtos;
using Loom.Core.Entities;

namespace Loom.Core.Services;

public class ActivityWorkTypeService(LoomDbContext db)
{
    public async Task<Result<ActivityWorkTypeDto>> CreateAsync(Guid activityId, Guid userId, CreateActivityWorkTypeRequest req)
    {
        var err = Validators.ValidateTitle(req.Title, "Title");
        if (err is not null) return Result<ActivityWorkTypeDto>.Fail(err);

        var activity = await db.Activities
            .Include(a => a.WorkTypes)
            .FirstOrDefaultAsync(a => a.Id == activityId && a.UserId == userId);
        if (activity is null) return Result<ActivityWorkTypeDto>.Fail(new Error(ErrorType.NotFound, "Activity not found."));

        var title = req.Title.Trim();
        var existing = FindByTitle(activity.WorkTypes, title);
        if (existing is not null)
        {
            if (!existing.IsArchived)
                return Result<ActivityWorkTypeDto>.Fail(new Error(ErrorType.Conflict, "That work type already exists."));

            existing.IsArchived = false;
            existing.Title = title;
            await db.SaveChangesAsync();
            return Result<ActivityWorkTypeDto>.Success(ActivityWorkTypeDto.FromEntity(existing));
        }

        var workType = new ActivityWorkType { ActivityId = activityId, Title = title };
        db.ActivityWorkTypes.Add(workType);
        await db.SaveChangesAsync();
        return Result<ActivityWorkTypeDto>.Success(ActivityWorkTypeDto.FromEntity(workType));
    }

    public async Task<Result<ActivityWorkTypeDto>> UpdateAsync(Guid id, Guid activityId, Guid userId, UpdateActivityWorkTypeRequest req)
    {
        var err = Validators.ValidateTitle(req.Title, "Title");
        if (err is not null) return Result<ActivityWorkTypeDto>.Fail(err);

        var workTypes = await db.ActivityWorkTypes
            .Where(w => w.ActivityId == activityId && w.Activity.UserId == userId)
            .ToListAsync();
        var workType = workTypes.FirstOrDefault(w => w.Id == id);
        if (workType is null) return Result<ActivityWorkTypeDto>.Fail(new Error(ErrorType.NotFound, "Work type not found."));

        var title = req.Title.Trim();
        var clash = FindByTitle(workTypes.Where(w => w.Id != id), title);
        if (clash is not null)
            return Result<ActivityWorkTypeDto>.Fail(new Error(ErrorType.Conflict, "That work type already exists."));

        workType.Title = title;
        await db.SaveChangesAsync();
        return Result<ActivityWorkTypeDto>.Success(ActivityWorkTypeDto.FromEntity(workType));
    }

    public async Task<Result> DeleteAsync(Guid id, Guid activityId, Guid userId)
    {
        var workType = await db.ActivityWorkTypes
            .FirstOrDefaultAsync(w => w.Id == id && w.ActivityId == activityId && w.Activity.UserId == userId);
        if (workType is null) return Result.Fail(new Error(ErrorType.NotFound, "Work type not found."));

        if (await db.OccurrenceTimeSplits.AnyAsync(t => t.WorkTypeId == id))
            workType.IsArchived = true;
        else
            db.ActivityWorkTypes.Remove(workType);

        await db.SaveChangesAsync();
        return Result.Success();
    }

    private static ActivityWorkType? FindByTitle(IEnumerable<ActivityWorkType> workTypes, string title) =>
        workTypes.FirstOrDefault(w => string.Equals(w.Title, title, StringComparison.OrdinalIgnoreCase));
}
