namespace Loom.Core.Auth;

public sealed class JwtOptions
{
    public const string SectionName = "Jwt";

    public string Secret { get; set; } = string.Empty;
    public string Issuer { get; set; } = "loom";
    public string Audience { get; set; } = "loom";
    public int AccessTokenMinutes { get; set; } = 15;
    public int RefreshTokenDays { get; set; } = 180;

    public const int MinSecretBytes = 32;

    /// <summary>A message describing what is wrong with the configuration, or null when it is usable.</summary>
    public string? Validate()
    {
        if (string.IsNullOrWhiteSpace(Secret))
            return "Jwt:Secret is not set. Set the Jwt__Secret environment variable (JWT_SECRET in .env for Docker) " +
                   $"to a random string of at least {MinSecretBytes} bytes, e.g. `openssl rand -base64 48`.";
        if (System.Text.Encoding.UTF8.GetByteCount(Secret) < MinSecretBytes)
            return $"Jwt:Secret is too short: it must be at least {MinSecretBytes} bytes.";
        if (AccessTokenMinutes <= 0) return "Jwt:AccessTokenMinutes must be positive.";
        if (RefreshTokenDays <= 0) return "Jwt:RefreshTokenDays must be positive.";
        return null;
    }
}
