using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Loom.Core.Auth;
using Loom.Core.Data;
using Loom.Core.Services;

namespace Loom.Core;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddLoomCore(this IServiceCollection services, IConfiguration config)
    {
        services.AddDbContext<LoomDbContext>(options =>
            options.UseSqlite(config.GetConnectionString("Default") ?? "Data Source=loom.db"));

        services.Configure<JwtOptions>(config.GetSection(JwtOptions.SectionName));

        services.AddSingleton<TokenService>();
        services.AddScoped<PasswordHasher>();
        services.AddScoped<AuthService>();
        services.AddScoped<UserSettingsService>();
        services.AddScoped<GoalService>();
        services.AddScoped<ActivityService>();
        services.AddScoped<ActivitySubtaskService>();
        services.AddScoped<OccurrenceService>();
        services.AddScoped<CheckpointService>();
        services.AddScoped<CategoryService>();
        services.AddScoped<InsightsService>();
        services.AddScoped<ExportService>();

        return services;
    }

    public static void MigrateDatabase(this IServiceProvider services)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<LoomDbContext>();
        db.Database.Migrate();
    }
}
