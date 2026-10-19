using Loom.Core.Common;
using Loom.Core.Dtos;
using Loom.Core.Entities;
using Xunit;

namespace Loom.Tests.Unit;

public class ShowAsOverdueTests
{
    private static OccurrenceDto Dto(bool showAsOverdue)
    {
        var activity = new Activity { Title = "Water plants", ShowAsOverdue = showAsOverdue };
        var occurrence = new Occurrence
        {
            Activity = activity,
            ActivityId = activity.Id,
            StartAt = DateTimeOffset.Parse("2026-06-01T09:00:00Z"),
        };
        var ctx = new DayContext(TimeZoneInfo.Utc, TimeOnly.Parse("00:00"));
        return OccurrenceDto.FromEntity(occurrence, ctx, DateTimeOffset.Parse("2026-06-05T09:00:00Z"));
    }

    [Fact]
    public void FromEntity_late_occurrence_is_overdue_and_behind_by_default()
    {
        var dto = Dto(showAsOverdue: true);

        Assert.True(dto.IsOverdue);
        Assert.True(dto.IsBehind);
    }

    [Fact]
    public void FromEntity_late_occurrence_of_an_activity_with_show_as_overdue_off_is_neither()
    {
        var dto = Dto(showAsOverdue: false);

        Assert.False(dto.IsOverdue);
        Assert.False(dto.IsBehind);
    }
}
