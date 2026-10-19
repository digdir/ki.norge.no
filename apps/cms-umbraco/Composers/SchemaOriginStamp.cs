using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Cms.Core.Events;
using uSync.BackOffice;

namespace KiNorge.Cms.Composers;

/// <summary>
/// Stamps every uSync export with the environment it came from.
///
/// The schema files that are committed MUST be taken from prod. Without a mark in the
/// export itself it is impossible to tell afterwards where the files came from, and an export from
/// a local database looks exactly the same in a diff.
///
/// The mark is written by code, not by per-machine config, so it follows the repo to everyone
/// who runs the CMS. CI reads it and rejects a PR where the origin is not prod
/// (scripts/check-usync-schema.sh).
///
/// The environment is derived from UmbracoApplicationUrl, which already tells the environments
/// apart. No new env var to remember to set.
/// </summary>
public class SchemaOriginStampComposer : IComposer
{
    public void Compose(IUmbracoBuilder builder)
    {
        builder.AddNotificationHandler<uSyncExportCompletedNotification, SchemaOriginStamp>();
    }
}

public class SchemaOriginStamp : INotificationHandler<uSyncExportCompletedNotification>
{
    private readonly IHostEnvironment _env;
    private readonly IConfiguration _config;
    private readonly ILogger<SchemaOriginStamp> _logger;

    public SchemaOriginStamp(IHostEnvironment env, IConfiguration config, ILogger<SchemaOriginStamp> logger)
    {
        _env = env;
        _config = config;
        _logger = logger;
    }

    public void Handle(uSyncExportCompletedNotification notification)
    {
        var dir = Path.Combine(_env.ContentRootPath, "uSync", "v17");
        // Only schema exports are interesting. If the folder does not exist, no schema was exported.
        if (!Directory.Exists(Path.Combine(dir, "ContentTypes"))) return;

        var appUrl = _config["Umbraco:CMS:WebRouting:UmbracoApplicationUrl"] ?? "";
        var stamp = new
        {
            environment = DeriveEnvironment(appUrl),
            applicationUrl = appUrl,
            exportedAtUtc = DateTime.UtcNow.ToString("o"),
        };

        try
        {
            File.WriteAllText(
                Path.Combine(dir, ".origin"),
                JsonSerializer.Serialize(stamp, new JsonSerializerOptions { WriteIndented = true }));
        }
        catch (Exception ex)
        {
            // A missing mark must never break an export.
            _logger.LogWarning(ex, "Could not write the uSync .origin mark.");
        }
    }

    private static string DeriveEnvironment(string appUrl) => appUrl switch
    {
        var u when u.Contains("cms.ki.test.norge.no", StringComparison.OrdinalIgnoreCase) => "tt02",
        var u when u.Contains("tt02", StringComparison.OrdinalIgnoreCase) => "tt02",
        var u when u.Contains("cms.ki.norge.no", StringComparison.OrdinalIgnoreCase) => "prod",
        var u when u.Contains("prod", StringComparison.OrdinalIgnoreCase) => "prod",
        _ => "local",
    };
}
