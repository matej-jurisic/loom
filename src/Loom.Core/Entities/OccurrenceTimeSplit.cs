namespace Loom.Core.Entities;

public class OccurrenceTimeSplit
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid OccurrenceId { get; set; }
    public Guid WorkTypeId { get; set; }
    public int? Minutes { get; set; }
    public int Position { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public Occurrence Occurrence { get; set; } = null!;
    public ActivityWorkType WorkType { get; set; } = null!;
}
