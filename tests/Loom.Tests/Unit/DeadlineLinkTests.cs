using Loom.Core.Common;
using Loom.Core.Dtos;
using Loom.Core.Entities;
using Microsoft.EntityFrameworkCore;

namespace Loom.Tests.Unit;

public class DeadlineLinkTests : IDisposable
{
    private readonly TestContext _ctx = new();

    public void Dispose() => _ctx.Dispose();

    private async Task<Guid> CreateUserAsync()
    {
        var user = new User { Username = "u" + Guid.NewGuid().ToString("N")[..8], PasswordHash = "x", Timezone = "UTC" };
        _ctx.Db.Users.Add(user);
        await _ctx.Db.SaveChangesAsync();
        return user.Id;
    }

    private async Task<Guid> CreateActivityAsync(Guid userId) =>
        (await _ctx.ActivityService.CreateAsync(userId, new CreateActivityRequest("Lab work", null, null))).Value!.Id;

    private async Task<OccurrenceDto> CreateDeadlineAsync(Guid userId, string title = "Lab 3 report", Guid? deadlineId = null) =>
        (await _ctx.OccurrenceService.CreateEventAsync(userId,
            new CreateEventRequest(title, null, null, null, DateTimeOffset.UtcNow.AddDays(3), false, false, deadlineId))).Value!;

    private Task<Result<OccurrenceDto>> CreateSessionAsync(
        Guid userId, Guid activityId, Guid? deadlineId, DateTimeOffset? start = null, DateTimeOffset? end = null) =>
        _ctx.OccurrenceService.CreateAsync(userId,
            new CreateOccurrenceRequest(activityId, null, start, end, false, false, null, null, null, deadlineId));

    private static UpdateOccurrenceRequest Resend(OccurrenceDto o, Guid? deadlineId = null, bool clear = false) =>
        new(o.Title, o.StartAt, o.EndAt, o.IsAllDay, o.IsPlanned, null, null, deadlineId, clear);

    [Fact]
    public async Task CreateAsync_links_session_to_pending_event()
    {
        var userId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId);
        var deadline = await CreateDeadlineAsync(userId);

        var result = await CreateSessionAsync(userId, activityId, deadline.Id);

        Assert.True(result.IsSuccess);
        Assert.Equal(deadline.Id, result.Value!.DeadlineOccurrenceId);
        Assert.Equal("Lab 3 report", result.Value.Deadline!.EffectiveTitle);
    }

    [Fact]
    public async Task CreateAsync_rejects_a_non_event_target()
    {
        var userId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId);
        var other = (await CreateSessionAsync(userId, activityId, null)).Value!;

        var result = await CreateSessionAsync(userId, activityId, other.Id);

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorType.Validation, result.Error!.Type);
    }

    [Fact]
    public async Task CreateAsync_rejects_a_done_target()
    {
        var userId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId);
        var deadline = await CreateDeadlineAsync(userId);
        await _ctx.OccurrenceService.SetStatusAsync(deadline.Id, userId, Loom.Core.Enums.EventStatus.done);

        var result = await CreateSessionAsync(userId, activityId, deadline.Id);

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorType.Validation, result.Error!.Type);
    }

    [Fact]
    public async Task CreateAsync_rejects_another_users_deadline()
    {
        var mine = await CreateUserAsync();
        var theirs = await CreateUserAsync();
        var activityId = await CreateActivityAsync(mine);
        var deadline = await CreateDeadlineAsync(theirs);

        var result = await CreateSessionAsync(mine, activityId, deadline.Id);

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorType.NotFound, result.Error!.Type);
    }

    [Fact]
    public async Task UpdateAsync_without_link_fields_keeps_the_link()
    {
        var userId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId);
        var deadline = await CreateDeadlineAsync(userId);
        var session = (await CreateSessionAsync(userId, activityId, deadline.Id)).Value!;

        var result = await _ctx.OccurrenceService.UpdateAsync(session.Id, userId, Resend(session));

        Assert.True(result.IsSuccess);
        Assert.Equal(deadline.Id, result.Value!.DeadlineOccurrenceId);
    }

    [Fact]
    public async Task UpdateAsync_clear_removes_the_link()
    {
        var userId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId);
        var deadline = await CreateDeadlineAsync(userId);
        var session = (await CreateSessionAsync(userId, activityId, deadline.Id)).Value!;

        var result = await _ctx.OccurrenceService.UpdateAsync(session.Id, userId, Resend(session, clear: true));

        Assert.True(result.IsSuccess);
        Assert.Null(result.Value!.DeadlineOccurrenceId);
        Assert.Null(result.Value.Deadline);
    }

    [Fact]
    public async Task UpdateAsync_keeps_an_existing_link_after_the_deadline_is_done()
    {
        var userId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId);
        var deadline = await CreateDeadlineAsync(userId);
        var session = (await CreateSessionAsync(userId, activityId, deadline.Id)).Value!;
        await _ctx.OccurrenceService.SetStatusAsync(deadline.Id, userId, Loom.Core.Enums.EventStatus.done);

        var result = await _ctx.OccurrenceService.UpdateAsync(session.Id, userId, Resend(session, deadline.Id));

        Assert.True(result.IsSuccess);
        Assert.Equal(deadline.Id, result.Value!.DeadlineOccurrenceId);
    }

    [Fact]
    public async Task UpdateEventAsync_allows_a_deadline_to_link_to_another_deadline()
    {
        var userId = await CreateUserAsync();
        var final = await CreateDeadlineAsync(userId, "Final project");
        var draft = await CreateDeadlineAsync(userId, "Draft", final.Id);

        Assert.Equal(final.Id, draft.DeadlineOccurrenceId);
    }

    [Fact]
    public async Task UpdateEventAsync_rejects_self_link()
    {
        var userId = await CreateUserAsync();
        var deadline = await CreateDeadlineAsync(userId);

        var result = await _ctx.OccurrenceService.UpdateEventAsync(deadline.Id, userId,
            new UpdateEventRequest(deadline.EffectiveTitle, null, null, null, deadline.EndAt, false, false, null, deadline.Id));

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorType.Validation, result.Error!.Type);
    }

    [Fact]
    public async Task UpdateEventAsync_rejects_a_loop()
    {
        var userId = await CreateUserAsync();
        var a = await CreateDeadlineAsync(userId, "A");
        var b = await CreateDeadlineAsync(userId, "B", a.Id);

        var result = await _ctx.OccurrenceService.UpdateEventAsync(a.Id, userId,
            new UpdateEventRequest("A", null, null, null, a.EndAt, false, false, null, b.Id));

        Assert.False(result.IsSuccess);
        Assert.Equal(ErrorType.Validation, result.Error!.Type);
    }

    [Fact]
    public async Task ListAsync_sums_done_linked_sessions_on_the_deadline()
    {
        var userId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId);
        var deadline = await CreateDeadlineAsync(userId);
        var t = DateTimeOffset.UtcNow.AddDays(-1);

        var doneA = (await CreateSessionAsync(userId, activityId, deadline.Id, t, t.AddMinutes(90))).Value!;
        var doneB = (await CreateSessionAsync(userId, activityId, deadline.Id, t, t.AddMinutes(30))).Value!;
        await CreateSessionAsync(userId, activityId, deadline.Id, t, t.AddMinutes(60));
        await _ctx.OccurrenceService.SetStatusAsync(doneA.Id, userId, Loom.Core.Enums.EventStatus.done);
        await _ctx.OccurrenceService.SetStatusAsync(doneB.Id, userId, Loom.Core.Enums.EventStatus.done);

        var list = await _ctx.OccurrenceService.ListAsync(userId);

        var row = list.Single(o => o.Id == deadline.Id);
        Assert.Equal(2, row.LinkedDoneCount);
        Assert.Equal(120, row.LinkedDoneMinutes);
    }

    [Fact]
    public async Task DeleteAsync_on_the_deadline_clears_the_sessions_link()
    {
        var userId = await CreateUserAsync();
        var activityId = await CreateActivityAsync(userId);
        var deadline = await CreateDeadlineAsync(userId);
        var session = (await CreateSessionAsync(userId, activityId, deadline.Id)).Value!;

        var deleted = await _ctx.OccurrenceService.DeleteAsync(deadline.Id, userId);

        Assert.True(deleted.IsSuccess);
        var after = (await _ctx.OccurrenceService.GetAsync(session.Id, userId)).Value!;
        Assert.Null(after.DeadlineOccurrenceId);
        Assert.Single(await _ctx.Db.Occurrences.ToListAsync());
    }
}
