using KiNorge.Cms.CachePurge.Cloudflare;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Umbraco.Cms.Core.Models;
using Umbraco.Extensions;

namespace KiNorge.Cms.CachePurge;

/// <summary>URLer som må purges for en innholdsendring. PurgeEverything overstyrer Urls.</summary>
public record AffectedUrls(IReadOnlyCollection<string> Urls, bool PurgeEverything);

/// <summary>
/// Mapper en innholdsnode til de offentlige frontend-URLene den påvirker. Frontend ruter på
/// innholdets `slug`-felt (ikke Umbracos tre-URL), så vi bygger URLene fra content type +
/// slug, ikke fra IPublishedContent.Url(). Listesider og forsiden tas med der innholdet
/// vises der. Ukjente typer og globale innstillinger eskalerer til purge_everything
/// (trygt: heller for mye enn stale).
/// </summary>
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
            // Header/footer/cookie-tekst rendres på hver side.
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

            // Guide og enkel veiledning deler /veiledning/{slug}-ruten.
            case "veiledningGuide":
            case "enkelVeiledning":
                AddItem(paths, "/veiledning", slug, alsoHome: true);
                break;

            // Steg rendres på guide-siden (+ egen steg-URL under guiden).
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

            // Oversiktssidene (egne content types, jf. umbraco.ts).
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

    // Egen URL (hvis slug finnes) + listeside + eventuelt forsiden (der innholdet løftes).
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
