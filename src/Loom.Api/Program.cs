using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Loom.Api.Auth;
using Loom.Api.Endpoints;
using Loom.Core;
using Loom.Core.Auth;
using System.IdentityModel.Tokens.Jwt;
using System.Text;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using System.Text.Json.Serialization;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddLoomCore(builder.Configuration);

builder.Services.ConfigureHttpJsonOptions(o =>
    o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));

builder.Services.Configure<RefreshCookieOptions>(builder.Configuration.GetSection("Auth:RefreshCookie"));
builder.Services.AddScoped<RefreshCookieManager>();

// Keep JWT claim types verbatim ("sub") instead of legacy SOAP URI mappings.
JwtSecurityTokenHandler.DefaultMapInboundClaims = false;
var jwt = builder.Configuration.GetSection(JwtOptions.SectionName).Get<JwtOptions>() ?? new JwtOptions();
if (jwt.Validate() is { } jwtProblem)
    throw new InvalidOperationException(jwtProblem);

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwt.Issuer,
            ValidateAudience = true,
            ValidAudience = jwt.Audience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Secret)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30),
            NameClaimType = "username",
        };
    });

builder.Services.AddAuthorization();

var corsOrigins = (builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? [])
    .Where(o => !string.IsNullOrWhiteSpace(o)).ToArray();
if (corsOrigins.Length > 0)
{
    builder.Services.AddCors(options =>
        options.AddDefaultPolicy(policy =>
            policy.WithOrigins(corsOrigins)
                  .AllowAnyHeader()
                  .AllowAnyMethod()
                  .AllowCredentials()));
}

// Login and register are the only endpoints that take a guessable secret, so they get a per-IP
// budget. Behind a reverse proxy the IP is only right if forwarded headers are enabled (see README).
var authPermits = builder.Configuration.GetValue("RateLimit:Auth:PermitLimit", 10);
var authWindow = TimeSpan.FromSeconds(builder.Configuration.GetValue("RateLimit:Auth:WindowSeconds", 60));
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy(AuthEndpoints.RateLimitPolicy, ctx =>
        RateLimitPartition.GetFixedWindowLimiter(
            ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = authPermits,
                Window = authWindow,
                QueueLimit = 0,
            }));
    options.OnRejected = async (ctx, ct) =>
    {
        if (ctx.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
            ctx.HttpContext.Response.Headers.RetryAfter = ((int)Math.Ceiling(retryAfter.TotalSeconds)).ToString();
        await Results.Problem(
            title: "Too many attempts. Try again shortly.",
            statusCode: StatusCodes.Status429TooManyRequests).ExecuteAsync(ctx.HttpContext);
    };
});

var app = builder.Build();

if (builder.Configuration.GetValue<bool>("Database:MigrateOnStartup"))
    app.Services.MigrateDatabase();

// ASPNETCORE_FORWARDEDHEADERS_ENABLED=true makes the host add UseForwardedHeaders itself, before this
// pipeline, so scheme and client IP are correct behind a proxy. HSTS only applies to HTTPS requests.
if (!app.Environment.IsDevelopment())
    app.UseHsts();

app.Use(async (ctx, next) =>
{
    var headers = ctx.Response.Headers;
    headers["X-Content-Type-Options"] = "nosniff";
    headers["X-Frame-Options"] = "DENY";
    headers["Referrer-Policy"] = "no-referrer";
    headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
    // The client loads nothing cross-origin. Styles stay 'unsafe-inline' because components set
    // colours through inline style attributes. Vite's dev server needs looser rules, so dev is exempt.
    if (!app.Environment.IsDevelopment())
        headers["Content-Security-Policy"] =
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
            "font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; " +
            "form-action 'self'; frame-ancestors 'none'";
    await next();
});

app.UseDefaultFiles();
app.UseStaticFiles();
if (corsOrigins.Length > 0)
    app.UseCors();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" })).AllowAnonymous();
app.MapAuthEndpoints();
app.MapGoalEndpoints();
app.MapActivityEndpoints();
app.MapOccurrenceEndpoints();
app.MapCheckpointEndpoints();
app.MapSettingsEndpoints();
app.MapCategoryEndpoints();
app.MapInsightsEndpoints();
app.MapExportEndpoints();

app.MapFallbackToFile("index.html");

app.Run();

public partial class Program;
