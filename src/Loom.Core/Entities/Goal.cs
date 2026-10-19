using Loom.Core.Enums;

namespace Loom.Core.Entities;

public class Goal
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public required string Title { get; set; }
    public string? Description { get; set; }
    public GoalStatus Status { get; set; } = GoalStatus.active;
    /// <summary>
    /// A <c>track</c> is an ongoing area (a college course) rather than an outcome: it is only ever
    /// active or closed, is never stale, and stays out of the Plan page's "Goal activity" strip.
    /// </summary>
    public GoalKind Kind { get; set; } = GoalKind.goal;
    /// <summary>
    /// Optional last day, in the user's day. Display only: passing it never closes the goal, the
    /// user does that.
    /// </summary>
    public DateOnly? EndDate { get; set; }
    /// <summary>A 6-digit hex colour; also the calendar colour when the user colours by goal.</summary>
    public string? Color { get; set; }
    /// <summary>A lucide icon name from the client's category icon set.</summary>
    public string? Icon { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public string? Notes { get; set; }

    public List<Checkpoint> Checkpoints { get; set; } = [];
}
