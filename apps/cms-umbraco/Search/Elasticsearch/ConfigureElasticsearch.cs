using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace KiNorge.Cms.Search.Elasticsearch;

public static class ConfigureElasticsearch
{
    /// <summary>
    /// Registers the ingestion-only Elasticsearch adapter: options bound to the
    /// "Elasticsearch" config section, the shared client factory, and the index service.
    /// </summary>
    public static IServiceCollection AddElasticsearchIndexing(
        this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<ElasticsearchOptions>(configuration.GetSection("Elasticsearch"));
        services.AddSingleton<ElasticsearchClientFactory>();
        services.AddScoped<IIndexService, ElasticsearchIndexService>();
        return services;
    }
}
