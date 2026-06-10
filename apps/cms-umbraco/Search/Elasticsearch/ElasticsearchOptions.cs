namespace KiNorge.Cms.Search.Elasticsearch;

/// <summary>
/// Bound to configuration section "Elasticsearch". In cloud environments Endpoint
/// and ApiKey are injected via Elasticsearch__Endpoint / Elasticsearch__ApiKey env
/// vars, sourced from Azure Key Vault. Locally they live in appsettings.Development.json.
/// When Endpoint is empty the indexing pipeline cleanly no-ops (see ElasticsearchClientFactory).
/// </summary>
public class ElasticsearchOptions
{
    public string Endpoint { get; set; } = "";

    public string? ApiKey { get; set; }

    /// <summary>
    /// Single hybrid index. Its mapping (BM25 norwegian + semantic_text/e5-large) is
    /// owned by the index template in infrastructure/elasticsearch/ — this app never
    /// creates or mutates the mapping, it only writes documents.
    /// </summary>
    public string IndexName { get; set; } = "ki-content";

    /// <summary>
    /// Property aliases whose text must never enter the search body (SEO, slugs, alt text).
    /// Media/picker properties are skipped automatically (only text editors are harvested),
    /// so this list only needs the text-bearing properties we want to exclude.
    /// </summary>
    public List<string> ExcludedProperties { get; set; } =
    [
        "seoTittel",
        "seoBeskrivelse",
        "slug",
        "guideSlug",
        "bildeAlt",
        "canonicalUrl",
        "umbracoUrlName",
    ];
}
