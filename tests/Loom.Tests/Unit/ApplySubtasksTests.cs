using Loom.Core.Common;
using Loom.Core.Dtos;
using Loom.Core.Entities;
using Loom.Core.Enums;

namespace Loom.Tests.Unit;

public class ApplySubtasksTests : IDisposable
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

    private async Task<Guid> CreateActivityAsync(Guid userId) =>
        (await _ctx.ActivityService.CreateAsync(userId, new CreateActivityRequest("Clean", null))).Value!.Id;

    private async Task<OccurrenceDto> CreateOccurrenceAsync(Guid userId, Guid activityId) =>
        (await _ctx.OccurrenceService.CreateAsync(userId,
            new CreateOccurrenceRequest(activityId, null, null, null, false, false, null, null, null, null))).Value!;

    private Task AddTemplateAsync(Guid userId, Guid activityId, string title) =>
        _ctx.ActivitySubtaskService.CreateAsync(activityId, userId, new CreateActivitySubtaskRequest(title));

    private async Task<List<string>> TitlesAsync(Guid userId, Guid occurrenceId) =>
        (await _ctx.OccurrenceService.GetAsync(occurrenceId, userId)).Value!.Subtasks.Select(s => s.Title).ToList();

    [Fact]
    public async Task ApplyToPendingAsync_appends_missing_template_titles_in_order()
    {
        var userId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId);
        await AddTemplateAsync(userId, activityId, "Kitchen");
        var occ = await CreateOccurrenceAsync(userId, activityId);
        await AddTemplateAsync(userId, activityId, "Bathroom");
        await AddTemplateAsync(userId, activityId, "Hallway");

        var count = await _ctx.ActivitySubtaskService.CountApplicableAsync(activityId, userId);
        var applied = await _ctx.ActivitySubtaskService.ApplyToPendingAsync(activityId, userId);

        Assert.Equal(1, count.Value!.OccurrenceCount);
        Assert.Equal(1, applied.Value!.OccurrenceCount);
        Assert.Equal(["Kitchen", "Bathroom", "Hallway"], await TitlesAsync(userId, occ.Id));
    }

    [Fact]
    public async Task ApplyToPendingAsync_keeps_existing_subtasks_and_their_state()
    {
        var userId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId);
        await AddTemplateAsync(userId, activityId, "Kitchen");
        var occ = await CreateOccurrenceAsync(userId, activityId);
        await _ctx.OccurrenceService.ToggleSubtaskAsync(occ.Id, occ.Subtasks[0].Id, userId);
        await _ctx.OccurrenceService.CreateSubtaskAsync(occ.Id, userId, new CreateOccurrenceSubtaskRequest("Balcony"));
        await AddTemplateAsync(userId, activityId, "  kitchen ");
        await AddTemplateAsync(userId, activityId, "Bathroom");

        await _ctx.ActivitySubtaskService.ApplyToPendingAsync(activityId, userId);

        var subtasks = (await _ctx.OccurrenceService.GetAsync(occ.Id, userId)).Value!.Subtasks;
        Assert.Equal(["Kitchen", "Balcony", "Bathroom"], subtasks.Select(s => s.Title));
        Assert.True(subtasks[0].IsDone);
    }

    [Fact]
    public async Task ApplyToPendingAsync_leaves_done_and_skipped_occurrences_alone()
    {
        var userId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId);
        var done = await CreateOccurrenceAsync(userId, activityId);
        var skipped = await CreateOccurrenceAsync(userId, activityId);
        await _ctx.OccurrenceService.SetStatusAsync(done.Id, userId, EventStatus.done);
        await _ctx.OccurrenceService.SetStatusAsync(skipped.Id, userId, EventStatus.skipped);
        await AddTemplateAsync(userId, activityId, "Kitchen");

        var applied = await _ctx.ActivitySubtaskService.ApplyToPendingAsync(activityId, userId);

        Assert.Equal(0, applied.Value!.OccurrenceCount);
        Assert.Empty(await TitlesAsync(userId, done.Id));
        Assert.Empty(await TitlesAsync(userId, skipped.Id));
    }

    [Fact]
    public async Task ApplyToPendingAsync_twice_adds_nothing_the_second_time()
    {
        var userId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId);
        var occ = await CreateOccurrenceAsync(userId, activityId);
        await AddTemplateAsync(userId, activityId, "Kitchen");

        await _ctx.ActivitySubtaskService.ApplyToPendingAsync(activityId, userId);
        var second = await _ctx.ActivitySubtaskService.ApplyToPendingAsync(activityId, userId);

        Assert.Equal(0, second.Value!.OccurrenceCount);
        Assert.Equal(["Kitchen"], await TitlesAsync(userId, occ.Id));
    }

    [Fact]
    public async Task ApplyToPendingAsync_rejects_another_users_activity()
    {
        var owner = await CreateUserAsync();
        var other = await CreateUserAsync();
        var activityId = await CreateActivityAsync(owner);

        var result = await _ctx.ActivitySubtaskService.ApplyToPendingAsync(activityId, other);

        Assert.Equal(ErrorType.NotFound, result.Error!.Type);
    }
}
