using Loom.Core.Common;
using Loom.Core.Dtos;
using Loom.Core.Entities;
using Microsoft.EntityFrameworkCore;

namespace Loom.Tests.Unit;

public class ActivityDuplicateTests : IDisposable
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

    [Fact]
    public async Task DuplicateAsync_copies_links_and_templates_but_not_occurrences()
    {
        var userId = await CreateUserAsync();
        var tag = (await _ctx.TagService.CreateAsync(userId, new CreateTagRequest("Lab"))).Value!;
        var goal = new Goal { UserId = userId, Title = "Fit" };
        _ctx.Db.Goals.Add(goal);
        await _ctx.Db.SaveChangesAsync();

        var src = (await _ctx.ActivityService.CreateAsync(userId,
            new CreateActivityRequest("Run", null, [goal.Id], 7, [tag.Id]))).Value!;
        foreach (var t in new[] { "Warm up", "Run", "Stretch" })
            await _ctx.ActivitySubtaskService.CreateAsync(src.Id, userId, new CreateActivitySubtaskRequest(t));
        var keep = (await _ctx.ActivityWorkTypeService.CreateAsync(src.Id, userId, new CreateActivityWorkTypeRequest("Easy"))).Value!;
        var gone = (await _ctx.ActivityWorkTypeService.CreateAsync(src.Id, userId, new CreateActivityWorkTypeRequest("Old"))).Value!;
        await _ctx.Db.ActivityWorkTypes.Where(w => w.Id == gone.Id).ExecuteUpdateAsync(s => s.SetProperty(w => w.IsArchived, true));
        await _ctx.OccurrenceService.CreateAsync(userId, new CreateOccurrenceRequest(src.Id, null, null, null, false, false, null, null, null));
        _ctx.Db.ChangeTracker.Clear();

        var result = await _ctx.ActivityService.DuplicateAsync(src.Id, userId);

        Assert.True(result.IsSuccess);
        var copy = (await _ctx.ActivityService.GetAsync(result.Value!.Id, userId)).Value!;
        Assert.NotEqual(src.Id, copy.Id);
        Assert.Equal("Run (copy)", copy.Title);
        Assert.Equal(7, copy.RepeatAfterDays);
        Assert.Equal([goal.Id], copy.Goals.Select(g => g.Id));
        Assert.Equal([tag.Id], copy.Tags.Select(t => t.Id));
        Assert.Equal(["Warm up", "Run", "Stretch"], copy.Subtasks.Select(s => s.Title));
        Assert.Equal([keep.Title], copy.WorkTypes.Select(w => w.Title));
        Assert.False(await _ctx.Db.Occurrences.AnyAsync(o => o.ActivityId == copy.Id));
    }

    [Fact]
    public async Task DuplicateAsync_activity_of_another_user_returns_not_found()
    {
        var userId = await CreateUserAsync();
        var otherId = await CreateUserAsync();
        var theirs = (await _ctx.ActivityService.CreateAsync(otherId, new CreateActivityRequest("Run", null))).Value!;

        var result = await _ctx.ActivityService.DuplicateAsync(theirs.Id, userId);

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorType.NotFound, result.Error!.Type);
    }
}
