using Loom.Core.Dtos;
using Loom.Core.Services;
using System.Security.Claims;

namespace Loom.Api.Endpoints;

public static class TagEndpoints
{
    public static void MapTagEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/tags").RequireAuthorization();

        group.MapGet("/", async (ClaimsPrincipal principal, TagService svc) =>
        {
            var userId = principal.GetUserId();
            if (userId is null) return Results.Unauthorized();
            return Results.Ok(await svc.ListAsync(userId.Value));
        });

        group.MapPost("/", async (CreateTagRequest req, ClaimsPrincipal principal, TagService svc) =>
        {
            var userId = principal.GetUserId();
            if (userId is null) return Results.Unauthorized();
            var result = await svc.CreateAsync(userId.Value, req);
            return result.IsSuccess
                ? Results.Created($"/api/tags/{result.Value!.Id}", result.Value)
                : result.Error!.ToProblem();
        });

        group.MapPut("/{id:guid}", async (Guid id, UpdateTagRequest req, ClaimsPrincipal principal, TagService svc) =>
        {
            var userId = principal.GetUserId();
            if (userId is null) return Results.Unauthorized();
            var result = await svc.UpdateAsync(id, userId.Value, req);
            return result.IsSuccess ? Results.Ok(result.Value) : result.Error!.ToProblem();
        });

        group.MapDelete("/{id:guid}", async (Guid id, ClaimsPrincipal principal, TagService svc) =>
        {
            var userId = principal.GetUserId();
            if (userId is null) return Results.Unauthorized();
            var result = await svc.DeleteAsync(id, userId.Value);
            return result.IsSuccess ? Results.NoContent() : result.Error!.ToProblem();
        });
    }
}
