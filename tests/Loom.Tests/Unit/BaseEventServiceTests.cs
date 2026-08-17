using Loom.Core.Common;
using Loom.Core.Dtos;
using Loom.Core.Entities;
using Loom.Core.Services;

namespace Loom.Tests.Unit;

public class ActivityServiceTests : IDisposable
{
    private readonly TestContext _ctx = new();

    public void Dispose() => _ctx.Dispose();

    private async Task<(Guid userId, Guid goalId)> CreateUserWithGoalAsync()
    {
        var user = new User
        {
            Username = "u" + Guid.NewGuid().ToString("N")[..8],
            PasswordHash = "x",
            Timezone = "UTC",
        };
        var goal = new Goal { UserId = user.Id, Title = "My Goal" };
        _ctx.Db.Users.Add(user);
        _ctx.Db.Goals.Add(goal);
        await _ctx.Db.SaveChangesAsync();
        return (user.Id, goal.Id);
    }

    [Fact]
    public async Task CreateAsync_returns_activity()
    {
        var (userId, goalId) = await CreateUserWithGoalAsync();

        var result = await _ctx.ActivityService.CreateAsync(userId, new CreateActivityRequest("Morning run", null, goalId));

        Assert.True(result.IsSuccess);
        Assert.Equal("Morning run", result.Value!.Title);
        Assert.Equal(goalId, result.Value.GoalId);
    }

    [Fact]
    public async Task CreateAsync_unknown_goal_returns_not_found()
    {
        var (userId, _) = await CreateUserWithGoalAsync();

        var result = await _ctx.ActivityService.CreateAsync(userId, new CreateActivityRequest("Task", null, Guid.NewGuid()));

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorType.NotFound, result.Error!.Type);
    }

    [Fact]
    public async Task CreateAsync_empty_title_returns_validation_error()
    {
        var (userId, goalId) = await CreateUserWithGoalAsync();

        var result = await _ctx.ActivityService.CreateAsync(userId, new CreateActivityRequest("  ", null, goalId));

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorType.Validation, result.Error!.Type);
    }

    [Fact]
    public async Task UpdateAsync_changes_title()
    {
        var (userId, goalId) = await CreateUserWithGoalAsync();
        var created = (await _ctx.ActivityService.CreateAsync(userId, new CreateActivityRequest("Old title", null, goalId))).Value!;

        var result = await _ctx.ActivityService.UpdateAsync(created.Id, userId, new UpdateActivityRequest("New title", null, goalId));

        Assert.True(result.IsSuccess);
        Assert.Equal("New title", result.Value!.Title);
    }

    [Fact]
    public async Task UpdateAsync_unknown_returns_not_found()
    {
        var (userId, goalId) = await CreateUserWithGoalAsync();

        var result = await _ctx.ActivityService.UpdateAsync(Guid.NewGuid(), userId, new UpdateActivityRequest("X", null, goalId));

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorType.NotFound, result.Error!.Type);
    }

    [Fact]
    public async Task DeleteAsync_removes_activity()
    {
        var (userId, goalId) = await CreateUserWithGoalAsync();
        var created = (await _ctx.ActivityService.CreateAsync(userId, new CreateActivityRequest("To delete", null, goalId))).Value!;

        var deleteResult = await _ctx.ActivityService.DeleteAsync(created.Id, userId);
        var remaining = await _ctx.ActivityService.ListAsync(userId, goalId);

        Assert.True(deleteResult.IsSuccess);
        Assert.Empty(remaining);
    }

    [Fact]
    public async Task DeleteAsync_unknown_returns_not_found()
    {
        var (userId, _) = await CreateUserWithGoalAsync();

        var result = await _ctx.ActivityService.DeleteAsync(Guid.NewGuid(), userId);

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorType.NotFound, result.Error!.Type);
    }

    [Fact]
    public async Task ListAsync_filtered_by_goal()
    {
        var (userId, goal1Id) = await CreateUserWithGoalAsync();
        var goal2 = new Goal { UserId = userId, Title = "Goal 2" };
        _ctx.Db.Goals.Add(goal2);
        await _ctx.Db.SaveChangesAsync();

        await _ctx.ActivityService.CreateAsync(userId, new CreateActivityRequest("Activity A", null, goal1Id));
        await _ctx.ActivityService.CreateAsync(userId, new CreateActivityRequest("Activity B", null, goal1Id));
        await _ctx.ActivityService.CreateAsync(userId, new CreateActivityRequest("Activity C", null, goal2.Id));

        var list = await _ctx.ActivityService.ListAsync(userId, goal1Id);

        Assert.Equal(2, list.Count);
        Assert.All(list, a => Assert.Equal(goal1Id, a.GoalId));
    }

    private async Task AddOccurrenceAsync(Guid userId, Guid activityId, DateTimeOffset? startAt)
    {
        _ctx.Db.Occurrences.Add(new Occurrence { UserId = userId, ActivityId = activityId, StartAt = startAt });
        await _ctx.Db.SaveChangesAsync();
    }

    [Fact]
    public async Task ListAsync_counts_occurrences_inside_the_recent_window()
    {
        var (userId, goalId) = await CreateUserWithGoalAsync();
        var now = DateTimeOffset.UtcNow;
        var recent = (await _ctx.ActivityService.CreateAsync(userId, new CreateActivityRequest("Recent", null, goalId))).Value!;
        var stale = (await _ctx.ActivityService.CreateAsync(userId, new CreateActivityRequest("Stale", null, goalId))).Value!;

        await AddOccurrenceAsync(userId, recent.Id, now.AddDays(-10));
        await AddOccurrenceAsync(userId, recent.Id, now.AddDays(-200));
        await AddOccurrenceAsync(userId, stale.Id, now.AddDays(-ActivityService.RecentWindowDays - 5));

        var list = await _ctx.ActivityService.ListAsync(userId);

        Assert.Equal(2, list.Single(a => a.Title == "Recent").RecentOccurrenceCount);
        Assert.Equal(0, list.Single(a => a.Title == "Stale").RecentOccurrenceCount);
    }

    [Fact]
    public async Task ListAsync_counts_floating_occurrences_by_creation_time()
    {
        var (userId, goalId) = await CreateUserWithGoalAsync();
        var activity = (await _ctx.ActivityService.CreateAsync(userId, new CreateActivityRequest("Floating", null, goalId))).Value!;

        await AddOccurrenceAsync(userId, activity.Id, null);

        var list = await _ctx.ActivityService.ListAsync(userId);

        Assert.Equal(1, Assert.Single(list).RecentOccurrenceCount);
    }

    [Fact]
    public async Task ListAsync_does_not_count_another_users_occurrences()
    {
        var (userId, goalId) = await CreateUserWithGoalAsync();
        var (otherId, otherGoalId) = await CreateUserWithGoalAsync();
        await _ctx.ActivityService.CreateAsync(userId, new CreateActivityRequest("Mine", null, goalId));
        var theirs = (await _ctx.ActivityService.CreateAsync(otherId, new CreateActivityRequest("Theirs", null, otherGoalId))).Value!;

        await AddOccurrenceAsync(otherId, theirs.Id, DateTimeOffset.UtcNow.AddDays(-1));

        var list = await _ctx.ActivityService.ListAsync(userId);

        Assert.Equal(0, Assert.Single(list).RecentOccurrenceCount);
    }
}
