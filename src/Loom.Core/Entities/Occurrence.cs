using Loom.Core.Enums;

namespace Loom.Core.Entities;

public class Occurrence
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public Guid ActivityId { get; set; }
    public string? Title { get; set; }
    public string? Notes { get; set; }
    public DateTimeOffset? StartAt { get; set; }
    public DateTimeOffset? EndAt { get; set; }
    public EventStatus Status { get; set; } = EventStatus.pending;
    public bool IsAllDay { get; set; } = false;
    public bool IsPlanned { get; set; } = false;
    // A todo with no date: floating in shape (no start, no end, not all-day, not planned) but kept
    // off the calendar and the Daily Plan. OccurrenceService.ValidateNoDate owns the invariant.
    public bool IsNoDate { get; set; } = false;
    public DateTimeOffset? WindowStart { get; set; }
    public DateTimeOffset? WindowEnd { get; set; }
    public int? WindowDurationMinutes { get; set; }
    public Guid? DeadlineOccurrenceId { get; set; }
    // Null inherits Activity.Reminders; a list, even an empty one, replaces them for this occurrence.
    public List<int>? Reminders { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public Activity Activity { get; set; } = null!;
    public Occurrence? DeadlineOccurrence { get; set; }
    public List<OccurrenceSubtask> Subtasks { get; set; } = [];
    public List<OccurrenceTimeSplit> TimeSplits { get; set; } = [];
    public List<Tag> Tags { get; set; } = [];
}
