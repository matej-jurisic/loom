using Loom.Core.Common;
using Loom.Core.Dtos;
using Loom.Core.Entities;
using Loom.Core.Enums;
using Loom.Core.Notifications;
using Loom.Core.Services;

namespace Loom.Tests.Unit;

public class ReminderTests : IDisposable
{
    private readonly TestContext _ctx = new();
    private readonly FakePushSender _sender = new();
    private readonly NotificationService _notifications;

    private static readonly DateTimeOffset Start = DateTimeOffset.Parse("2026-06-01T10:00:00Z");

    public ReminderTests() =>
        _notifications = new NotificationService(_ctx.Db, _ctx.UserSettingsService, _sender);

    public void Dispose() => _ctx.Dispose();

    private sealed class FakePushSender : IPushSender
    {
        public List<(string Token, PushMessage Message)> Sent { get; } = [];
        public HashSet<string> GoneTokens { get; } = [];
        public bool IsConfigured => true;

        public Task<PushSendResult> SendAsync(string token, PushMessage message, CancellationToken ct = default)
        {
            if (GoneTokens.Contains(token)) return Task.FromResult(PushSendResult.Gone);
            Sent.Add((token, message));
            return Task.FromResult(PushSendResult.Ok);
        }
    }

    private async Task<Guid> CreateUserAsync(string timezone = "UTC")
    {
        var user = new User { Username = "u" + Guid.NewGuid().ToString("N")[..8], PasswordHash = "x", Timezone = timezone };
        _ctx.Db.Users.Add(user);
        await _ctx.Db.SaveChangesAsync();
        return user.Id;
    }

    private async Task<ActivityDto> CreateActivityAsync(Guid userId, List<int>? reminders) =>
        (await _ctx.ActivityService.CreateAsync(userId,
            new CreateActivityRequest("Gym", null, Reminders: reminders))).Value!;

    private async Task<OccurrenceDto> CreateOccurrenceAsync(
        Guid userId, Guid activityId, DateTimeOffset? startAt, DateTimeOffset? endAt = null,
        bool isAllDay = false, bool isPlanned = false, List<int>? reminders = null)
    {
        var dto = (await _ctx.OccurrenceService.CreateAsync(userId,
            new CreateOccurrenceRequest(activityId, null, startAt, endAt, isAllDay, isPlanned, null, null, null,
                Reminders: reminders))).Value!;
        // Created well before any fire time, so the "not before it existed" rule stays out of the way.
        var entity = await _ctx.Db.Occurrences.FindAsync(dto.Id);
        entity!.CreatedAt = DateTimeOffset.Parse("2026-05-01T00:00:00Z");
        await _ctx.Db.SaveChangesAsync();
        return dto;
    }

    [Fact]
    public async Task CreateAsync_normalizes_activity_reminders()
    {
        var userId = await CreateUserAsync();

        var activity = await CreateActivityAsync(userId, [30, 0, 30, 10]);

        Assert.Equal([0, 10, 30], activity.Reminders);
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(ReminderMath.MaxOffsetMinutes + 1)]
    public async Task CreateAsync_rejects_an_out_of_range_reminder(int minutes)
    {
        var userId = await CreateUserAsync();

        var result = await _ctx.ActivityService.CreateAsync(userId,
            new CreateActivityRequest("Gym", null, Reminders: [minutes]));

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorType.Validation, result.Error!.Type);
    }

    [Fact]
    public async Task Occurrence_inherits_activity_reminders_until_it_overrides_them()
    {
        var userId = await CreateUserAsync();
        var activity = await CreateActivityAsync(userId, [15]);
        var occ = await CreateOccurrenceAsync(userId, activity.Id, Start);

        Assert.Null(occ.Reminders);
        Assert.Equal([15], occ.EffectiveReminders);

        var overridden = (await _ctx.OccurrenceService.PatchAsync(occ.Id, userId,
            new PatchOccurrenceRequest(Reminders: new Optional<List<int>?>(true, [])))).Value!;
        Assert.Equal([], overridden.Reminders);
        Assert.Equal([], overridden.EffectiveReminders);

        var reset = (await _ctx.OccurrenceService.PatchAsync(occ.Id, userId,
            new PatchOccurrenceRequest(Reminders: new Optional<List<int>?>(true, null)))).Value!;
        Assert.Null(reset.Reminders);
        Assert.Equal([15], reset.EffectiveReminders);
    }

    [Fact]
    public async Task PatchAsync_without_reminders_keeps_the_override()
    {
        var userId = await CreateUserAsync();
        var activity = await CreateActivityAsync(userId, [15]);
        var occ = await CreateOccurrenceAsync(userId, activity.Id, Start, reminders: [60]);

        var patched = (await _ctx.OccurrenceService.PatchAsync(occ.Id, userId,
            new PatchOccurrenceRequest(Title: new Optional<string?>(true, "Leg day")))).Value!;

        Assert.Equal([60], patched.Reminders);
    }

    [Fact]
    public void FireTimes_all_day_anchors_at_nine_local()
    {
        var activity = new Activity { Title = "Exam", Reminders = [0, 24 * 60] };
        var o = new Occurrence
        {
            Activity = activity,
            StartAt = DateTimeOffset.Parse("2026-06-01T00:00:00+02:00"),
            IsAllDay = true,
        };
        var ctx = new DayContext(TimeZoneInfo.FindSystemTimeZoneById("Europe/Zagreb"), TimeOnly.MinValue);

        var times = ReminderMath.FireTimes(o, ctx);

        Assert.Equal([DateTimeOffset.Parse("2026-06-01T07:00:00Z"), DateTimeOffset.Parse("2026-05-31T07:00:00Z")], times);
    }

    [Fact]
    public void FireTimes_planned_or_done_never_fire()
    {
        var activity = new Activity { Title = "Gym", Reminders = [0] };
        var ctx = new DayContext(TimeZoneInfo.Utc, TimeOnly.MinValue);

        Assert.Empty(ReminderMath.FireTimes(new Occurrence { Activity = activity, StartAt = Start, IsPlanned = true }, ctx));
        Assert.Empty(ReminderMath.FireTimes(new Occurrence { Activity = activity, StartAt = Start, Status = EventStatus.done }, ctx));
        Assert.Empty(ReminderMath.FireTimes(new Occurrence { Activity = activity }, ctx));
    }

    [Fact]
    public async Task SendDueRemindersAsync_sends_once_per_fire_time()
    {
        var userId = await CreateUserAsync();
        await _notifications.RegisterDeviceAsync(userId, "tok");
        var activity = await CreateActivityAsync(userId, [30]);
        var occ = await CreateOccurrenceAsync(userId, activity.Id, Start, Start.AddHours(1));

        Assert.Equal(0, await _notifications.SendDueRemindersAsync(Start.AddMinutes(-31)));
        Assert.Equal(1, await _notifications.SendDueRemindersAsync(Start.AddMinutes(-30)));
        Assert.Equal(0, await _notifications.SendDueRemindersAsync(Start.AddMinutes(-29)));

        var (token, message) = Assert.Single(_sender.Sent);
        Assert.Equal("tok", token);
        Assert.Equal("Gym", message.Title);
        Assert.Equal("Today, 10:00 - 11:00", message.Body);
        Assert.Equal($"/plan?occurrence={occ.Id}", message.Url);
    }

    [Fact]
    public async Task SendDueRemindersAsync_skips_reminders_older_than_the_grace()
    {
        var userId = await CreateUserAsync();
        await _notifications.RegisterDeviceAsync(userId, "tok");
        var activity = await CreateActivityAsync(userId, [0]);
        await CreateOccurrenceAsync(userId, activity.Id, Start);

        Assert.Equal(0, await _notifications.SendDueRemindersAsync(Start + NotificationService.Grace));
        Assert.Empty(_sender.Sent);
    }

    [Fact]
    public async Task SendDueRemindersAsync_skips_a_fire_time_before_the_occurrence_existed()
    {
        var userId = await CreateUserAsync();
        await _notifications.RegisterDeviceAsync(userId, "tok");
        var activity = await CreateActivityAsync(userId, [30]);
        var occ = await CreateOccurrenceAsync(userId, activity.Id, Start);
        var entity = await _ctx.Db.Occurrences.FindAsync(occ.Id);
        entity!.CreatedAt = Start.AddMinutes(-10);
        await _ctx.Db.SaveChangesAsync();

        Assert.Equal(0, await _notifications.SendDueRemindersAsync(Start.AddMinutes(-25)));
    }

    [Fact]
    public async Task SendDueRemindersAsync_moving_the_occurrence_fires_again()
    {
        var userId = await CreateUserAsync();
        await _notifications.RegisterDeviceAsync(userId, "tok");
        var activity = await CreateActivityAsync(userId, [0]);
        var occ = await CreateOccurrenceAsync(userId, activity.Id, Start);
        await _notifications.SendDueRemindersAsync(Start);

        var later = Start.AddMinutes(5);
        await _ctx.OccurrenceService.PatchAsync(occ.Id, userId,
            new PatchOccurrenceRequest(StartAt: new Optional<DateTimeOffset?>(true, later)));
        _ctx.Db.ChangeTracker.Clear();

        Assert.Equal(1, await _notifications.SendDueRemindersAsync(later));
        Assert.Equal(2, _sender.Sent.Count);
    }

    [Fact]
    public async Task SendDueRemindersAsync_prunes_gone_tokens()
    {
        var userId = await CreateUserAsync();
        await _notifications.RegisterDeviceAsync(userId, "dead");
        await _notifications.RegisterDeviceAsync(userId, "live");
        _sender.GoneTokens.Add("dead");
        var activity = await CreateActivityAsync(userId, [0]);
        await CreateOccurrenceAsync(userId, activity.Id, Start);

        await _notifications.SendDueRemindersAsync(Start);

        Assert.Equal(["live"], _ctx.Db.PushDevices.Select(d => d.Token).ToList());
    }

    [Fact]
    public async Task RepeatAsync_copies_the_reminder_override()
    {
        var userId = await CreateUserAsync();
        var activity = (await _ctx.ActivityService.CreateAsync(userId,
            new CreateActivityRequest("Gym", null, RepeatAfterDays: 7, Reminders: [15]))).Value!;
        var occ = await CreateOccurrenceAsync(userId, activity.Id, DateTimeOffset.UtcNow.AddHours(-2), reminders: [60]);
        await _ctx.OccurrenceService.SetStatusAsync(occ.Id, userId, EventStatus.done);

        var copy = (await _ctx.OccurrenceService.RepeatAsync(occ.Id, userId, new RepeatOccurrenceRequest())).Value!;

        Assert.Equal([60], copy.Reminders);
    }
}
