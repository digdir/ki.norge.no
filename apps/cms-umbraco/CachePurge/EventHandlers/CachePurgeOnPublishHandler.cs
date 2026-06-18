using Umbraco.Cms.Core.Events;
using Umbraco.Cms.Core.Notifications;

namespace KiNorge.Cms.CachePurge.EventHandlers;

/// <summary>Purger påvirkede frontend-URLer når innhold publiseres.</summary>
public class CachePurgeOnPublishHandler : INotificationHandler<ContentPublishedNotification>
{
    private readonly CachePurgeDispatcher _dispatcher;

    public CachePurgeOnPublishHandler(CachePurgeDispatcher dispatcher) => _dispatcher = dispatcher;

    public void Handle(ContentPublishedNotification notification) =>
        _dispatcher.Dispatch(notification.PublishedEntities, "publish");
}
