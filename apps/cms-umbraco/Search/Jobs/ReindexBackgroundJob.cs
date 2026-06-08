using KiNorge.Cms.Search.Elasticsearch;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Services;

namespace KiNorge.Cms.Search.Jobs;

/// <summary>
/// Full backfill of the ki-content index: walks every published node and upserts it
/// (by content GUID). Does NOT drop or create the index — the mapping is owned by the
/// index template in infrastructure/elasticsearch/. Replaces the retired Delivery-API
/// crawler. Registered as a hosted service only so it can be a run-state singleton for
/// ReindexController; it does no work on startup. Triggered on demand.
/// </summary>
public class ReindexBackgroundJob : IHostedService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<ReindexBackgroundJob> _logger;

    private static int _isRunning;
    private static int _totalItems;
    private static int _processedItems;
    private static int _indexedItems;
    private static string _status = "idle";

    public static bool IsRunning => _isRunning == 1;
    public static string Status => _status;
    public static int TotalItems => _totalItems;
    public static int ProcessedItems => _processedItems;
    public static int IndexedItems => _indexedItems;

    public ReindexBackgroundJob(
        IServiceScopeFactory scopeFactory,
        ILogger<ReindexBackgroundJob> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    public Task StartAsync(CancellationToken ct) => Task.CompletedTask;
    public Task StopAsync(CancellationToken ct) => Task.CompletedTask;

    public async Task ExecuteReindexAsync(CancellationToken ct)
    {
        if (Interlocked.CompareExchange(ref _isRunning, 1, 0) != 0)
            return;

        _status = "starting";
        _processedItems = 0;
        _indexedItems = 0;
        _totalItems = 0;

        _logger.LogInformation("Full reindex started");

        try
        {
            using var scope = _scopeFactory.CreateScope();
            var contentService = scope.ServiceProvider.GetRequiredService<IContentService>();
            var indexService = scope.ServiceProvider.GetRequiredService<IIndexService>();
            var extractor = scope.ServiceProvider.GetRequiredService<ContentTextExtractor>();

            _status = "collecting content";
            var allContent = CollectAllPublishedContent(contentService);
            _totalItems = allContent.Count;

            _status = "indexing";
            _logger.LogInformation("Reindexing {TotalItems} published items", _totalItems);

            foreach (var content in allContent)
            {
                ct.ThrowIfCancellationRequested();
                try
                {
                    var document = extractor.ExtractDocument(content);
                    if (document != null)
                    {
                        await indexService.IndexDocumentAsync(content.Key.ToString(), document, ct);
                        Interlocked.Increment(ref _indexedItems);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Reindex failed for content {ContentId}", content.Id);
                }

                Interlocked.Increment(ref _processedItems);
            }

            _status = "completed";
            _logger.LogInformation(
                "Full reindex completed. {Indexed} indexed of {Total} processed",
                _indexedItems, _totalItems);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Full reindex job failed");
            _status = $"failed: {ex.Message}";
        }
        finally
        {
            Interlocked.Exchange(ref _isRunning, 0);
        }
    }

    private static List<IContent> CollectAllPublishedContent(IContentService contentService)
    {
        var result = new List<IContent>();
        foreach (var root in contentService.GetRootContent())
        {
            CollectRecursive(contentService, root, result);
        }
        return result;
    }

    private static void CollectRecursive(
        IContentService contentService, IContent content, List<IContent> result)
    {
        if (content.Published)
            result.Add(content);

        var children = contentService.GetPagedChildren(content.Id, 0, int.MaxValue, out _);
        foreach (var child in children)
        {
            CollectRecursive(contentService, child, result);
        }
    }
}
