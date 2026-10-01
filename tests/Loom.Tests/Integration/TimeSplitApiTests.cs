using System.Net;
using System.Net.Http.Json;

namespace Loom.Tests.Integration;

public class TimeSplitApiTests : IDisposable
{
    private readonly LoomApiFactory _factory = new();
    private readonly HttpClient _client;

    public TimeSplitApiTests()
    {
        _client = _factory.CreateClient();
    }

    public void Dispose() => _factory.Dispose();

    private async Task<(Guid ActivityId, Guid OccurrenceId)> CreateSessionAsync()
    {
        var token = await _client.SetupUserAsync();
        _client.UseBearer(token);

        var activityRes = await _client.PostAsJsonAsync("/api/activities", new { title = "Project work" });
        var activity = await activityRes.ReadAsync<ActivityDto>();

        var start = DateTimeOffset.UtcNow.AddHours(-4);
        var occurrenceRes = await _client.PostAsJsonAsync("/api/occurrences",
            new { activityId = activity.Id, startAt = start, endAt = start.AddHours(3) });
        var occurrence = await occurrenceRes.ReadAsync<OccurrenceDto>();
        return (activity.Id, occurrence.Id);
    }

    private async Task<WorkTypeDto> CreateWorkTypeAsync(Guid activityId, string title)
    {
        var res = await _client.PostAsJsonAsync($"/api/activities/{activityId}/work-types", new { title });
        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        return await res.ReadAsync<WorkTypeDto>();
    }

    [Fact]
    public async Task SetTimeSplit_ReturnsResolvedRows()
    {
        var (activityId, occurrenceId) = await CreateSessionAsync();
        var coding = await CreateWorkTypeAsync(activityId, "Coding");
        var meeting = await CreateWorkTypeAsync(activityId, "Meeting");

        var res = await _client.PutAsJsonAsync($"/api/occurrences/{occurrenceId}/time-split", new
        {
            rows = new object[]
            {
                new { workTypeId = coding.Id, minutes = 120 },
                new { workTypeId = meeting.Id },
            },
        });

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var occurrence = await res.ReadAsync<OccurrenceDto>();
        Assert.Equal([120, 60], occurrence.TimeSplit.Select(t => t.Minutes));
        Assert.Equal([true, false], occurrence.TimeSplit.Select(t => t.IsPinned));
        Assert.Equal(2, occurrence.Activity.WorkTypes.Count);
    }

    [Fact]
    public async Task SetTimeSplit_OverTheDuration_Returns400()
    {
        var (activityId, occurrenceId) = await CreateSessionAsync();
        var coding = await CreateWorkTypeAsync(activityId, "Coding");

        var res = await _client.PutAsJsonAsync($"/api/occurrences/{occurrenceId}/time-split", new
        {
            rows = new[] { new { workTypeId = coding.Id, minutes = 181 } },
        });

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task WorkType_RenameAndDelete()
    {
        var (activityId, _) = await CreateSessionAsync();
        var coding = await CreateWorkTypeAsync(activityId, "Coding");

        var rename = await _client.PutAsJsonAsync($"/api/activities/{activityId}/work-types/{coding.Id}", new { title = "Implementation" });
        Assert.Equal("Implementation", (await rename.ReadAsync<WorkTypeDto>()).Title);

        var delete = await _client.DeleteAsync($"/api/activities/{activityId}/work-types/{coding.Id}");
        Assert.Equal(HttpStatusCode.NoContent, delete.StatusCode);

        var activity = await (await _client.GetAsync($"/api/activities/{activityId}")).ReadAsync<ActivityDto>();
        Assert.Empty(activity.WorkTypes);
    }

    private sealed record WorkTypeDto(Guid Id, string Title);
    private sealed record ActivityDto(Guid Id, List<WorkTypeDto> WorkTypes);
    private sealed record TimeSplitDto(Guid WorkTypeId, string Title, int Minutes, bool IsPinned);
    private sealed record OccurrenceDto(Guid Id, List<TimeSplitDto> TimeSplit, ActivityDto Activity);
}
