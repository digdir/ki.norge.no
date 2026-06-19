namespace KiNorge.Cms.CachePurge.Cloudflare;

public record CloudflarePurgeProbe(bool Configured, int? HttpStatus, bool Ok, string? Detail);

public interface ICloudflareCachePurgeService
{
    Task PurgeUrlsAsync(IReadOnlyCollection<string> absoluteUrls, CancellationToken ct = default);
    Task PurgeEverythingAsync(CancellationToken ct = default);
    Task<CloudflarePurgeProbe> SelfTestAsync(CancellationToken ct = default);
}
