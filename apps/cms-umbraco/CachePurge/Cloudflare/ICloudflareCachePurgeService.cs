namespace KiNorge.Cms.CachePurge.Cloudflare;

public interface ICloudflareCachePurgeService
{
    /// <summary>Purger en konkret liste absolutte URLer (Cloudflare `files`). No-op uten config.</summary>
    Task PurgeUrlsAsync(IReadOnlyCollection<string> absoluteUrls, CancellationToken ct = default);

    /// <summary>Purger hele sonen (`purge_everything`). Kun for globale endringer / eskalering.</summary>
    Task PurgeEverythingAsync(CancellationToken ct = default);
}
