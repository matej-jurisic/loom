using System.Net;
using System.Net.Http.Json;

namespace Loom.Tests.Integration;

public class OccurrenceReorderApiTests : IDisposable
{
    private readonly LoomApiFactory _factory = new();
    private readonly HttpClient _client;

    public OccurrenceReorderApiTests()
    {
        _client = _factory.CreateClient();
    }

    public void Dispose() => _factory.Dispose();

    [Fact]
    public async Task PutOrder_SetsSortOrderOnTheListedOccurrences()
    {
        _client.UseBearer(await _client.SetupUserAsync());
        var activity = await (await _client.PostAsJsonAsync("/api/activities", new { title = "Chores" })).ReadAsync<ActivityDto>();
        var first = await (await _client.PostAsJsonAsync("/api/occurrences", new { activityId = activity.Id, title = "A" })).ReadAsync<OccurrenceDto>();
        var second = await (await _client.PostAsJsonAsync("/api/occurrences", new { activityId = activity.Id, title = "B" })).ReadAsync<OccurrenceDto>();

        var res = await _client.PutAsJsonAsync("/api/occurrences/order", new { occurrenceIds = new[] { second.Id, first.Id } });

        Assert.Equal(HttpStatusCode.NoContent, res.StatusCode);
        var all = await _client.GetFromJsonAsync<List<OccurrenceDto>>("/api/occurrences");
        Assert.Equal(0, all!.Single(o => o.Id == second.Id).SortOrder);
        Assert.Equal(1, all!.Single(o => o.Id == first.Id).SortOrder);
    }

    [Fact]
    public async Task PutOrder_UnknownOccurrence_Returns404()
    {
        _client.UseBearer(await _client.SetupUserAsync());

        var res = await _client.PutAsJsonAsync("/api/occurrences/order", new { occurrenceIds = new[] { Guid.NewGuid() } });

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }

    private sealed record ActivityDto(Guid Id);
    private sealed record OccurrenceDto(Guid Id, int? SortOrder);
}
