using Microsoft.EntityFrameworkCore;
using Loom.Core.Common;
using Loom.Core.Data;
using Loom.Core.Dtos;
using Loom.Core.Entities;

namespace Loom.Core.Services;

public class OccurrenceListService(LoomDbContext db)
{
    // Mirror the client's StatusFilter / OccurrenceGroupBy and NONE_FILTER (lib/occurrenceView.ts).
    private static readonly string[] Statuses = ["open", "done", "skipped", "all"];
    private static readonly string[] GroupBys = ["when", "category", "tag", "goal", "activity", "none"];
    private const string NoneFilter = "none";
    private const int MaxSearchLength = 255;

    public async Task<List<OccurrenceListDto>> ListAsync(Guid userId)
    {
        var lists = await db.OccurrenceLists.AsNoTracking().Where(l => l.UserId == userId).ToListAsync();
        return lists.OrderBy(l => l.Name, StringComparer.OrdinalIgnoreCase).Select(OccurrenceListDto.FromEntity).ToList();
    }

    public async Task<Result<OccurrenceListDto>> CreateAsync(Guid userId, SaveOccurrenceListRequest req)
    {
        var list = new OccurrenceList { UserId = userId, Name = "" };
        var err = await ApplyAsync(list, userId, req);
        if (err is not null) return Result<OccurrenceListDto>.Fail(err);

        db.OccurrenceLists.Add(list);
        await db.SaveChangesAsync();
        return Result<OccurrenceListDto>.Success(OccurrenceListDto.FromEntity(list));
    }

    public async Task<Result<OccurrenceListDto>> UpdateAsync(Guid id, Guid userId, SaveOccurrenceListRequest req)
    {
        var list = await db.OccurrenceLists.FirstOrDefaultAsync(l => l.Id == id && l.UserId == userId);
        if (list is null) return Result<OccurrenceListDto>.Fail(new Error(ErrorType.NotFound, "List not found."));

        var err = await ApplyAsync(list, userId, req);
        if (err is not null) return Result<OccurrenceListDto>.Fail(err);

        await db.SaveChangesAsync();
        return Result<OccurrenceListDto>.Success(OccurrenceListDto.FromEntity(list));
    }

    public async Task<Result> DeleteAsync(Guid id, Guid userId)
    {
        var list = await db.OccurrenceLists.FirstOrDefaultAsync(l => l.Id == id && l.UserId == userId);
        if (list is null) return Result.Fail(new Error(ErrorType.NotFound, "List not found."));
        db.OccurrenceLists.Remove(list);
        await db.SaveChangesAsync();
        return Result.Success();
    }

    // Full replace: every field of the request overwrites the list's.
    private async Task<Error?> ApplyAsync(OccurrenceList list, Guid userId, SaveOccurrenceListRequest req)
    {
        var err = Validators.ValidateTitle(req.Name, "Name");
        if (err is not null) return err;

        var name = req.Name.Trim();
        var names = await db.OccurrenceLists
            .Where(l => l.UserId == userId && l.Id != list.Id)
            .Select(l => l.Name)
            .ToListAsync();
        if (names.Any(n => string.Equals(n, name, StringComparison.OrdinalIgnoreCase)))
            return new Error(ErrorType.Conflict, "A list with that name already exists.");

        var status = Blank(req.Status) ?? "open";
        if (!Statuses.Contains(status))
            return new Error(ErrorType.Validation, "Unknown status filter.");

        var groupBy = Blank(req.GroupBy);
        if (groupBy is not null && !GroupBys.Contains(groupBy))
            return new Error(ErrorType.Validation, "Unknown grouping.");

        var search = Blank(req.Search);
        if (search is { Length: > MaxSearchLength })
            return new Error(ErrorType.Validation, $"Search cannot exceed {MaxSearchLength} characters.");

        var category = Blank(req.Category);
        var tag = Blank(req.Tag);
        var goal = Blank(req.Goal);
        if (await ParseRefAsync(category, id => db.Categories.AnyAsync(c => c.Id == id && c.UserId == userId)) is false)
            return new Error(ErrorType.Validation, "Category not found.");
        if (await ParseRefAsync(tag, id => db.Tags.AnyAsync(t => t.Id == id && t.UserId == userId)) is false)
            return new Error(ErrorType.Validation, "Tag not found.");
        if (await ParseRefAsync(goal, id => db.Goals.AnyAsync(g => g.Id == id && g.UserId == userId)) is false)
            return new Error(ErrorType.Validation, "Goal not found.");

        list.Name = name;
        list.Status = status;
        list.Category = category is null or NoneFilter ? category : Guid.Parse(category).ToString();
        list.Tag = tag is null or NoneFilter ? tag : Guid.Parse(tag).ToString();
        list.Goal = goal is null or NoneFilter ? goal : Guid.Parse(goal).ToString();
        list.Search = search;
        list.GroupBy = groupBy;
        return null;
    }

    private static string? Blank(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    // null and "none" need no lookup; anything else must be an id the user owns.
    private static async Task<bool> ParseRefAsync(string? value, Func<Guid, Task<bool>> exists)
    {
        if (value is null or NoneFilter) return true;
        return Guid.TryParse(value, out var id) && await exists(id);
    }
}
