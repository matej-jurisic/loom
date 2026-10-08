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
            .Include(a => a.Goals)
            .Include(a => a.Tags)
            .Include(a => a.Subtasks)
            .Include(a => a.WorkTypes)
            .FirstOrDefaultAsync(a => a.Id == id && a.UserId == userId);
        return a is null
            ? Result<ActivityDto>.Fail(new Error(ErrorType.NotFound, "Activity not found."))
            : Result<ActivityDto>.Success(ActivityDto.FromEntity(a));
    }

    public async Task<List<ActivityDto>> ListAsync(Guid userId, Guid? goalId = null, Guid? tagId = null)
    {
        var query = db.Activities
            .Include(a => a.Category)
            .Include(a => a.Goals)
            .Include(a => a.Tags)
            .Include(a => a.Subtasks)
            .Include(a => a.WorkTypes)
            .Where(a => a.UserId == userId && a.Kind == ActivityKind.activity);

        if (goalId.HasValue)
            query = query.Where(a => a.Goals.Any(g => g.Id == goalId.Value));

        if (tagId.HasValue)
            query = query.Where(a => a.Tags.Any(t => t.Id == tagId.Value));

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
        var err = Validators.ValidateTitle(req.Title, "Title")
            ?? Validators.ValidateRepeatAfterDays(req.RepeatAfterDays);
        if (err is not null) return Result<ActivityDto>.Fail(err);

        var a = new Activity { UserId = userId, Title = req.Title.Trim(), RepeatAfterDays = req.RepeatAfterDays };

        if (req.CategoryId.HasValue)
        {
            var cat = await db.Categories.FirstOrDefaultAsync(c => c.Id == req.CategoryId.Value && c.UserId == userId);
            if (cat is null) return Result<ActivityDto>.Fail(new Error(ErrorType.NotFound, "Category not found."));
            a.CategoryId = req.CategoryId.Value;
            a.Category = cat;
        }

        var goals = await ResolveGoalsAsync(db, userId, req.GoalIds);
        if (!goals.IsSuccess) return Result<ActivityDto>.Fail(goals.Error!);
        a.Goals = goals.Value!;

        var tags = await ResolveTagsAsync(db, userId, req.TagIds);
        if (!tags.IsSuccess) return Result<ActivityDto>.Fail(tags.Error!);
        a.Tags = tags.Value!;

        db.Activities.Add(a);
        await db.SaveChangesAsync();
        return Result<ActivityDto>.Success(ActivityDto.FromEntity(a));
    }

    public async Task<Result<ActivityDto>> UpdateAsync(Guid id, Guid userId, UpdateActivityRequest req)
    {
        var err = Validators.ValidateTitle(req.Title, "Title")
            ?? Validators.ValidateRepeatAfterDays(req.RepeatAfterDays);
        if (err is not null) return Result<ActivityDto>.Fail(err);

        var a = await db.Activities
            .Include(a => a.Category)
            .Include(a => a.Goals)
            .Include(a => a.Tags)
            .Include(a => a.Subtasks)
            .Include(a => a.WorkTypes)
            .FirstOrDefaultAsync(a => a.Id == id && a.UserId == userId);
        if (a is null) return Result<ActivityDto>.Fail(new Error(ErrorType.NotFound, "Activity not found."));

        a.Title = req.Title.Trim();
        a.RepeatAfterDays = req.RepeatAfterDays;

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

        var goals = await ResolveGoalsAsync(db, userId, req.GoalIds);
        if (!goals.IsSuccess) return Result<ActivityDto>.Fail(goals.Error!);
        SetGoals(a, goals.Value!);

        var tags = await ResolveTagsAsync(db, userId, req.TagIds);
        if (!tags.IsSuccess) return Result<ActivityDto>.Fail(tags.Error!);
        a.Tags.RemoveAll(t => tags.Value!.All(n => n.Id != t.Id));
        foreach (var tag in tags.Value!)
            if (a.Tags.All(t => t.Id != tag.Id))
                a.Tags.Add(tag);

        await db.SaveChangesAsync();
        return Result<ActivityDto>.Success(ActivityDto.FromEntity(a));
    }

    internal static async Task<Result<List<Goal>>> ResolveGoalsAsync(LoomDbContext db, Guid userId, List<Guid>? goalIds)
    {
        var ids = (goalIds ?? []).Distinct().ToList();
        if (ids.Count == 0) return Result<List<Goal>>.Success([]);

        var goals = await db.Goals.Where(g => g.UserId == userId && ids.Contains(g.Id)).ToListAsync();
        return goals.Count == ids.Count
            ? Result<List<Goal>>.Success(goals)
            : Result<List<Goal>>.Fail(new Error(ErrorType.NotFound, "Goal not found."));
    }

    internal static async Task<Result<List<Tag>>> ResolveTagsAsync(LoomDbContext db, Guid userId, List<Guid>? tagIds)
    {
        var ids = (tagIds ?? []).Distinct().ToList();
        if (ids.Count == 0) return Result<List<Tag>>.Success([]);

        var tags = await db.Tags.Where(t => t.UserId == userId && ids.Contains(t.Id)).ToListAsync();
        return tags.Count == ids.Count
            ? Result<List<Tag>>.Success(tags)
            : Result<List<Tag>>.Fail(new Error(ErrorType.NotFound, "Tag not found."));
    }

    internal static void SetGoals(Activity a, List<Goal> goals)
    {
        a.Goals.RemoveAll(g => goals.All(n => n.Id != g.Id));
        foreach (var goal in goals)
            if (a.Goals.All(g => g.Id != goal.Id))
                a.Goals.Add(goal);
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
