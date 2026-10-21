using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Loom.Core.Common;
using Loom.Core.Data;
using Loom.Core.Entities;
using Loom.Core.Enums;
using Loom.Core.Notifications;

namespace Loom.Core.Services;

public class NotificationService(LoomDbContext db, UserSettingsService settings, IPushSender sender)
{
    /// <summary>How late a reminder may still go out: covers a missed scheduler tick or a short
    /// restart, without a burst of stale reminders after a long outage.</summary>
    public static readonly TimeSpan Grace = TimeSpan.FromMinutes(10);

    public static readonly TimeSpan DigestWindow = TimeSpan.FromHours(1);

    /// <summary>Delivery records older than this can no longer matter (their fire time is past the grace).</summary>
    private static readonly TimeSpan DeliveryRetention = TimeSpan.FromDays(2);

    public async Task<Result> RegisterDeviceAsync(Guid userId, string token)
    {
        if (string.IsNullOrWhiteSpace(token) || token.Length > 4096)
            return Result.Fail(new Error(ErrorType.Validation, "A device token is required."));

        var existing = await db.PushDevices.FirstOrDefaultAsync(d => d.Token == token);
        // A token belongs to an install, not an account: signing in as someone else moves it.
        if (existing is null) db.PushDevices.Add(new PushDevice { UserId = userId, Token = token });
        else existing.UserId = userId;
        await db.SaveChangesAsync();
        return Result.Success();
    }

    public async Task<Result> UnregisterDeviceAsync(Guid userId, string token)
    {
        await db.PushDevices.Where(d => d.Token == token && d.UserId == userId).ExecuteDeleteAsync();
        return Result.Success();
    }

    /// <summary>Sends a test notification to every device of the user. Returns how many accepted it.</summary>
    public async Task<Result<int>> SendTestAsync(Guid userId, CancellationToken ct = default)
    {
        if (!sender.IsConfigured)
            return Result<int>.Fail(new Error(ErrorType.Validation, "Push notifications are not configured on the server."));

        var devices = await db.PushDevices.Where(d => d.UserId == userId).ToListAsync(ct);
        if (devices.Count == 0)
            return Result<int>.Fail(new Error(ErrorType.Validation, "No device is registered for notifications."));

        var sent = await SendToDevicesAsync(devices, new PushMessage("Loom", "Notifications are working.", "/plan"), ct);
        await db.SaveChangesAsync(ct);
        return Result<int>.Success(sent);
    }

    /// <summary>
    /// Sends every reminder whose fire time has come, at most once each. A reminder fires when its time
    /// is within <see cref="Grace"/> of now and not before the occurrence existed, so adding something
    /// that starts in five minutes does not set off its "30 minutes before". Returns how many
    /// notifications went out (one per occurrence, however many of its reminders came due together).
    /// </summary>
    public async Task<int> SendDueRemindersAsync(DateTimeOffset nowUtc, CancellationToken ct = default)
    {
        await PruneDeliveriesAsync(nowUtc, ct);

        var devicesByUser = (await db.PushDevices.ToListAsync(ct)).GroupBy(d => d.UserId);
        var notified = 0;

        foreach (var devices in devicesByUser)
        {
            var userId = devices.Key;
            var ctx = await settings.GetDayContextAsync(userId);
            // SQLite can't compare DateTimeOffset, so the time window is applied in memory.
            var candidates = await db.Occurrences
                .AsNoTracking()
                .Include(o => o.Activity)
                .Where(o => o.UserId == userId && o.Status == EventStatus.pending && !o.IsPlanned && !o.IsNoDate
                    && (o.StartAt != null || o.EndAt != null))
                .ToListAsync(ct);

            var due = candidates
                .Select(o => (Occurrence: o, Times: ReminderMath.FireTimes(o, ctx)
                    .Where(t => t <= nowUtc && t > nowUtc - Grace && t >= o.CreatedAt)
                    .ToList()))
                .Where(x => x.Times.Count > 0)
                .ToList();
            if (due.Count == 0) continue;

            var ids = due.Select(x => x.Occurrence.Id).ToList();
            var delivered = (await db.ReminderDeliveries.Where(d => ids.Contains(d.OccurrenceId)).ToListAsync(ct))
                .Select(d => (d.OccurrenceId, d.FireAt.UtcTicks))
                .ToHashSet();

            foreach (var (o, times) in due)
            {
                var fresh = times.Where(t => !delivered.Contains((o.Id, t.UtcTicks))).ToList();
                if (fresh.Count == 0) continue;

                foreach (var t in fresh)
                    db.ReminderDeliveries.Add(new ReminderDelivery { OccurrenceId = o.Id, FireAt = t });

                var message = new PushMessage(o.Title ?? o.Activity.Title, Describe(o, ctx, nowUtc), $"/plan?occurrence={o.Id}");
                await SendToDevicesAsync(devices.ToList(), message, ct);
                notified++;
            }
        }

        await db.SaveChangesAsync(ct);
        return notified;
    }

    public async Task<int> SendDailyDigestsAsync(DateTimeOffset nowUtc, CancellationToken ct = default)
    {
        var userIds = await db.PushDevices.Select(d => d.UserId).Distinct().ToListAsync(ct);
        var notified = 0;

        foreach (var userId in userIds)
        {
            var prefs = await db.UserSettings.FirstOrDefaultAsync(s => s.UserId == userId, ct);
            if (prefs?.DailyDigestTime is not { } digestTime) continue;

            var ctx = await settings.GetDayContextAsync(userId);
            var local = TimeZoneInfo.ConvertTime(nowUtc, ctx.TimeZone);
            var today = DateOnly.FromDateTime(local.DateTime);
            var sinceDigest = TimeOnly.FromDateTime(local.DateTime).ToTimeSpan() - digestTime.ToTimeSpan();
            if (sinceDigest < TimeSpan.Zero || sinceDigest > DigestWindow || prefs.LastDigestDate == today) continue;

            prefs.LastDigestDate = today;

            var overdue = (await db.Occurrences
                    .AsNoTracking()
                    .Include(o => o.Activity)
                    .Where(o => o.UserId == userId && o.Status == EventStatus.pending && o.StartAt != null)
                    .ToListAsync(ct))
                .Where(o => o.Activity.ShowAsOverdue && DayMath.IsOverdue(o, ctx, nowUtc))
                .OrderBy(o => o.StartAt)
                .ToList();

            if (overdue.Count > 0)
            {
                var devices = await db.PushDevices.Where(d => d.UserId == userId).ToListAsync(ct);
                await SendToDevicesAsync(devices, DigestMessage(overdue), ct);
                notified++;
            }

            await db.SaveChangesAsync(ct);
        }

        return notified;
    }

    public static PushMessage DigestMessage(List<Occurrence> overdue)
    {
        const int shown = 3;
        var titles = string.Join(", ", overdue.Take(shown).Select(o => o.Title ?? o.Activity.Title));
        var more = overdue.Count > shown ? $" +{overdue.Count - shown} more" : "";
        var title = overdue.Count == 1 ? "1 overdue item" : $"{overdue.Count} overdue items";
        return new PushMessage(title, titles + more, "/plan");
    }

    /// <summary>Sends to each device, removing any whose token is gone. The caller saves.</summary>
    private async Task<int> SendToDevicesAsync(List<PushDevice> devices, PushMessage message, CancellationToken ct)
    {
        var sent = 0;
        foreach (var device in devices)
        {
            var result = await sender.SendAsync(device.Token, message, ct);
            if (result == PushSendResult.Ok) sent++;
            else if (result == PushSendResult.Gone && db.Entry(device).State != EntityState.Deleted)
                db.PushDevices.Remove(device);
        }
        return sent;
    }

    private async Task PruneDeliveriesAsync(DateTimeOffset nowUtc, CancellationToken ct)
    {
        var cutoff = nowUtc - DeliveryRetention;
        var stale = (await db.ReminderDeliveries.Select(d => new { d.Id, d.FireAt }).ToListAsync(ct))
            .Where(d => d.FireAt < cutoff)
            .Select(d => d.Id)
            .ToList();
        foreach (var chunk in stale.Chunk(500))
            await db.ReminderDeliveries.Where(d => chunk.Contains(d.Id)).ExecuteDeleteAsync(ct);
    }

    /// <summary>The notification body: when the occurrence is, in the user's timezone, 24-hour.</summary>
    public static string Describe(Occurrence o, DayContext ctx, DateTimeOffset nowUtc)
    {
        var today = DayMath.LocalDate(nowUtc, ctx);
        string Day(DateTimeOffset at)
        {
            var date = DayMath.LocalDate(at, ctx);
            if (date == today) return "Today";
            if (date == today.AddDays(1)) return "Tomorrow";
            return date.ToString("ddd d MMM", CultureInfo.InvariantCulture);
        }
        string Clock(DateTimeOffset at) =>
            TimeZoneInfo.ConvertTime(at, ctx.TimeZone).ToString("HH:mm", CultureInfo.InvariantCulture);

        if (o.IsAllDay) return Day((o.StartAt ?? o.EndAt)!.Value);
        if (o.StartAt is { } start && o.EndAt is { } end) return $"{Day(start)}, {Clock(start)} - {Clock(end)}";
        var due = (o.StartAt ?? o.EndAt)!.Value;
        return $"{Day(due)}, due {Clock(due)}";
    }
}
