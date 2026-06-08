using Asp.Versioning;
using KiNorge.Cms.Search.Jobs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Umbraco.Cms.Api.Management.Controllers;
using Umbraco.Cms.Api.Management.Routing;
using Umbraco.Cms.Web.Common.Authorization;

namespace KiNorge.Cms.Search.Controllers;

/// <summary>
/// Backoffice admin endpoint to trigger a full reindex of the ki-content index —
/// the initial backfill that replaces the retired crawler. POST to start, GET status.
/// </summary>
[ApiVersion("1.0")]
[VersionedApiBackOfficeRoute("search/reindex")]
[ApiExplorerSettings(GroupName = "Search")]
[Authorize(Policy = AuthorizationPolicies.RequireAdminAccess)]
public class ReindexController : ManagementApiControllerBase
{
    private readonly ReindexBackgroundJob _job;
    private readonly ILogger<ReindexController> _logger;

    public ReindexController(
        ReindexBackgroundJob job,
        ILogger<ReindexController> logger)
    {
        _job = job;
        _logger = logger;
    }

    [HttpPost]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(StatusCodes.Status202Accepted)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status409Conflict)]
    [EndpointSummary("Trigger a full Elasticsearch reindex.")]
    [EndpointDescription("Upserts all published Umbraco content into the ki-content hybrid index. Runs as a background task; poll /status for progress.")]
    public IActionResult Start()
    {
        if (ReindexBackgroundJob.IsRunning)
        {
            return Conflict(new ProblemDetails
            {
                Title = "Reindex already running",
                Detail = "A reindex job is already in progress. Wait for it to finish before starting another.",
                Status = StatusCodes.Status409Conflict,
                Type = "Error",
            });
        }

        _ = Task.Run(() => _job.ExecuteReindexAsync(CancellationToken.None));
        _logger.LogInformation("Manual reindex triggered by {User}", User.Identity?.Name);
        return Accepted();
    }

    [HttpGet("status")]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(ReindexStatusResponse), StatusCodes.Status200OK)]
    [EndpointSummary("Get current reindex progress.")]
    public IActionResult Status() => Ok(new ReindexStatusResponse(
        Status: ReindexBackgroundJob.Status,
        IsRunning: ReindexBackgroundJob.IsRunning,
        TotalItems: ReindexBackgroundJob.TotalItems,
        ProcessedItems: ReindexBackgroundJob.ProcessedItems,
        IndexedItems: ReindexBackgroundJob.IndexedItems,
        PercentComplete: ReindexBackgroundJob.TotalItems > 0
            ? (int)(100.0 * ReindexBackgroundJob.ProcessedItems / ReindexBackgroundJob.TotalItems)
            : 0));

    public record ReindexStatusResponse(
        string Status,
        bool IsRunning,
        int TotalItems,
        int ProcessedItems,
        int IndexedItems,
        int PercentComplete);
}
