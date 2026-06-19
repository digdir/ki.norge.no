namespace KiNorge.Cms.CachePurge.Cloudflare;

public class CloudflareOptions
{
    public bool Enabled { get; set; } = true;
    public string ZoneId { get; set; } = "";
    public string ApiToken { get; set; } = "";
    public string ApiHost { get; set; } = "api.cloudflare.com";
    public string SiteBaseUrl { get; set; } = "";
    public int MaxUrlsPerRequest { get; set; } = 30;
    public int TimeoutSeconds { get; set; } = 5;
    public int AffectedUrlThreshold { get; set; } = 30;
}
