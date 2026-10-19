namespace Loom.Core.Notifications;

/// <summary>Sends one notification to one device token. Abstracted so the reminder logic is testable
/// without Firebase.</summary>
public interface IPushSender
{
    bool IsConfigured { get; }
    Task<PushSendResult> SendAsync(string token, PushMessage message, CancellationToken ct = default);
}

/// <summary><see cref="Url"/> is the in-app route a tap opens.</summary>
public sealed record PushMessage(string Title, string Body, string Url);

/// <summary><see cref="Gone"/> means the token is dead and the caller should prune it.</summary>
public enum PushSendResult
{
    Ok,
    Gone,
    Failed,
}
