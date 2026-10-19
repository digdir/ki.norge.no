using KiNorge.Cms.CachePurge.Cloudflare;
using KiNorge.Cms.CachePurge.EventHandlers;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Cms.Core.Notifications;

namespace KiNorge.Cms.CachePurge;

public class CachePurgeComposer : IComposer
{
    public void Compose(IUmbracoBuilder builder)
    {
        builder.Services.AddCloudflareCachePurge(builder.Config);
        builder.Services.AddSingleton<FrontendUrlResolver>();
        builder.Services.AddSingleton<CachePurgeDispatcher>();

        builder.AddNotificationHandler<ContentPublishedNotification, CachePurgeOnPublishHandler>();
        builder.AddNotificationHandler<ContentUnpublishedNotification, CachePurgeOnUnpublishHandler>();
        builder.AddNotificationHandler<ContentMovedToRecycleBinNotification, CachePurgeOnTrashHandler>();

        builder.Services.AddHostedService<CachePurgeStartupLogger>();
    }
}

internal sealed class CachePurgeStartupLogger : IHostedService
{
    private readonly IOptions<CloudflareOptions> _options;
    private readonly ILogger<CachePurgeStartupLogger> _logger;

    public CachePurgeStartupLogger(IOptions<CloudflareOptions> options, ILogger<CachePurgeStartupLogger> logger)
    {
        _options = options;
        _logger = logger;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        CloudflareOptions o = _options.Value;
        _logger.LogInformation(
            "Cloudflare cache-purge: Enabled={Enabled}, ZoneId={Zone}, ApiToken={Token}, SiteBaseUrl={Site}, Threshold={Threshold}",
            o.Enabled,
            string.IsNullOrWhiteSpace(o.ZoneId) ? "<empty>" : "<set>",
            string.IsNullOrWhiteSpace(o.ApiToken) ? "<empty>" : "<set>",
            string.IsNullOrWhiteSpace(o.SiteBaseUrl) ? "<empty>" : o.SiteBaseUrl,
            o.AffectedUrlThreshold);
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
