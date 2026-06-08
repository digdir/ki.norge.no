using KiNorge.Cms.Search.Elasticsearch;
using KiNorge.Cms.Search.EventHandlers;
using KiNorge.Cms.Search.Jobs;
using Microsoft.Extensions.DependencyInjection;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Cms.Core.Notifications;

namespace KiNorge.Cms.Search;

/// <summary>
/// Wires up search ingestion: the Elasticsearch adapter, the content extractor, the
/// reindex job, and the publish/unpublish/trash notification handlers that keep the
/// ki-content index in sync. Retrieval lives in the Astro frontend, not here.
/// </summary>
public class SearchComposer : IComposer
{
    public void Compose(IUmbracoBuilder builder)
    {
        builder.Services.AddElasticsearchIndexing(builder.Config);
        builder.Services.AddScoped<ContentTextExtractor>();
        builder.Services.AddSingleton<ReindexBackgroundJob>();
        builder.Services.AddHostedService(sp => sp.GetRequiredService<ReindexBackgroundJob>());

        builder.AddNotificationHandler<ContentPublishedNotification, SearchIndexOnPublishHandler>();
        builder.AddNotificationHandler<ContentUnpublishedNotification, SearchIndexOnUnpublishHandler>();
        builder.AddNotificationHandler<ContentMovedToRecycleBinNotification, SearchIndexOnTrashHandler>();
    }
}
