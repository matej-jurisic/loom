namespace Loom.Core.Entities;

public class Tag
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public required string Name { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public User User { get; set; } = null!;
}
