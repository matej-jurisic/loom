using Microsoft.EntityFrameworkCore;
using Loom.Core.Common;
using Loom.Core.Data;
using Loom.Core.Dtos;
using Loom.Core.Entities;
using Loom.Core.Enums;

namespace Loom.Core.Services;

public class ActivityService(LoomDbContext db)
{
    /// <summary>Window used for <see cref="ActivityDto.RecentOccurrenceCount"/>: how far back "recently used" reaches.</summary>
    public const int RecentWindowDays = 365;

    public async Task<Result<ActivityDto>> GetAsync(Guid id, Guid userId)
    {
        var a = await db.Activities
            .Include(a => a.Category)
            .Include(a => a.Goal)
            .Include(a => a.Subtasks)
            .Include(a => a.Recurrence)
            .FirstOrDefaultAsync(a => a.Id == id && a.UserId == userId);
        return a is null
            ? Result<ActivityDto>.Fail(new Error(ErrorType.NotFound, "Activity not found."))
            : Result<ActivityDto>.Success(ActivityDto.FromEntity(a));
    }

    public async Task<List<ActivityDto>> ListAsync(Guid userId, Guid? goalId = null)
    {
        var query = db.Activities
            .Include(a => a.Category)
            .Include(a => a.Goal)
            .Include(a => a.Subtasks)
            .Include(a => a.Recurrence)
            .Where(a => a.UserId == userId && a.Kind == ActivityKind.activity);

        if (goalId.HasValue)
            query = query.Where(a => a.GoalId == goalId.Value);

        var all = await query.OrderBy(a => a.Title).ToListAsync();
        var counts = await RecentOccurrenceCountsAsync(userId);
        return all.Select(a => ActivityDto.FromEntity(a, counts.GetValueOrDefault(a.Id))).ToList();
    }

    /// <summary>
    /// Occurrences per activity within the recent window, so pickers can offer the activities the
    /// user actually reaches for first. An occurrence counts from its start, falling back to its
    /// deadline and then to when it was created, so floating rows are not invisible here. There is
    /// no upper bound: something scheduled for tomorrow is still evidence the activity is in use.
    /// SQLite can't translate a DateTimeOffset range WHERE, so the window is applied in memory.
    /// </summary>
    private async Task<Dictionary<Guid, int>> RecentOccurrenceCountsAsync(Guid userId)
    {
        var since = DateTimeOffset.UtcNow.AddDays(-RecentWindowDays);
        var refs = await db.Occurrences
            .Where(o => o.UserId == userId)
            .Select(o => new { o.ActivityId, o.StartAt, o.EndAt, o.CreatedAt })
            .ToListAsync();

        return refs
            .Where(o => (o.StartAt ?? o.EndAt ?? o.CreatedAt) >= since)
            .GroupBy(o => o.ActivityId)
            .ToDictionary(g => g.Key, g => g.Count());
    }

    public async Task<Result<ActivityDto>> CreateAsync(Guid userId, CreateActivityRequest req)
    {
        var err = Validators.ValidateTitle(req.Title, "Title");
        if (err is not null) return Result<ActivityDto>.Fail(err);

        var a = new Activity { UserId = userId, Title = req.Title.Trim() };

        if (req.CategoryId.HasValue)
        {
            var cat = await db.Categories.FirstOrDefaultAsync(c => c.Id == req.CategoryId.Value && c.UserId == userId);
            if (cat is null) return Result<ActivityDto>.Fail(new Error(ErrorType.NotFound, "Category not found."));
            a.CategoryId = req.CategoryId.Value;
            a.Category = cat;
        }

        if (req.GoalId.HasValue)
        {
            var goal = await db.Goals.FirstOrDefaultAsync(g => g.Id == req.GoalId.Value && g.UserId == userId);
            if (goal is null) return Result<ActivityDto>.Fail(new Error(ErrorType.NotFound, "Goal not found."));
            a.GoalId = req.GoalId.Value;
            a.Goal = goal;
        }

        db.Activities.Add(a);
        await db.SaveChangesAsync();
        return Result<ActivityDto>.Success(ActivityDto.FromEntity(a));
    }

    public async Task<Result<ActivityDto>> UpdateAsync(Guid id, Guid userId, UpdateActivityRequest req)
    {
        var err = Validators.ValidateTitle(req.Title, "Title");
        if (err is not null) return Result<ActivityDto>.Fail(err);

        var a = await db.Activities
            .Include(a => a.Category)
            .Include(a => a.Goal)
            .Include(a => a.Subtasks)
            .Include(a => a.Recurrence)
            .FirstOrDefaultAsync(a => a.Id == id && a.UserId == userId);
        if (a is null) return Result<ActivityDto>.Fail(new Error(ErrorType.NotFound, "Activity not found."));

        a.Title = req.Title.Trim();

        if (req.CategoryId.HasValue)
        {
            var cat = await db.Categories.FirstOrDefaultAsync(c => c.Id == req.CategoryId.Value && c.UserId == userId);
            if (cat is null) return Result<ActivityDto>.Fail(new Error(ErrorType.NotFound, "Category not found."));
            a.CategoryId = req.CategoryId.Value;
            a.Category = cat;
        }
        else
        {
            a.CategoryId = null;
            a.Category = null;
        }

        if (req.GoalId.HasValue)
        {
            var goal = await db.Goals.FirstOrDefaultAsync(g => g.Id == req.GoalId.Value && g.UserId == userId);
            if (goal is null) return Result<ActivityDto>.Fail(new Error(ErrorType.NotFound, "Goal not found."));
            a.GoalId = req.GoalId.Value;
            a.Goal = goal;
        }
        else
        {
            a.GoalId = null;
            a.Goal = null;
        }

        await db.SaveChangesAsync();
        return Result<ActivityDto>.Success(ActivityDto.FromEntity(a));
    }

    public async Task<Result<ActivityDto>> SetRecurrenceAsync(Guid id, Guid userId, SetRecurrenceRequest req)
    {
        var a = await db.Activities
            .Include(a => a.Category)
            .Include(a => a.Goal)
            .Include(a => a.Subtasks)
            .Include(a => a.Recurrence)
            .FirstOrDefaultAsync(a => a.Id == id && a.UserId == userId);
        if (a is null) return Result<ActivityDto>.Fail(new Error(ErrorType.NotFound, "Activity not found."));
        if (a.Kind != ActivityKind.activity)
            return Result<ActivityDto>.Fail(new Error(ErrorType.Validation, "An event cannot repeat."));

        var err = ValidateRecurrence(req, out var timeOfDay);
        if (err is not null) return Result<ActivityDto>.Fail(err);

        var isNew = a.Recurrence is null;
        var r = a.Recurrence ??= new ActivityRecurrence { ActivityId = a.Id };
        r.Frequency = req.Frequency;
        r.Interval = req.Interval;
        r.WeekdayMask = req.Frequency == RecurrenceFrequency.weekly && req.Weekdays is { Count: > 0 }
            ? RecurrenceMath.MaskOf(req.Weekdays)
            : 0;
        r.StartDate = req.StartDate;
        r.EndDate = req.EndDate;
        r.TimeOfDay = timeOfDay;
        r.DurationMinutes = req.DurationMinutes;

        if (isNew) db.ActivityRecurrences.Add(r);
        await db.SaveChangesAsync();
        return Result<ActivityDto>.Success(ActivityDto.FromEntity(a));
    }

    public async Task<Result<ActivityDto>> RemoveRecurrenceAsync(Guid id, Guid userId)
    {
        var a = await db.Activities
            .Include(a => a.Category)
            .Include(a => a.Goal)
            .Include(a => a.Subtasks)
            .Include(a => a.Recurrence)
            .FirstOrDefaultAsync(a => a.Id == id && a.UserId == userId);
        if (a is null) return Result<ActivityDto>.Fail(new Error(ErrorType.NotFound, "Activity not found."));

        if (a.Recurrence is not null)
        {
            db.ActivityRecurrences.Remove(a.Recurrence);
            a.Recurrence = null;
            await db.SaveChangesAsync();
        }
        return Result<ActivityDto>.Success(ActivityDto.FromEntity(a));
    }

    private static Error? ValidateRecurrence(SetRecurrenceRequest req, out TimeOnly? timeOfDay)
    {
        timeOfDay = null;
        if (!Enum.IsDefined(req.Frequency))
            return new Error(ErrorType.Validation, "Unknown repeat frequency.");
        if (req.Interval is < 1 or > 99)
            return new Error(ErrorType.Validation, "Repeat interval must be between 1 and 99.");
        if (req.Weekdays is { Count: > 0 })
        {
            if (req.Frequency != RecurrenceFrequency.weekly)
                return new Error(ErrorType.Validation, "Weekdays only apply to a weekly repeat.");
            if (req.Weekdays.Any(d => d is < 1 or > 7))
                return new Error(ErrorType.Validation, "Weekdays must be between 1 (Monday) and 7 (Sunday).");
        }
        if (req.EndDate is { } end && end < req.StartDate)
            return new Error(ErrorType.Validation, "The repeat cannot end before it starts.");
        if (req.DurationMinutes is < 1 or > 24 * 60)
            return new Error(ErrorType.Validation, "Duration must be between 1 minute and 24 hours.");

        if (req.TimeOfDay is not null)
        {
            if (!TimeOnly.TryParseExact(req.TimeOfDay, ["HH:mm", "H:mm"], out var t))
                return new Error(ErrorType.Validation, "Time of day must be in HH:mm format.");
            timeOfDay = t;
        }
        return null;
    }

    public async Task<Result> DeleteAsync(Guid id, Guid userId)
    {
        var a = await db.Activities.FirstOrDefaultAsync(a => a.Id == id && a.UserId == userId);
        if (a is null) return Result.Fail(new Error(ErrorType.NotFound, "Activity not found."));
        db.Activities.Remove(a);
        await db.SaveChangesAsync();
        return Result.Success();
    }
}
