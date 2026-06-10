namespace KiNorge.Cms.Search.Elasticsearch;

/// <summary>
/// Write side of the hybrid search index. Ingestion only — querying lives in the
/// Astro frontend (hybridSearch), and the mapping is owned by the index template
/// in infrastructure/elasticsearch/. The id is the Umbraco content GUID.
/// </summary>
public interface IIndexService
{
    Task IndexDocumentAsync(string id, SearchDocument document, CancellationToken ct = default);

    Task DeleteDocumentAsync(string id, CancellationToken ct = default);
}
