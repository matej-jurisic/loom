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
}
