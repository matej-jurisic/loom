using Loom.Core.Common;
using Loom.Core.Dtos;
using Loom.Core.Entities;

namespace Loom.Tests.Unit;

public class ActivityCreateTemplatesTests : IDisposable
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
    public async Task CreateAsync_saves_subtasks_and_work_types_in_order()
    {
        var userId = await CreateUserAsync();

        var created = await _ctx.ActivityService.CreateAsync(userId, new CreateActivityRequest("Run", null,
            Subtasks: ["Warm up", " Run ", "Stretch"], WorkTypes: ["Easy", "Tempo", "easy"]));

        Assert.True(created.IsSuccess);
        _ctx.Db.ChangeTracker.Clear();
        var a = (await _ctx.ActivityService.GetAsync(created.Value!.Id, userId)).Value!;
        Assert.Equal(["Warm up", "Run", "Stretch"], a.Subtasks.Select(s => s.Title));
        Assert.Equal(["Easy", "Tempo"], a.WorkTypes.Select(w => w.Title));
    }

    [Fact]
    public async Task CreateAsync_rejects_a_blank_subtask()
    {
        var userId = await CreateUserAsync();

        var result = await _ctx.ActivityService.CreateAsync(userId, new CreateActivityRequest("Run", null, Subtasks: ["  "]));

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorType.Validation, result.Error!.Type);
    }
}
