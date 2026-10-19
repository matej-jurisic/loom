using Loom.Core.Enums;

namespace Loom.Core.Entities;

public class UserSettings
{
    public Guid UserId { get; set; }
    public int MaxFocusGoals { get; set; } = 3;
    public TimeOnly DayBoundaryTime { get; set; } = TimeOnly.MinValue;
    public CalendarColorBy CalendarColorBy { get; set; } = CalendarColorBy.category;
    public User User { get; set; } = null!;
}
