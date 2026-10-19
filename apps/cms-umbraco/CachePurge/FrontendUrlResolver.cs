using KiNorge.Cms.CachePurge.Cloudflare;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Umbraco.Cms.Core.Models;

namespace KiNorge.Cms.CachePurge;

public record AffectedUrls(IReadOnlyCollection<string> Urls, bool PurgeEverything);

// The page's own path comes from ContentRouteResolver (shared/content-routes.json), the same source
// as the preview and the search. Only the pages that show the node without being its own URL are listed here.
public class FrontendUrlResolver
{
    private readonly ContentRouteResolver _routes;
    private readonly IOptionsMonitor<CloudflareOptions> _options;
    private readonly ILogger<FrontendUrlResolver> _logger;

    public FrontendUrlResolver(
        ContentRouteResolver routes,
        IOptionsMonitor<CloudflareOptions> options,
        ILogger<FrontendUrlResolver> logger)
    {
        _routes = routes;
        _options = options;
        _logger = logger;
    }

    public AffectedUrls Resolve(IContent content)
    {
        string baseUrl = (_options.CurrentValue.SiteBaseUrl ?? "").TrimEnd('/');
        if (string.IsNullOrEmpty(baseUrl))
            return new AffectedUrls([], PurgeEverything: false);

        string alias = content.ContentType.Alias;
        if (alias == "globaleInnstillinger")
            return new AffectedUrls([], PurgeEverything: true);

        string? path = _routes.Resolve(content);
        if (path == null)
            return Escalate(alias, content.Id);

        List<string> urls = AlsoShownOn(alias, path)
            .Prepend(path)
            .Distinct()
            .Select(p => baseUrl + p)
            .ToList();
        return new AffectedUrls(urls, PurgeEverything: false);
    }

    private static string[] AlsoShownOn(string alias, string path) => alias switch
    {
        "artikkel" => ["/artikler", "/"],
        "eksempel" => ["/eksempler", "/"],
        "kalenderhendelse" => ["/kalender", "/"],
        "veiledningGuide" or "enkelVeiledning" => ["/veiledning", "/"],
        "veiledningSteg" => [path[..path.LastIndexOf('/')]],
        "artikler" or "eksempler" or "veiledninger" or "kalender" => ["/"],
        _ => [],
    };

    private AffectedUrls Escalate(string alias, int contentId)
    {
        _logger.LogInformation(
            "Found no frontend URL for content type '{Alias}' (id {Id}), escalating to purge_everything",
            alias, contentId);
        return new AffectedUrls([], PurgeEverything: true);
    }
}
