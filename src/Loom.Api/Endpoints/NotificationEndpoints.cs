using Loom.Core.Dtos;
using Loom.Core.Services;
using System.Security.Claims;

namespace Loom.Api.Endpoints;

public static class NotificationEndpoints
{
    public static void MapNotificationEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/notifications").RequireAuthorization();

        // The native app registers its FCM token after sign-in and drops it on sign-out.
        group.MapPost("/devices", async (RegisterPushDeviceRequest req, ClaimsPrincipal principal, NotificationService svc) =>
        {
            var userId = principal.GetUserId();
            if (userId is null) return Results.Unauthorized();
            var result = await svc.RegisterDeviceAsync(userId.Value, req.Token);
            return result.IsSuccess ? Results.NoContent() : result.Error!.ToProblem();
        });

        group.MapPost("/devices/remove", async (RegisterPushDeviceRequest req, ClaimsPrincipal principal, NotificationService svc) =>
        {
            var userId = principal.GetUserId();
            if (userId is null) return Results.Unauthorized();
            var result = await svc.UnregisterDeviceAsync(userId.Value, req.Token);
            return result.IsSuccess ? Results.NoContent() : result.Error!.ToProblem();
        });

        group.MapPost("/test", async (ClaimsPrincipal principal, NotificationService svc, CancellationToken ct) =>
        {
            var userId = principal.GetUserId();
            if (userId is null) return Results.Unauthorized();
            var result = await svc.SendTestAsync(userId.Value, ct);
            return result.IsSuccess ? Results.Ok(new { sent = result.Value }) : result.Error!.ToProblem();
        });
    }
}
