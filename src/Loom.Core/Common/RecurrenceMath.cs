using System.Security.Cryptography;
using System.Text;
using Loom.Core.Entities;
using Loom.Core.Enums;

namespace Loom.Core.Common;

public sealed record RecurrenceInstance(
    DateTimeOffset StartAt, DateTimeOffset? EndAt, bool IsAllDay, int? DurationMinutes);

public static class RecurrenceMath
{
    public const int MaxProjectionDays = 62;

    public static int IsoDay(DateOnly date) => ((int)date.DayOfWeek + 6) % 7 + 1;

    public static int MaskOf(IEnumerable<int> isoDays) => isoDays.Aggregate(0, (m, d) => m | 1 << (d - 1));

    public static List<int> DaysOf(int mask) =>
        Enumerable.Range(1, 7).Where(d => (mask & 1 << (d - 1)) != 0).ToList();

    private static DateOnly MondayOf(DateOnly date) => date.AddDays(1 - IsoDay(date));

    public static bool Occurs(ActivityRecurrence r, DateOnly date)
    {
        if (date < r.StartDate) return false;
        if (r.EndDate is { } end && date > end) return false;

        var start = r.StartDate;
        switch (r.Frequency)
        {
            case RecurrenceFrequency.daily:
                return (date.DayNumber - start.DayNumber) % r.Interval == 0;

            case RecurrenceFrequency.weekly:
                var mask = r.WeekdayMask == 0 ? MaskOf([IsoDay(start)]) : r.WeekdayMask;
                if ((mask & MaskOf([IsoDay(date)])) == 0) return false;
                return (MondayOf(date).DayNumber - MondayOf(start).DayNumber) / 7 % r.Interval == 0;

            case RecurrenceFrequency.monthly:
                var months = (date.Year - start.Year) * 12 + date.Month - start.Month;
                if (months % r.Interval != 0) return false;
                return date.Day == Math.Min(start.Day, DateTime.DaysInMonth(date.Year, date.Month));

            default:
                return false;
        }
    }

    public static IEnumerable<DateOnly> DatesBetween(ActivityRecurrence r, DateOnly from, DateOnly to)
    {
        if (from < r.StartDate) from = r.StartDate;
        if (r.EndDate is { } end && to > end) to = end;
        if (to.DayNumber - from.DayNumber >= MaxProjectionDays) to = from.AddDays(MaxProjectionDays - 1);

        for (var d = from; d <= to; d = d.AddDays(1))
            if (Occurs(r, d)) yield return d;
    }

    public static RecurrenceInstance InstanceOn(ActivityRecurrence r, DateOnly date, TimeZoneInfo tz)
    {
        if (r.TimeOfDay is not { } time)
            return new RecurrenceInstance(DayMath.AtLocal(date, TimeOnly.MinValue, tz), null, true, r.DurationMinutes);

        var start = DayMath.AtLocal(date, time, tz);
        return new RecurrenceInstance(start, r.DurationMinutes is { } d ? start.AddMinutes(d) : null, false, null);
    }

    public static Guid OccurrenceId(Guid activityId, DateOnly date) =>
        Derive($"occurrence:{activityId:N}:{date:yyyyMMdd}");

    public static Guid SubtaskId(Guid activitySubtaskId, DateOnly date) =>
        Derive($"subtask:{activitySubtaskId:N}:{date:yyyyMMdd}");

    private static Guid Derive(string key) => new(MD5.HashData(Encoding.UTF8.GetBytes(key)));
}
