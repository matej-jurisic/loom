using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Loom.Core.Auth;
using Loom.Core.Data;
using Loom.Core.Services;

namespace Loom.Tests.Unit;

public class TestContext : IDisposable
{
    private readonly SqliteConnection _connection;
    public LoomDbContext Db { get; }
    public AuthService AuthService { get; }
    public GoalService GoalService { get; }
    public ActivityService ActivityService { get; }
    public OccurrenceService OccurrenceService { get; }
    public CheckpointService CheckpointService { get; }
    public UserSettingsService UserSettingsService { get; }
    public InsightsService InsightsService { get; }

    public TestContext()
    {
        _connection = new SqliteConnection("Data Source=:memory:");
        _connection.Open();

        var options = new DbContextOptionsBuilder<LoomDbContext>()
            .UseSqlite(_connection)
            .Options;

        Db = new LoomDbContext(options);
        Db.Database.EnsureCreated();

        var jwtOpts = Microsoft.Extensions.Options.Options.Create(new JwtOptions
        {
            Secret = "test-secret-key-that-is-long-enough-32chars",
            Issuer = "loom-test",
            Audience = "loom-test",
        });

        var tokens = new TokenService(jwtOpts);
        var hasher = new PasswordHasher();
        AuthService = new AuthService(Db, tokens, hasher);
        UserSettingsService = new UserSettingsService(Db);
        GoalService = new GoalService(Db, UserSettingsService);
        ActivityService = new ActivityService(Db);
        OccurrenceService = new OccurrenceService(Db, UserSettingsService);
        CheckpointService = new CheckpointService(Db);
        InsightsService = new InsightsService(Db, UserSettingsService);
    }

    public void Dispose()
    {
        Db.Dispose();
        _connection.Dispose();
    }
}
