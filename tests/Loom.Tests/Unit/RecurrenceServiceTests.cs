using Loom.Core.Common;
using Loom.Core.Dtos;
using Loom.Core.Entities;
using Loom.Core.Enums;
using Microsoft.EntityFrameworkCore;

namespace Loom.Tests.Unit;

public class RecurrenceServiceTests : IDisposable
{
    private readonly TestContext _ctx = new();
    private static readonly DateOnly Today = DateOnly.FromDateTime(DateTime.UtcNow);

    public void Dispose() => _ctx.Dispose();

    private static DateTimeOffset Midnight(DateOnly d) => new(d.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);

    private async Task<Guid> CreateUserAsync()
    {
        var user = new User { Username = "u" + Guid.NewGuid().ToString("N")[..8], PasswordHash = "x", Timezone = "UTC" };
        _ctx.Db.Users.Add(user);
        await _ctx.Db.SaveChangesAsync();
        return user.Id;
    }

    private static SetRecurrenceRequest Daily(DateOnly? start = null, string? time = "09:00", int? duration = 30) =>
        new(RecurrenceFrequency.daily, 1, null, start ?? Today, null, time, duration);

    private async Task<ActivityDto> CreateRepeatingAsync(Guid userId, SetRecurrenceRequest? rule = null, string title = "Stretch")
    {
        var a = (await _ctx.ActivityService.CreateAsync(userId, new CreateActivityRequest(title, null, null))).Value!;
        var set = await _ctx.ActivityService.SetRecurrenceAsync(a.Id, userId, rule ?? Daily());
        Assert.True(set.IsSuccess, set.Error?.Message);
        return set.Value!;
    }

    private Task<List<OccurrenceDto>> ListDaysAsync(Guid userId, int days, DateOnly? from = null,
        EventStatus? status = null, Guid? goalId = null, Guid? activityId = null)
    {
        var start = Midnight(from ?? Today);
        return _ctx.OccurrenceService.ListAsync(userId, status, start, start.AddDays(days), goalId: goalId, activityId: activityId);
    }

    [Fact]
    public async Task List_projects_a_daily_repeat_for_each_day_in_a_closed_range()
    {
        var userId = await CreateUserAsync();
        var a = await CreateRepeatingAsync(userId);

        var list = await ListDaysAsync(userId, 3);

        Assert.Equal(3, list.Count);
        Assert.All(list, o =>
        {
            Assert.True(o.IsProjected);
            Assert.Equal(a.Id, o.ActivityId);
            Assert.Equal("Stretch", o.EffectiveTitle);
            Assert.Equal("pending", o.Status);
            Assert.NotNull(o.EndAt);
        });
        Assert.Equal([Today, Today.AddDays(1), Today.AddDays(2)], list.Select(o => o.SeriesDate!.Value));
        Assert.Equal(3, list.Select(o => o.Id).Distinct().Count());
        Assert.Empty(await _ctx.Db.Occurrences.ToListAsync());
    }

    [Fact]
    public async Task List_projects_nothing_before_today()
    {
        var userId = await CreateUserAsync();
        await CreateRepeatingAsync(userId, Daily(start: Today.AddDays(-10)));

        var list = await ListDaysAsync(userId, 5, from: Today.AddDays(-4));

        Assert.Equal([Today], list.Select(o => o.SeriesDate!.Value));
    }

    [Fact]
    public async Task List_projects_nothing_when_the_range_has_no_upper_bound()
    {
        var userId = await CreateUserAsync();
        await CreateRepeatingAsync(userId);

        var open = await _ctx.OccurrenceService.ListAsync(userId, startFrom: Midnight(Today));
        var all = await _ctx.OccurrenceService.ListAsync(userId);

        Assert.Empty(open);
        Assert.Empty(all);
    }

    [Fact]
    public async Task List_projects_only_for_pending_status_or_no_status_filter()
    {
        var userId = await CreateUserAsync();
        await CreateRepeatingAsync(userId);

        Assert.Equal(2, (await ListDaysAsync(userId, 2, status: EventStatus.pending)).Count);
        Assert.Empty(await ListDaysAsync(userId, 2, status: EventStatus.done));
        Assert.Empty(await ListDaysAsync(userId, 2, status: EventStatus.skipped));
    }

    [Fact]
    public async Task List_respects_start_and_end_dates_of_the_rule()
    {
        var userId = await CreateUserAsync();
        await CreateRepeatingAsync(userId,
            new SetRecurrenceRequest(RecurrenceFrequency.daily, 1, null, Today.AddDays(1), Today.AddDays(2), "09:00", 30));

        var list = await ListDaysAsync(userId, 6);

        Assert.Equal([Today.AddDays(1), Today.AddDays(2)], list.Select(o => o.SeriesDate!.Value));
    }

    [Fact]
    public async Task List_filters_projections_by_goal_and_activity()
    {
        var userId = await CreateUserAsync();
        var goal = new Goal { UserId = userId, Title = "G" };
        _ctx.Db.Goals.Add(goal);
        await _ctx.Db.SaveChangesAsync();
        var linked = (await _ctx.ActivityService.CreateAsync(userId, new CreateActivityRequest("Linked", null, goal.Id))).Value!;
        Assert.True((await _ctx.ActivityService.SetRecurrenceAsync(linked.Id, userId, Daily())).IsSuccess);
        var other = await CreateRepeatingAsync(userId, title: "Other");

        var byGoal = await ListDaysAsync(userId, 1, goalId: goal.Id);
        var byActivity = await ListDaysAsync(userId, 1, activityId: other.Id);

        Assert.Equal(linked.Id, Assert.Single(byGoal).ActivityId);
        Assert.Equal(other.Id, Assert.Single(byActivity).ActivityId);
    }

    [Fact]
    public async Task List_returns_real_and_projected_rows_in_time_order()
    {
        var userId = await CreateUserAsync();
        var a = await CreateRepeatingAsync(userId);
        var real = (await _ctx.OccurrenceService.CreateAsync(userId, new CreateOccurrenceRequest(
            a.Id, "One-off", Midnight(Today).AddHours(12), null, false, false, null, null, null, null))).Value!;

        var list = await ListDaysAsync(userId, 1);

        Assert.Equal([false, true], list.Select(o => o.IsProjected).Reverse());
        Assert.Equal(real.Id, list[^1].Id);
    }

    [Fact]
    public async Task An_event_cannot_repeat()
    {
        var userId = await CreateUserAsync();
        var ev = (await _ctx.OccurrenceService.CreateEventAsync(userId,
            new CreateEventRequest("Dentist", null, null, DateTimeOffset.UtcNow, DateTimeOffset.UtcNow.AddHours(1), false, false, null))).Value!;

        var set = await _ctx.ActivityService.SetRecurrenceAsync(ev.ActivityId, userId, Daily());

        Assert.Equal(ErrorType.Validation, set.Error!.Type);
    }

    [Fact]
    public async Task All_day_rule_projects_all_day_occurrences()
    {
        var userId = await CreateUserAsync();
        await CreateRepeatingAsync(userId, Daily(time: null, duration: null));

        var o = Assert.Single(await ListDaysAsync(userId, 1));

        Assert.True(o.IsAllDay);
        Assert.Equal(Midnight(Today), o.StartAt);
        Assert.Null(o.EndAt);
    }

    [Fact]
    public async Task Materialize_creates_the_row_under_the_projected_id_and_stops_projecting_the_day()
    {
        var userId = await CreateUserAsync();
        var a = await CreateRepeatingAsync(userId);
        var projected = (await ListDaysAsync(userId, 2)).First();

        var made = await _ctx.OccurrenceService.MaterializeAsync(userId, new MaterializeOccurrenceRequest(a.Id, projected.SeriesDate!.Value));

        Assert.True(made.IsSuccess, made.Error?.Message);
        Assert.Equal(projected.Id, made.Value!.Id);
        Assert.False(made.Value.IsProjected);
        Assert.Equal(projected.StartAt, made.Value.StartAt);
        Assert.Equal(projected.EndAt, made.Value.EndAt);

        var after = await ListDaysAsync(userId, 2);
        Assert.Equal(2, after.Count);
        Assert.Equal([false, true], after.Select(o => o.IsProjected));
        Assert.Equal(1, await _ctx.Db.Occurrences.CountAsync());
    }

    [Fact]
    public async Task Materialize_twice_returns_the_same_row()
    {
        var userId = await CreateUserAsync();
        var a = await CreateRepeatingAsync(userId);

        var first = await _ctx.OccurrenceService.MaterializeAsync(userId, new MaterializeOccurrenceRequest(a.Id, Today));
        var second = await _ctx.OccurrenceService.MaterializeAsync(userId, new MaterializeOccurrenceRequest(a.Id, Today));

        Assert.Equal(first.Value!.Id, second.Value!.Id);
        Assert.Equal(1, await _ctx.Db.Occurrences.CountAsync());
    }

    [Fact]
    public async Task Materialize_rejects_a_day_the_rule_does_not_land_on()
    {
        var userId = await CreateUserAsync();
        var a = await CreateRepeatingAsync(userId, new SetRecurrenceRequest(RecurrenceFrequency.daily, 2, null, Today, null, "09:00", 30));

        var result = await _ctx.OccurrenceService.MaterializeAsync(userId, new MaterializeOccurrenceRequest(a.Id, Today.AddDays(1)));

        Assert.Equal(ErrorType.Conflict, result.Error!.Type);
        Assert.Empty(await _ctx.Db.Occurrences.ToListAsync());
    }

    [Fact]
    public async Task Materialize_cannot_reach_another_users_activity()
    {
        var owner = await CreateUserAsync();
        var stranger = await CreateUserAsync();
        var a = await CreateRepeatingAsync(owner);

        var result = await _ctx.OccurrenceService.MaterializeAsync(stranger, new MaterializeOccurrenceRequest(a.Id, Today));

        Assert.Equal(ErrorType.NotFound, result.Error!.Type);
    }

    [Fact]
    public async Task Materialized_row_can_be_completed_and_is_no_longer_projected()
    {
        var userId = await CreateUserAsync();
        var a = await CreateRepeatingAsync(userId);
        var made = (await _ctx.OccurrenceService.MaterializeAsync(userId, new MaterializeOccurrenceRequest(a.Id, Today))).Value!;

        var done = await _ctx.OccurrenceService.SetStatusAsync(made.Id, userId, EventStatus.done);

        Assert.Equal("done", done.Value!.Status);
        var list = await ListDaysAsync(userId, 1);
        Assert.Equal("done", Assert.Single(list).Status);
        Assert.Empty(await ListDaysAsync(userId, 1, status: EventStatus.pending));
    }

    [Fact]
    public async Task Moving_a_materialized_row_does_not_reopen_its_original_slot()
    {
        var userId = await CreateUserAsync();
        var a = await CreateRepeatingAsync(userId);
        var made = (await _ctx.OccurrenceService.MaterializeAsync(userId, new MaterializeOccurrenceRequest(a.Id, Today))).Value!;

        var moved = await _ctx.OccurrenceService.UpdateAsync(made.Id, userId, new UpdateOccurrenceRequest(
            made.Title, Midnight(Today).AddDays(1).AddHours(18), null, false, false, null));
        Assert.True(moved.IsSuccess);

        var today = await ListDaysAsync(userId, 1);
        Assert.Empty(today);

        var tomorrow = await ListDaysAsync(userId, 1, from: Today.AddDays(1));
        Assert.Equal(2, tomorrow.Count);
        Assert.Equal(1, tomorrow.Count(o => !o.IsProjected));
        Assert.Equal(Today, tomorrow.Single(o => !o.IsProjected).SeriesDate);
    }

    [Fact]
    public async Task Projected_and_materialized_subtasks_share_ids_and_start_undone()
    {
        var userId = await CreateUserAsync();
        var a = await CreateRepeatingAsync(userId);
        Assert.True((await new Loom.Core.Services.ActivitySubtaskService(_ctx.Db)
            .CreateAsync(a.Id, userId, new CreateActivitySubtaskRequest("Warm up"))).IsSuccess);

        var projected = (await ListDaysAsync(userId, 1)).Single();
        var made = (await _ctx.OccurrenceService.MaterializeAsync(userId, new MaterializeOccurrenceRequest(a.Id, Today))).Value!;

        var p = Assert.Single(projected.Subtasks);
        var m = Assert.Single(made.Subtasks);
        Assert.Equal(p.Id, m.Id);
        Assert.Equal("Warm up", m.Title);
        Assert.False(m.IsDone);

        var toggled = await _ctx.OccurrenceService.ToggleSubtaskAsync(made.Id, m.Id, userId);
        Assert.True(toggled.Value!.Subtasks.Single().IsDone);
    }

    [Fact]
    public async Task Different_days_get_different_subtask_ids()
    {
        var userId = await CreateUserAsync();
        var a = await CreateRepeatingAsync(userId);
        Assert.True((await new Loom.Core.Services.ActivitySubtaskService(_ctx.Db)
            .CreateAsync(a.Id, userId, new CreateActivitySubtaskRequest("Warm up"))).IsSuccess);

        var list = await ListDaysAsync(userId, 2);

        Assert.NotEqual(list[0].Subtasks.Single().Id, list[1].Subtasks.Single().Id);
    }

    [Fact]
    public async Task Deleting_a_future_repeat_deletes_it_and_the_day_stays_gone()
    {
        var userId = await CreateUserAsync();
        var a = await CreateRepeatingAsync(userId);
        var made = (await _ctx.OccurrenceService.MaterializeAsync(userId, new MaterializeOccurrenceRequest(a.Id, Today.AddDays(1)))).Value!;

        var deleted = await _ctx.OccurrenceService.DeleteAsync(made.Id, userId);

        Assert.True(deleted.IsSuccess);
        Assert.Empty(await _ctx.Db.Occurrences.ToListAsync());
        Assert.Empty(await ListDaysAsync(userId, 1, from: Today.AddDays(1)));
        Assert.Equal(2, (await ListDaysAsync(userId, 3)).Count);
    }

    [Fact]
    public async Task Deleting_a_moved_repeat_does_not_reopen_its_original_slot()
    {
        var userId = await CreateUserAsync();
        var a = await CreateRepeatingAsync(userId);
        var made = (await _ctx.OccurrenceService.MaterializeAsync(userId, new MaterializeOccurrenceRequest(a.Id, Today))).Value!;
        await _ctx.OccurrenceService.UpdateAsync(made.Id, userId, new UpdateOccurrenceRequest(
            made.Title, Midnight(Today).AddDays(1).AddHours(18), null, false, false, null));

        Assert.True((await _ctx.OccurrenceService.DeleteAsync(made.Id, userId)).IsSuccess);

        Assert.Empty(await ListDaysAsync(userId, 1));
        Assert.Single(await ListDaysAsync(userId, 1, from: Today.AddDays(1)));
    }

    [Fact]
    public async Task A_deleted_repeat_day_cannot_be_materialized_again()
    {
        var userId = await CreateUserAsync();
        var a = await CreateRepeatingAsync(userId);
        var made = (await _ctx.OccurrenceService.MaterializeAsync(userId, new MaterializeOccurrenceRequest(a.Id, Today.AddDays(1)))).Value!;
        await _ctx.OccurrenceService.DeleteAsync(made.Id, userId);

        var again = await _ctx.OccurrenceService.MaterializeAsync(userId, new MaterializeOccurrenceRequest(a.Id, Today.AddDays(1)));

        Assert.Equal(ErrorType.Conflict, again.Error!.Type);
    }

    [Fact]
    public async Task Deleting_the_activity_removes_its_deleted_days()
    {
        var userId = await CreateUserAsync();
        var a = await CreateRepeatingAsync(userId);
        var made = (await _ctx.OccurrenceService.MaterializeAsync(userId, new MaterializeOccurrenceRequest(a.Id, Today.AddDays(1)))).Value!;
        await _ctx.OccurrenceService.DeleteAsync(made.Id, userId);

        Assert.True((await _ctx.ActivityService.DeleteAsync(a.Id, userId)).IsSuccess);

        Assert.Empty(await _ctx.Db.RecurrenceExclusions.ToListAsync());
    }

    [Fact]
    public async Task Deleting_a_repeat_whose_day_has_passed_really_deletes_it()
    {
        var userId = await CreateUserAsync();
        var a = await CreateRepeatingAsync(userId, Daily(start: Today.AddDays(-5)));
        var made = (await _ctx.OccurrenceService.MaterializeAsync(userId, new MaterializeOccurrenceRequest(a.Id, Today.AddDays(-3)))).Value!;

        var deleted = await _ctx.OccurrenceService.DeleteAsync(made.Id, userId);

        Assert.True(deleted.IsSuccess);
        Assert.Empty(await _ctx.Db.Occurrences.ToListAsync());
    }

    [Fact]
    public async Task Deleting_a_repeat_after_its_rule_was_removed_really_deletes_it()
    {
        var userId = await CreateUserAsync();
        var a = await CreateRepeatingAsync(userId);
        var made = (await _ctx.OccurrenceService.MaterializeAsync(userId, new MaterializeOccurrenceRequest(a.Id, Today.AddDays(1)))).Value!;
        Assert.True((await _ctx.ActivityService.RemoveRecurrenceAsync(a.Id, userId)).IsSuccess);

        Assert.True((await _ctx.OccurrenceService.DeleteAsync(made.Id, userId)).IsSuccess);

        Assert.Empty(await _ctx.Db.Occurrences.ToListAsync());
    }

    [Fact]
    public async Task Editing_the_rule_changes_untouched_days_but_not_materialized_ones()
    {
        var userId = await CreateUserAsync();
        var a = await CreateRepeatingAsync(userId, Daily(time: "09:00"));
        await _ctx.OccurrenceService.MaterializeAsync(userId, new MaterializeOccurrenceRequest(a.Id, Today));

        Assert.True((await _ctx.ActivityService.SetRecurrenceAsync(a.Id, userId, Daily(time: "18:00"))).IsSuccess);

        var list = await ListDaysAsync(userId, 2);
        Assert.Equal(9, list[0].StartAt!.Value.Hour);
        Assert.Equal(18, list[1].StartAt!.Value.Hour);
        Assert.Equal(1, await _ctx.Db.ActivityRecurrences.CountAsync());
    }

    [Fact]
    public async Task Removing_the_rule_stops_projections_and_keeps_materialized_rows()
    {
        var userId = await CreateUserAsync();
        var a = await CreateRepeatingAsync(userId);
        await _ctx.OccurrenceService.MaterializeAsync(userId, new MaterializeOccurrenceRequest(a.Id, Today));

        var removed = await _ctx.ActivityService.RemoveRecurrenceAsync(a.Id, userId);

        Assert.Null(removed.Value!.Recurrence);
        var list = await ListDaysAsync(userId, 3);
        Assert.False(Assert.Single(list).IsProjected);
    }

    [Fact]
    public async Task Deleting_the_activity_removes_its_rule()
    {
        var userId = await CreateUserAsync();
        var a = await CreateRepeatingAsync(userId);

        Assert.True((await _ctx.ActivityService.DeleteAsync(a.Id, userId)).IsSuccess);

        Assert.Empty(await _ctx.Db.ActivityRecurrences.ToListAsync());
    }

    [Fact]
    public async Task Activity_update_leaves_the_rule_alone()
    {
        var userId = await CreateUserAsync();
        var a = await CreateRepeatingAsync(userId);

        var updated = await _ctx.ActivityService.UpdateAsync(a.Id, userId, new UpdateActivityRequest("Renamed", null, null));

        Assert.NotNull(updated.Value!.Recurrence);
        Assert.Equal("Renamed", (await ListDaysAsync(userId, 1)).Single().EffectiveTitle);
    }

    [Fact]
    public async Task Rule_is_returned_on_the_activity_with_weekdays_and_time()
    {
        var userId = await CreateUserAsync();
        var a = (await _ctx.ActivityService.CreateAsync(userId, new CreateActivityRequest("Gym", null, null))).Value!;

        var set = await _ctx.ActivityService.SetRecurrenceAsync(a.Id, userId,
            new SetRecurrenceRequest(RecurrenceFrequency.weekly, 2, [5, 1], Today, Today.AddDays(90), "7:05", 60));

        var r = set.Value!.Recurrence!;
        Assert.Equal("weekly", r.Frequency);
        Assert.Equal(2, r.Interval);
        Assert.Equal([1, 5], r.Weekdays);
        Assert.Equal("07:05", r.TimeOfDay);
        Assert.Equal(60, r.DurationMinutes);

        var fetched = (await _ctx.ActivityService.GetAsync(a.Id, userId)).Value!.Recurrence!;
        Assert.Equal(r.Weekdays, fetched.Weekdays);
        Assert.Equal(r.EndDate, fetched.EndDate);
        Assert.Equal(r.TimeOfDay, fetched.TimeOfDay);
    }

    [Theory]
    [InlineData(0, null, "09:00", 30)]
    [InlineData(100, null, "09:00", 30)]
    [InlineData(1, new[] { 3 }, "09:00", 30)]
    [InlineData(1, null, "25:00", 30)]
    [InlineData(1, null, "09:00", 0)]
    [InlineData(1, null, "09:00", 1441)]
    public async Task Invalid_rules_are_rejected(int interval, int[]? weekdays, string time, int duration)
    {
        var userId = await CreateUserAsync();
        var a = (await _ctx.ActivityService.CreateAsync(userId, new CreateActivityRequest("X", null, null))).Value!;

        var result = await _ctx.ActivityService.SetRecurrenceAsync(a.Id, userId,
            new SetRecurrenceRequest(RecurrenceFrequency.daily, interval, weekdays?.ToList(), Today, null, time, duration));

        Assert.Equal(ErrorType.Validation, result.Error!.Type);
        Assert.Empty(await _ctx.Db.ActivityRecurrences.ToListAsync());
    }

    [Fact]
    public async Task A_rule_cannot_end_before_it_starts_or_use_out_of_range_weekdays()
    {
        var userId = await CreateUserAsync();
        var a = (await _ctx.ActivityService.CreateAsync(userId, new CreateActivityRequest("X", null, null))).Value!;

        var backwards = await _ctx.ActivityService.SetRecurrenceAsync(a.Id, userId,
            new SetRecurrenceRequest(RecurrenceFrequency.daily, 1, null, Today, Today.AddDays(-1), null, null));
        var badDay = await _ctx.ActivityService.SetRecurrenceAsync(a.Id, userId,
            new SetRecurrenceRequest(RecurrenceFrequency.weekly, 1, [0], Today, null, null, null));

        Assert.Equal(ErrorType.Validation, backwards.Error!.Type);
        Assert.Equal(ErrorType.Validation, badDay.Error!.Type);
    }

    [Fact]
    public async Task Setting_a_rule_on_someone_elses_activity_is_not_found()
    {
        var owner = await CreateUserAsync();
        var stranger = await CreateUserAsync();
        var a = (await _ctx.ActivityService.CreateAsync(owner, new CreateActivityRequest("X", null, null))).Value!;

        var result = await _ctx.ActivityService.SetRecurrenceAsync(a.Id, stranger, Daily());

        Assert.Equal(ErrorType.NotFound, result.Error!.Type);
    }

    [Fact]
    public async Task Projections_never_count_towards_insights()
    {
        var userId = await CreateUserAsync();
        await CreateRepeatingAsync(userId);

        var insights = await _ctx.InsightsService.GetAsync(userId, windowDays: 30, nowUtc: Midnight(Today).AddDays(3));

        Assert.Empty(insights.Activities);
        Assert.All(insights.Categories, c => Assert.Equal(0, c.Done));
    }
}
