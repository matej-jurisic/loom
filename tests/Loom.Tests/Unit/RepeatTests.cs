using Loom.Core.Common;
using Loom.Core.Dtos;
using Loom.Core.Entities;
using Loom.Core.Enums;

namespace Loom.Tests.Unit;

public class RepeatTests : IDisposable
{
    private readonly TestContext _ctx = new();

    public void Dispose() => _ctx.Dispose();

    private async Task<Guid> CreateUserAsync(string timezone = "UTC")
    {
        var user = new User { Username = "u" + Guid.NewGuid().ToString("N")[..8], PasswordHash = "x", Timezone = timezone };
        _ctx.Db.Users.Add(user);
        await _ctx.Db.SaveChangesAsync();
        return user.Id;
    }

    private async Task<Guid> CreateActivityAsync(Guid userId, int? repeatAfterDays = 7) =>
        (await _ctx.ActivityService.CreateAsync(userId, new CreateActivityRequest("Water plants", null, null, repeatAfterDays))).Value!.Id;

    private async Task<OccurrenceDto> CreateDoneAsync(
        Guid userId, Guid activityId, DateTimeOffset? startAt, DateTimeOffset? endAt,
        bool isAllDay = false, string? title = null, Guid? deadlineId = null)
    {
        var occ = (await _ctx.OccurrenceService.CreateAsync(userId,
            new CreateOccurrenceRequest(activityId, title, startAt, endAt, isAllDay, false, null, null, null, deadlineId))).Value!;
        return (await _ctx.OccurrenceService.SetStatusAsync(occ.Id, userId, EventStatus.done)).Value!;
    }

    [Theory]
    [InlineData(1)]
    [InlineData(365)]
    public async Task CreateAsync_stores_the_repeat_interval(int days)
    {
        var userId = await CreateUserAsync();

        var result = await _ctx.ActivityService.CreateAsync(userId, new CreateActivityRequest("Run", null, null, days));

        Assert.True(result.IsSuccess);
        Assert.Equal(days, result.Value!.RepeatAfterDays);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-3)]
    [InlineData(366)]
    public async Task CreateAsync_rejects_an_interval_out_of_range(int days)
    {
        var userId = await CreateUserAsync();

        var result = await _ctx.ActivityService.CreateAsync(userId, new CreateActivityRequest("Run", null, null, days));

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorType.Validation, result.Error!.Type);
    }

    [Fact]
    public async Task UpdateAsync_sets_and_clears_the_repeat_interval()
    {
        var userId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId, null);

        var set = await _ctx.ActivityService.UpdateAsync(activityId, userId, new UpdateActivityRequest("Run", null, null, 14));
        var cleared = await _ctx.ActivityService.UpdateAsync(activityId, userId, new UpdateActivityRequest("Run", null));

        Assert.Equal(14, set.Value!.RepeatAfterDays);
        Assert.Null(cleared.Value!.RepeatAfterDays);
        Assert.False((await _ctx.ActivityService.UpdateAsync(activityId, userId, new UpdateActivityRequest("Run", null, null, 0))).IsSuccess);
    }

    [Fact]
    public async Task RepeatAsync_puts_a_pending_copy_one_interval_after_the_source_at_the_same_clock_time()
    {
        var userId = await CreateUserAsync("Europe/Zagreb");
        var activityId = await CreateActivityAsync(userId);
        await _ctx.Db.ActivitySubtasks.AddAsync(new ActivitySubtask { ActivityId = activityId, Title = "Fill the can" });
        await _ctx.Db.SaveChangesAsync();
        var ctx = await _ctx.UserSettingsService.GetDayContextAsync(userId);
        var start = DayMath.StartOfDay(DayMath.Today(ctx, DateTimeOffset.UtcNow).AddDays(-3), ctx).AddHours(6);
        var source = await CreateDoneAsync(userId, activityId, start, start.AddMinutes(45), title: "Balcony");

        var result = await _ctx.OccurrenceService.RepeatAsync(source.Id, userId, new RepeatOccurrenceRequest());

        Assert.True(result.IsSuccess);
        var copy = result.Value!;
        Assert.NotEqual(source.Id, copy.Id);
        Assert.Equal("pending", copy.Status);
        Assert.Equal("Balcony", copy.Title);
        Assert.False(copy.IsAllDay);
        Assert.False(copy.IsPlanned);
        Assert.Equal(DayMath.Today(ctx, DateTimeOffset.UtcNow).AddDays(4), DayMath.DayOf(copy.StartAt!.Value, ctx));
        Assert.Equal(
            TimeZoneInfo.ConvertTime(start, ctx.TimeZone).TimeOfDay,
            TimeZoneInfo.ConvertTime(copy.StartAt.Value, ctx.TimeZone).TimeOfDay);
        Assert.Equal(TimeSpan.FromMinutes(45), copy.EndAt!.Value - copy.StartAt.Value);
        Assert.Equal("Fill the can", Assert.Single(copy.Subtasks).Title);
        Assert.False(copy.Subtasks[0].IsDone);
    }

    [Theory]
    [InlineData(-10, 4)]
    [InlineData(-7, 7)]
    [InlineData(-1, 6)]
    [InlineData(0, 7)]
    [InlineData(2, 9)]
    [InlineData(7, 14)]
    public async Task RepeatAsync_steps_from_the_source_day_to_the_first_day_after_today(int sourceOffset, int expectedOffset)
    {
        var userId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId);
        var ctx = await _ctx.UserSettingsService.GetDayContextAsync(userId);
        var today = DayMath.Today(ctx, DateTimeOffset.UtcNow);
        var start = DayMath.StartOfDay(today.AddDays(sourceOffset), ctx).AddHours(6);
        var source = await CreateDoneAsync(userId, activityId, start, null);

        var copy = (await _ctx.OccurrenceService.RepeatAsync(source.Id, userId, new RepeatOccurrenceRequest())).Value!;

        Assert.Equal(today.AddDays(expectedOffset), DayMath.DayOf(copy.StartAt!.Value, ctx));
    }

    [Fact]
    public async Task RepeatAsync_keeps_the_planned_flag_it_is_given()
    {
        var userId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId);
        var start = DateTimeOffset.UtcNow.AddHours(-2);
        var source = await CreateDoneAsync(userId, activityId, start, start.AddHours(1));

        var copy = (await _ctx.OccurrenceService.RepeatAsync(source.Id, userId, new RepeatOccurrenceRequest(true))).Value!;

        Assert.True(copy.IsPlanned);
    }

    [Fact]
    public async Task RepeatAsync_moves_an_all_day_occurrence_by_calendar_date()
    {
        var userId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId, 3);
        var ctx = await _ctx.UserSettingsService.GetDayContextAsync(userId);
        var today = DayMath.Today(ctx, DateTimeOffset.UtcNow);
        var source = await CreateDoneAsync(userId, activityId, DayMath.Midnight(today.AddDays(-1), ctx), null, isAllDay: true);

        var copy = (await _ctx.OccurrenceService.RepeatAsync(source.Id, userId, new RepeatOccurrenceRequest())).Value!;

        Assert.True(copy.IsAllDay);
        Assert.Equal(DayMath.Midnight(today.AddDays(2), ctx), copy.StartAt);
        Assert.Null(copy.EndAt);
    }

    [Fact]
    public async Task RepeatAsync_gives_a_floating_occurrence_a_planned_date()
    {
        var userId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId, 10);
        var ctx = await _ctx.UserSettingsService.GetDayContextAsync(userId);
        var source = await CreateDoneAsync(userId, activityId, null, null);

        var copy = (await _ctx.OccurrenceService.RepeatAsync(source.Id, userId, new RepeatOccurrenceRequest())).Value!;

        Assert.True(copy.IsAllDay);
        Assert.True(copy.IsPlanned);
        Assert.Equal(DayMath.Midnight(DayMath.Today(ctx, DateTimeOffset.UtcNow).AddDays(10), ctx), copy.StartAt);
        Assert.Null(copy.EndAt);
    }

    [Fact]
    public async Task RepeatAsync_moves_a_deadline_only_occurrence()
    {
        var userId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId, 2);
        var ctx = await _ctx.UserSettingsService.GetDayContextAsync(userId);
        var source = await CreateDoneAsync(userId, activityId, null, DateTimeOffset.UtcNow.AddHours(-1));

        var copy = (await _ctx.OccurrenceService.RepeatAsync(source.Id, userId, new RepeatOccurrenceRequest())).Value!;

        Assert.Null(copy.StartAt);
        Assert.Equal(DayMath.DayOf(source.EndAt!.Value, ctx).AddDays(2), DayMath.DayOf(copy.EndAt!.Value, ctx));
    }

    [Fact]
    public async Task RepeatAsync_carries_the_deadline_only_while_it_is_pending()
    {
        var userId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId);
        var deadline = (await _ctx.OccurrenceService.CreateEventAsync(userId,
            new CreateEventRequest("Report", null, null, DateTimeOffset.UtcNow.AddDays(20), null, false, false))).Value!;
        var start = DateTimeOffset.UtcNow.AddHours(-2);
        var source = await CreateDoneAsync(userId, activityId, start, start.AddHours(1), deadlineId: deadline.Id);

        var linked = (await _ctx.OccurrenceService.RepeatAsync(source.Id, userId, new RepeatOccurrenceRequest())).Value!;
        await _ctx.OccurrenceService.DeleteAsync(linked.Id, userId);
        await _ctx.OccurrenceService.SetStatusAsync(deadline.Id, userId, EventStatus.done);
        var unlinked = (await _ctx.OccurrenceService.RepeatAsync(source.Id, userId, new RepeatOccurrenceRequest())).Value!;

        Assert.Equal(deadline.Id, linked.DeadlineOccurrenceId);
        Assert.Null(unlinked.DeadlineOccurrenceId);
    }

    [Fact]
    public async Task RepeatAsync_does_not_add_a_second_copy_on_the_same_day()
    {
        var userId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId);
        var source = await CreateDoneAsync(userId, activityId, DateTimeOffset.UtcNow.AddHours(-1), null);
        var first = (await _ctx.OccurrenceService.RepeatAsync(source.Id, userId, new RepeatOccurrenceRequest())).Value!;

        var again = await _ctx.OccurrenceService.RepeatAsync(source.Id, userId, new RepeatOccurrenceRequest());
        await _ctx.OccurrenceService.SetStatusAsync(first.Id, userId, EventStatus.skipped);
        var afterSkip = await _ctx.OccurrenceService.RepeatAsync(source.Id, userId, new RepeatOccurrenceRequest());

        Assert.Equal(ErrorType.Conflict, again.Error!.Type);
        Assert.True(afterSkip.IsSuccess);
    }

    [Fact]
    public async Task RepeatAsync_rejects_an_activity_without_an_interval()
    {
        var userId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId, null);
        var source = await CreateDoneAsync(userId, activityId, DateTimeOffset.UtcNow.AddHours(-1), null);

        var result = await _ctx.OccurrenceService.RepeatAsync(source.Id, userId, new RepeatOccurrenceRequest());

        Assert.Equal(ErrorType.Validation, result.Error!.Type);
    }

    [Fact]
    public async Task RepeatAsync_rejects_an_occurrence_that_is_not_done()
    {
        var userId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId);
        var pending = (await _ctx.OccurrenceService.CreateAsync(userId,
            new CreateOccurrenceRequest(activityId, null, DateTimeOffset.UtcNow, null, false, false, null, null, null))).Value!;
        var skipped = (await _ctx.OccurrenceService.SetStatusAsync(
            (await _ctx.OccurrenceService.CreateAsync(userId,
                new CreateOccurrenceRequest(activityId, null, DateTimeOffset.UtcNow, null, false, false, null, null, null))).Value!.Id,
            userId, EventStatus.skipped)).Value!;

        Assert.Equal(ErrorType.Validation,
            (await _ctx.OccurrenceService.RepeatAsync(pending.Id, userId, new RepeatOccurrenceRequest())).Error!.Type);
        Assert.Equal(ErrorType.Validation,
            (await _ctx.OccurrenceService.RepeatAsync(skipped.Id, userId, new RepeatOccurrenceRequest())).Error!.Type);
        Assert.Equal(2, (await _ctx.OccurrenceService.ListAsync(userId)).Count);
    }

    [Fact]
    public async Task RepeatAsync_does_not_reach_another_users_occurrence()
    {
        var userId = await CreateUserAsync();
        var otherId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId);
        var source = await CreateDoneAsync(userId, activityId, DateTimeOffset.UtcNow.AddHours(-1), null);

        var result = await _ctx.OccurrenceService.RepeatAsync(source.Id, otherId, new RepeatOccurrenceRequest());

        Assert.Equal(ErrorType.NotFound, result.Error!.Type);
    }
}
