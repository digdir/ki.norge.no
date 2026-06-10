using KiNorge.Cms.Search.Elasticsearch;
using Microsoft.Extensions.Logging;
using Umbraco.Cms.Core.Events;
using Umbraco.Cms.Core.Notifications;

namespace KiNorge.Cms.Search.EventHandlers;

/// <summary>On move-to-recycle-bin, remove the node's document from the ki-content index.</summary>
public class SearchIndexOnTrashHandler : INotificationHandler<ContentMovedToRecycleBinNotification>
{
    private readonly IIndexService _indexService;
    private readonly ILogger<SearchIndexOnTrashHandler> _logger;

    public SearchIndexOnTrashHandler(
        IIndexService indexService,
        ILogger<SearchIndexOnTrashHandler> logger)
    {
        _indexService = indexService;
        _logger = logger;
    }

    public void Handle(ContentMovedToRecycleBinNotification notification)
    {
        foreach (var moveInfo in notification.MoveInfoCollection)
        {
            try
            {
                _indexService.DeleteDocumentAsync(moveInfo.Entity.Key.ToString()).GetAwaiter().GetResult();
                _logger.LogInformation(
                    "Removed trashed content {ContentId} from search index", moveInfo.Entity.Id);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex,
                    "Failed to remove trashed content {ContentId} from search index", moveInfo.Entity.Id);
            }
        }
    }
}
