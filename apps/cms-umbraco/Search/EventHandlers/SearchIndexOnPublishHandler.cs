using KiNorge.Cms.Search.Elasticsearch;
using Microsoft.Extensions.Logging;
using Umbraco.Cms.Core.Events;
using Umbraco.Cms.Core.Notifications;

namespace KiNorge.Cms.Search.EventHandlers;

/// <summary>
/// On publish, (re)index each affected node into the ki-content index by content GUID.
/// If a node is no longer indexable (became a container, lost its prose), its prior
/// document is removed so it doesn't linger in search.
/// </summary>
public class SearchIndexOnPublishHandler : INotificationHandler<ContentPublishedNotification>
{
    private readonly IIndexService _indexService;
    private readonly ContentTextExtractor _extractor;
    private readonly ILogger<SearchIndexOnPublishHandler> _logger;

    public SearchIndexOnPublishHandler(
        IIndexService indexService,
        ContentTextExtractor extractor,
        ILogger<SearchIndexOnPublishHandler> logger)
    {
        _indexService = indexService;
        _extractor = extractor;
        _logger = logger;
    }

    public void Handle(ContentPublishedNotification notification)
    {
        foreach (var content in notification.PublishedEntities)
        {
            var id = content.Key.ToString();
            try
            {
                var document = _extractor.ExtractDocument(content);
                if (document != null)
                {
                    _indexService.IndexDocumentAsync(id, document).GetAwaiter().GetResult();
                    _logger.LogInformation("Indexed content {ContentId}", content.Id);
                }
                else
                {
                    _indexService.DeleteDocumentAsync(id).GetAwaiter().GetResult();
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to index content {ContentId}", content.Id);
            }
        }
    }
}
