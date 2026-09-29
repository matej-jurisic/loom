using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace Loom.Tests.Integration;

public class RecurrenceTests : IDisposable
{
    private readonly LoomApiFactory _factory = new();
    private readonly HttpClient _client;
    private static readonly DateOnly Today = DateOnly.FromDateTime(DateTime.UtcNow);

    public RecurrenceTests()
    {
        _client = _factory.CreateClient();
    }

    public void Dispose() => _factory.Dispose();

    private async Task<Guid> CreateRepeatingActivityAsync(object? rule = null)
    {
        _client.UseBearer(await _client.SetupUserAsync());
        var act = await (await _client.PostAsJsonAsync("/api/activities", new { title = "Stretch" })).ReadAsync<IdDto>();
        var set = await _client.PutAsJsonAsync($"/api/activities/{act.Id}/recurrence", rule ?? new
        {
            frequency = "daily", interval = 1, startDate = Today.ToString("yyyy-MM-dd"), timeOfDay = "09:00", durationMinutes = 30,
        });
        Assert.Equal(HttpStatusCode.OK, set.StatusCode);
        return act.Id;
    }

    private async Task<JsonElement[]> ListAsync(int days)
    {
        var from = new DateTimeOffset(Today.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var url = $"/api/occurrences?startFrom={Uri.EscapeDataString(from.ToString("o"))}&endBefore={Uri.EscapeDataString(from.AddDays(days).ToString("o"))}";
        var doc = await (await _client.GetAsync(url)).ReadAsync<JsonElement>();
        return doc.EnumerateArray().ToArray();
    }

    [Fact]
    public async Task Rule_requires_auth()
    {
        var res = await _client.PutAsJsonAsync($"/api/activities/{Guid.NewGuid()}/recurrence", new { frequency = "daily", interval = 1, startDate = "2026-01-01" });
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task Rule_round_trips_on_the_activity_as_strings_and_dates()
    {
        var id = await CreateRepeatingActivityAsync(new
        {
            frequency = "weekly", interval = 2, weekdays = new[] { 5, 1 }, startDate = Today.ToString("yyyy-MM-dd"),
            endDate = Today.AddDays(30).ToString("yyyy-MM-dd"), timeOfDay = "18:30", durationMinutes = 45,
        });

        var act = await (await _client.GetAsync($"/api/activities/{id}")).ReadAsync<JsonElement>();
        var r = act.GetProperty("recurrence");

        Assert.Equal("weekly", r.GetProperty("frequency").GetString());
        Assert.Equal(2, r.GetProperty("interval").GetInt32());
        Assert.Equal([1, 5], r.GetProperty("weekdays").EnumerateArray().Select(e => e.GetInt32()));
        Assert.Equal(Today.AddDays(30).ToString("yyyy-MM-dd"), r.GetProperty("endDate").GetString());
        Assert.Equal("18:30", r.GetProperty("timeOfDay").GetString());
    }

    [Fact]
    public async Task Invalid_rule_is_a_400()
    {
        var id = await CreateRepeatingActivityAsync();

        var res = await _client.PutAsJsonAsync($"/api/activities/{id}/recurrence",
            new { frequency = "daily", interval = 0, startDate = Today.ToString("yyyy-MM-dd") });

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Range_list_carries_projected_rows_with_their_series_day()
    {
        var id = await CreateRepeatingActivityAsync();

        var list = await ListAsync(2);

        Assert.Equal(2, list.Length);
        Assert.All(list, o =>
        {
            Assert.True(o.GetProperty("isProjected").GetBoolean());
            Assert.Equal(id, o.GetProperty("activityId").GetGuid());
        });
        Assert.Equal(Today.ToString("yyyy-MM-dd"), list[0].GetProperty("seriesDate").GetString());
    }

    [Fact]
    public async Task Materialize_then_complete_keeps_the_id_and_drops_the_projection()
    {
        var id = await CreateRepeatingActivityAsync();
        var projected = (await ListAsync(1)).Single();
        var occurrenceId = projected.GetProperty("id").GetGuid();

        var made = await _client.PostAsJsonAsync("/api/occurrences/materialize",
            new { activityId = id, seriesDate = projected.GetProperty("seriesDate").GetString() });
        Assert.Equal(HttpStatusCode.OK, made.StatusCode);
        Assert.Equal(occurrenceId, (await made.ReadAsync<JsonElement>()).GetProperty("id").GetGuid());

        var done = await _client.PostAsJsonAsync($"/api/occurrences/{occurrenceId}/status", new { status = "done" });
        Assert.Equal(HttpStatusCode.OK, done.StatusCode);

        var after = (await ListAsync(1)).Single();
        Assert.False(after.GetProperty("isProjected").GetBoolean());
        Assert.Equal("done", after.GetProperty("status").GetString());
    }

    [Fact]
    public async Task Acting_on_a_projected_id_without_materializing_is_a_404()
    {
        await CreateRepeatingActivityAsync();
        var projectedId = (await ListAsync(1)).Single().GetProperty("id").GetGuid();

        var res = await _client.PostAsJsonAsync($"/api/occurrences/{projectedId}/status", new { status = "done" });

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }

    [Fact]
    public async Task Materialize_of_a_day_the_rule_no_longer_has_is_a_409()
    {
        var id = await CreateRepeatingActivityAsync();
        await _client.DeleteAsync($"/api/activities/{id}/recurrence");

        var res = await _client.PostAsJsonAsync("/api/occurrences/materialize",
            new { activityId = id, seriesDate = Today.ToString("yyyy-MM-dd") });

        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
    }

    [Fact]
    public async Task Removing_the_rule_returns_the_activity_without_one_and_ends_projection()
    {
        var id = await CreateRepeatingActivityAsync();

        var res = await _client.DeleteAsync($"/api/activities/{id}/recurrence");

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal(JsonValueKind.Null, (await res.ReadAsync<JsonElement>()).GetProperty("recurrence").ValueKind);
        Assert.Empty(await ListAsync(3));
    }

    [Fact]
    public async Task Another_users_repeat_is_never_projected()
    {
        await CreateRepeatingActivityAsync();
        using var other = _factory.CreateClient();
        other.UseBearer(await other.SetupUserAsync("someone-else"));

        var from = new DateTimeOffset(Today.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var url = $"/api/occurrences?startFrom={Uri.EscapeDataString(from.ToString("o"))}&endBefore={Uri.EscapeDataString(from.AddDays(3).ToString("o"))}";
        var doc = await (await other.GetAsync(url)).ReadAsync<JsonElement>();

        Assert.Empty(doc.EnumerateArray());
    }

    private sealed record IdDto(Guid Id);
}
