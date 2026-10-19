namespace Loom.Core.Entities;

/// <summary>An FCM registration token for one native app install. A user may have several; a token
/// FCM reports as unregistered is pruned on the next send.</summary>
public class PushDevice
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public required string Token { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public User User { get; set; } = null!;
}
