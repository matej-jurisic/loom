using Loom.Core.Common;
using Loom.Core.Entities;
using Loom.Core.Enums;

namespace Loom.Core.Dtos;

// Auth
public sealed record UserDto(Guid Id, string Username, string Timezone)
{
    public static UserDto FromEntity(User u) => new(u.Id, u.Username, u.Timezone);
}

public sealed record AuthResult(string AccessToken, UserDto User, string RefreshToken, DateTimeOffset RefreshTokenExpiry);

public sealed record RegisterRequest(string Username, string Password, string Timezone);
public sealed record LoginRequest(string Username, string Password);

// Shared summaries
public sealed record CategorySummaryDto(Guid Id, string Name, string Color, string? Icon)
{
    public static CategorySummaryDto FromEntity(Entities.Category c) => new(c.Id, c.Name, c.Color, c.Icon);
}

public sealed record GoalSummaryDto(Guid Id, string Title, string Status)
{
    public static GoalSummaryDto FromEntity(Goal g) => new(g.Id, g.Title, g.Status.ToString());
}

// Activities
public sealed record ActivityDto(
    Guid Id,
    Guid UserId,
    string Title,
    Guid? CategoryId,
    string Kind,
    DateTimeOffset CreatedAt,
    CategorySummaryDto? Category,
    List<GoalSummaryDto> Goals,
    List<ActivitySubtaskDto> Subtasks,
    List<ActivityWorkTypeDto> WorkTypes,
    int? RepeatAfterDays,
    // How many occurrences this activity has in the recent window (see ActivityService.RecentWindowDays).
    // Only the list endpoint fills it; single-activity responses leave it at 0.
    int RecentOccurrenceCount = 0)
{
    public static ActivityDto FromEntity(Activity a, int recentOccurrenceCount = 0) => new(
        a.Id, a.UserId, a.Title, a.CategoryId, a.Kind.ToString(), a.CreatedAt,
        a.Category is not null ? CategorySummaryDto.FromEntity(a.Category) : null,
        a.Goals.OrderBy(g => g.Status).ThenBy(g => g.Title).Select(GoalSummaryDto.FromEntity).ToList(),
        a.Subtasks.OrderBy(s => s.CreatedAt).Select(ActivitySubtaskDto.FromEntity).ToList(),
        a.WorkTypes.Where(w => !w.IsArchived).OrderBy(w => w.CreatedAt).Select(ActivityWorkTypeDto.FromEntity).ToList(),
        a.RepeatAfterDays,
        recentOccurrenceCount);
}

public sealed record CreateActivityRequest(string Title, Guid? CategoryId, List<Guid>? GoalIds = null, int? RepeatAfterDays = null);
public sealed record UpdateActivityRequest(string Title, Guid? CategoryId, List<Guid>? GoalIds = null, int? RepeatAfterDays = null);

// Activity subtasks (template)
public sealed record ActivitySubtaskDto(Guid Id, Guid ActivityId, string Title, DateTimeOffset CreatedAt)
{
    public static ActivitySubtaskDto FromEntity(ActivitySubtask s) => new(s.Id, s.ActivityId, s.Title, s.CreatedAt);
}

public sealed record CreateActivitySubtaskRequest(string Title);
public sealed record UpdateActivitySubtaskRequest(string Title);

public sealed record ActivityWorkTypeDto(Guid Id, Guid ActivityId, string Title, DateTimeOffset CreatedAt)
{
    public static ActivityWorkTypeDto FromEntity(ActivityWorkType w) => new(w.Id, w.ActivityId, w.Title, w.CreatedAt);
}

public sealed record CreateActivityWorkTypeRequest(string Title);
public sealed record UpdateActivityWorkTypeRequest(string Title);

public sealed record TimeSplitDto(Guid Id, Guid WorkTypeId, string Title, int Minutes, bool IsPinned)
{
    public static List<TimeSplitDto> FromOccurrence(Occurrence o)
    {
        var rows = o.TimeSplits.OrderBy(t => t.Position).ThenBy(t => t.CreatedAt).ToList();
        var resolved = TimeSplitMath.Resolve(
            TimeSplitMath.DurationMinutes(o.StartAt, o.EndAt),
            rows.Select(t => t.Minutes).ToList());
        return rows
            .Select((t, i) => new TimeSplitDto(t.Id, t.WorkTypeId, t.WorkType.Title, resolved[i], t.Minutes.HasValue))
            .ToList();
    }
}

public sealed record TimeSplitInput(Guid WorkTypeId, int? Minutes);
public sealed record SetTimeSplitRequest(List<TimeSplitInput> Rows);

// Occurrence subtasks (per-occurrence copy)
public sealed record OccurrenceSubtaskDto(Guid Id, Guid OccurrenceId, string Title, bool IsDone, DateTimeOffset CreatedAt)
{
    public static OccurrenceSubtaskDto FromEntity(OccurrenceSubtask s) => new(s.Id, s.OccurrenceId, s.Title, s.IsDone, s.CreatedAt);
}

public sealed record CreateOccurrenceSubtaskRequest(string Title);
public sealed record UpdateOccurrenceSubtaskRequest(string Title);

// Full-set subtask input for occurrence updates: Id set = keep existing (IsDone preserved),
// Id null = create new. Existing subtasks missing from the list are deleted. Null list = leave untouched.
public sealed record OccurrenceSubtaskInput(Guid? Id, string Title);

public sealed record CreateEventRequest(
    string Title,
    Guid? CategoryId,
    List<Guid>? GoalIds,
    DateTimeOffset? StartAt,
    DateTimeOffset? EndAt,
    bool IsAllDay,
    bool IsPlanned,
    Guid? DeadlineOccurrenceId = null);

public sealed record UpdateEventRequest(
    string Title,
    Guid? CategoryId,
    List<Guid>? GoalIds,
    DateTimeOffset? StartAt,
    DateTimeOffset? EndAt,
    bool IsAllDay,
    bool IsPlanned,
    List<OccurrenceSubtaskInput>? Subtasks = null,
    Guid? DeadlineOccurrenceId = null,
    bool ClearDeadline = false);

// Occurrences
public sealed record OccurrenceDto(
    Guid Id,
    Guid UserId,
    Guid ActivityId,
    string? Title,
    string? Notes,
    string EffectiveTitle,
    DateTimeOffset? StartAt,
    DateTimeOffset? EndAt,
    string Status,
    DateTimeOffset CreatedAt,
    bool IsOverdue,
    bool IsAllDay,
    bool IsPlanned,
    DateTimeOffset? WindowStart,
    DateTimeOffset? WindowEnd,
    int? WindowDurationMinutes,
    List<OccurrenceSubtaskDto> Subtasks,
    List<TimeSplitDto> TimeSplit,
    ActivityDto Activity,
    Guid? DeadlineOccurrenceId = null,
    DeadlineRefDto? Deadline = null,
    int LinkedDoneCount = 0,
    int LinkedDoneMinutes = 0)
{
    public static OccurrenceDto FromEntity(Occurrence o, DayContext ctx, DateTimeOffset nowUtc) => new(
        o.Id, o.UserId, o.ActivityId, o.Title, o.Notes,
        o.Title ?? o.Activity.Title,
        o.StartAt, o.EndAt,
        o.Status.ToString(), o.CreatedAt,
        DayMath.IsOverdue(o, ctx, nowUtc),
        o.IsAllDay,
        o.IsPlanned,
        o.WindowStart, o.WindowEnd, o.WindowDurationMinutes,
        o.Subtasks.OrderBy(s => s.CreatedAt).Select(OccurrenceSubtaskDto.FromEntity).ToList(),
        TimeSplitDto.FromOccurrence(o),
        ActivityDto.FromEntity(o.Activity),
        o.DeadlineOccurrenceId);
}

public sealed record DeadlineRefDto(
    Guid Id,
    string EffectiveTitle,
    DateTimeOffset? StartAt,
    DateTimeOffset? EndAt,
    bool IsAllDay,
    string Status)
{
    public static DeadlineRefDto FromEntity(Occurrence d) => new(
        d.Id, d.Title ?? d.Activity.Title, d.StartAt, d.EndAt, d.IsAllDay, d.Status.ToString());
}

public sealed record CreateOccurrenceRequest(
    Guid ActivityId,
    string? Title,
    DateTimeOffset? StartAt,
    DateTimeOffset? EndAt,
    bool IsAllDay,
    bool IsPlanned,
    DateTimeOffset? WindowStart,
    DateTimeOffset? WindowEnd,
    int? WindowDurationMinutes,
    Guid? DeadlineOccurrenceId = null);

public sealed record PatchOccurrenceRequest(
    Optional<Guid?> ActivityId = default,
    Optional<string?> Title = default,
    Optional<DateTimeOffset?> StartAt = default,
    Optional<DateTimeOffset?> EndAt = default,
    Optional<bool> IsAllDay = default,
    Optional<bool> IsPlanned = default,
    Optional<Guid?> DeadlineOccurrenceId = default,
    List<OccurrenceSubtaskInput>? Subtasks = null,
    Optional<string?> Notes = default);

public sealed record SetOccurrenceStatusRequest(EventStatus Status);
public sealed record RepeatOccurrenceRequest(bool IsPlanned = false);

// Goals
public sealed record GoalOccurrenceStats(int Done, int Skipped, int Pending);

/// <summary>One day of a goal's history. Days with nothing on them are not sent.</summary>
public sealed record GoalHeatmapDay(DateOnly Date, int Done, int Skipped);

/// <summary>
/// Trailing window of per-day done/skipped counts for a goal. <c>Start</c> and <c>End</c>
/// are days in the user's timezone offset by the day boundary, so the client lays the grid out from
/// them rather than recomputing "today" locally.
/// </summary>
public sealed record GoalHeatmap(DateOnly Start, DateOnly End, List<GoalHeatmapDay> Days);

public sealed record GoalDto(
    Guid Id,
    Guid UserId,
    string Title,
    string? Description,
    string? Notes,
    string Status,
    DateTimeOffset CreatedAt,
    List<CheckpointDto> Checkpoints,
    GoalOccurrenceStats? OccurrenceStats = null,
    DateTimeOffset? LastOccurrenceAt = null,
    GoalHeatmap? Heatmap = null,
    int? DaysSinceLastOccurrence = null)
{
    public static GoalDto FromEntity(
        Goal g,
        GoalOccurrenceStats? stats = null,
        DateTimeOffset? lastOccurrenceAt = null,
        GoalHeatmap? heatmap = null,
        int? daysSinceLastOccurrence = null) => new(
        g.Id, g.UserId, g.Title, g.Description, g.Notes,
        g.Status.ToString(), g.CreatedAt,
        g.Checkpoints.Select(CheckpointDto.FromEntity).ToList(),
        stats, lastOccurrenceAt, heatmap, daysSinceLastOccurrence);
}

public sealed record CreateGoalRequest(string Title, string? Description, string? Notes = null);
public sealed record UpdateGoalRequest(string Title, string? Description, string? Notes = null);
public sealed record SetGoalStatusRequest(GoalStatus Status);

// Checkpoints
public sealed record CheckpointDto(
    Guid Id,
    Guid GoalId,
    string Title,
    string Size,
    DateTimeOffset? TargetDate,
    string Status,
    DateTimeOffset CreatedAt)
{
    public static CheckpointDto FromEntity(Checkpoint c) => new(
        c.Id, c.GoalId, c.Title, c.Size.ToString(),
        c.TargetDate, c.Status.ToString(), c.CreatedAt);
}

public sealed record CreateCheckpointRequest(string Title, CheckpointSize Size, DateTimeOffset? TargetDate);
public sealed record UpdateCheckpointRequest(string Title, CheckpointSize Size, DateTimeOffset? TargetDate);
public sealed record SetCheckpointStatusRequest(CheckpointStatus Status);

// Categories
public sealed record CategoryDto(Guid Id, Guid UserId, string Name, string Color, string? Icon, DateTimeOffset CreatedAt)
{
    public static CategoryDto FromEntity(Entities.Category c) => new(c.Id, c.UserId, c.Name, c.Color, c.Icon, c.CreatedAt);
}

public sealed record CreateCategoryRequest(string Name, string Color, string? Icon);
public sealed record UpdateCategoryRequest(string Name, string Color, string? Icon);

// Insights — server-side day bucketing; floating occurrences (no StartAt) are excluded.
// Time = EndAt-StartAt when both set, else 0.
//
// Every stat here sums only what the user chose to log. Nothing divides by the length of a day or
// reads meaning into unlogged time: the app does not assume the calendar is complete, so a stat that
// needed it to be would simply be wrong.
public sealed record InsightsWorkTypeDto(Guid WorkTypeId, string Title, int TimeMinutes);

public sealed record InsightsActivityDto(Guid ActivityId, string Title, string? CategoryColor, int TimeMinutes, int Count, List<InsightsWorkTypeDto> WorkTypes);

public sealed record InsightsCategoryDto(Guid? CategoryId, string? Name, string? Color, string? Icon, int Done, int TimeMinutes);

public sealed record InsightsDto(
    List<InsightsActivityDto> Activities,
    List<InsightsCategoryDto> Categories);

// Export — flat JSON snapshot of all user data, meant for external analysis.
// Not a backup format: there is no import path and the shape may change freely.
public sealed record ExportOccurrenceDto(
    Guid Id,
    Guid ActivityId,
    string Title,
    string? Notes,
    string Status,
    DateTimeOffset? StartAt,
    DateTimeOffset? EndAt,
    bool IsAllDay,
    bool IsPlanned,
    DateTimeOffset? WindowStart,
    DateTimeOffset? WindowEnd,
    int? WindowDurationMinutes,
    DateTimeOffset CreatedAt,
    List<OccurrenceSubtaskDto> Subtasks,
    List<TimeSplitDto> TimeSplit,
    Guid? DeadlineOccurrenceId)
{
    public static ExportOccurrenceDto FromEntity(Occurrence o) => new(
        o.Id, o.ActivityId, o.Title ?? o.Activity.Title, o.Notes, o.Status.ToString(),
        o.StartAt, o.EndAt, o.IsAllDay, o.IsPlanned,
        o.WindowStart, o.WindowEnd, o.WindowDurationMinutes, o.CreatedAt,
        o.Subtasks.OrderBy(s => s.CreatedAt).Select(OccurrenceSubtaskDto.FromEntity).ToList(),
        TimeSplitDto.FromOccurrence(o),
        o.DeadlineOccurrenceId);
}

public sealed record ExportDto(
    DateTimeOffset ExportedAt,
    UserDto User,
    UserSettingsDto Settings,
    List<CategoryDto> Categories,
    List<GoalDto> Goals,
    List<ActivityDto> Activities,
    List<ExportOccurrenceDto> Occurrences);

// UserSettings
public sealed record UserSettingsDto(
    Guid UserId, int MaxFocusGoals, string DayBoundaryTime, string Timezone)
{
    public static UserSettingsDto FromEntity(UserSettings us, string timezone) => new(
        us.UserId, us.MaxFocusGoals, us.DayBoundaryTime.ToString("HH:mm"), timezone);
}

public sealed record UpdateUserSettingsRequest(
    int MaxFocusGoals, string DayBoundaryTime, string Timezone);
