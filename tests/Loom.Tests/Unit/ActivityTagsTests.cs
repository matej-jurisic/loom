using Loom.Core.Common;
using Loom.Core.Dtos;
using Loom.Core.Entities;
using Loom.Core.Enums;

namespace Loom.Tests.Unit;

public class ActivityTagsTests : IDisposable
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

    [Fact]
    public async Task CreateAsync_links_every_tag_once()
    {
        var userId = await CreateUserAsync();
        var a = await CreateTagAsync(userId, "CS101");
        var b = await CreateTagAsync(userId, "Lab");

        var result = await _ctx.ActivityService.CreateAsync(
            userId, new CreateActivityRequest("Lab 1", null, TagIds: [b.Id, a.Id, b.Id]));

        Assert.True(result.IsSuccess);
        Assert.Equal(["CS101", "Lab"], result.Value!.Tags.Select(t => t.Name));
    }

    [Fact]
    public async Task CreateAsync_tag_of_another_user_returns_not_found()
    {
        var userId = await CreateUserAsync();
        var otherId = await CreateUserAsync();
        var mine = await CreateTagAsync(userId, "Mine");
        var theirs = await CreateTagAsync(otherId, "Theirs");

        var result = await _ctx.ActivityService.CreateAsync(
            userId, new CreateActivityRequest("Run", null, TagIds: [mine.Id, theirs.Id]));

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorType.NotFound, result.Error!.Type);
    }

    [Fact]
    public async Task UpdateAsync_replaces_the_tag_set()
    {
        var userId = await CreateUserAsync();
        var a = await CreateTagAsync(userId, "A");
        var b = await CreateTagAsync(userId, "B");
        var c = await CreateTagAsync(userId, "C");
        var activity = await CreateActivityAsync(userId, "Run", a, b);

        var result = await _ctx.ActivityService.UpdateAsync(
            activity.Id, userId, new UpdateActivityRequest("Run", null, TagIds: [b.Id, c.Id]));

        Assert.True(result.IsSuccess);
        _ctx.Db.ChangeTracker.Clear();
        var reloaded = (await _ctx.ActivityService.GetAsync(activity.Id, userId)).Value!;
        Assert.Equal(["B", "C"], reloaded.Tags.Select(t => t.Name));
    }

    [Fact]
    public async Task UpdateAsync_without_tags_clears_them()
    {
        var userId = await CreateUserAsync();
        var a = await CreateTagAsync(userId, "A");
        var activity = await CreateActivityAsync(userId, "Run", a);

        await _ctx.ActivityService.UpdateAsync(activity.Id, userId, new UpdateActivityRequest("Run", null));

        _ctx.Db.ChangeTracker.Clear();
        var reloaded = (await _ctx.ActivityService.GetAsync(activity.Id, userId)).Value!;
        Assert.Empty(reloaded.Tags);
    }

    [Fact]
    public async Task ListAsync_by_tag_returns_only_tagged_activities()
    {
        var userId = await CreateUserAsync();
        var a = await CreateTagAsync(userId, "A");
        var b = await CreateTagAsync(userId, "B");
        await CreateActivityAsync(userId, "Shared", a, b);
        await CreateActivityAsync(userId, "Only A", a);
        await CreateActivityAsync(userId, "None");

        var forA = await _ctx.ActivityService.ListAsync(userId, tagId: a.Id);
        var forB = await _ctx.ActivityService.ListAsync(userId, tagId: b.Id);

        Assert.Equal(["Only A", "Shared"], forA.Select(x => x.Title));
        Assert.Equal(["Shared"], forB.Select(x => x.Title));
    }

    [Fact]
    public async Task OccurrenceDto_carries_the_activity_tags()
    {
        var userId = await CreateUserAsync();
        var tag = await CreateTagAsync(userId, "CS101");
        var activity = await CreateActivityAsync(userId, "Lecture", tag);
        _ctx.Db.Occurrences.Add(new Occurrence { UserId = userId, ActivityId = activity.Id, Status = EventStatus.pending });
        await _ctx.Db.SaveChangesAsync();
        _ctx.Db.ChangeTracker.Clear();

        var list = await _ctx.OccurrenceService.ListAsync(userId);

        var dto = Assert.Single(list);
        Assert.Equal(["CS101"], dto.Activity.Tags.Select(t => t.Name));
    }

    [Fact]
    public async Task DeleteAsync_removes_the_link_but_keeps_the_activity()
    {
        var userId = await CreateUserAsync();
        var tag = await CreateTagAsync(userId, "A");
        var activity = await CreateActivityAsync(userId, "Run", tag);

        var result = await _ctx.TagService.DeleteAsync(tag.Id, userId);

        Assert.True(result.IsSuccess);
        _ctx.Db.ChangeTracker.Clear();
        var reloaded = (await _ctx.ActivityService.GetAsync(activity.Id, userId)).Value!;
        Assert.Empty(reloaded.Tags);
    }

    [Fact]
    public async Task CreateAsync_duplicate_name_is_a_conflict_ignoring_case()
    {
        var userId = await CreateUserAsync();
        await CreateTagAsync(userId, "CS101");

        var result = await _ctx.TagService.CreateAsync(userId, new CreateTagRequest(" cs101 "));

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorType.Conflict, result.Error!.Type);
    }

    [Fact]
    public async Task UpdateAsync_renaming_to_itself_with_new_case_is_allowed()
    {
        var userId = await CreateUserAsync();
        var tag = await CreateTagAsync(userId, "cs101");

        var result = await _ctx.TagService.UpdateAsync(tag.Id, userId, new UpdateTagRequest("CS101"));

        Assert.True(result.IsSuccess);
        Assert.Equal("CS101", result.Value!.Name);
    }
}
