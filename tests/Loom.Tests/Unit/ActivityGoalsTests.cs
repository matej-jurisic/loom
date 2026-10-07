using Loom.Core.Common;
using Loom.Core.Dtos;
using Loom.Core.Entities;
using Loom.Core.Enums;

namespace Loom.Tests.Unit;

public class ActivityGoalsTests : IDisposable
{
    private readonly TestContext _ctx = new();

    public void Dispose() => _ctx.Dispose();

    private static readonly DateTimeOffset Now = new(2026, 7, 7, 12, 0, 0, TimeSpan.Zero);
    private static readonly DateTimeOffset Yesterday = new(2026, 7, 6, 9, 0, 0, TimeSpan.Zero);

    private async Task<Guid> CreateUserAsync()
    {
        var user = new User { Username = "u" + Guid.NewGuid().ToString("N")[..8], PasswordHash = "x", Timezone = "UTC" };
        _ctx.Db.Users.Add(user);
        await _ctx.Db.SaveChangesAsync();
        return user.Id;
    }

    private async Task<Goal> CreateGoalAsync(Guid userId, string title, GoalStatus status = GoalStatus.active)
    {
        var goal = new Goal { UserId = userId, Title = title, Status = status };
        _ctx.Db.Goals.Add(goal);
        await _ctx.Db.SaveChangesAsync();
        return goal;
    }

    private async Task<ActivityDto> CreateActivityAsync(Guid userId, string title, params Goal[] goals) =>
        (await _ctx.ActivityService.CreateAsync(
            userId, new CreateActivityRequest(title, null, goals.Select(g => g.Id).ToList()))).Value!;

    private async Task AddOccurrenceAsync(Guid userId, Guid activityId, DateTimeOffset? startAt, EventStatus status)
    {
        _ctx.Db.Occurrences.Add(new Occurrence { UserId = userId, ActivityId = activityId, StartAt = startAt, Status = status });
        await _ctx.Db.SaveChangesAsync();
    }

    [Fact]
    public async Task CreateAsync_links_every_goal_once()
    {
        var userId = await CreateUserAsync();
        var a = await CreateGoalAsync(userId, "A");
        var b = await CreateGoalAsync(userId, "B");

        var result = await _ctx.ActivityService.CreateAsync(
            userId, new CreateActivityRequest("Run", null, [a.Id, b.Id, a.Id]));

        Assert.True(result.IsSuccess);
        Assert.Equal(["A", "B"], result.Value!.Goals.Select(g => g.Title));
    }

    [Fact]
    public async Task CreateAsync_goal_of_another_user_returns_not_found()
    {
        var userId = await CreateUserAsync();
        var otherId = await CreateUserAsync();
        var mine = await CreateGoalAsync(userId, "Mine");
        var theirs = await CreateGoalAsync(otherId, "Theirs");

        var result = await _ctx.ActivityService.CreateAsync(
            userId, new CreateActivityRequest("Run", null, [mine.Id, theirs.Id]));

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorType.NotFound, result.Error!.Type);
    }

    [Fact]
    public async Task UpdateAsync_replaces_the_goal_set()
    {
        var userId = await CreateUserAsync();
        var a = await CreateGoalAsync(userId, "A");
        var b = await CreateGoalAsync(userId, "B");
        var c = await CreateGoalAsync(userId, "C");
        var activity = await CreateActivityAsync(userId, "Run", a, b);

        var result = await _ctx.ActivityService.UpdateAsync(
            activity.Id, userId, new UpdateActivityRequest("Run", null, [b.Id, c.Id]));

        Assert.True(result.IsSuccess);
        _ctx.Db.ChangeTracker.Clear();
        var reloaded = (await _ctx.ActivityService.GetAsync(activity.Id, userId)).Value!;
        Assert.Equal(["B", "C"], reloaded.Goals.Select(g => g.Title));
    }

    [Fact]
    public async Task UpdateAsync_without_goals_clears_them()
    {
        var userId = await CreateUserAsync();
        var a = await CreateGoalAsync(userId, "A");
        var b = await CreateGoalAsync(userId, "B");
        var activity = await CreateActivityAsync(userId, "Run", a, b);

        await _ctx.ActivityService.UpdateAsync(activity.Id, userId, new UpdateActivityRequest("Run", null));

        _ctx.Db.ChangeTracker.Clear();
        var reloaded = (await _ctx.ActivityService.GetAsync(activity.Id, userId)).Value!;
        Assert.Empty(reloaded.Goals);
    }

    [Fact]
    public async Task ListAsync_by_goal_returns_a_shared_activity_for_each_goal()
    {
        var userId = await CreateUserAsync();
        var a = await CreateGoalAsync(userId, "A");
        var b = await CreateGoalAsync(userId, "B");
        await CreateActivityAsync(userId, "Shared", a, b);
        await CreateActivityAsync(userId, "Only A", a);

        var forA = await _ctx.ActivityService.ListAsync(userId, a.Id);
        var forB = await _ctx.ActivityService.ListAsync(userId, b.Id);

        Assert.Equal(["Only A", "Shared"], forA.Select(x => x.Title));
        Assert.Equal(["Shared"], forB.Select(x => x.Title));
    }

    [Fact]
    public async Task GoalList_counts_a_shared_occurrence_toward_each_goal()
    {
        var userId = await CreateUserAsync();
        var a = await CreateGoalAsync(userId, "A");
        var b = await CreateGoalAsync(userId, "B");
        var shared = await CreateActivityAsync(userId, "Shared", a, b);
        var onlyA = await CreateActivityAsync(userId, "Only A", a);
        await AddOccurrenceAsync(userId, shared.Id, Yesterday, EventStatus.done);
        await AddOccurrenceAsync(userId, onlyA.Id, Yesterday, EventStatus.done);

        var goals = (await _ctx.GoalService.ListAsync(userId, nowUtc: Now)).ToDictionary(g => g.Title);

        Assert.Equal(2, goals["A"].OccurrenceStats!.Done);
        Assert.Equal(1, goals["B"].OccurrenceStats!.Done);
        Assert.Equal(2, Assert.Single(goals["A"].Heatmap!.Days).Done);
        Assert.Equal(1, Assert.Single(goals["B"].Heatmap!.Days).Done);
        Assert.Equal(Yesterday, goals["A"].LastOccurrenceAt);
        Assert.Equal(Yesterday, goals["B"].LastOccurrenceAt);
        Assert.Equal(1, goals["B"].DaysSinceLastOccurrence);
    }

    [Fact]
    public async Task AggregateHeatmap_counts_a_shared_occurrence_once()
    {
        var userId = await CreateUserAsync();
        var a = await CreateGoalAsync(userId, "A");
        var b = await CreateGoalAsync(userId, "B");
        var shared = await CreateActivityAsync(userId, "Shared", a, b);
        await AddOccurrenceAsync(userId, shared.Id, Yesterday, EventStatus.done);

        var heatmap = await _ctx.GoalService.GetAggregateHeatmapAsync(userId, Now);

        Assert.Equal(1, Assert.Single(heatmap.Days).Done);
    }

    [Fact]
    public async Task DeletingAGoal_keeps_the_activity_and_its_other_goals()
    {
        var userId = await CreateUserAsync();
        var a = await CreateGoalAsync(userId, "A");
        var b = await CreateGoalAsync(userId, "B");
        var activity = await CreateActivityAsync(userId, "Shared", a, b);

        var result = await _ctx.GoalService.DeleteAsync(a.Id, userId);

        Assert.True(result.IsSuccess);
        _ctx.Db.ChangeTracker.Clear();
        var reloaded = (await _ctx.ActivityService.GetAsync(activity.Id, userId)).Value!;
        Assert.Equal(["B"], reloaded.Goals.Select(g => g.Title));
    }

    [Fact]
    public async Task DeletingAnActivity_keeps_its_goals()
    {
        var userId = await CreateUserAsync();
        var a = await CreateGoalAsync(userId, "A");
        var activity = await CreateActivityAsync(userId, "Run", a);

        var result = await _ctx.ActivityService.DeleteAsync(activity.Id, userId);

        Assert.True(result.IsSuccess);
        Assert.Single(await _ctx.GoalService.ListAsync(userId, nowUtc: Now));
    }

    [Fact]
    public async Task OccurrenceList_by_goal_returns_a_shared_occurrence_for_each_goal()
    {
        var userId = await CreateUserAsync();
        var a = await CreateGoalAsync(userId, "A");
        var b = await CreateGoalAsync(userId, "B");
        var c = await CreateGoalAsync(userId, "C");
        var shared = await CreateActivityAsync(userId, "Shared", a, b);
        await AddOccurrenceAsync(userId, shared.Id, Yesterday, EventStatus.done);

        Assert.Single(await _ctx.OccurrenceService.ListAsync(userId, goalId: a.Id));
        Assert.Single(await _ctx.OccurrenceService.ListAsync(userId, goalId: b.Id));
        Assert.Empty(await _ctx.OccurrenceService.ListAsync(userId, goalId: c.Id));
    }

    [Fact]
    public async Task FloatingList_hides_an_occurrence_only_when_every_goal_is_benched()
    {
        var userId = await CreateUserAsync();
        var active = await CreateGoalAsync(userId, "Active");
        var benched = await CreateGoalAsync(userId, "Benched", GoalStatus.bench);
        var alsoBenched = await CreateGoalAsync(userId, "Also benched", GoalStatus.bench);
        var mixed = await CreateActivityAsync(userId, "Mixed", active, benched);
        var allBenched = await CreateActivityAsync(userId, "All benched", benched, alsoBenched);
        var noGoal = await CreateActivityAsync(userId, "No goal");
        await AddOccurrenceAsync(userId, mixed.Id, null, EventStatus.pending);
        await AddOccurrenceAsync(userId, allBenched.Id, null, EventStatus.pending);
        await AddOccurrenceAsync(userId, noGoal.Id, null, EventStatus.pending);

        var floating = await _ctx.OccurrenceService.ListAsync(userId, floatingOnly: true);

        Assert.Equal(["Mixed", "No goal"], floating.Select(o => o.EffectiveTitle).Order());
    }

    [Fact]
    public async Task Event_goals_are_set_on_create_and_replaced_on_update()
    {
        var userId = await CreateUserAsync();
        var a = await CreateGoalAsync(userId, "A");
        var b = await CreateGoalAsync(userId, "B");

        var created = (await _ctx.OccurrenceService.CreateEventAsync(
            userId, new CreateEventRequest("Recital", null, [a.Id, b.Id], Yesterday, null, false, false))).Value!;
        Assert.Equal(["A", "B"], created.Activity.Goals.Select(g => g.Title));

        var updated = await _ctx.OccurrenceService.UpdateEventAsync(
            created.Id, userId, new UpdateEventRequest("Recital", null, [b.Id], Yesterday, null, false, false));

        Assert.True(updated.IsSuccess);
        _ctx.Db.ChangeTracker.Clear();
        var reloaded = (await _ctx.OccurrenceService.GetAsync(created.Id, userId)).Value!;
        Assert.Equal(["B"], reloaded.Activity.Goals.Select(g => g.Title));
    }
}
