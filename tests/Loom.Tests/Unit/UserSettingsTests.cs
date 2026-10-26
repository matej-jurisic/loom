using Loom.Core.Common;
using Loom.Core.Dtos;
using Loom.Core.Entities;
using Loom.Core.Enums;

namespace Loom.Tests.Unit;

public class UserSettingsTests : IDisposable
{
    private readonly TestContext _ctx = new();

    public void Dispose() => _ctx.Dispose();

    [Fact]
    public async Task UpdateAsync_without_calendar_colour_keeps_the_stored_one()
    {
        var user = new User { Username = "u", PasswordHash = "x", Timezone = "UTC" };
        _ctx.Db.Users.Add(user);
        await _ctx.Db.SaveChangesAsync();

        await _ctx.UserSettingsService.UpdateAsync(user.Id, new UpdateUserSettingsRequest(3, "00:00", "UTC", CalendarColorBy.goal));
        var result = await _ctx.UserSettingsService.UpdateAsync(user.Id, new UpdateUserSettingsRequest(4, "00:00", "UTC"));

        Assert.Equal("goal", result.Value!.CalendarColorBy);
        Assert.Equal(4, result.Value.MaxFocusGoals);
    }

    [Fact]
    public async Task UpdateAsync_deadline_horizon_is_kept_when_absent_and_cleared_by_null()
    {
        var user = new User { Username = "u", PasswordHash = "x", Timezone = "UTC" };
        _ctx.Db.Users.Add(user);
        await _ctx.Db.SaveChangesAsync();

        var set = await _ctx.UserSettingsService.UpdateAsync(user.Id, new UpdateUserSettingsRequest(
            3, "00:00", "UTC", DeadlineHorizonDays: new Optional<int?>(true, 14)));
        Assert.Equal(14, set.Value!.DeadlineHorizonDays);

        var kept = await _ctx.UserSettingsService.UpdateAsync(user.Id, new UpdateUserSettingsRequest(3, "00:00", "UTC"));
        Assert.Equal(14, kept.Value!.DeadlineHorizonDays);

        var cleared = await _ctx.UserSettingsService.UpdateAsync(user.Id, new UpdateUserSettingsRequest(
            3, "00:00", "UTC", DeadlineHorizonDays: new Optional<int?>(true, null)));
        Assert.Null(cleared.Value!.DeadlineHorizonDays);
    }

    [Fact]
    public async Task UpdateAsync_rejects_a_deadline_horizon_out_of_range()
    {
        var user = new User { Username = "u", PasswordHash = "x", Timezone = "UTC" };
        _ctx.Db.Users.Add(user);
        await _ctx.Db.SaveChangesAsync();

        var result = await _ctx.UserSettingsService.UpdateAsync(user.Id, new UpdateUserSettingsRequest(
            3, "00:00", "UTC", DeadlineHorizonDays: new Optional<int?>(true, 366)));

        Assert.Equal(ErrorType.Validation, result.Error!.Type);
    }
}
