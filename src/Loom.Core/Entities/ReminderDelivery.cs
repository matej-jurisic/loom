namespace Loom.Core.Entities;

/// <summary>Records that the reminder firing at <see cref="FireAt"/> went out for an occurrence, so the
/// scheduler sends it once. Moving the occurrence changes the fire time, which is then a new reminder.</summary>
public class ReminderDelivery
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid OccurrenceId { get; set; }
    public DateTimeOffset FireAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
