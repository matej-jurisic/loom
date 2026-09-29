using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Xunit;

namespace Loom.Tests.Integration;

public class HardeningTests
{
    private sealed class TightLimitFactory : LoomApiFactory
    {
        protected override int AuthPermitLimit => 3;
    }

    private sealed class ShortSecretFactory : LoomApiFactory
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            builder.UseSetting("Jwt:Secret", "too-short");
        }
    }

    [Fact]
    public async Task Login_ExceedingAttemptBudget_Returns429()
    {
        using var factory = new TightLimitFactory();
        var client = factory.CreateClient();

        var statuses = new List<HttpStatusCode>();
        for (var i = 0; i < 5; i++)
        {
            var res = await client.PostAsJsonAsync("/api/auth/login", new { username = "nobody", password = "wrongpassword" });
            statuses.Add(res.StatusCode);
        }

        Assert.Equal(3, statuses.Count(s => s == HttpStatusCode.Unauthorized));
        Assert.Equal(2, statuses.Count(s => s == HttpStatusCode.TooManyRequests));
    }

    [Fact]
    public async Task Register_ExceedingAttemptBudget_Returns429WithRetryAfter()
    {
        using var factory = new TightLimitFactory();
        var client = factory.CreateClient();

        HttpResponseMessage? last = null;
        for (var i = 0; i < 4; i++)
            last = await client.PostAsJsonAsync("/api/auth/register", new { username = "u", password = "x", timezone = "UTC" });

        Assert.Equal(HttpStatusCode.TooManyRequests, last!.StatusCode);
        Assert.True(last.Headers.Contains("Retry-After"));
    }

    [Fact]
    public async Task Refresh_IsNotRateLimitedLikeLogin()
    {
        using var factory = new TightLimitFactory();
        var client = factory.CreateClient();

        for (var i = 0; i < 6; i++)
        {
            var res = await client.PostAsync("/api/auth/refresh", null);
            Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
        }
    }

    [Fact]
    public async Task Responses_CarrySecurityHeaders()
    {
        using var factory = new LoomApiFactory();
        var res = await factory.CreateClient().GetAsync("/api/health");

        Assert.Equal("nosniff", res.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.Equal("DENY", res.Headers.GetValues("X-Frame-Options").Single());
        Assert.Equal("no-referrer", res.Headers.GetValues("Referrer-Policy").Single());
    }

    [Fact]
    public void Startup_WithShortJwtSecret_FailsWithClearMessage()
    {
        using var factory = new ShortSecretFactory();

        var ex = Record.Exception(() => factory.CreateClient());

        Assert.NotNull(ex);
        Assert.Contains("Jwt:Secret is too short", ex!.ToString());
    }
}
