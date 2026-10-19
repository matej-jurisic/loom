namespace Loom.Core.Notifications;

/// <summary>Firebase service-account credential for sending native push, as a file path or inline
/// JSON. Unset leaves push off: the sender stays inert and the reminder scheduler idle.</summary>
public class FcmOptions
{
    public const string SectionName = "Fcm";

    public string CredentialsPath { get; set; } = string.Empty;
    public string CredentialsJson { get; set; } = string.Empty;

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(CredentialsPath) || !string.IsNullOrWhiteSpace(CredentialsJson);
}
