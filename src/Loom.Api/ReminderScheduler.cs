using Loom.Core.Notifications;
using Loom.Core.Services;

namespace Loom.Api;

/// <summary>Sends due occurrence reminders every 30 seconds. Idle when no Firebase credential is set.</summary>
public class ReminderScheduler(IServiceScopeFactory scopes, IPushSender sender, ILogger<ReminderScheduler> logger)
    : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(30);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!sender.IsConfigured)
        {
            logger.LogInformation("Fcm credentials not configured; reminder scheduler is idle.");
            return;
        }

        using var timer = new PeriodicTimer(Interval);
        do
        {
            try
            {
                using var scope = scopes.CreateScope();
                var notifications = scope.ServiceProvider.GetRequiredService<NotificationService>();
                var sent = await notifications.SendDueRemindersAsync(DateTimeOffset.UtcNow, stoppingToken);
                if (sent > 0) logger.LogInformation("Sent {Count} reminder(s).", sent);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Reminder scan failed; retrying next tick.");
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
