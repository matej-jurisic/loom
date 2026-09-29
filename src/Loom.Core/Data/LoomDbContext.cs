using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Loom.Core.Entities;
using Loom.Core.Enums;

namespace Loom.Core.Data;

public class LoomDbContext(DbContextOptions<LoomDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<Occurrence> Occurrences => Set<Occurrence>();
    public DbSet<Activity> Activities => Set<Activity>();
    public DbSet<Goal> Goals => Set<Goal>();
    public DbSet<Checkpoint> Checkpoints => Set<Checkpoint>();
    public DbSet<UserSettings> UserSettings => Set<UserSettings>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<ActivitySubtask> ActivitySubtasks => Set<ActivitySubtask>();
    public DbSet<OccurrenceSubtask> OccurrenceSubtasks => Set<OccurrenceSubtask>();
    public DbSet<ActivityRecurrence> ActivityRecurrences => Set<ActivityRecurrence>();
    public DbSet<RecurrenceExclusion> RecurrenceExclusions => Set<RecurrenceExclusion>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<RefreshToken>()
            .Ignore(rt => rt.IsActive);

        modelBuilder.Entity<Occurrence>()
            .Property(o => o.Status)
            .HasConversion<string>();

        modelBuilder.Entity<Occurrence>()
            .HasOne(o => o.Activity)
            .WithMany()
            .HasForeignKey(o => o.ActivityId)
            .OnDelete(DeleteBehavior.Cascade);

        // Every occurrence read filters by UserId (often together with Status); UserId is a bare
        // Guid with no relationship, so EF would not index it otherwise. Occurrences are the
        // highest-volume table, so this is the index that matters most.
        modelBuilder.Entity<Occurrence>()
            .HasIndex(o => new { o.UserId, o.Status });

        modelBuilder.Entity<Occurrence>()
            .HasIndex(o => new { o.ActivityId, o.SeriesDate })
            .IsUnique();

        modelBuilder.Entity<Activity>()
            .Property(a => a.Kind)
            .HasConversion<string>();

        modelBuilder.Entity<ActivityRecurrence>()
            .Property(r => r.Frequency)
            .HasConversion<string>();

        modelBuilder.Entity<ActivityRecurrence>()
            .HasOne(r => r.Activity)
            .WithOne(a => a.Recurrence)
            .HasForeignKey<ActivityRecurrence>(r => r.ActivityId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<ActivityRecurrence>()
            .HasIndex(r => r.ActivityId)
            .IsUnique();

        modelBuilder.Entity<RecurrenceExclusion>()
            .HasOne(e => e.Activity)
            .WithMany()
            .HasForeignKey(e => e.ActivityId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<RecurrenceExclusion>()
            .HasIndex(e => new { e.ActivityId, e.SeriesDate })
            .IsUnique();

        modelBuilder.Entity<Activity>()
            .HasOne(a => a.Category)
            .WithMany()
            .HasForeignKey(a => a.CategoryId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<Activity>()
            .HasOne(a => a.Goal)
            .WithMany()
            .HasForeignKey(a => a.GoalId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<Goal>()
            .HasIndex(g => g.UserId);

        modelBuilder.Entity<Goal>()
            .Property(g => g.Status)
            .HasConversion<string>();

        modelBuilder.Entity<Goal>()
            .Property(g => g.Kind)
            .HasConversion<string>();

        modelBuilder.Entity<Checkpoint>()
            .Property(c => c.Status)
            .HasConversion<string>();

        modelBuilder.Entity<Checkpoint>()
            .Property(c => c.Size)
            .HasConversion<string>();

        modelBuilder.Entity<UserSettings>()
            .HasKey(us => us.UserId);

        modelBuilder.Entity<UserSettings>()
            .HasOne(us => us.User)
            .WithOne()
            .HasForeignKey<UserSettings>(us => us.UserId);

        modelBuilder.Entity<UserSettings>()
            .Property(us => us.DayBoundaryTime)
            .HasConversion(
                v => v.ToString("HH:mm:ss"),
                v => TimeOnly.ParseExact(v, "HH:mm:ss"));


        modelBuilder.Entity<Checkpoint>()
            .HasOne(c => c.Goal)
            .WithMany(g => g.Checkpoints)
            .HasForeignKey(c => c.GoalId);

        modelBuilder.Entity<ActivitySubtask>()
            .HasOne(s => s.Activity)
            .WithMany(a => a.Subtasks)
            .HasForeignKey(s => s.ActivityId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<OccurrenceSubtask>()
            .HasOne(s => s.Occurrence)
            .WithMany(o => o.Subtasks)
            .HasForeignKey(s => s.OccurrenceId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public class LoomDbContextFactory : IDesignTimeDbContextFactory<LoomDbContext>
{
    public LoomDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<LoomDbContext>()
            .UseSqlite("Data Source=loom-design.db")
            .Options;
        return new LoomDbContext(options);
    }
}
