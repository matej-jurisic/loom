using System.Text.Json;
using Loom.Core.Common;

namespace Loom.Tests.Unit;

public class TimeSplitFixtureTests
{
    private static JsonElement LoadFixture()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "fixtures", "time-split-cases.json");
        return JsonDocument.Parse(File.ReadAllText(path)).RootElement;
    }

    [Fact]
    public void Resolve_matches_the_shared_fixture()
    {
        foreach (var c in LoadFixture().GetProperty("resolve").EnumerateArray())
        {
            var minutes = c.GetProperty("minutes").EnumerateArray()
                .Select(e => e.ValueKind == JsonValueKind.Null ? (int?)null : e.GetInt32())
                .ToList();
            var expected = c.GetProperty("expected").EnumerateArray().Select(e => e.GetInt32()).ToArray();

            var actual = TimeSplitMath.Resolve(c.GetProperty("duration").GetInt32(), minutes);

            Assert.True(expected.SequenceEqual(actual), $"{c.GetProperty("name").GetString()}: expected [{string.Join(",", expected)}], got [{string.Join(",", actual)}]");
        }
    }

    [Fact]
    public void DurationMinutes_matches_the_shared_fixture()
    {
        foreach (var c in LoadFixture().GetProperty("duration").EnumerateArray())
        {
            static DateTimeOffset? Read(JsonElement e) =>
                e.ValueKind == JsonValueKind.Null ? null : DateTimeOffset.Parse(e.GetString()!);

            var actual = TimeSplitMath.DurationMinutes(Read(c.GetProperty("startAt")), Read(c.GetProperty("endAt")));

            Assert.True(c.GetProperty("expected").GetInt32() == actual, $"{c.GetProperty("name").GetString()}: got {actual}");
        }
    }
}
