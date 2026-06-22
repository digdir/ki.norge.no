namespace KiNorge.Cms.CachePurge.Cloudflare;

public interface ICloudflareCachePurgeService
{
    Task PurgeUrlsAsync(IReadOnlyCollection<string> absoluteUrls, CancellationToken ct = default);
    Task PurgeEverythingAsync(CancellationToken ct = default);
}
