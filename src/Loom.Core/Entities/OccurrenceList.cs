namespace Loom.Core.Entities;

/// <summary>
/// A saved filter preset of the Occurrences page. Holds no occurrences: the client applies the
/// filters to the full list. Category / tag / goal are stored as the page's filter value (an id or
/// "none"), not as foreign keys, so a deleted target makes the list match nothing instead of
/// silently widening it to "any".
/// </summary>
public class OccurrenceList
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public required string Name { get; set; }
    public string Status { get; set; } = "open";
    public string? Category { get; set; }
    public string? Tag { get; set; }
    public string? Goal { get; set; }
    public string? Search { get; set; }
    public string? GroupBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public User User { get; set; } = null!;
}
