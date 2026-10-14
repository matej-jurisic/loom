using System.Net;
using System.Net.Http.Json;
using Xunit;

namespace Loom.Tests.Integration;

public class OccurrenceListApiTests : IDisposable
{
    private readonly LoomApiFactory _factory = new();
    private readonly HttpClient _client;

    public OccurrenceListApiTests()
    {
        _client = _factory.CreateClient();
    }

    [Fact]
    public async Task Lists_require_auth()
    {
        var res = await _client.GetAsync("/api/lists");
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task Create_update_list_delete_round_trip()
    {
        _client.UseBearer(await _client.SetupUserAsync());

        var created = await _client.PostAsJsonAsync("/api/lists", new { name = "Done", status = "done", groupBy = "tag" });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var list = await created.ReadAsync<ListDto>();
        Assert.Equal("done", list.Status);

        var updated = await _client.PutAsJsonAsync($"/api/lists/{list.Id}", new { name = "Errands", search = "milk" });
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        var after = await updated.ReadAsync<ListDto>();
        Assert.Equal(("Errands", "open", "milk", (string?)null), (after.Name, after.Status, after.Search, after.GroupBy));

        var all = await (await _client.GetAsync("/api/lists")).ReadAsync<List<ListDto>>();
        Assert.Single(all);

        Assert.Equal(HttpStatusCode.BadRequest,
            (await _client.PostAsJsonAsync("/api/lists", new { name = "Bad", status = "pending" })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await _client.DeleteAsync($"/api/lists/{list.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _client.DeleteAsync($"/api/lists/{list.Id}")).StatusCode);
    }

    public void Dispose() => _factory.Dispose();

    private sealed record ListDto(Guid Id, string Name, string Status, string? Search, string? GroupBy);
}
