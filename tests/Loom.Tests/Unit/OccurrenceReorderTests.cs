using Loom.Core.Common;
using Loom.Core.Dtos;
using Loom.Core.Entities;

namespace Loom.Tests.Unit;

public class OccurrenceReorderTests : IDisposable
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

    private async Task<List<Guid>> CreateFloatingAsync(Guid userId, int count)
    {
        var activityId = (await _ctx.ActivityService.CreateAsync(userId, new CreateActivityRequest("Chores", null, null))).Value!.Id;
        var ids = new List<Guid>();
        for (var i = 0; i < count; i++)
        {
            var occ = await _ctx.OccurrenceService.CreateAsync(userId,
                new CreateOccurrenceRequest(activityId, $"Item {i}", null, null, false, false, null, null, null));
            ids.Add(occ.Value!.Id);
        }
        return ids;
    }

    private async Task<int?> SortOrderAsync(Guid userId, Guid id) =>
        (await _ctx.OccurrenceService.GetAsync(id, userId)).Value!.SortOrder;

    [Fact]
    public async Task ReorderAsync_ranks_unranked_occurrences_in_the_given_order()
    {
        var userId = await CreateUserAsync();
        var ids = await CreateFloatingAsync(userId, 3);

        var result = await _ctx.OccurrenceService.ReorderAsync(userId, new ReorderOccurrencesRequest([ids[2], ids[0], ids[1]]));

        Assert.True(result.IsSuccess);
        Assert.Equal(0, await SortOrderAsync(userId, ids[2]));
        Assert.Equal(1, await SortOrderAsync(userId, ids[0]));
        Assert.Equal(2, await SortOrderAsync(userId, ids[1]));
    }

    [Fact]
    public async Task ReorderAsync_reuses_held_positions_and_leaves_others_alone()
    {
        var userId = await CreateUserAsync();
        var ids = await CreateFloatingAsync(userId, 4);
        await _ctx.OccurrenceService.ReorderAsync(userId, new ReorderOccurrencesRequest(ids)); // 0,1,2,3

        // A section showing only items 1 and 3 swaps them: they trade 1 and 3, items 0 and 2 keep theirs.
        var result = await _ctx.OccurrenceService.ReorderAsync(userId, new ReorderOccurrencesRequest([ids[3], ids[1]]));

        Assert.True(result.IsSuccess);
        Assert.Equal(0, await SortOrderAsync(userId, ids[0]));
        Assert.Equal(1, await SortOrderAsync(userId, ids[3]));
        Assert.Equal(2, await SortOrderAsync(userId, ids[2]));
        Assert.Equal(3, await SortOrderAsync(userId, ids[1]));
    }

    [Fact]
    public async Task ReorderAsync_places_newly_ranked_after_every_ranked_occurrence()
    {
        var userId = await CreateUserAsync();
        var ids = await CreateFloatingAsync(userId, 3);
        await _ctx.OccurrenceService.ReorderAsync(userId, new ReorderOccurrencesRequest([ids[0], ids[1]])); // 0,1

        await _ctx.OccurrenceService.ReorderAsync(userId, new ReorderOccurrencesRequest([ids[2], ids[0]]));

        Assert.Equal(0, await SortOrderAsync(userId, ids[2]));
        Assert.Equal(1, await SortOrderAsync(userId, ids[1]));
        Assert.Equal(2, await SortOrderAsync(userId, ids[0]));
    }

    [Fact]
    public async Task ReorderAsync_rejects_another_users_occurrence()
    {
        var userId = await CreateUserAsync();
        var otherId = await CreateUserAsync();
        var mine = await CreateFloatingAsync(userId, 1);
        var theirs = await CreateFloatingAsync(otherId, 1);

        var result = await _ctx.OccurrenceService.ReorderAsync(userId, new ReorderOccurrencesRequest([mine[0], theirs[0]]));

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorType.NotFound, result.Error!.Type);
        Assert.Null(await SortOrderAsync(otherId, theirs[0]));
    }

    [Fact]
    public async Task ReorderAsync_rejects_duplicates_and_empty()
    {
        var userId = await CreateUserAsync();
        var ids = await CreateFloatingAsync(userId, 1);

        Assert.Equal(ErrorType.Validation,
            (await _ctx.OccurrenceService.ReorderAsync(userId, new ReorderOccurrencesRequest([ids[0], ids[0]]))).Error!.Type);
        Assert.Equal(ErrorType.Validation,
            (await _ctx.OccurrenceService.ReorderAsync(userId, new ReorderOccurrencesRequest([]))).Error!.Type);
    }
}
