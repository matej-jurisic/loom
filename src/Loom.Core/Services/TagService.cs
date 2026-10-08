using Microsoft.EntityFrameworkCore;
using Loom.Core.Common;
using Loom.Core.Data;
using Loom.Core.Dtos;
using Loom.Core.Entities;

namespace Loom.Core.Services;

public class TagService(LoomDbContext db)
{
    public async Task<List<TagDto>> ListAsync(Guid userId)
    {
        var tags = await db.Tags.AsNoTracking().Where(t => t.UserId == userId).ToListAsync();
        return tags.OrderBy(t => t.Name, StringComparer.OrdinalIgnoreCase).Select(TagDto.FromEntity).ToList();
    }

    public async Task<Result<TagDto>> CreateAsync(Guid userId, CreateTagRequest req)
    {
        var err = Validators.ValidateTitle(req.Name, "Name");
        if (err is not null) return Result<TagDto>.Fail(err);

        var name = req.Name.Trim();
        if (await NameTakenAsync(userId, name, null))
            return Result<TagDto>.Fail(new Error(ErrorType.Conflict, "A tag with that name already exists."));

        var tag = new Tag { UserId = userId, Name = name };
        db.Tags.Add(tag);
        await db.SaveChangesAsync();
        return Result<TagDto>.Success(TagDto.FromEntity(tag));
    }

    public async Task<Result<TagDto>> UpdateAsync(Guid id, Guid userId, UpdateTagRequest req)
    {
        var err = Validators.ValidateTitle(req.Name, "Name");
        if (err is not null) return Result<TagDto>.Fail(err);

        var tag = await db.Tags.FirstOrDefaultAsync(t => t.Id == id && t.UserId == userId);
        if (tag is null) return Result<TagDto>.Fail(new Error(ErrorType.NotFound, "Tag not found."));

        var name = req.Name.Trim();
        if (await NameTakenAsync(userId, name, id))
            return Result<TagDto>.Fail(new Error(ErrorType.Conflict, "A tag with that name already exists."));

        tag.Name = name;
        await db.SaveChangesAsync();
        return Result<TagDto>.Success(TagDto.FromEntity(tag));
    }

    public async Task<Result> DeleteAsync(Guid id, Guid userId)
    {
        var tag = await db.Tags.FirstOrDefaultAsync(t => t.Id == id && t.UserId == userId);
        if (tag is null) return Result.Fail(new Error(ErrorType.NotFound, "Tag not found."));
        db.Tags.Remove(tag);
        await db.SaveChangesAsync();
        return Result.Success();
    }

    private async Task<bool> NameTakenAsync(Guid userId, string name, Guid? exceptId)
    {
        var names = await db.Tags
            .Where(t => t.UserId == userId && t.Id != exceptId)
            .Select(t => t.Name)
            .ToListAsync();
        return names.Any(n => string.Equals(n, name, StringComparison.OrdinalIgnoreCase));
    }
}
