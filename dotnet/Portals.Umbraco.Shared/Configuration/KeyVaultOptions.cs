namespace Portals.Shared.Configuration;

public class KeyVaultOptions
{
    public const string SectionName = "KeyVault";
    public const string AkvUriKey = $"{SectionName}:{nameof(AkvUri)}";

    public string? AkvUri { get; set; }

    public bool? Enabled { get; set; }
}
