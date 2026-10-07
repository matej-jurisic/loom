using Loom.Core.Enums;

namespace Loom.Core.Entities;

public class Activity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public required string Title { get; set; }
    public Guid? CategoryId { get; set; }
    public ActivityKind Kind { get; set; } = ActivityKind.activity;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public User User { get; set; } = null!;
    public Category? Category { get; set; }
    public List<Goal> Goals { get; set; } = [];
    public List<ActivitySubtask> Subtasks { get; set; } = [];
    public List<ActivityWorkType> WorkTypes { get; set; } = [];
}
