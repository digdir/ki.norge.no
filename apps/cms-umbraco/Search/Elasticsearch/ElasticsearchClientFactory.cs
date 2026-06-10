using Elastic.Clients.Elasticsearch;
using Elastic.Transport;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace KiNorge.Cms.Search.Elasticsearch;

/// <summary>
/// Builds a single shared <see cref="ElasticsearchClient"/>. If no endpoint is
/// configured (e.g. local dev without Elasticsearch), the client is left null and
/// the indexing pipeline no-ops — the CMS must never fail to boot because search
/// is unconfigured.
/// </summary>
public class ElasticsearchClientFactory
{
    private readonly ElasticsearchClient? _client;

    public ElasticsearchClientFactory(
        IOptions<ElasticsearchOptions> options,
        ILogger<ElasticsearchClientFactory> logger)
    {
        var endpoint = options.Value.Endpoint;
        if (string.IsNullOrWhiteSpace(endpoint))
        {
            logger.LogWarning("Elasticsearch endpoint not configured — search indexing disabled.");
            return;
        }

        var settings = new ElasticsearchClientSettings(new Uri(endpoint));

        if (!string.IsNullOrEmpty(options.Value.ApiKey))
        {
            settings = settings.Authentication(new ApiKey(options.Value.ApiKey));
        }

        settings = settings.RequestTimeout(TimeSpan.FromSeconds(30));

        _client = new ElasticsearchClient(settings);
        logger.LogInformation("Elasticsearch client created for {Endpoint}", endpoint);
    }

    /// <summary>Returns the shared client, or null when Elasticsearch is unconfigured.</summary>
    public ElasticsearchClient? GetClient() => _client;
}
