using Loom.Core.Common;
using Loom.Core.Dtos;
using Loom.Core.Entities;
using Loom.Core.Enums;

namespace Loom.Tests.Unit;

public class OccurrenceTagsTests : IDisposable
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

    private async Task<TagDto> CreateTagAsync(Guid userId, string name) =>
        (await _ctx.TagService.CreateAsync(userId, new CreateTagRequest(name))).Value!;

    private async Task<ActivityDto> CreateActivityAsync(Guid userId, string title, params TagDto[] tags) =>
        (await _ctx.ActivityService.CreateAsync(
            userId, new CreateActivityRequest(title, null, TagIds: tags.Select(t => t.Id).ToList()))).Value!;

    private async Task<OccurrenceDto> CreateOccurrenceAsync(Guid userId, Guid activityId, params TagDto[] tags) =>
        (await _ctx.OccurrenceService.CreateAsync(userId, new CreateOccurrenceRequest(
            activityId, null, null, null, false, false, null, null, null,
            TagIds: tags.Select(t => t.Id).ToList()))).Value!;

    [Fact]
    public async Task CreateAsync_stores_the_tags_and_unions_them_with_the_activity_tags()
    {
        var userId = await CreateUserAsync();
        var uni = await CreateTagAsync(userId, "uni");
        var math = await CreateTagAsync(userId, "Math");
        var activity = await CreateActivityAsync(userId, "Lecture", uni);

        var dto = await CreateOccurrenceAsync(userId, activity.Id, math, uni);

        Assert.Equal(["Math", "uni"], dto.Tags.Select(t => t.Name));
        Assert.Equal(["Math", "uni"], dto.EffectiveTags.Select(t => t.Name));
        Assert.Equal(["uni"], dto.Activity.Tags.Select(t => t.Name));
    }

    [Fact]
    public async Task CreateAsync_tag_of_another_user_returns_not_found()
    {
        var userId = await CreateUserAsync();
        var otherId = await CreateUserAsync();
        var theirs = await CreateTagAsync(otherId, "Theirs");
        var activity = await CreateActivityAsync(userId, "Lecture");

        var result = await _ctx.OccurrenceService.CreateAsync(userId, new CreateOccurrenceRequest(
            activity.Id, null, null, null, false, false, null, null, null, TagIds: [theirs.Id]));

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorType.NotFound, result.Error!.Type);
    }

    [Fact]
    public async Task ListAsync_returns_the_occurrence_tags()
    {
        var userId = await CreateUserAsync();
        var math = await CreateTagAsync(userId, "Math");
        var activity = await CreateActivityAsync(userId, "Lecture");
        await CreateOccurrenceAsync(userId, activity.Id, math);
        await CreateOccurrenceAsync(userId, activity.Id);
        _ctx.Db.ChangeTracker.Clear();

        var list = await _ctx.OccurrenceService.ListAsync(userId);

        Assert.Equal(1, list.Count(o => o.Tags.Count == 1 && o.EffectiveTags.Count == 1));
        Assert.Equal(1, list.Count(o => o.Tags.Count == 0 && o.EffectiveTags.Count == 0));
    }

    [Fact]
    public async Task PatchAsync_replaces_the_tag_set()
    {
        var userId = await CreateUserAsync();
        var a = await CreateTagAsync(userId, "A");
        var b = await CreateTagAsync(userId, "B");
        var c = await CreateTagAsync(userId, "C");
        var activity = await CreateActivityAsync(userId, "Lecture");
        var occ = await CreateOccurrenceAsync(userId, activity.Id, a, b);

        var result = await _ctx.OccurrenceService.PatchAsync(occ.Id, userId,
            new PatchOccurrenceRequest(TagIds: [b.Id, c.Id]));

        Assert.True(result.IsSuccess);
        _ctx.Db.ChangeTracker.Clear();
        var reloaded = (await _ctx.OccurrenceService.GetAsync(occ.Id, userId)).Value!;
        Assert.Equal(["B", "C"], reloaded.Tags.Select(t => t.Name));
    }

    [Fact]
    public async Task PatchAsync_without_tag_ids_leaves_the_tags_alone()
    {
        var userId = await CreateUserAsync();
        var a = await CreateTagAsync(userId, "A");
        var activity = await CreateActivityAsync(userId, "Lecture");
        var occ = await CreateOccurrenceAsync(userId, activity.Id, a);

        var result = await _ctx.OccurrenceService.PatchAsync(occ.Id, userId,
            new PatchOccurrenceRequest(Notes: new Optional<string?>(true, "note")));

        Assert.True(result.IsSuccess);
        Assert.Equal(["A"], result.Value!.Tags.Select(t => t.Name));
    }

    [Fact]
    public async Task PatchAsync_with_an_empty_list_clears_the_tags()
    {
        var userId = await CreateUserAsync();
        var a = await CreateTagAsync(userId, "A");
        var activity = await CreateActivityAsync(userId, "Lecture");
        var occ = await CreateOccurrenceAsync(userId, activity.Id, a);

        var result = await _ctx.OccurrenceService.PatchAsync(occ.Id, userId, new PatchOccurrenceRequest(TagIds: []));

        Assert.True(result.IsSuccess);
        Assert.Empty(result.Value!.Tags);
    }

    [Fact]
    public async Task PatchAsync_unknown_tag_returns_not_found()
    {
        var userId = await CreateUserAsync();
        var activity = await CreateActivityAsync(userId, "Lecture");
        var occ = await CreateOccurrenceAsync(userId, activity.Id);

        var result = await _ctx.OccurrenceService.PatchAsync(occ.Id, userId,
            new PatchOccurrenceRequest(TagIds: [Guid.NewGuid()]));

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorType.NotFound, result.Error!.Type);
    }

    [Fact]
    public async Task Editing_the_activity_tags_still_reaches_existing_occurrences()
    {
        var userId = await CreateUserAsync();
        var uni = await CreateTagAsync(userId, "uni");
        var math = await CreateTagAsync(userId, "Math");
        var activity = await CreateActivityAsync(userId, "Lecture");
        var occ = await CreateOccurrenceAsync(userId, activity.Id, math);

        await _ctx.ActivityService.UpdateAsync(activity.Id, userId,
            new UpdateActivityRequest("Lecture", null, TagIds: [uni.Id]));

        _ctx.Db.ChangeTracker.Clear();
        var reloaded = (await _ctx.OccurrenceService.GetAsync(occ.Id, userId)).Value!;
        Assert.Equal(["Math"], reloaded.Tags.Select(t => t.Name));
        Assert.Equal(["Math", "uni"], reloaded.EffectiveTags.Select(t => t.Name));
    }

    [Fact]
    public async Task Deleting_a_tag_removes_it_from_occurrences()
    {
        var userId = await CreateUserAsync();
        var math = await CreateTagAsync(userId, "Math");
        var activity = await CreateActivityAsync(userId, "Lecture");
        var occ = await CreateOccurrenceAsync(userId, activity.Id, math);

        var deleted = await _ctx.TagService.DeleteAsync(math.Id, userId);

        Assert.True(deleted.IsSuccess);
        _ctx.Db.ChangeTracker.Clear();
        var reloaded = (await _ctx.OccurrenceService.GetAsync(occ.Id, userId)).Value!;
        Assert.Empty(reloaded.Tags);
    }

    [Fact]
    public async Task CreateEventAsync_and_UpdateEventAsync_carry_tags()
    {
        var userId = await CreateUserAsync();
        var exam = await CreateTagAsync(userId, "Exam");
        var math = await CreateTagAsync(userId, "Math");
        var start = new DateTimeOffset(2026, 10, 20, 9, 0, 0, TimeSpan.Zero);

        var created = (await _ctx.OccurrenceService.CreateEventAsync(userId, new CreateEventRequest(
            "Midterm", null, null, start, start.AddHours(2), false, false, TagIds: [exam.Id]))).Value!;

        Assert.Equal(["Exam"], created.Tags.Select(t => t.Name));

        var updated = await _ctx.OccurrenceService.UpdateEventAsync(created.Id, userId, new UpdateEventRequest(
            "Midterm", null, null, start, start.AddHours(2), false, false, TagIds: [exam.Id, math.Id]));

        Assert.True(updated.IsSuccess);
        Assert.Equal(["Exam", "Math"], updated.Value!.Tags.Select(t => t.Name));
    }

    [Fact]
    public async Task RepeatAsync_copies_the_tags_of_the_source()
    {
        var userId = await CreateUserAsync();
        var math = await CreateTagAsync(userId, "Math");
        var activity = (await _ctx.ActivityService.CreateAsync(
            userId, new CreateActivityRequest("Homework", null, null, 7))).Value!;
        var start = new DateTimeOffset(2026, 10, 5, 9, 0, 0, TimeSpan.Zero);
        var source = (await _ctx.OccurrenceService.CreateAsync(userId, new CreateOccurrenceRequest(
            activity.Id, null, start, start.AddHours(1), false, false, null, null, null, TagIds: [math.Id]))).Value!;
        await _ctx.OccurrenceService.SetStatusAsync(source.Id, userId, EventStatus.done);

        var repeat = await _ctx.OccurrenceService.RepeatAsync(source.Id, userId, new RepeatOccurrenceRequest());

        Assert.True(repeat.IsSuccess);
        Assert.Equal(["Math"], repeat.Value!.Tags.Select(t => t.Name));
    }
}
