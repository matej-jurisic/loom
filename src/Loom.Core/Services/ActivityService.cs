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

    public async Task<Result> DeleteAsync(Guid id, Guid userId)
    {
        var a = await db.Activities.FirstOrDefaultAsync(a => a.Id == id && a.UserId == userId);
        if (a is null) return Result.Fail(new Error(ErrorType.NotFound, "Activity not found."));
        db.Activities.Remove(a);
        await db.SaveChangesAsync();
        return Result.Success();
    }
}
