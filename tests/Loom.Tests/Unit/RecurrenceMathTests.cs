using Loom.Core.Common;
using Loom.Core.Entities;
using Loom.Core.Enums;
using Xunit;

namespace Loom.Tests.Unit;

public class RecurrenceMathTests
{
    private static readonly TimeZoneInfo Zagreb = TimeZoneInfo.FindSystemTimeZoneById("Europe/Zagreb");

    private static ActivityRecurrence Rule(
        RecurrenceFrequency freq, string start, int interval = 1, int mask = 0, string? end = null,
        string? time = null, int? duration = null) => new()
    {
        Frequency = freq,
        Interval = interval,
        WeekdayMask = mask,
        StartDate = DateOnly.Parse(start),
        EndDate = end is null ? null : DateOnly.Parse(end),
        TimeOfDay = time is null ? null : TimeOnly.Parse(time),
        DurationMinutes = duration,
    };

    private static List<string> Dates(ActivityRecurrence r, string from, string to) =>
        RecurrenceMath.DatesBetween(r, DateOnly.Parse(from), DateOnly.Parse(to))
            .Select(d => d.ToString("yyyy-MM-dd")).ToList();

    private static List<string> Landings(ActivityRecurrence r, string from, string to)
    {
        var result = new List<string>();
        for (var d = DateOnly.Parse(from); d <= DateOnly.Parse(to); d = d.AddDays(1))
            if (RecurrenceMath.Occurs(r, d)) result.Add(d.ToString("yyyy-MM-dd"));
        return result;
    }

    [Fact]
    public void Daily_interval_two_lands_on_every_other_day_from_the_start()
    {
        var r = Rule(RecurrenceFrequency.daily, "2026-06-01", interval: 2);
        Assert.Equal(["2026-06-01", "2026-06-03", "2026-06-05"], Dates(r, "2026-05-25", "2026-06-06"));
    }

    [Fact]
    public void Nothing_occurs_before_the_start_or_after_the_end()
    {
        var r = Rule(RecurrenceFrequency.daily, "2026-06-03", end: "2026-06-05");
        Assert.Equal(["2026-06-03", "2026-06-04", "2026-06-05"], Dates(r, "2026-06-01", "2026-06-30"));
    }

    [Fact]
    public void Weekly_without_weekdays_uses_the_weekday_of_the_start_date()
    {
        var r = Rule(RecurrenceFrequency.weekly, "2026-06-03");
        Assert.Equal(["2026-06-03", "2026-06-10", "2026-06-17"], Dates(r, "2026-06-01", "2026-06-20"));
    }

    [Fact]
    public void Weekly_with_weekdays_and_interval_skips_whole_weeks()
    {
        var r = Rule(RecurrenceFrequency.weekly, "2026-06-01", interval: 2, mask: RecurrenceMath.MaskOf([1, 4]));
        Assert.Equal(["2026-06-01", "2026-06-04", "2026-06-15", "2026-06-18"], Dates(r, "2026-06-01", "2026-06-21"));
    }

    [Fact]
    public void Weekly_does_not_land_on_a_masked_day_earlier_in_the_start_week()
    {
        var r = Rule(RecurrenceFrequency.weekly, "2026-06-04", mask: RecurrenceMath.MaskOf([1, 4]));
        Assert.Equal(["2026-06-04", "2026-06-08", "2026-06-11"], Dates(r, "2026-06-01", "2026-06-12"));
    }

    [Fact]
    public void Sunday_belongs_to_the_week_that_started_the_Monday_before()
    {
        var r = Rule(RecurrenceFrequency.weekly, "2026-06-01", interval: 2, mask: RecurrenceMath.MaskOf([7]));
        Assert.Equal(["2026-06-07", "2026-06-21"], Dates(r, "2026-06-01", "2026-06-28"));
    }

    [Fact]
    public void Monthly_on_the_31st_falls_back_to_the_last_day_of_shorter_months()
    {
        var r = Rule(RecurrenceFrequency.monthly, "2027-01-31");
        Assert.Equal(["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30"], Landings(r, "2027-01-01", "2027-04-30"));
    }

    [Fact]
    public void Monthly_on_the_31st_uses_the_29th_in_a_leap_february()
    {
        var r = Rule(RecurrenceFrequency.monthly, "2028-01-31");
        Assert.Contains("2028-02-29", Dates(r, "2028-02-01", "2028-02-29"));
    }

    [Fact]
    public void Monthly_interval_counts_months_across_a_year_boundary()
    {
        var r = Rule(RecurrenceFrequency.monthly, "2026-11-15", interval: 3);
        Assert.Equal(["2026-11-15", "2027-02-15", "2027-05-15"], Landings(r, "2026-11-01", "2027-05-31"));
    }

    [Fact]
    public void DatesBetween_never_expands_more_than_the_cap()
    {
        var r = Rule(RecurrenceFrequency.daily, "2026-01-01");
        Assert.Equal(RecurrenceMath.MaxProjectionDays, Dates(r, "2026-01-01", "2030-01-01").Count);
    }

    [Fact]
    public void Timed_instance_is_a_block_of_real_elapsed_time()
    {
        var r = Rule(RecurrenceFrequency.daily, "2026-06-01", time: "09:30", duration: 45);
        var i = RecurrenceMath.InstanceOn(r, new DateOnly(2026, 6, 1), TimeZoneInfo.Utc);
        Assert.False(i.IsAllDay);
        Assert.Equal(DateTimeOffset.Parse("2026-06-01T09:30:00Z"), i.StartAt);
        Assert.Equal(DateTimeOffset.Parse("2026-06-01T10:15:00Z"), i.EndAt);
        Assert.Null(i.DurationMinutes);
    }

    [Fact]
    public void Timed_instance_without_a_duration_is_a_point_in_time()
    {
        var r = Rule(RecurrenceFrequency.daily, "2026-06-01", time: "09:30");
        var i = RecurrenceMath.InstanceOn(r, new DateOnly(2026, 6, 1), TimeZoneInfo.Utc);
        Assert.Null(i.EndAt);
    }

    [Fact]
    public void AllDay_instance_starts_at_local_midnight_and_keeps_its_duration_as_a_duration()
    {
        var r = Rule(RecurrenceFrequency.daily, "2026-06-01", duration: 20);
        var i = RecurrenceMath.InstanceOn(r, new DateOnly(2026, 6, 1), Zagreb);
        Assert.True(i.IsAllDay);
        Assert.Equal(DateTimeOffset.Parse("2026-06-01T00:00:00+02:00"), i.StartAt);
        Assert.Null(i.EndAt);
        Assert.Equal(20, i.DurationMinutes);
    }

    [Fact]
    public void Same_wall_clock_time_keeps_its_hour_across_the_spring_forward()
    {
        var r = Rule(RecurrenceFrequency.daily, "2026-03-27", time: "09:00");
        var before = RecurrenceMath.InstanceOn(r, new DateOnly(2026, 3, 28), Zagreb);
        var after = RecurrenceMath.InstanceOn(r, new DateOnly(2026, 3, 29), Zagreb);
        Assert.Equal(DateTimeOffset.Parse("2026-03-28T09:00:00+01:00"), before.StartAt);
        Assert.Equal(DateTimeOffset.Parse("2026-03-29T09:00:00+02:00"), after.StartAt);
    }

    [Fact]
    public void A_wall_clock_time_inside_the_spring_forward_gap_lands_at_the_end_of_the_gap()
    {
        var r = Rule(RecurrenceFrequency.daily, "2026-03-29", time: "02:30");
        var i = RecurrenceMath.InstanceOn(r, new DateOnly(2026, 3, 29), Zagreb);
        Assert.Equal(DateTimeOffset.Parse("2026-03-29T03:00:00+02:00"), i.StartAt);
    }

    [Fact]
    public void Ids_are_stable_per_activity_and_day_and_differ_between_them()
    {
        var activity = Guid.NewGuid();
        var day = new DateOnly(2026, 6, 1);
        Assert.Equal(RecurrenceMath.OccurrenceId(activity, day), RecurrenceMath.OccurrenceId(activity, day));
        Assert.NotEqual(RecurrenceMath.OccurrenceId(activity, day), RecurrenceMath.OccurrenceId(activity, day.AddDays(1)));
        Assert.NotEqual(RecurrenceMath.OccurrenceId(activity, day), RecurrenceMath.OccurrenceId(Guid.NewGuid(), day));
        Assert.NotEqual(RecurrenceMath.OccurrenceId(activity, day), RecurrenceMath.SubtaskId(activity, day));
    }

    [Fact]
    public void MaskOf_and_DaysOf_round_trip()
    {
        Assert.Equal([1, 4, 7], RecurrenceMath.DaysOf(RecurrenceMath.MaskOf([7, 1, 4])));
        Assert.Empty(RecurrenceMath.DaysOf(0));
    }
}
