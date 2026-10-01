namespace Loom.Core.Common;

public static class TimeSplitMath
{
    public static int DurationMinutes(DateTimeOffset? startAt, DateTimeOffset? endAt) =>
        startAt.HasValue && endAt.HasValue
            ? Math.Max(0, (int)(endAt.Value - startAt.Value).TotalMinutes)
            : 0;

    public static int[] Resolve(int durationMinutes, IReadOnlyList<int?> minutes)
    {
        var pinned = minutes.Sum(m => m ?? 0);
        var autoCount = minutes.Count(m => m is null);
        var pool = Math.Max(0, durationMinutes - pinned);
        var share = autoCount == 0 ? 0 : pool / autoCount;
        var extra = autoCount == 0 ? 0 : pool % autoCount;

        var resolved = new int[minutes.Count];
        for (var i = 0; i < minutes.Count; i++)
        {
            if (minutes[i] is { } m)
            {
                resolved[i] = m;
                continue;
            }
            resolved[i] = share + (extra > 0 ? 1 : 0);
            if (extra > 0) extra--;
        }
        return resolved;
    }
}
