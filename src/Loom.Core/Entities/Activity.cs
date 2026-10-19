using Loom.Core.Enums;

namespace Loom.Core.Entities;

public class Activity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public required string Title { get; set; }
    public Guid? CategoryId { get; set; }
    public ActivityKind Kind { get; set; } = ActivityKind.activity;
    public int? RepeatAfterDays { get; set; }
    public bool ShowAsOverdue { get; set; } = true;
    // Minutes before an occurrence's anchor at which to push a reminder; occurrences inherit it.
    public List<int> Reminders { get; set; } = [];
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public User User { get; set; } = null!;
    public Category? Category { get; set; }
    public List<Goal> Goals { get; set; } = [];
    public List<Tag> Tags { get; set; } = [];
    public List<ActivitySubtask> Subtasks { get; set; } = [];
    public List<ActivityWorkType> WorkTypes { get; set; } = [];
}
