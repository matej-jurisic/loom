using Loom.Core.Dtos;
using Loom.Core.Services;
using System.Security.Claims;

namespace Loom.Api.Endpoints;

public static class OccurrenceListEndpoints
{
    public static void MapOccurrenceListEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/lists").RequireAuthorization();

        group.MapGet("/", async (ClaimsPrincipal principal, OccurrenceListService svc) =>
        {
            var userId = principal.GetUserId();
            if (userId is null) return Results.Unauthorized();
            return Results.Ok(await svc.ListAsync(userId.Value));
        });

        group.MapPost("/", async (SaveOccurrenceListRequest req, ClaimsPrincipal principal, OccurrenceListService svc) =>
        {
            var userId = principal.GetUserId();
            if (userId is null) return Results.Unauthorized();
            var result = await svc.CreateAsync(userId.Value, req);
            return result.IsSuccess
                ? Results.Created($"/api/lists/{result.Value!.Id}", result.Value)
                : result.Error!.ToProblem();
        });

        group.MapPut("/{id:guid}", async (Guid id, SaveOccurrenceListRequest req, ClaimsPrincipal principal, OccurrenceListService svc) =>
        {
            var userId = principal.GetUserId();
            if (userId is null) return Results.Unauthorized();
            var result = await svc.UpdateAsync(id, userId.Value, req);
            return result.IsSuccess ? Results.Ok(result.Value) : result.Error!.ToProblem();
        });

        group.MapDelete("/{id:guid}", async (Guid id, ClaimsPrincipal principal, OccurrenceListService svc) =>
        {
            var userId = principal.GetUserId();
            if (userId is null) return Results.Unauthorized();
            var result = await svc.DeleteAsync(id, userId.Value);
            return result.IsSuccess ? Results.NoContent() : result.Error!.ToProblem();
        });
    }
}
