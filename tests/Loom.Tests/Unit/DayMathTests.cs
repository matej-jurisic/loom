using Loom.Core.Common;
using Loom.Core.Entities;
using Loom.Core.Enums;
using Xunit;

namespace Loom.Tests.Unit;

public class DayMathTests
{
    private static readonly TimeZoneInfo Zagreb = TimeZoneInfo.FindSystemTimeZoneById("Europe/Zagreb");
    private static readonly TimeZoneInfo NewYork = TimeZoneInfo.FindSystemTimeZoneById("America/New_York");

    private static DayContext Ctx(TimeZoneInfo tz, string boundary = "00:00") =>
        new(tz, TimeOnly.Parse(boundary));

    private static DateTimeOffset At(string iso) => DateTimeOffset.Parse(iso);

    // ---- ResolveTimeZone ----

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("Not/AZone")]
    public void ResolveTimeZone_MissingOrUnknown_FallsBackToUtc(string? id) =>
        Assert.Equal(TimeZoneInfo.Utc, DayMath.ResolveTimeZone(id));

    [Fact]
    public void ResolveTimeZone_KnownId_ReturnsThatZone() =>
        Assert.Equal("Europe/Zagreb", DayMath.ResolveTimeZone("Europe/Zagreb").Id);

    // ---- DayOf ----

    [Fact]
    public void DayOf_BeforeBoundary_BelongsToPreviousDay()
    {
        var ctx = Ctx(TimeZoneInfo.Utc, "04:00");
        Assert.Equal(new DateOnly(2026, 6, 1), DayMath.DayOf(At("2026-06-02T03:59:00Z"), ctx));
    }

    [Fact]
    public void DayOf_ExactlyOnBoundary_BelongsToNewDay()
    {
        var ctx = Ctx(TimeZoneInfo.Utc, "04:00");
        Assert.Equal(new DateOnly(2026, 6, 2), DayMath.DayOf(At("2026-06-02T04:00:00Z"), ctx));
    }

    [Fact]
    public void DayOf_UsesUserTimezoneNotUtc()
    {
        // 23:30Z is 01:30 the next day in Zagreb (CEST, +02:00).
        var instant = At("2026-06-01T23:30:00Z");
        Assert.Equal(new DateOnly(2026, 6, 2), DayMath.DayOf(instant, Ctx(Zagreb)));
        Assert.Equal(new DateOnly(2026, 6, 1), DayMath.DayOf(instant, Ctx(Zagreb, "04:00")));
    }

    [Fact]
    public void DayOf_WestOfUtc_LagsBehindUtcDate()
    {
        // 02:00Z on 2 Jun is 22:00 on 1 Jun in New York (EDT, -04:00).
        Assert.Equal(new DateOnly(2026, 6, 1), DayMath.DayOf(At("2026-06-02T02:00:00Z"), Ctx(NewYork)));
    }

    // ---- Start/End of day across DST ----

    [Fact]
    public void SpringForward_DayIsTwentyThreeHours()
    {
        var ctx = Ctx(Zagreb);
        var day = new DateOnly(2026, 3, 29);

        Assert.Equal(TimeSpan.FromHours(23), DayMath.EndOfDay(day, ctx) - DayMath.StartOfDay(day, ctx));
    }

    [Fact]
    public void FallBack_DayIsTwentyFiveHours()
    {
        var ctx = Ctx(Zagreb);
        var day = new DateOnly(2026, 10, 25);

        Assert.Equal(TimeSpan.FromHours(25), DayMath.EndOfDay(day, ctx) - DayMath.StartOfDay(day, ctx));
    }

    [Fact]
    public void NewYorkSpringForward_DayIsTwentyThreeHours()
    {
        var ctx = Ctx(NewYork);
        var day = new DateOnly(2026, 3, 8);

        Assert.Equal(TimeSpan.FromHours(23), DayMath.EndOfDay(day, ctx) - DayMath.StartOfDay(day, ctx));
    }

    [Theory]
    [InlineData("00:00")]
    [InlineData("04:00")]
    [InlineData("02:30")] // inside the spring-forward gap and the fall-back overlap
    public void Days_TileTimeAcrossDstWithoutGapsOrOverlaps(string boundary)
    {
        foreach (var tz in new[] { Zagreb, NewYork })
        {
            var ctx = Ctx(tz, boundary);
            // Two weeks either side of every 2026 transition in both zones.
            foreach (var anchor in new[] { new DateOnly(2026, 3, 8), new DateOnly(2026, 3, 29), new DateOnly(2026, 10, 25), new DateOnly(2026, 11, 1) })
            {
                for (var offset = -3; offset <= 3; offset++)
                {
                    var day = anchor.AddDays(offset);
                    var start = DayMath.StartOfDay(day, ctx);
                    var end = DayMath.EndOfDay(day, ctx);

                    Assert.Equal(start, DayMath.EndOfDay(day.AddDays(-1), ctx));
                    Assert.True(end > start, $"{tz.Id} {day}: day has no length");
                    Assert.Equal(day, DayMath.DayOf(start, ctx));
                    Assert.Equal(day, DayMath.DayOf(end.AddTicks(-1), ctx));
                    Assert.Equal(day.AddDays(1), DayMath.DayOf(end, ctx));
                }
            }
        }
    }

    // ---- OccurrenceDay ----

    [Fact]
    public void OccurrenceDay_Floating_HasNoDay() =>
        Assert.Null(DayMath.OccurrenceDay(new Occurrence(), Ctx(Zagreb)));

    [Fact]
    public void OccurrenceDay_IsTheStartDay_NotTheEndDay()
    {
        var o = new Occurrence { StartAt = At("2026-06-01T22:00:00+02:00"), EndAt = At("2026-06-02T01:00:00+02:00") };
        Assert.Equal(new DateOnly(2026, 6, 1), DayMath.OccurrenceDay(o, Ctx(Zagreb)));
    }

    // ---- IsOverdue ----

    private static Occurrence Pending(string? start, string? end = null, bool allDay = false, bool planned = false) => new()
    {
        Status = EventStatus.pending,
        StartAt = start is null ? null : At(start),
        EndAt = end is null ? null : At(end),
        IsAllDay = allDay,
        IsPlanned = planned,
    };

    [Fact]
    public void IsOverdue_TimedWithoutEnd_StaysOpenUntilItsDayEnds()
    {
        var ctx = Ctx(Zagreb);
        var o = Pending("2026-06-01T09:00:00+02:00");

        Assert.False(DayMath.IsOverdue(o, ctx, At("2026-06-01T23:59:00+02:00")));
        Assert.True(DayMath.IsOverdue(o, ctx, At("2026-06-02T00:00:00+02:00")));
    }

    [Fact]
    public void IsOverdue_DayBoundaryPushesTheDeadlineLater()
    {
        var ctx = Ctx(Zagreb, "04:00");
        var o = Pending("2026-06-01T22:00:00+02:00");

        // 01:00 on 2 Jun still belongs to 1 Jun's day.
        Assert.False(DayMath.IsOverdue(o, ctx, At("2026-06-02T01:00:00+02:00")));
        Assert.True(DayMath.IsOverdue(o, ctx, At("2026-06-02T04:00:00+02:00")));
    }

    [Fact]
    public void IsOverdue_WithEnd_UsesTheEndInstant()
    {
        var ctx = Ctx(Zagreb);
        var o = Pending("2026-06-01T09:00:00+02:00", "2026-06-01T10:00:00+02:00");

        Assert.False(DayMath.IsOverdue(o, ctx, At("2026-06-01T09:59:00+02:00")));
        Assert.True(DayMath.IsOverdue(o, ctx, At("2026-06-01T10:01:00+02:00")));
    }

    [Fact]
    public void IsOverdue_AllDay_OverdueOnceTheDateHasPassed()
    {
        var ctx = Ctx(Zagreb);
        var o = Pending("2026-06-01T00:00:00+02:00", allDay: true);

        Assert.False(DayMath.IsOverdue(o, ctx, At("2026-06-01T23:00:00+02:00")));
        Assert.True(DayMath.IsOverdue(o, ctx, At("2026-06-02T00:30:00+02:00")));
    }

    [Fact]
    public void IsOverdue_AllDay_RespectsTheDayBoundaryForToday()
    {
        var ctx = Ctx(Zagreb, "04:00");
        var o = Pending("2026-06-01T00:00:00+02:00", allDay: true);

        // 02:00 on 2 Jun is still "1 Jun" for this user.
        Assert.False(DayMath.IsOverdue(o, ctx, At("2026-06-02T02:00:00+02:00")));
        Assert.True(DayMath.IsOverdue(o, ctx, At("2026-06-02T05:00:00+02:00")));
    }

    [Fact]
    public void IsOverdue_PlannedFloatingAndFinishedNeverOverdue()
    {
        var ctx = Ctx(Zagreb);
        var later = At("2030-01-01T00:00:00Z");

        Assert.False(DayMath.IsOverdue(Pending("2026-06-01T09:00:00+02:00", planned: true), ctx, later));
        Assert.False(DayMath.IsOverdue(Pending(null), ctx, later));

        var done = Pending("2026-06-01T09:00:00+02:00");
        done.Status = EventStatus.done;
        Assert.False(DayMath.IsOverdue(done, ctx, later));

        var skipped = Pending("2026-06-01T09:00:00+02:00");
        skipped.Status = EventStatus.skipped;
        Assert.False(DayMath.IsOverdue(skipped, ctx, later));
    }

    [Fact]
    public void IsOverdue_OnSpringForwardDay_DeadlineIsTheShortenedDaysEnd()
    {
        var ctx = Ctx(Zagreb);
        var o = Pending("2026-03-29T09:00:00+02:00");

        // The day ends at 00:00 CEST on the 30th, which is 22:00Z on the 29th.
        Assert.False(DayMath.IsOverdue(o, ctx, At("2026-03-29T21:59:00Z")));
        Assert.True(DayMath.IsOverdue(o, ctx, At("2026-03-29T22:00:00Z")));
    }
}
