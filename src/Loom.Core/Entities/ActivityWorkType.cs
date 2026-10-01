namespace Loom.Core.Entities;

public class ActivityWorkType
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ActivityId { get; set; }
    public required string Title { get; set; }
    public bool IsArchived { get; set; } = false;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public Activity Activity { get; set; } = null!;
}
