namespace KiNorge.Cms.CachePurge.Cloudflare;

/// <summary>
/// Bundet til config-seksjonen "Cloudflare". ZoneId + ApiToken injiseres i cloud via Azure
/// Key Vault (Cloudflare--ZoneId / Cloudflare--ApiToken). SiteBaseUrl settes per miljø som
/// env-var i syncroot. Når ApiToken eller ZoneId er tom no-op-er purge rent (se
/// CloudflareCachePurgeService), så koden er trygg å deploye før secreten finnes.
/// </summary>
public class CloudflareOptions
{
    public bool Enabled { get; set; } = true;

    /// <summary>norge.no-sonens Zone ID. Ikke hemmelig, men hentes fra Key Vault for enkelhet.</summary>
    public string ZoneId { get; set; } = "";

    /// <summary>API-token med kun "Zone.Cache Purge" på norge.no-sonen. Hemmelig (Key Vault).</summary>
    public string ApiToken { get; set; } = "";

    public string ApiHost { get; set; } = "api.cloudflare.com";

    /// <summary>Offentlig frontend-URL for dette miljøet, f.eks. https://ki.norge.no (prod).</summary>
    public string SiteBaseUrl { get; set; } = "";

    /// <summary>Cloudflare tar maks 30 URLer per purge-kall utenfor Enterprise.</summary>
    public int MaxUrlsPerRequest { get; set; } = 30;

    public int TimeoutSeconds { get; set; } = 5;

    /// <summary>Flere påvirkede URLer enn dette eskalerer til purge_everything (masse-publisering).</summary>
    public int AffectedUrlThreshold { get; set; } = 30;
}
