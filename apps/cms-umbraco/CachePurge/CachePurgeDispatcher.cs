using KiNorge.Cms.CachePurge.Cloudflare;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Umbraco.Cms.Core.Models;

namespace KiNorge.Cms.CachePurge;

public class CachePurgeDispatcher
{
    private readonly FrontendUrlResolver _resolver;
    private readonly IOptionsMonitor<CloudflareOptions> _options;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<CachePurgeDispatcher> _logger;

    public CachePurgeDispatcher(
        FrontendUrlResolver resolver,
        IOptionsMonitor<CloudflareOptions> options,
        IServiceScopeFactory scopeFactory,
        ILogger<CachePurgeDispatcher> logger)
    {
        _resolver = resolver;
        _options = options;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    public void Dispatch(IEnumerable<IContent> entities, string reason)
    {
        if (!_options.CurrentValue.Enabled) return;

        var urls = new HashSet<string>(StringComparer.Ordinal);
        bool purgeEverything = false;

        foreach (IContent content in entities)
        {
            try
            {
                AffectedUrls affected = _resolver.Resolve(content);
                if (affected.PurgeEverything) purgeEverything = true;
                foreach (string url in affected.Urls) urls.Add(url);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex,
                    "Klarte ikke løse URLer for content {ContentId} (reason={Reason})", content.Id, reason);
                purgeEverything = true;
            }
        }

        if (urls.Count > _options.CurrentValue.AffectedUrlThreshold) purgeEverything = true;
        if (urls.Count == 0 && !purgeEverything) return;

        SchedulePurge(urls.ToArray(), purgeEverything, reason);
    }

    // Fire-and-forget så backoffice-lagring ikke blokkeres.
    private void SchedulePurge(string[] urls, bool purgeEverything, string reason)
    {
        _ = Task.Run(async () =>
        {
            using IServiceScope scope = _scopeFactory.CreateScope();
            ICloudflareCachePurgeService purge =
                scope.ServiceProvider.GetRequiredService<ICloudflareCachePurgeService>();
            try
            {
                if (purgeEverything)
                {
                    await purge.PurgeEverythingAsync();
                    _logger.LogInformation("Cloudflare purge_everything (reason={Reason})", reason);
                }
                else
                {
                    await purge.PurgeUrlsAsync(urls);
                    _logger.LogInformation(
                        "Cloudflare purget {Count} URLer (reason={Reason}): {Urls}",
                        urls.Length, reason, string.Join(", ", urls));
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Cloudflare-purge feilet (reason={Reason})", reason);
            }
        });
    }
}
