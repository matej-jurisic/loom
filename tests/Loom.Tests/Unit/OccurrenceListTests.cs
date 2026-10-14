using Loom.Core.Common;
using Loom.Core.Dtos;
using Loom.Core.Entities;

namespace Loom.Tests.Unit;

public class OccurrenceListTests : IDisposable
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

    private static SaveOccurrenceListRequest Req(
        string name, string? status = null, string? category = null, string? tag = null,
        string? goal = null, string? search = null, string? groupBy = null) =>
        new(name, status, category, tag, goal, search, groupBy);

    [Fact]
    public async Task CreateAsync_stores_filters_and_defaults_status_to_open()
    {
        var userId = await CreateUserAsync();
        var tag = (await _ctx.TagService.CreateAsync(userId, new CreateTagRequest("Errands"))).Value!;

        var result = await _ctx.OccurrenceListService.CreateAsync(
            userId, Req("  Errands  ", tag: tag.Id.ToString().ToUpperInvariant(), goal: "none", search: " milk ", groupBy: "activity"));

        Assert.True(result.IsSuccess);
        var list = result.Value!;
        Assert.Equal("Errands", list.Name);
        Assert.Equal("open", list.Status);
        Assert.Equal(tag.Id.ToString(), list.Tag);
        Assert.Equal("none", list.Goal);
        Assert.Null(list.Category);
        Assert.Equal("milk", list.Search);
        Assert.Equal("activity", list.GroupBy);
    }

    [Fact]
    public async Task CreateAsync_rejects_unknown_status_grouping_and_foreign_refs()
    {
        var userId = await CreateUserAsync();
        var otherId = await CreateUserAsync();
        var otherTag = (await _ctx.TagService.CreateAsync(otherId, new CreateTagRequest("Theirs"))).Value!;

        Assert.Equal(ErrorType.Validation, (await _ctx.OccurrenceListService.CreateAsync(userId, Req("A", status: "pending"))).Error!.Type);
        Assert.Equal(ErrorType.Validation, (await _ctx.OccurrenceListService.CreateAsync(userId, Req("A", groupBy: "day"))).Error!.Type);
        Assert.Equal(ErrorType.Validation, (await _ctx.OccurrenceListService.CreateAsync(userId, Req("A", tag: otherTag.Id.ToString()))).Error!.Type);
        Assert.Equal(ErrorType.Validation, (await _ctx.OccurrenceListService.CreateAsync(userId, Req("A", category: "nope"))).Error!.Type);
        Assert.Equal(ErrorType.Validation, (await _ctx.OccurrenceListService.CreateAsync(userId, Req(" "))).Error!.Type);
    }

    [Fact]
    public async Task Names_are_unique_per_user_ignoring_case()
    {
        var userId = await CreateUserAsync();
        var otherId = await CreateUserAsync();
        var first = (await _ctx.OccurrenceListService.CreateAsync(userId, Req("Today"))).Value!;

        Assert.Equal(ErrorType.Conflict, (await _ctx.OccurrenceListService.CreateAsync(userId, Req("today"))).Error!.Type);
        Assert.True((await _ctx.OccurrenceListService.CreateAsync(otherId, Req("Today"))).IsSuccess);
        Assert.True((await _ctx.OccurrenceListService.UpdateAsync(first.Id, userId, Req("TODAY"))).IsSuccess);
    }

    [Fact]
    public async Task UpdateAsync_replaces_every_field_and_is_scoped_to_the_owner()
    {
        var userId = await CreateUserAsync();
        var otherId = await CreateUserAsync();
        var list = (await _ctx.OccurrenceListService.CreateAsync(userId, Req("Done", status: "done", search: "x", groupBy: "tag"))).Value!;

        var updated = (await _ctx.OccurrenceListService.UpdateAsync(list.Id, userId, Req("Renamed"))).Value!;
        Assert.Equal("open", updated.Status);
        Assert.Null(updated.Search);
        Assert.Null(updated.GroupBy);

        Assert.Equal(ErrorType.NotFound, (await _ctx.OccurrenceListService.UpdateAsync(list.Id, otherId, Req("Mine"))).Error!.Type);
        Assert.Equal(ErrorType.NotFound, (await _ctx.OccurrenceListService.DeleteAsync(list.Id, otherId)).Error!.Type);
        Assert.True((await _ctx.OccurrenceListService.DeleteAsync(list.Id, userId)).IsSuccess);
        Assert.Empty(await _ctx.OccurrenceListService.ListAsync(userId));
    }

    [Fact]
    public async Task Icon_is_stored_cleared_by_a_replace_and_length_bounded()
    {
        var userId = await CreateUserAsync();
        var created = (await _ctx.OccurrenceListService.CreateAsync(userId, Req("Errands") with { Icon = "ShoppingCart" })).Value!;
        Assert.Equal("ShoppingCart", created.Icon);

        var updated = (await _ctx.OccurrenceListService.UpdateAsync(created.Id, userId, Req("Errands"))).Value!;
        Assert.Null(updated.Icon);

        var tooLong = await _ctx.OccurrenceListService.CreateAsync(userId, Req("B") with { Icon = new string('x', 51) });
        Assert.Equal(ErrorType.Validation, tooLong.Error!.Type);
    }

    [Fact]
    public async Task Color_is_stored_cleared_by_a_replace_and_must_be_hex()
    {
        var userId = await CreateUserAsync();
        var created = (await _ctx.OccurrenceListService.CreateAsync(userId, Req("Errands") with { Color = "#3b82f6" })).Value!;
        Assert.Equal("#3b82f6", created.Color);

        var updated = (await _ctx.OccurrenceListService.UpdateAsync(created.Id, userId, Req("Errands"))).Value!;
        Assert.Null(updated.Color);

        var bad = await _ctx.OccurrenceListService.CreateAsync(userId, Req("B") with { Color = "blue" });
        Assert.Equal(ErrorType.Validation, bad.Error!.Type);
    }
}
