using Loom.Core.Common;
using Loom.Core.Dtos;
using Loom.Core.Entities;
using Loom.Core.Enums;
using Microsoft.EntityFrameworkCore;

namespace Loom.Tests.Unit;

public class LinkEventToActivityTests : IDisposable
{
    private readonly TestContext _ctx = new();

    public void Dispose() => _ctx.Dispose();

    private static readonly DateTimeOffset Start = new(2026, 5, 4, 9, 0, 0, TimeSpan.Zero);

    private async Task<Guid> CreateUserAsync()
    {
        var user = new User { Username = "u" + Guid.NewGuid().ToString("N")[..8], PasswordHash = "x", Timezone = "UTC" };
        _ctx.Db.Users.Add(user);
        await _ctx.Db.SaveChangesAsync();
        return user.Id;
    }

    private async Task<ActivityDto> CreateActivityAsync(Guid userId, string title) =>
        (await _ctx.ActivityService.CreateAsync(userId, new CreateActivityRequest(title, null, null))).Value!;

    private async Task<OccurrenceDto> CreateEventAsync(Guid userId, string title, List<Guid>? tagIds = null) =>
        (await _ctx.OccurrenceService.CreateEventAsync(userId, new CreateEventRequest(
            title, null, null, Start, Start.AddHours(1), false, false, TagIds: tagIds))).Value!;

    private static PatchOccurrenceRequest Link(Guid activityId, string? title) =>
        new(ActivityId: new(true, activityId), Title: new(true, title));

    [Fact]
    public async Task PatchAsync_links_an_event_and_deletes_its_backing_activity()
    {
        var userId = await CreateUserAsync();
        var gym = await CreateActivityAsync(userId, "Gym");
        var tag = (await _ctx.TagService.CreateAsync(userId, new CreateTagRequest("Health"))).Value!;
        var ev = await CreateEventAsync(userId, "Leg day", [tag.Id]);

        var result = await _ctx.OccurrenceService.PatchAsync(ev.Id, userId, Link(gym.Id, "Leg day"));

        Assert.True(result.IsSuccess);
        Assert.Equal(gym.Id, result.Value!.ActivityId);
        Assert.Equal("activity", result.Value.Activity.Kind);
        Assert.Equal("Leg day", result.Value.EffectiveTitle);
        Assert.Equal(Start, result.Value.StartAt);
        Assert.Equal(["Health"], result.Value.Tags.Select(t => t.Name));
        Assert.False(await _ctx.Db.Activities.AnyAsync(a => a.Id == ev.ActivityId));
        Assert.True(await _ctx.Db.Occurrences.AnyAsync(o => o.Id == ev.Id));
    }

    [Fact]
    public async Task PatchAsync_linking_drops_a_title_that_repeats_the_activity()
    {
        var userId = await CreateUserAsync();
        var gym = await CreateActivityAsync(userId, "Gym");
        var ev = await CreateEventAsync(userId, "gym");

        var result = await _ctx.OccurrenceService.PatchAsync(ev.Id, userId, Link(gym.Id, "gym"));

        Assert.Null(result.Value!.Title);
        Assert.Equal("Gym", result.Value.EffectiveTitle);
    }

    [Fact]
    public async Task PatchAsync_cannot_move_an_occurrence_onto_an_event()
    {
        var userId = await CreateUserAsync();
        var gym = await CreateActivityAsync(userId, "Gym");
        var occ = (await _ctx.OccurrenceService.CreateAsync(userId, new CreateOccurrenceRequest(
            gym.Id, null, Start, null, false, false, null, null, null))).Value!;
        var ev = await CreateEventAsync(userId, "Party");

        var result = await _ctx.OccurrenceService.PatchAsync(occ.Id, userId, Link(ev.ActivityId, null));

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorType.Validation, result.Error!.Type);
    }

    [Fact]
    public async Task PatchAsync_linking_to_an_unknown_activity_keeps_the_event()
    {
        var userId = await CreateUserAsync();
        var ev = await CreateEventAsync(userId, "Party");

        var result = await _ctx.OccurrenceService.PatchAsync(ev.Id, userId, Link(Guid.NewGuid(), null));

        Assert.Equal(ErrorType.NotFound, result.Error!.Type);
        var backing = await _ctx.Db.Activities.SingleAsync(a => a.Id == ev.ActivityId);
        Assert.Equal(ActivityKind.@event, backing.Kind);
    }
}
