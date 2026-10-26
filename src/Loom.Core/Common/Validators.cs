namespace Loom.Core.Common;

public static class Validators
{
    public static Error? ValidateTitle(string? title, string fieldName = "Title")
    {
        if (string.IsNullOrWhiteSpace(title))
            return new Error(ErrorType.Validation, $"{fieldName} is required.");
        if (title.Length > 255)
            return new Error(ErrorType.Validation, $"{fieldName} cannot exceed 255 characters.");
        return null;
    }

    public const int MaxNotesLength = 4000;

    public static Error? ValidateNotes(string? notes) =>
        notes is { Length: > MaxNotesLength }
            ? new Error(ErrorType.Validation, $"Notes cannot exceed {MaxNotesLength} characters.")
            : null;

    public const int MaxShortLabelLength = 12;

    public static Error? ValidateShortLabel(string? label) =>
        label?.Trim() is { Length: > MaxShortLabelLength }
            ? new Error(ErrorType.Validation, $"Short label cannot exceed {MaxShortLabelLength} characters.")
            : null;

    /// <summary>Trimmed label, or null when blank.</summary>
    public static string? NormalizeShortLabel(string? label) =>
        string.IsNullOrWhiteSpace(label) ? null : label.Trim();

    public const int MaxRepeatAfterDays = 365;

    public static Error? ValidateRepeatAfterDays(int? days) =>
        days is < 1 or > MaxRepeatAfterDays
            ? new Error(ErrorType.Validation, $"Repeat interval must be between 1 and {MaxRepeatAfterDays} days.")
            : null;

    public static Error? ValidateReminders(List<int>? minutes)
    {
        if (minutes is null) return null;
        if (minutes.Distinct().Count() > ReminderMath.MaxReminders)
            return new Error(ErrorType.Validation, $"An occurrence can have at most {ReminderMath.MaxReminders} reminders.");
        return minutes.Any(m => m is < 0 or > ReminderMath.MaxOffsetMinutes)
            ? new Error(ErrorType.Validation, "A reminder must be between 0 minutes and 30 days before.")
            : null;
    }

    public static Error? ValidateColor(string? color)
    {
        if (string.IsNullOrWhiteSpace(color))
            return new Error(ErrorType.Validation, "Color is required.");
        if (!System.Text.RegularExpressions.Regex.IsMatch(color, @"^#[0-9A-Fa-f]{6}$"))
            return new Error(ErrorType.Validation, "Color must be a 6-digit hex value (e.g. #3b82f6).");
        return null;
    }

    public static Error? ValidateTimezone(string? timezoneId)
    {
        if (string.IsNullOrWhiteSpace(timezoneId))
            return new Error(ErrorType.Validation, "Timezone is required.");
        try
        {
            _ = TimeZoneInfo.FindSystemTimeZoneById(timezoneId);
            return null;
        }
        catch (Exception e) when (e is TimeZoneNotFoundException or InvalidTimeZoneException)
        {
            return new Error(ErrorType.Validation, "Unknown timezone.");
        }
    }

    public static Error? ValidateDateRange(DateTimeOffset? startAt, DateTimeOffset? endAt)
    {
        if (startAt.HasValue && endAt.HasValue && endAt <= startAt)
            return new Error(ErrorType.Validation, "End time must be after start time.");
        return null;
    }
}
