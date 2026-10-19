using Microsoft.EntityFrameworkCore;
using Loom.Core.Common;
using Loom.Core.Data;
using Loom.Core.Dtos;
using Loom.Core.Enums;

namespace Loom.Core.Services;

/// <summary>
/// Read-only totals over completed occurrences.
/// <para>
/// Everything here is a sum over what the user chose to log. There is deliberately no stat whose
/// denominator is the length of a day: the calendar is not assumed to be complete, so "unaccounted
/// time" is not a measurable quantity and an empty hour means nothing in particular.
/// </para>
/// </summary>
public class InsightsService(LoomDbContext db, UserSettingsService settings)
{
    public async Task<InsightsDto> GetAsync(Guid userId, int windowDays = 30, DateTimeOffset? nowUtc = null)
    {
        var now = nowUtc ?? DateTimeOffset.UtcNow;
        var ctx = await settings.GetDayContextAsync(userId);
        var today = DayMath.Today(ctx, now);
        var windowStart = today.AddDays(-(windowDays - 1));

        var completed = await db.Occurrences
            .AsNoTracking()
            .Include(o => o.Activity).ThenInclude(a => a.Category)
            .Include(o => o.Activity).ThenInclude(a => a.Goals)
            .Include(o => o.Activity).ThenInclude(a => a.Tags)
            .Include(o => o.Tags)
            .Include(o => o.TimeSplits).ThenInclude(t => t.WorkType)
            .AsSplitQuery()
            .Where(o => o.UserId == userId && o.Status == EventStatus.done && o.StartAt != null)
            .ToListAsync();

        var windowDone = completed
            .Select(o => (Occurrence: o, Day: DayMath.DayOf(o.StartAt!.Value, ctx)))
            .ToList();

        var inWindow = windowDone
            .Where(x => x.Day >= windowStart && x.Day <= today)
            .Select(x => x.Occurrence)
            .ToList();

        var previousStart = windowStart.AddDays(-windowDays);
        var previous = windowDone
            .Where(x => x.Day >= previousStart && x.Day < windowStart)
            .Select(x => x.Occurrence)
            .ToList();

        var timed = Timed(inWindow);

        var activities = timed
            .GroupBy(x => x.Occurrence.ActivityId)
            .Select(g =>
            {
                var first = g.First().Occurrence;
                return new InsightsActivityDto(
                    first.ActivityId,
                    first.Activity.Title,
                    first.Activity.Category?.Color,
                    g.Sum(x => x.Minutes),
                    g.Count(),
                    WorkTypeTotals(g.Select(x => x.Occurrence)));
            })
            .OrderByDescending(a => a.TimeMinutes)
            .ThenByDescending(a => a.Count)
            .ToList();

        var categories = timed
            .GroupBy(x => x.Occurrence.Activity.Category?.Id)
            .Select(g =>
            {
                var cat = g.First().Occurrence.Activity.Category;
                return new InsightsCategoryDto(
                    cat?.Id, cat?.Name, cat?.Color, cat?.Icon,
                    g.Count(),
                    g.Sum(x => x.Minutes));
            })
            .OrderByDescending(c => c.TimeMinutes)
            .ThenBy(c => c.Name)
            .ToList();

        var goals = timed
            .SelectMany(x => x.Occurrence.Activity.Goals.Select(g => (Goal: g, x.Minutes)))
            .GroupBy(x => x.Goal.Id)
            .Select(g =>
            {
                var goal = g.First().Goal;
                return new InsightsGoalDto(goal.Id, goal.Title, goal.Color, goal.Icon, g.Count(), g.Sum(x => x.Minutes));
            })
            .OrderByDescending(g => g.TimeMinutes)
            .ThenBy(g => g.Title)
            .ToList();

        var tags = timed
            .SelectMany(x => x.Occurrence.Activity.Tags.Concat(x.Occurrence.Tags).DistinctBy(t => t.Id).Select(t => (Tag: t, x.Minutes)))
            .GroupBy(x => x.Tag.Id)
            .Select(g => new InsightsTagDto(g.Key, g.First().Tag.Name, g.Count(), g.Sum(x => x.Minutes)))
            .OrderByDescending(t => t.TimeMinutes)
            .ThenBy(t => t.Name)
            .ToList();

        var summary = new InsightsSummaryDto(
            timed.Sum(x => x.Minutes),
            inWindow.Count,
            inWindow.Select(o => DayMath.DayOf(o.StartAt!.Value, ctx)).Distinct().Count(),
            Timed(previous).Sum(x => x.Minutes),
            previous.Count);

        return new InsightsDto(summary, activities, categories, goals, tags);
    }

    private static List<(Entities.Occurrence Occurrence, int Minutes)> Timed(IEnumerable<Entities.Occurrence> occurrences) =>
        occurrences
            .Where(o => o.StartAt.HasValue && o.EndAt.HasValue)
            .Select(o => (Occurrence: o, Minutes: (int)(o.EndAt!.Value - o.StartAt!.Value).TotalMinutes))
            .Where(x => x.Minutes > 0)
            .ToList();

    private static List<InsightsWorkTypeDto> WorkTypeTotals(IEnumerable<Entities.Occurrence> occurrences) =>
        occurrences
            .SelectMany(TimeSplitDto.FromOccurrence)
            .Where(t => t.Minutes > 0)
            .GroupBy(t => t.WorkTypeId)
            .Select(g => new InsightsWorkTypeDto(g.Key, g.First().Title, g.Sum(t => t.Minutes)))
            .OrderByDescending(w => w.TimeMinutes)
            .ThenBy(w => w.Title)
            .ToList();
}
