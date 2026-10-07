using Loom.Core.Common;
using Loom.Core.Dtos;
using Loom.Core.Entities;
using Loom.Core.Enums;
using Microsoft.EntityFrameworkCore;

namespace Loom.Tests.Unit;

public class TimeSplitTests : IDisposable
{
    private readonly TestContext _ctx = new();

    public void Dispose() => _ctx.Dispose();

    private static readonly DateTimeOffset Start = new(2026, 7, 7, 14, 0, 0, TimeSpan.Zero);

    private async Task<Guid> CreateUserAsync()
    {
        var user = new User { Username = "u" + Guid.NewGuid().ToString("N")[..8], PasswordHash = "x", Timezone = "UTC" };
        _ctx.Db.Users.Add(user);
        await _ctx.Db.SaveChangesAsync();
        return user.Id;
    }

    private async Task<Guid> CreateActivityAsync(Guid userId, string title = "Project work") =>
        (await _ctx.ActivityService.CreateAsync(userId, new CreateActivityRequest(title, null, null))).Value!.Id;

    private async Task<Guid> CreateWorkTypeAsync(Guid userId, Guid activityId, string title) =>
        (await _ctx.ActivityWorkTypeService.CreateAsync(activityId, userId, new CreateActivityWorkTypeRequest(title))).Value!.Id;

    private async Task<OccurrenceDto> CreateSessionAsync(Guid userId, Guid activityId, int minutes = 180) =>
        (await _ctx.OccurrenceService.CreateAsync(userId,
            new CreateOccurrenceRequest(activityId, null, Start, Start.AddMinutes(minutes), false, false, null, null, null))).Value!;

    private Task<Result<OccurrenceDto>> SplitAsync(Guid userId, Guid occurrenceId, params (Guid WorkTypeId, int? Minutes)[] rows) =>
        _ctx.OccurrenceService.SetTimeSplitAsync(occurrenceId, userId,
            new SetTimeSplitRequest(rows.Select(r => new TimeSplitInput(r.WorkTypeId, r.Minutes)).ToList()));

    private static PatchOccurrenceRequest Patch(DateTimeOffset? endAt, Guid? activityId = null) =>
        new(ActivityId: new(activityId is not null, activityId), EndAt: new(true, endAt));

    [Fact]
    public void Resolve_shares_the_remainder_between_auto_rows()
    {
        Assert.Equal([90, 45, 45], TimeSplitMath.Resolve(180, [90, null, null]));
    }

    [Fact]
    public void Resolve_hands_leftover_minutes_to_the_first_auto_rows()
    {
        Assert.Equal([34, 33, 33], TimeSplitMath.Resolve(100, [null, null, null]));
    }

    [Fact]
    public void Resolve_gives_auto_rows_nothing_without_a_duration()
    {
        Assert.Equal([30, 0], TimeSplitMath.Resolve(0, [30, null]));
    }

    [Fact]
    public async Task CreateAsync_copies_no_work_types_onto_the_occurrence()
    {
        var userId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId);
        await CreateWorkTypeAsync(userId, activityId, "Coding");

        var session = await CreateSessionAsync(userId, activityId);

        Assert.Empty(session.TimeSplit);
        Assert.Single(session.Activity.WorkTypes);
    }

    [Fact]
    public async Task SetTimeSplitAsync_splits_evenly_when_nothing_is_pinned()
    {
        var userId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId);
        var coding = await CreateWorkTypeAsync(userId, activityId, "Coding");
        var meeting = await CreateWorkTypeAsync(userId, activityId, "Meeting");
        var session = await CreateSessionAsync(userId, activityId);

        var result = await SplitAsync(userId, session.Id, (coding, null), (meeting, null));

        Assert.True(result.IsSuccess);
        Assert.Equal([90, 90], result.Value!.TimeSplit.Select(t => t.Minutes));
        Assert.All(result.Value.TimeSplit, t => Assert.False(t.IsPinned));
    }

    [Fact]
    public async Task SetTimeSplitAsync_auto_rows_share_what_pinned_rows_leave()
    {
        var userId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId);
        var coding = await CreateWorkTypeAsync(userId, activityId, "Coding");
        var report = await CreateWorkTypeAsync(userId, activityId, "Report writing");
        var meeting = await CreateWorkTypeAsync(userId, activityId, "Meeting");
        var session = await CreateSessionAsync(userId, activityId);

        var result = await SplitAsync(userId, session.Id, (coding, 90), (report, null), (meeting, null));

        Assert.Equal(["Coding", "Report writing", "Meeting"], result.Value!.TimeSplit.Select(t => t.Title));
        Assert.Equal([90, 45, 45], result.Value.TimeSplit.Select(t => t.Minutes));
        Assert.Equal([true, false, false], result.Value.TimeSplit.Select(t => t.IsPinned));
    }

    [Fact]
    public async Task SetTimeSplitAsync_replaces_the_previous_set_and_keeps_order()
    {
        var userId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId);
        var coding = await CreateWorkTypeAsync(userId, activityId, "Coding");
        var meeting = await CreateWorkTypeAsync(userId, activityId, "Meeting");
        var report = await CreateWorkTypeAsync(userId, activityId, "Report writing");
        var session = await CreateSessionAsync(userId, activityId);
        await SplitAsync(userId, session.Id, (coding, 60), (meeting, 30));

        await SplitAsync(userId, session.Id, (report, 20), (coding, 100));
        var reread = (await _ctx.OccurrenceService.GetAsync(session.Id, userId)).Value!;

        Assert.Equal(["Report writing", "Coding"], reread.TimeSplit.Select(t => t.Title));
        Assert.Equal([20, 100], reread.TimeSplit.Select(t => t.Minutes));
        Assert.Equal(2, await _ctx.Db.OccurrenceTimeSplits.CountAsync());
    }

    [Fact]
    public async Task SetTimeSplitAsync_rejects_a_pinned_total_over_the_duration()
    {
        var userId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId);
        var coding = await CreateWorkTypeAsync(userId, activityId, "Coding");
        var meeting = await CreateWorkTypeAsync(userId, activityId, "Meeting");
        var session = await CreateSessionAsync(userId, activityId);

        var result = await SplitAsync(userId, session.Id, (coding, 120), (meeting, 90));

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorType.Validation, result.Error!.Type);
        Assert.Equal(0, await _ctx.Db.OccurrenceTimeSplits.CountAsync());
    }

    [Fact]
    public async Task SetTimeSplitAsync_rejects_a_work_type_of_another_activity()
    {
        var userId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId);
        var otherId = await CreateActivityAsync(userId, "Reading");
        var foreign = await CreateWorkTypeAsync(userId, otherId, "Notes");
        var session = await CreateSessionAsync(userId, activityId);

        var result = await SplitAsync(userId, session.Id, (foreign, null));

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorType.NotFound, result.Error!.Type);
    }

    [Fact]
    public async Task SetTimeSplitAsync_rejects_a_repeated_work_type()
    {
        var userId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId);
        var coding = await CreateWorkTypeAsync(userId, activityId, "Coding");
        var session = await CreateSessionAsync(userId, activityId);

        var result = await SplitAsync(userId, session.Id, (coding, 30), (coding, 30));

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorType.Validation, result.Error!.Type);
    }

    [Fact]
    public async Task UpdateAsync_auto_rows_follow_a_resized_occurrence()
    {
        var userId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId);
        var coding = await CreateWorkTypeAsync(userId, activityId, "Coding");
        var meeting = await CreateWorkTypeAsync(userId, activityId, "Meeting");
        var session = await CreateSessionAsync(userId, activityId);
        await SplitAsync(userId, session.Id, (coding, 90), (meeting, null));

        var result = await _ctx.OccurrenceService.PatchAsync(session.Id, userId, Patch(Start.AddMinutes(120)));

        Assert.True(result.IsSuccess);
        Assert.Equal([90, 30], result.Value!.TimeSplit.Select(t => t.Minutes));
    }

    [Fact]
    public async Task UpdateAsync_rejects_shrinking_below_the_pinned_total()
    {
        var userId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId);
        var coding = await CreateWorkTypeAsync(userId, activityId, "Coding");
        var session = await CreateSessionAsync(userId, activityId);
        await SplitAsync(userId, session.Id, (coding, 90));

        var result = await _ctx.OccurrenceService.PatchAsync(session.Id, userId, Patch(Start.AddMinutes(60)));

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorType.Validation, result.Error!.Type);
    }

    [Fact]
    public async Task UpdateAsync_keeps_the_split_when_the_end_is_removed()
    {
        var userId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId);
        var coding = await CreateWorkTypeAsync(userId, activityId, "Coding");
        var session = await CreateSessionAsync(userId, activityId);
        await SplitAsync(userId, session.Id, (coding, 90));

        var result = await _ctx.OccurrenceService.PatchAsync(session.Id, userId, Patch(null));

        Assert.True(result.IsSuccess);
        Assert.Equal(90, Assert.Single(result.Value!.TimeSplit).Minutes);
    }

    [Fact]
    public async Task UpdateAsync_repointing_drops_the_split()
    {
        var userId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId);
        var otherId = await CreateActivityAsync(userId, "Reading");
        var coding = await CreateWorkTypeAsync(userId, activityId, "Coding");
        var session = await CreateSessionAsync(userId, activityId);
        await SplitAsync(userId, session.Id, (coding, 90));

        var result = await _ctx.OccurrenceService.PatchAsync(session.Id, userId, Patch(session.EndAt, otherId));

        Assert.True(result.IsSuccess);
        Assert.Empty(result.Value!.TimeSplit);
        Assert.Equal(0, await _ctx.Db.OccurrenceTimeSplits.CountAsync());
    }

    [Fact]
    public async Task WorkType_CreateAsync_rejects_a_duplicate_title()
    {
        var userId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId);
        await CreateWorkTypeAsync(userId, activityId, "Coding");

        var result = await _ctx.ActivityWorkTypeService.CreateAsync(activityId, userId, new CreateActivityWorkTypeRequest(" coding "));

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorType.Conflict, result.Error!.Type);
    }

    [Fact]
    public async Task WorkType_UpdateAsync_renames_logged_rows()
    {
        var userId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId);
        var coding = await CreateWorkTypeAsync(userId, activityId, "Coding");
        var session = await CreateSessionAsync(userId, activityId);
        await SplitAsync(userId, session.Id, (coding, 90));

        await _ctx.ActivityWorkTypeService.UpdateAsync(coding, activityId, userId, new UpdateActivityWorkTypeRequest("Implementation"));
        var reread = (await _ctx.OccurrenceService.GetAsync(session.Id, userId)).Value!;

        Assert.Equal("Implementation", Assert.Single(reread.TimeSplit).Title);
    }

    [Fact]
    public async Task WorkType_DeleteAsync_removes_an_unused_type()
    {
        var userId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId);
        var coding = await CreateWorkTypeAsync(userId, activityId, "Coding");

        var result = await _ctx.ActivityWorkTypeService.DeleteAsync(coding, activityId, userId);

        Assert.True(result.IsSuccess);
        Assert.Equal(0, await _ctx.Db.ActivityWorkTypes.CountAsync());
    }

    [Fact]
    public async Task WorkType_DeleteAsync_archives_a_type_with_logged_time()
    {
        var userId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId);
        var coding = await CreateWorkTypeAsync(userId, activityId, "Coding");
        var session = await CreateSessionAsync(userId, activityId);
        await SplitAsync(userId, session.Id, (coding, 90));

        await _ctx.ActivityWorkTypeService.DeleteAsync(coding, activityId, userId);
        var reread = (await _ctx.OccurrenceService.GetAsync(session.Id, userId)).Value!;

        Assert.Equal("Coding", Assert.Single(reread.TimeSplit).Title);
        Assert.Empty(reread.Activity.WorkTypes);
    }

    [Fact]
    public async Task WorkType_CreateAsync_restores_an_archived_type()
    {
        var userId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId);
        var coding = await CreateWorkTypeAsync(userId, activityId, "Coding");
        var session = await CreateSessionAsync(userId, activityId);
        await SplitAsync(userId, session.Id, (coding, 90));
        await _ctx.ActivityWorkTypeService.DeleteAsync(coding, activityId, userId);

        var restored = await _ctx.ActivityWorkTypeService.CreateAsync(activityId, userId, new CreateActivityWorkTypeRequest("Coding"));

        Assert.True(restored.IsSuccess);
        Assert.Equal(coding, restored.Value!.Id);
    }

    [Fact]
    public async Task Insights_breaks_an_activity_down_by_work_type()
    {
        var userId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId);
        var coding = await CreateWorkTypeAsync(userId, activityId, "Coding");
        var meeting = await CreateWorkTypeAsync(userId, activityId, "Meeting");
        var first = await CreateSessionAsync(userId, activityId);
        var second = await CreateSessionAsync(userId, activityId, 60);
        var unsplit = await CreateSessionAsync(userId, activityId, 30);
        await SplitAsync(userId, first.Id, (coding, 120), (meeting, null));
        await SplitAsync(userId, second.Id, (coding, 45));
        foreach (var o in new[] { first, second, unsplit })
            await _ctx.OccurrenceService.SetStatusAsync(o.Id, userId, EventStatus.done);

        var insights = await _ctx.InsightsService.GetAsync(userId, 7, Start.AddHours(5));

        var activity = Assert.Single(insights.Activities);
        Assert.Equal(270, activity.TimeMinutes);
        Assert.Equal(["Coding", "Meeting"], activity.WorkTypes.Select(w => w.Title));
        Assert.Equal([165, 60], activity.WorkTypes.Select(w => w.TimeMinutes));
    }
}
