using Elastic.Clients.Elasticsearch;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace KiNorge.Cms.Search.Elasticsearch;

/// <summary>
/// Pushes documents into the ki-content hybrid index. Deliberately minimal:
/// - Does NOT create the index or mapping — the index template in
///   infrastructure/elasticsearch/ owns that. An index matching ki-content*
///   auto-creates with the semantic_text mapping on first write, embedding
///   body_semantic via copy_to at index time.
/// - Does NOT query — retrieval is the Astro frontend's hybridSearch.
/// - No-ops cleanly when Elasticsearch is unconfigured, so publish never fails
///   because of search.
/// </summary>
public class ElasticsearchIndexService : IIndexService
{
    private readonly ElasticsearchClient? _client;
    private readonly ElasticsearchOptions _options;
    private readonly ILogger<ElasticsearchIndexService> _logger;

    public ElasticsearchIndexService(
        ElasticsearchClientFactory clientFactory,
        IOptions<ElasticsearchOptions> options,
        ILogger<ElasticsearchIndexService> logger)
    {
        _client = clientFactory.GetClient();
        _options = options.Value;
        _logger = logger;
    }

    public async Task IndexDocumentAsync(string id, SearchDocument document, CancellationToken ct = default)
    {
        if (_client is null)
            return;

        try
        {
            var response = await _client.IndexAsync(document, i => i
                .Index(_options.IndexName)
                .Id(id), ct);

            if (!response.IsValidResponse)
            {
                _logger.LogWarning(
                    "Failed to index document {DocumentId}: {Error}",
                    id, response.DebugInformation);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to index document {DocumentId}", id);
        }
    }

    public async Task DeleteDocumentAsync(string id, CancellationToken ct = default)
    {
        if (_client is null)
            return;

        try
        {
            var response = await _client.DeleteAsync(_options.IndexName, id, ct);

            if (!response.IsValidResponse && response.Result != Result.NotFound)
            {
                _logger.LogWarning(
                    "Failed to delete document {DocumentId}: {Error}",
                    id, response.DebugInformation);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to delete document {DocumentId}", id);
        }
    }
}
