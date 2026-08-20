using Loom.Core.Entities;
using Loom.Core.Enums;

namespace Loom.Tests.Unit;

public class GoalServiceTests : IDisposable
{
    private readonly TestContext _ctx = new();

    public void Dispose() => _ctx.Dispose();

    // A Tuesday, so week alignment in the client is exercised against a mid-week "today".
    private static readonly DateTimeOffset Now = new(2026, 7, 7, 12, 0, 0, TimeSpan.Zero);

    private static DateTimeOffset At(int month, int day, int hour) =>
        new(2026, month, day, hour, 0, 0, TimeSpan.Zero);

    private async Task<(Guid userId, Guid goalId, Activity activity)> SetupOngoingGoalAsync(
        string timezone = "UTC", TimeOnly? dayBoundary = null)
    {
        var user = new User { Username = "u" + Guid.NewGuid().ToString("N")[..8], PasswordHash = "x", Timezone = timezone };
        var goal = new Goal { UserId = user.Id, Title = "Practice", Kind = GoalKind.ongoing };
        var activity = new Activity { UserId = user.Id, Title = "Scales", GoalId = goal.Id };
        _ctx.Db.Users.Add(user);
        _ctx.Db.Goals.Add(goal);
        _ctx.Db.Activities.Add(activity);
        if (dayBoundary is not null)
            _ctx.Db.UserSettings.Add(new UserSettings { UserId = user.Id, DayBoundaryTime = dayBoundary.Value });
        await _ctx.Db.SaveChangesAsync();
        return (user.Id, goal.Id, activity);
    }

    private async Task AddOccurrenceAsync(Guid userId, Activity activity, DateTimeOffset? startAt, EventStatus status)
    {
        _ctx.Db.Occurrences.Add(new Occurrence
        {
            UserId = userId,
            ActivityId = activity.Id,
            StartAt = startAt,
            Status = status,
        });
        await _ctx.Db.SaveChangesAsync();
    }

    [Fact]
    public async Task ListAsync_heatmap_buckets_occurrences_by_day()
    {
        var (userId, _, activity) = await SetupOngoingGoalAsync();
        await AddOccurrenceAsync(userId, activity, At(7, 6, 9), EventStatus.done);
        await AddOccurrenceAsync(userId, activity, At(7, 6, 18), EventStatus.done);
        await AddOccurrenceAsync(userId, activity, At(7, 5, 9), EventStatus.skipped);

        var goals = await _ctx.GoalService.ListAsync(userId, nowUtc: Now);

        var days = goals[0].Heatmap!.Days;
        Assert.Equal(2, days.Count);
        Assert.Equal(new DateOnly(2026, 7, 5), days[0].Date);
        Assert.Equal((0, 1), (days[0].Done, days[0].Skipped));
        Assert.Equal(new DateOnly(2026, 7, 6), days[1].Date);
        Assert.Equal((2, 0), (days[1].Done, days[1].Skipped));
    }

    [Fact]
    public async Task ListAsync_heatmap_window_ends_on_today()
    {
        var (userId, _, _) = await SetupOngoingGoalAsync();

        var goals = await _ctx.GoalService.ListAsync(userId, nowUtc: Now);

        // No occurrences at all: the goal has nothing to report, so no heatmap either.
        Assert.Null(goals[0].Heatmap);
    }

    [Fact]
    public async Task ListAsync_heatmap_spans_280_days_back_from_today()
    {
        var (userId, _, activity) = await SetupOngoingGoalAsync();
        await AddOccurrenceAsync(userId, activity, At(7, 6, 9), EventStatus.done);

        var heatmap = (await _ctx.GoalService.ListAsync(userId, nowUtc: Now))[0].Heatmap!;

        Assert.Equal(new DateOnly(2026, 7, 7), heatmap.End);
        Assert.Equal(new DateOnly(2026, 7, 7).AddDays(-279), heatmap.Start);
        // The widest grid is 39 Monday-first columns; the window has to reach the first of them.
        Assert.True(heatmap.Start <= new DateOnly(2026, 7, 6).AddDays(-7 * 38));
    }

    [Fact]
    public async Task ListAsync_heatmap_excludes_days_before_the_window()
    {
        var (userId, _, activity) = await SetupOngoingGoalAsync();
        await AddOccurrenceAsync(userId, activity, At(7, 6, 9), EventStatus.done);
        await AddOccurrenceAsync(userId, activity, new DateTimeOffset(2025, 7, 6, 9, 0, 0, TimeSpan.Zero), EventStatus.done);

        var goals = await _ctx.GoalService.ListAsync(userId, nowUtc: Now);

        var heatmap = goals[0].Heatmap!;
        Assert.Single(heatmap.Days);
        Assert.Equal(new DateOnly(2026, 7, 6), heatmap.Days[0].Date);
        // The old one is out of the window but still part of the lifetime totals.
        Assert.Equal(2, goals[0].OccurrenceStats!.Done);
    }

    [Fact]
    public async Task ListAsync_heatmap_excludes_pending_and_floating_occurrences()
    {
        var (userId, _, activity) = await SetupOngoingGoalAsync();
        await AddOccurrenceAsync(userId, activity, At(7, 6, 9), EventStatus.pending);
        await AddOccurrenceAsync(userId, activity, startAt: null, status: EventStatus.done);

        var goals = await _ctx.GoalService.ListAsync(userId, nowUtc: Now);

        Assert.Empty(goals[0].Heatmap!.Days);
        Assert.Equal(1, goals[0].OccurrenceStats!.Done);
        Assert.Equal(1, goals[0].OccurrenceStats!.Pending);
    }

    [Fact]
    public async Task ListAsync_heatmap_respects_the_day_boundary()
    {
        var (userId, _, activity) = await SetupOngoingGoalAsync(dayBoundary: new TimeOnly(4, 0));
        await AddOccurrenceAsync(userId, activity, At(7, 6, 1), EventStatus.done); // 01:00, before the boundary

        var goals = await _ctx.GoalService.ListAsync(userId, nowUtc: Now);

        Assert.Equal(new DateOnly(2026, 7, 5), goals[0].Heatmap!.Days[0].Date);
    }

    [Fact]
    public async Task ListAsync_milestone_goals_get_no_heatmap()
    {
        var (userId, goalId, activity) = await SetupOngoingGoalAsync();
        await AddOccurrenceAsync(userId, activity, At(7, 6, 9), EventStatus.done);
        var goal = await _ctx.Db.Goals.FindAsync(goalId);
        goal!.Kind = GoalKind.milestone;
        await _ctx.Db.SaveChangesAsync();

        var goals = await _ctx.GoalService.ListAsync(userId, nowUtc: Now);

        Assert.Null(goals[0].Heatmap);
        Assert.Null(goals[0].OccurrenceStats);
    }

    // ── GetAggregateHeatmapAsync ─────────────────────────────────────────────

    [Fact]
    public async Task GetAggregateHeatmapAsync_combines_occurrences_across_every_goal()
    {
        var (userId, _, activity) = await SetupOngoingGoalAsync();
        var milestoneGoal = new Goal { UserId = userId, Title = "Ship it", Kind = GoalKind.milestone };
        var milestoneActivity = new Activity { UserId = userId, Title = "Draft", GoalId = milestoneGoal.Id };
        _ctx.Db.Goals.Add(milestoneGoal);
        _ctx.Db.Activities.Add(milestoneActivity);
        await _ctx.Db.SaveChangesAsync();

        await AddOccurrenceAsync(userId, activity, At(7, 6, 9), EventStatus.done);
        await AddOccurrenceAsync(userId, milestoneActivity, At(7, 6, 18), EventStatus.done);
        await AddOccurrenceAsync(userId, milestoneActivity, At(7, 5, 9), EventStatus.skipped);

        var heatmap = await _ctx.GoalService.GetAggregateHeatmapAsync(userId, Now);

        Assert.Equal(2, heatmap.Days.Count);
        Assert.Equal(new DateOnly(2026, 7, 5), heatmap.Days[0].Date);
        Assert.Equal((0, 1), (heatmap.Days[0].Done, heatmap.Days[0].Skipped));
        Assert.Equal(new DateOnly(2026, 7, 6), heatmap.Days[1].Date);
        // A milestone goal's session counts too - the aggregate reads "toward any goal", not "ongoing only".
        Assert.Equal((2, 0), (heatmap.Days[1].Done, heatmap.Days[1].Skipped));
    }

    [Fact]
    public async Task GetAggregateHeatmapAsync_excludes_pending_and_floating_occurrences()
    {
        var (userId, _, activity) = await SetupOngoingGoalAsync();
        await AddOccurrenceAsync(userId, activity, At(7, 6, 9), EventStatus.pending);
        await AddOccurrenceAsync(userId, activity, startAt: null, status: EventStatus.done);

        var heatmap = await _ctx.GoalService.GetAggregateHeatmapAsync(userId, Now);

        Assert.Empty(heatmap.Days);
    }

    [Fact]
    public async Task GetAggregateHeatmapAsync_ignores_occurrences_on_activities_with_no_goal()
    {
        var user = new User { Username = "u" + Guid.NewGuid().ToString("N")[..8], PasswordHash = "x", Timezone = "UTC" };
        var activity = new Activity { UserId = user.Id, Title = "Chores" }; // no GoalId
        _ctx.Db.Users.Add(user);
        _ctx.Db.Activities.Add(activity);
        await _ctx.Db.SaveChangesAsync();
        await AddOccurrenceAsync(user.Id, activity, At(7, 6, 9), EventStatus.done);

        var heatmap = await _ctx.GoalService.GetAggregateHeatmapAsync(user.Id, Now);

        Assert.Empty(heatmap.Days);
        Assert.Equal(new DateOnly(2026, 7, 7), heatmap.End);
    }

    [Fact]
    public async Task GetAggregateHeatmapAsync_returns_empty_window_when_no_goal_linked_activities()
    {
        var user = new User { Username = "u" + Guid.NewGuid().ToString("N")[..8], PasswordHash = "x", Timezone = "UTC" };
        _ctx.Db.Users.Add(user);
        await _ctx.Db.SaveChangesAsync();

        var heatmap = await _ctx.GoalService.GetAggregateHeatmapAsync(user.Id, Now);

        Assert.Empty(heatmap.Days);
        Assert.Equal(new DateOnly(2026, 7, 7), heatmap.End);
        Assert.Equal(new DateOnly(2026, 7, 7).AddDays(-279), heatmap.Start);
    }
}
