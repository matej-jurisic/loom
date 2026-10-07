using Loom.Core.Common;
using Loom.Core.Dtos;
using Loom.Core.Entities;

namespace Loom.Tests.Unit;

public class OccurrencePatchTests : IDisposable
{
    private readonly TestContext _ctx = new();

    public void Dispose() => _ctx.Dispose();

    private static readonly DateTimeOffset Start = new(2026, 7, 7, 14, 0, 0, TimeSpan.Zero);

    private async Task<Guid> CreateUserAsync()
    {
        var user = new User { Username = "u" + Guid.NewGuid().ToString("N")[..8], PasswordHash = "x", Timezone = "UTC" };
        _ctx.Db.Users.Add(user);
        await _ctx.Db.SaveChangesAsync();
        return user.Id;
    }

    private async Task<(Guid UserId, OccurrenceDto Occurrence)> CreatePlannedAsync()
    {
        var userId = await CreateUserAsync();
        var activityId = (await _ctx.ActivityService.CreateAsync(userId, new CreateActivityRequest("Study", null, null))).Value!.Id;
        var occ = (await _ctx.OccurrenceService.CreateAsync(userId,
            new CreateOccurrenceRequest(activityId, "Chapter 4", Start, Start.AddMinutes(90), false, true, null, null, null))).Value!;
        return (userId, occ);
    }

    [Fact]
    public async Task PatchAsync_with_no_fields_changes_nothing()
    {
        var (userId, occ) = await CreatePlannedAsync();

        var result = await _ctx.OccurrenceService.PatchAsync(occ.Id, userId, new PatchOccurrenceRequest());

        Assert.True(result.IsSuccess);
        Assert.Equal("Chapter 4", result.Value!.Title);
        Assert.Equal(Start, result.Value.StartAt);
        Assert.Equal(Start.AddMinutes(90), result.Value.EndAt);
        Assert.True(result.Value.IsPlanned);
        Assert.False(result.Value.IsAllDay);
    }

    [Fact]
    public async Task PatchAsync_one_field_leaves_the_others_untouched()
    {
        var (userId, occ) = await CreatePlannedAsync();

        var result = await _ctx.OccurrenceService.PatchAsync(occ.Id, userId,
            new PatchOccurrenceRequest(Title: new(true, "Chapter 5")));

        Assert.True(result.IsSuccess);
        Assert.Equal("Chapter 5", result.Value!.Title);
        Assert.Equal(Start, result.Value.StartAt);
        Assert.Equal(Start.AddMinutes(90), result.Value.EndAt);
        Assert.True(result.Value.IsPlanned);
    }

    [Fact]
    public async Task PatchAsync_null_clears_title_start_and_end()
    {
        var (userId, occ) = await CreatePlannedAsync();

        var result = await _ctx.OccurrenceService.PatchAsync(occ.Id, userId,
            new PatchOccurrenceRequest(
                Title: new(true, null),
                StartAt: new(true, null),
                EndAt: new(true, null),
                IsPlanned: new(true, false)));

        Assert.True(result.IsSuccess);
        Assert.Null(result.Value!.Title);
        Assert.Null(result.Value.StartAt);
        Assert.Null(result.Value.EndAt);
        Assert.False(result.Value.IsPlanned);
    }

    [Fact]
    public async Task PatchAsync_rejects_an_end_before_the_existing_start()
    {
        var (userId, occ) = await CreatePlannedAsync();

        var result = await _ctx.OccurrenceService.PatchAsync(occ.Id, userId,
            new PatchOccurrenceRequest(EndAt: new(true, Start.AddMinutes(-30))));

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorType.Validation, result.Error!.Type);
    }

    [Fact]
    public async Task PatchAsync_unknown_occurrence_is_not_found()
    {
        var userId = await CreateUserAsync();

        var result = await _ctx.OccurrenceService.PatchAsync(Guid.NewGuid(), userId, new PatchOccurrenceRequest());

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorType.NotFound, result.Error!.Type);
    }
}
