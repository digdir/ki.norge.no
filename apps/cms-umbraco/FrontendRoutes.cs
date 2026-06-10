namespace KiNorge.Cms;

/// <summary>
/// Single source of truth for mapping an Umbraco content type to its public
/// ki.norge.no frontend route. The frontend routes by content type + slug
/// (Astro pages under /artikler, /veiledning, ...), NOT by Umbraco's content-tree
/// path, so URLs built for headless consumers (search index, editor preview) must
/// go through here. Mirrors apps/frontend's shared/content-routes.json.
///
/// Returns null when the type has no detail route, or when a required ancestor
/// slug is missing (caller should treat that as "no URL").
/// </summary>
public static class FrontendRoutes
{
    public static string? Path(string contentType, string? slug, string? guideSlug = null, string? stegSlug = null)
    {
        slug ??= "";
        return contentType switch
        {
            "artikkel" => $"/artikler/{slug}",
            "eksempel" => $"/eksempler/{slug}",
            "enkelVeiledning" or "veiledningGuide" => $"/veiledning/{slug}",
            "veiledningSteg" => string.IsNullOrWhiteSpace(guideSlug)
                ? null
                : $"/veiledning/{guideSlug}/{slug}",
            "stegartikkel" => string.IsNullOrWhiteSpace(guideSlug) || string.IsNullOrWhiteSpace(stegSlug)
                ? null
                : $"/veiledning/{guideSlug}/{stegSlug}/{slug}",
            "side" => $"/{slug}",
            "forside" => "/",
            "omOss" => "/om-oss",
            "sandkasse" => "/sandkasse",
            // Oversikts-/landingssider (redigerbare)
            "artikler" => "/artikler",
            "eksempler" => "/eksempler",
            "veiledninger" => "/veiledning",
            // kalenderhendelse har ingen egen detaljrute, vis i oversikten
            "kalender" or "kalenderhendelse" => "/kalender",
            _ => null,
        };
    }
}
