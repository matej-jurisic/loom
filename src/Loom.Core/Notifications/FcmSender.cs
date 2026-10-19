using FirebaseAdmin;
using FirebaseAdmin.Messaging;
using Google.Apis.Auth.OAuth2;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Loom.Core.Notifications;

/// <summary><see cref="IPushSender"/> over the Firebase Admin SDK. The Firebase app is created on the
/// first send; without credentials every send reports <see cref="PushSendResult.Failed"/>.</summary>
public class FcmSender(IOptions<FcmOptions> options, ILogger<FcmSender> logger) : IPushSender
{
    private const string AppName = "loom-fcm";

    private readonly FcmOptions _options = options.Value;
    private readonly Lock _gate = new();
    private FirebaseMessaging? _messaging;
    private bool _initFailed;

    public bool IsConfigured => _options.IsConfigured;

    private FirebaseMessaging? GetMessaging()
    {
        if (_messaging is not null) return _messaging;
        if (_initFailed || !_options.IsConfigured) return null;

        lock (_gate)
        {
            if (_messaging is not null || _initFailed) return _messaging;
            try
            {
                var credential = !string.IsNullOrWhiteSpace(_options.CredentialsJson)
                    ? GoogleCredential.FromJson(_options.CredentialsJson)
                    : GoogleCredential.FromFile(_options.CredentialsPath);
                var app = FirebaseApp.GetInstance(AppName)
                    ?? FirebaseApp.Create(new AppOptions { Credential = credential }, AppName);
                _messaging = FirebaseMessaging.GetMessaging(app);
            }
            catch (Exception ex)
            {
                _initFailed = true;
                logger.LogError(ex, "Failed to initialize Firebase Cloud Messaging; push disabled.");
            }
            return _messaging;
        }
    }

    public async Task<PushSendResult> SendAsync(string token, PushMessage message, CancellationToken ct = default)
    {
        var messaging = GetMessaging();
        if (messaging is null) return PushSendResult.Failed;

        try
        {
            await messaging.SendAsync(new Message
            {
                Token = token,
                Notification = new Notification { Title = message.Title, Body = message.Body },
                Data = new Dictionary<string, string> { ["url"] = message.Url },
                Android = new AndroidConfig { Priority = Priority.High },
            }, ct);
            return PushSendResult.Ok;
        }
        catch (FirebaseMessagingException ex)
            when (ex.MessagingErrorCode is MessagingErrorCode.Unregistered or MessagingErrorCode.SenderIdMismatch)
        {
            return PushSendResult.Gone;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "FCM send failed.");
            return PushSendResult.Failed;
        }
    }
}
