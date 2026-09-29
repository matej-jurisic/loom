using Microsoft.EntityFrameworkCore;
using Loom.Core.Auth;
using Xunit;

namespace Loom.Tests.Unit;

public class RefreshTokenTests : IDisposable
{
    private readonly TestContext _ctx = new();

    private async Task<string> RegisterAsync(string username = "alice")
    {
        var result = await _ctx.AuthService.RegisterAsync(username, "password123", "UTC");
        Assert.True(result.IsSuccess);
        return result.Value!.RefreshToken;
    }

    [Fact]
    public async Task Refresh_RotatesTheToken()
    {
        var first = await RegisterAsync();

        var refreshed = await _ctx.AuthService.RefreshAsync(first);

        Assert.True(refreshed.IsSuccess);
        Assert.NotEqual(first, refreshed.Value!.RefreshToken);
        Assert.NotEmpty(refreshed.Value.AccessToken);
    }

    [Fact]
    public async Task Refresh_RevokesTheOldRowAndLinksItToItsReplacement()
    {
        var first = await RegisterAsync();
        var refreshed = await _ctx.AuthService.RefreshAsync(first);

        var old = await _ctx.Db.RefreshTokens.SingleAsync(t => t.TokenHash == TokenService.HashRefreshToken(first));
        var replacement = await _ctx.Db.RefreshTokens.SingleAsync(t => t.TokenHash == TokenService.HashRefreshToken(refreshed.Value!.RefreshToken));

        Assert.NotNull(old.RevokedAt);
        Assert.Equal(replacement.Id, old.ReplacedByTokenId);
        Assert.Null(replacement.RevokedAt);
    }

    [Fact]
    public async Task Refresh_ReusingAnOldToken_IsRejected()
    {
        var first = await RegisterAsync();
        await _ctx.AuthService.RefreshAsync(first);

        var reuse = await _ctx.AuthService.RefreshAsync(first);

        Assert.False(reuse.IsSuccess);
        Assert.Equal(Loom.Core.Common.ErrorType.Unauthorized, reuse.Error!.Type);
    }

    [Fact]
    public async Task Refresh_NewTokenKeepsWorking_AcrossAChain()
    {
        var token = await RegisterAsync();
        for (var i = 0; i < 3; i++)
        {
            var next = await _ctx.AuthService.RefreshAsync(token);
            Assert.True(next.IsSuccess);
            token = next.Value!.RefreshToken;
        }
    }

    [Fact]
    public async Task Refresh_ExpiredToken_IsRejected()
    {
        var raw = await RegisterAsync();
        var row = await _ctx.Db.RefreshTokens.SingleAsync();
        row.ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(-1);
        await _ctx.Db.SaveChangesAsync();

        var result = await _ctx.AuthService.RefreshAsync(raw);

        Assert.False(result.IsSuccess);
    }

    [Fact]
    public async Task Refresh_UnknownToken_IsRejected()
    {
        var result = await _ctx.AuthService.RefreshAsync("not-a-real-token");

        Assert.False(result.IsSuccess);
        Assert.Equal(Loom.Core.Common.ErrorType.Unauthorized, result.Error!.Type);
    }

    [Fact]
    public async Task Refresh_StoresOnlyAHashOfTheToken()
    {
        var raw = await RegisterAsync();

        var row = await _ctx.Db.RefreshTokens.SingleAsync();

        Assert.NotEqual(raw, row.TokenHash);
        Assert.Equal(TokenService.HashRefreshToken(raw), row.TokenHash);
    }

    [Fact]
    public async Task Refresh_ReturnsTheSameUserAsLogin()
    {
        var raw = await RegisterAsync("carol");

        var refreshed = await _ctx.AuthService.RefreshAsync(raw);

        Assert.Equal("carol", refreshed.Value!.User.Username);
    }

    [Fact]
    public async Task Logout_RevokesTheToken()
    {
        var raw = await RegisterAsync();

        var logout = await _ctx.AuthService.LogoutAsync(raw);
        var refresh = await _ctx.AuthService.RefreshAsync(raw);

        Assert.True(logout.IsSuccess);
        Assert.False(refresh.IsSuccess);
    }

    [Fact]
    public async Task Logout_Twice_ReportsNotFound()
    {
        var raw = await RegisterAsync();
        await _ctx.AuthService.LogoutAsync(raw);

        var second = await _ctx.AuthService.LogoutAsync(raw);

        Assert.False(second.IsSuccess);
        Assert.Equal(Loom.Core.Common.ErrorType.NotFound, second.Error!.Type);
    }

    [Fact]
    public async Task Logout_OnlyEndsThatSession()
    {
        var first = await RegisterAsync();
        var second = (await _ctx.AuthService.LoginAsync("alice", "password123")).Value!.RefreshToken;

        await _ctx.AuthService.LogoutAsync(first);

        Assert.True((await _ctx.AuthService.RefreshAsync(second)).IsSuccess);
    }

    public void Dispose() => _ctx.Dispose();
}

public class JwtOptionsTests
{
    [Fact]
    public void Validate_EmptySecret_NamesTheSetting()
    {
        var msg = new JwtOptions().Validate();
        Assert.NotNull(msg);
        Assert.Contains("Jwt:Secret is not set", msg);
        Assert.Contains("Jwt__Secret", msg);
    }

    [Fact]
    public void Validate_ShortSecret_IsRejected() =>
        Assert.Contains("too short", new JwtOptions { Secret = new string('x', 31) }.Validate());

    [Fact]
    public void Validate_CountsBytesNotCharacters() =>
        // 16 two-byte characters = 32 bytes, which is enough.
        Assert.Null(new JwtOptions { Secret = new string('é', 16) }.Validate());

    [Fact]
    public void Validate_ThirtyTwoByteSecret_IsAccepted() =>
        Assert.Null(new JwtOptions { Secret = new string('x', 32) }.Validate());

    [Theory]
    [InlineData(0, 180)]
    [InlineData(15, 0)]
    public void Validate_NonPositiveLifetimes_AreRejected(int accessMinutes, int refreshDays) =>
        Assert.NotNull(new JwtOptions { Secret = new string('x', 32), AccessTokenMinutes = accessMinutes, RefreshTokenDays = refreshDays }.Validate());
}
