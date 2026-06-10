using KiNorge.Cms.Search.Elasticsearch;
using Microsoft.Extensions.Logging;
using Umbraco.Cms.Core.Events;
using Umbraco.Cms.Core.Notifications;

namespace KiNorge.Cms.Search.EventHandlers;

/// <summary>On unpublish, remove the node's document from the ki-content index.</summary>
public class SearchIndexOnUnpublishHandler : INotificationHandler<ContentUnpublishedNotification>
{
    private readonly IIndexService _indexService;
    private readonly ILogger<SearchIndexOnUnpublishHandler> _logger;

    public SearchIndexOnUnpublishHandler(
        IIndexService indexService,
        ILogger<SearchIndexOnUnpublishHandler> logger)
    {
        _indexService = indexService;
        _logger = logger;
    }

    public void Handle(ContentUnpublishedNotification notification)
    {
        foreach (var content in notification.UnpublishedEntities)
        {
            try
            {
                _indexService.DeleteDocumentAsync(content.Key.ToString()).GetAwaiter().GetResult();
                _logger.LogInformation("Removed content {ContentId} from search index", content.Id);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to remove content {ContentId} from search index", content.Id);
            }
        }
    }
}
