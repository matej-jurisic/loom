using Loom.Core.Common;
using Loom.Core.Dtos;
using Loom.Core.Entities;
using Loom.Core.Enums;

namespace Loom.Tests.Unit;

public class SourceLinkTests : IDisposable
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

    private async Task<Guid> CreateActivityAsync(Guid userId, string title = "Course study", int? repeatAfterDays = null) =>
        (await _ctx.ActivityService.CreateAsync(userId,
            new CreateActivityRequest(title, null, null, RepeatAfterDays: repeatAfterDays))).Value!.Id;

    private Task<Result<OccurrenceDto>> CreateAsync(Guid userId, Guid activityId, Guid? sourceId = null, string? title = null,
        DateTimeOffset? start = null) =>
        _ctx.OccurrenceService.CreateAsync(userId,
            new CreateOccurrenceRequest(activityId, title, start, start?.AddHours(1), false, false, null, null, null,
                SourceOccurrenceId: sourceId));

    [Fact]
    public async Task CreateAsync_links_to_a_done_source()
    {
        var userId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId);
        var lecture = (await CreateAsync(userId, activityId, title: "Lecture 01")).Value!;
        await _ctx.OccurrenceService.SetStatusAsync(lecture.Id, userId, EventStatus.done);

        var result = await CreateAsync(userId, activityId, lecture.Id);

        Assert.True(result.IsSuccess);
        Assert.Equal(lecture.Id, result.Value!.SourceOccurrenceId);
        Assert.Equal("Lecture 01", result.Value.Source!.EffectiveTitle);
    }

    [Fact]
    public async Task CreateAsync_rejects_a_source_that_is_itself_a_follow_up()
    {
        var userId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId);
        var lecture = (await CreateAsync(userId, activityId)).Value!;
        var revise = (await CreateAsync(userId, activityId, lecture.Id)).Value!;

        var result = await CreateAsync(userId, activityId, revise.Id);

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorType.Validation, result.Error!.Type);
    }

    [Fact]
    public async Task CreateAsync_rejects_another_users_source()
    {
        var userId = await CreateUserAsync();
        var otherId = await CreateUserAsync();
        var theirs = (await CreateAsync(otherId, await CreateActivityAsync(otherId))).Value!;

        var result = await CreateAsync(userId, await CreateActivityAsync(userId), theirs.Id);

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorType.NotFound, result.Error!.Type);
    }

    [Fact]
    public async Task PatchAsync_rejects_self_and_an_occurrence_with_follow_ups()
    {
        var userId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId);
        var lecture = (await CreateAsync(userId, activityId)).Value!;
        var other = (await CreateAsync(userId, activityId)).Value!;
        await CreateAsync(userId, activityId, lecture.Id);

        var self = await _ctx.OccurrenceService.PatchAsync(other.Id, userId,
            new PatchOccurrenceRequest(SourceOccurrenceId: new Optional<Guid?>(true, other.Id)));
        var withFollowUps = await _ctx.OccurrenceService.PatchAsync(lecture.Id, userId,
            new PatchOccurrenceRequest(SourceOccurrenceId: new Optional<Guid?>(true, other.Id)));

        Assert.Equal(ErrorType.Validation, self.Error!.Type);
        Assert.Equal(ErrorType.Validation, withFollowUps.Error!.Type);
    }

    [Fact]
    public async Task PatchAsync_absent_keeps_the_link_and_null_clears_it()
    {
        var userId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId);
        var lecture = (await CreateAsync(userId, activityId)).Value!;
        var revise = (await CreateAsync(userId, activityId, lecture.Id)).Value!;

        var kept = await _ctx.OccurrenceService.PatchAsync(revise.Id, userId, new PatchOccurrenceRequest(Title: new Optional<string?>(true, "x")));
        var cleared = await _ctx.OccurrenceService.PatchAsync(revise.Id, userId,
            new PatchOccurrenceRequest(SourceOccurrenceId: new Optional<Guid?>(true, null)));

        Assert.Equal(lecture.Id, kept.Value!.SourceOccurrenceId);
        Assert.Null(cleared.Value!.SourceOccurrenceId);
    }

    [Fact]
    public async Task Source_carries_follow_up_counts()
    {
        var userId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId);
        var lecture = (await CreateAsync(userId, activityId)).Value!;
        var read = (await CreateAsync(userId, activityId, lecture.Id, start: DateTimeOffset.UtcNow)).Value!;
        await CreateAsync(userId, activityId, lecture.Id);
        await _ctx.OccurrenceService.SetStatusAsync(read.Id, userId, EventStatus.done);

        var dto = (await _ctx.OccurrenceService.GetAsync(lecture.Id, userId)).Value!;
        var listed = await _ctx.OccurrenceService.ListAsync(userId, sourceId: lecture.Id);

        Assert.Equal(2, dto.FollowUpCount);
        Assert.Equal(1, dto.FollowUpDoneCount);
        Assert.Equal(60, dto.FollowUpDoneMinutes);
        Assert.Equal(2, listed.Count);
    }

    [Fact]
    public async Task ListAsync_undated_returns_floating_and_no_date_only()
    {
        var userId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId);
        var floating = (await CreateAsync(userId, activityId)).Value!;
        var book = (await _ctx.OccurrenceService.CreateAsync(userId,
            new CreateOccurrenceRequest(activityId, "Book", null, null, false, false, null, null, null, IsNoDate: true))).Value!;
        await CreateAsync(userId, activityId, start: DateTimeOffset.UtcNow);

        var listed = await _ctx.OccurrenceService.ListAsync(userId, undatedOnly: true);

        Assert.Equal(new[] { floating.Id, book.Id }.Order(), listed.Select(o => o.Id).Order());
    }

    [Fact]
    public async Task DeleteAsync_of_the_source_clears_the_link()
    {
        var userId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId);
        var lecture = (await CreateAsync(userId, activityId)).Value!;
        var revise = (await CreateAsync(userId, activityId, lecture.Id)).Value!;

        await _ctx.OccurrenceService.DeleteAsync(lecture.Id, userId);
        _ctx.Db.ChangeTracker.Clear();

        var dto = (await _ctx.OccurrenceService.GetAsync(revise.Id, userId)).Value!;
        Assert.Null(dto.SourceOccurrenceId);
        Assert.Null(dto.Source);
    }

    [Fact]
    public async Task RepeatAsync_keeps_the_link()
    {
        var userId = await CreateUserAsync();
        var lectureActivity = await CreateActivityAsync(userId, "Lecture");
        var studyActivity = await CreateActivityAsync(userId, "Revision", repeatAfterDays: 7);
        var lecture = (await CreateAsync(userId, lectureActivity)).Value!;
        var revise = (await CreateAsync(userId, studyActivity, lecture.Id, start: DateTimeOffset.UtcNow.AddHours(-2))).Value!;
        await _ctx.OccurrenceService.SetStatusAsync(revise.Id, userId, EventStatus.done);

        var copy = await _ctx.OccurrenceService.RepeatAsync(revise.Id, userId, new RepeatOccurrenceRequest(false));

        Assert.True(copy.IsSuccess);
        Assert.Equal(lecture.Id, copy.Value!.SourceOccurrenceId);
    }

    [Fact]
    public async Task UpdateEventAsync_is_a_full_replace_for_the_link()
    {
        var userId = await CreateUserAsync();
        var lecture = (await CreateAsync(userId, await CreateActivityAsync(userId))).Value!;
        var ev = (await _ctx.OccurrenceService.CreateEventAsync(userId,
            new CreateEventRequest("Office hours", null, null, null, null, false, false, SourceOccurrenceId: lecture.Id))).Value!;
        Assert.Equal(lecture.Id, ev.SourceOccurrenceId);

        var updated = await _ctx.OccurrenceService.UpdateEventAsync(ev.Id, userId,
            new UpdateEventRequest("Office hours", null, null, null, null, false, false));

        Assert.Null(updated.Value!.SourceOccurrenceId);
    }
}
