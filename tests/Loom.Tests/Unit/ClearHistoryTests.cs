using Loom.Core.Dtos;
using Loom.Core.Entities;
using Microsoft.EntityFrameworkCore;

namespace Loom.Tests.Unit;

public class ClearHistoryTests : IDisposable
{
    private readonly TestContext _ctx = new();

    public void Dispose() => _ctx.Dispose();

    private async Task<Guid> CreateUserAsync()
    {
        var user = new User { Username = "u" + Guid.NewGuid().ToString("N")[..8], PasswordHash = "x", Timezone = "UTC" };
        _ctx.Db.Users.Add(user);
        await _ctx.Db.SaveChangesAsync();
        return user.Id;
    }

    private Task<Loom.Core.Common.Result<OccurrenceDto>> AddOccurrenceAsync(Guid userId, Guid activityId) =>
        _ctx.OccurrenceService.CreateAsync(userId,
            new CreateOccurrenceRequest(activityId, null, null, null, false, false, null, null, null));

    [Fact]
    public async Task ClearAllAsync_removes_occurrences_and_events_but_keeps_activities_goals_categories()
    {
        var userId = await CreateUserAsync();
        var goal = new Goal { UserId = userId, Title = "G" };
        _ctx.Db.Goals.Add(goal);
        await _ctx.Db.SaveChangesAsync();
        var activity = (await _ctx.ActivityService.CreateAsync(userId, new CreateActivityRequest("Run", null, [goal.Id]))).Value!;
        Assert.True((await AddOccurrenceAsync(userId, activity.Id)).IsSuccess);
        Assert.True((await AddOccurrenceAsync(userId, activity.Id)).IsSuccess);
        var ev = await _ctx.OccurrenceService.CreateEventAsync(userId,
            new CreateEventRequest("Dentist", null, null, DateTimeOffset.UtcNow, DateTimeOffset.UtcNow.AddHours(1), false, false));
        Assert.True(ev.IsSuccess);

        var removed = await _ctx.OccurrenceService.ClearAllAsync(userId);

        Assert.Equal(3, removed);
        Assert.Empty(await _ctx.Db.Occurrences.ToListAsync());
        Assert.Empty(await _ctx.Db.OccurrenceSubtasks.ToListAsync());
        var remaining = await _ctx.Db.Activities.ToListAsync();
        Assert.Single(remaining);
        Assert.Equal("Run", remaining[0].Title);
        Assert.Single(await _ctx.Db.Goals.ToListAsync());
    }

    [Fact]
    public async Task ClearAllAsync_pastOnly_keeps_today_upcoming_and_undated()
    {
        var userId = await CreateUserAsync();
        var activity = (await _ctx.ActivityService.CreateAsync(userId, new CreateActivityRequest("Run", null, null))).Value!;
        var now = DateTimeOffset.UtcNow;
        foreach (var start in new DateTimeOffset?[] { now.AddDays(-10), now.AddDays(-3), now.AddDays(5), null })
            Assert.True((await _ctx.OccurrenceService.CreateAsync(userId,
                new CreateOccurrenceRequest(activity.Id, null, start, null, false, false, null, null, null))).IsSuccess);
        var pastEvent = await _ctx.OccurrenceService.CreateEventAsync(userId,
            new CreateEventRequest("Old", null, null, now.AddDays(-7), now.AddDays(-7).AddHours(1), false, false));
        var futureEvent = await _ctx.OccurrenceService.CreateEventAsync(userId,
            new CreateEventRequest("Soon", null, null, now.AddDays(7), now.AddDays(7).AddHours(1), false, false));
        Assert.True(pastEvent.IsSuccess && futureEvent.IsSuccess);

        var removed = await _ctx.OccurrenceService.ClearAllAsync(userId, pastOnly: true);

        Assert.Equal(3, removed);
        Assert.Equal(3, await _ctx.Db.Occurrences.CountAsync());
        Assert.DoesNotContain(await _ctx.Db.Activities.ToListAsync(), a => a.Title == "Old");
        Assert.Contains(await _ctx.Db.Activities.ToListAsync(), a => a.Title == "Soon");
    }

    [Fact]
    public async Task ClearAllAsync_leaves_other_users_untouched()
    {
        var mine = await CreateUserAsync();
        var theirs = await CreateUserAsync();
        var otherActivity = (await _ctx.ActivityService.CreateAsync(theirs, new CreateActivityRequest("Read", null, null))).Value!;
        Assert.True((await AddOccurrenceAsync(theirs, otherActivity.Id)).IsSuccess);

        await _ctx.OccurrenceService.ClearAllAsync(mine);

        Assert.Single(await _ctx.Db.Occurrences.ToListAsync());
    }
}
