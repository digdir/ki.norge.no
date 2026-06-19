namespace KiNorge.Cms.CachePurge.Cloudflare;

/// <summary>Resultat av en live purge-selvtest (diagnose). Eksponerer ALDRI secret-verdier.</summary>
public record CloudflarePurgeProbe(bool Configured, int? HttpStatus, bool Ok, string? Detail);

public interface ICloudflareCachePurgeService
{
    /// <summary>Purger en konkret liste absolutte URLer (Cloudflare `files`). No-op uten config.</summary>
    Task PurgeUrlsAsync(IReadOnlyCollection<string> absoluteUrls, CancellationToken ct = default);

    /// <summary>Purger hele sonen (`purge_everything`). Kun for globale endringer / eskalering.</summary>
    Task PurgeEverythingAsync(CancellationToken ct = default);

    /// <summary>Diagnose: purger en ufarlig test-URL og returnerer Cloudflare-svaret (status + body).
    /// Kaster ikke. Lar /api/diagnostics/cloudflare se 401/403/404 uten å lese pod-loggen.</summary>
    Task<CloudflarePurgeProbe> SelfTestAsync(CancellationToken ct = default);
}
