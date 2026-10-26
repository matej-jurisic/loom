using Loom.Core.Common;
using Loom.Core.Dtos;
using Loom.Core.Entities;

namespace Loom.Tests.Unit;

public class ActivityShortLabelTests : IDisposable
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
    public async Task CreateAsync_stores_the_trimmed_label()
    {
        var userId = await CreateUserAsync();

        var result = await _ctx.ActivityService.CreateAsync(userId, new CreateActivityRequest("Lab deadline", null, ShortLabel: "  DL "));

        Assert.Equal("DL", result.Value!.ShortLabel);
    }

    [Fact]
    public async Task CreateAsync_rejects_a_label_over_the_limit()
    {
        var userId = await CreateUserAsync();

        var result = await _ctx.ActivityService.CreateAsync(userId,
            new CreateActivityRequest("Lab deadline", null, ShortLabel: new string('x', Validators.MaxShortLabelLength + 1)));

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorType.Validation, result.Error!.Type);
    }

    [Fact]
    public async Task UpdateAsync_sets_and_clears_the_label()
    {
        var userId = await CreateUserAsync();
        var id = (await _ctx.ActivityService.CreateAsync(userId, new CreateActivityRequest("Lab defense", null))).Value!.Id;

        var set = await _ctx.ActivityService.UpdateAsync(id, userId, new UpdateActivityRequest("Lab defense", null, ShortLabel: "Def"));
        var blank = await _ctx.ActivityService.UpdateAsync(id, userId, new UpdateActivityRequest("Lab defense", null, ShortLabel: "   "));
        await _ctx.ActivityService.UpdateAsync(id, userId, new UpdateActivityRequest("Lab defense", null, ShortLabel: "Def"));
        var omitted = await _ctx.ActivityService.UpdateAsync(id, userId, new UpdateActivityRequest("Lab defense", null));

        Assert.Equal("Def", set.Value!.ShortLabel);
        Assert.Null(blank.Value!.ShortLabel);
        Assert.Null(omitted.Value!.ShortLabel);
    }
}
