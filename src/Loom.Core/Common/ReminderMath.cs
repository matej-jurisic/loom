using Loom.Core.Entities;
using Loom.Core.Enums;

namespace Loom.Core.Common;

/// <summary>
/// When an occurrence's reminders fire. A reminder is a number of minutes before the occurrence's
/// anchor: its start for a timed occurrence, its end for a deadline-only one, and
/// <see cref="AllDayAnchorTime"/> on the date for an all-day one. Floating and no-date occurrences
/// have no anchor, so they never fire, and neither does a planned one unless it is a timed Due pin
/// (exactly one of start and end): there the flag marks a date not yet confirmed, not a loose window.
/// </summary>
public static class ReminderMath
{
    public const int MaxReminders = 5;
    public const int MaxOffsetMinutes = 30 * 24 * 60;
    public static readonly TimeOnly AllDayAnchorTime = new(9, 0);

    /// <summary>Distinct and nearest-first, the order every reminder list is stored and sent in.</summary>
    public static List<int> Normalize(IEnumerable<int> minutes) => minutes.Distinct().Order().ToList();

    public static List<int>? NormalizeOrNull(List<int>? minutes) => minutes is null ? null : Normalize(minutes);

    public static List<int> Effective(Occurrence o) => o.Reminders ?? o.Activity.Reminders;

    public static DateTimeOffset? Anchor(Occurrence o, DayContext ctx)
    {
        if (o.IsNoDate) return null;
        if (o.IsPlanned && (o.IsAllDay || (o.StartAt is null) == (o.EndAt is null))) return null;
        if (o.IsAllDay)
            return (o.StartAt ?? o.EndAt) is { } day
                ? DayMath.AtLocalTime(DayMath.LocalDate(day, ctx), AllDayAnchorTime, ctx)
                : null;
        return o.StartAt ?? o.EndAt;
    }

    /// <summary>Every fire time of a pending occurrence, in UTC. Empty when nothing should fire.</summary>
    public static List<DateTimeOffset> FireTimes(Occurrence o, DayContext ctx)
    {
        if (o.Status != EventStatus.pending || Anchor(o, ctx) is not { } anchor) return [];
        return Effective(o).Select(m => anchor.AddMinutes(-m).ToUniversalTime()).ToList();
    }
}
