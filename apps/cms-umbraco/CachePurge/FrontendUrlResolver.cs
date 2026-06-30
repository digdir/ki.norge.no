using KiNorge.Cms.CachePurge.Cloudflare;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Umbraco.Cms.Core.Models;
using Umbraco.Extensions;

namespace KiNorge.Cms.CachePurge;

public record AffectedUrls(IReadOnlyCollection<string> Urls, bool PurgeEverything);

// Frontend ruter på slug-feltet, ikke Umbraco-treet, så URLene bygges fra content type + slug.
public class FrontendUrlResolver
{
    private readonly IOptionsMonitor<CloudflareOptions> _options;
    private readonly ILogger<FrontendUrlResolver> _logger;

    public FrontendUrlResolver(IOptionsMonitor<CloudflareOptions> options, ILogger<FrontendUrlResolver> logger)
    {
        _options = options;
        _logger = logger;
    }

    public AffectedUrls Resolve(IContent content)
    {
        string baseUrl = (_options.CurrentValue.SiteBaseUrl ?? "").TrimEnd('/');
        if (string.IsNullOrEmpty(baseUrl))
            return new AffectedUrls([], PurgeEverything: false);

        string alias = content.ContentType.Alias;
        string? slug = content.GetValue<string>("slug");
        var paths = new List<string>();

        switch (alias)
        {
            case "globaleInnstillinger":
                return new AffectedUrls([], PurgeEverything: true);

            case "forside":
                paths.Add("/");
                break;

            case "artikkel":
                AddItem(paths, "/artikler", slug, alsoHome: true);
                break;
            case "eksempel":
                AddItem(paths, "/eksempler", slug, alsoHome: true);
                break;
            case "kalenderhendelse":
                AddItem(paths, "/kalender", slug, alsoHome: true);
                break;

            case "veiledningGuide":
            case "enkelVeiledning":
                AddItem(paths, "/veiledning", slug, alsoHome: true);
                break;

            case "veiledningSteg":
            {
                string? guideSlug = content.GetValue<string>("guideSlug");
                if (string.IsNullOrWhiteSpace(guideSlug))
                    return Escalate(alias, content.Id);
                paths.Add($"/veiledning/{guideSlug}");
                if (!string.IsNullOrWhiteSpace(slug))
                    paths.Add($"/veiledning/{guideSlug}/{slug}");
                break;
            }

            case "side":
                if (string.IsNullOrWhiteSpace(slug)) return Escalate(alias, content.Id);
                paths.Add($"/{slug}");
                break;

            case "omOss":
                paths.Add("/om-oss");
                break;
            case "sandkasse":
                paths.Add("/sandkasse");
                break;

            case "artikler":
                paths.Add("/artikler"); paths.Add("/");
                break;
            case "eksempler":
                paths.Add("/eksempler"); paths.Add("/");
                break;
            case "veiledninger":
                paths.Add("/veiledning"); paths.Add("/");
                break;
            case "kalender":
                paths.Add("/kalender"); paths.Add("/");
                break;

            default:
                return Escalate(alias, content.Id);
        }

        List<string> urls = paths
            .Distinct()
            .Select(p => baseUrl + p)
            .ToList();
        return new AffectedUrls(urls, PurgeEverything: false);
    }

    private static void AddItem(List<string> paths, string listing, string? slug, bool alsoHome)
    {
        if (!string.IsNullOrWhiteSpace(slug)) paths.Add($"{listing}/{slug}");
        paths.Add(listing);
        if (alsoHome) paths.Add("/");
    }

    private AffectedUrls Escalate(string alias, int contentId)
    {
        _logger.LogInformation(
            "Ingen URL-regel for content type '{Alias}' (id {Id}) — eskalerer til purge_everything",
            alias, contentId);
        return new AffectedUrls([], PurgeEverything: true);
    }
}
