using Loom.Core.Enums;

namespace Loom.Core.Entities;

public class ActivityRecurrence
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ActivityId { get; set; }
    public RecurrenceFrequency Frequency { get; set; } = RecurrenceFrequency.daily;
    public int Interval { get; set; } = 1;
    public int WeekdayMask { get; set; }
    public DateOnly StartDate { get; set; }
    public DateOnly? EndDate { get; set; }
    public TimeOnly? TimeOfDay { get; set; }
    public int? DurationMinutes { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public Activity Activity { get; set; } = null!;
}
