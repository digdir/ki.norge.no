using System.Xml.Linq;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Cms.Core.Events;
using Umbraco.Cms.Core.Services;
using uSync.BackOffice;
using uSync.BackOffice.Notifications;
using uSync.Core.Notifications;

namespace KiNorge.Cms.Composers;

/// <summary>
/// Stops a uSync import that would give existing content types or data types
/// NEW keys.
///
/// Why: content references blocks via the type's key. If we import a schema export
/// taken from a DIFFERENT database than this one, the types are re-keyed and all block content becomes
/// "Unsupported". uSync 17.3.6 re-keys without asking (measured on tt02: 468 key changes).
///
/// The guard is the last line of defence. It does not care how the files ended up in the repo, so it
/// also covers hand-edited files and files written by an agent.
///
/// Deliberate re-keying (e.g. aligning tt02 with prod) requires the env var USYNC_ALLOW_REKEY=true.
/// </summary>
public class SchemaRekeyGuardComposer : IComposer
{
    public void Compose(IUmbracoBuilder builder)
    {
        builder.AddNotificationHandler<uSyncImportStartingNotification, SchemaRekeyGuard>();
        builder.AddNotificationHandler<uSyncImportCompletedNotification, SchemaImportReporter>();
    }
}

/// <summary>
/// Makes a schema import that actually CHANGED something visible.
///
/// Prod logs at Warning level (appsettings.Production.json), so uSync's own
/// summary at Info level is not in the log there. An import that changes schema in prod
/// is exactly what you want to catch, so it is logged at Error and written to stdout.
///
/// Zero changes is the normal state and is not logged.
/// </summary>
public class SchemaImportReporter : INotificationHandler<uSyncImportCompletedNotification>
{
    private readonly ILogger<SchemaImportReporter> _logger;

    public SchemaImportReporter(ILogger<SchemaImportReporter> logger) => _logger = logger;

    public void Handle(uSyncImportCompletedNotification notification)
    {
        var changed = notification.Actions
            .Where(a => a.Change != uSync.Core.ChangeType.NoChange)
            .ToList();

        if (changed.Count == 0) return;

        var summary = string.Join(", ", changed.Take(8).Select(a => $"{a.ItemType}:{a.Name}"));
        var more = changed.Count > 8 ? $" (+{changed.Count - 8})" : "";

        _logger.LogError(
            "uSync import CHANGED schema: {Count} items. {Summary}{More}. " +
            "Expected state is 0 changes. If this is unexpected, check whether the schema files " +
            "in uSync/v17 come from a different database than this one.",
            changed.Count, summary, more);

        Console.Error.WriteLine(
            $"ADVARSEL uSync-import endret skjema: {changed.Count} elementer. {summary}{more}");
    }
}

public class SchemaRekeyGuard : INotificationHandler<uSyncImportStartingNotification>
{
    private readonly IContentTypeService _contentTypeService;
    private readonly IDataTypeService _dataTypeService;
    private readonly IHostEnvironment _env;

    public SchemaRekeyGuard(
        IContentTypeService contentTypeService,
        IDataTypeService dataTypeService,
        IHostEnvironment env)
    {
        _contentTypeService = contentTypeService;
        _dataTypeService = dataTypeService;
        _env = env;
    }

    public void Handle(uSyncImportStartingNotification notification)
    {
        var conflicts = FindRekeyConflicts();
        if (conflicts.Count == 0) return;

        var allowed = string.Equals(
            Environment.GetEnvironmentVariable("USYNC_ALLOW_REKEY"), "true",
            StringComparison.OrdinalIgnoreCase);

        var summary = string.Join("\n  ", conflicts.Take(10));
        var more = conflicts.Count > 10 ? $"\n  … and {conflicts.Count - 10} more" : "";

        if (allowed)
        {
            Console.WriteLine(
                $"WARNING SchemaRekeyGuard: the import re-keys {conflicts.Count} types, " +
                $"but USYNC_ALLOW_REKEY=true so it is let through.\n  {summary}{more}");
            return;
        }

        // notification.Cancel is NOT respected by uSync 17.3.6 (verified: the import carried
        // on and re-keyed 80 items). We throw instead, which aborts the operation.
        notification.Cancel = true;
        var message =
            $"SchemaRekeyGuard STOPPED the uSync import. It would have given {conflicts.Count} " +
            $"existing types new keys, and all block content would have become \"Unsupported\".\n" +
            $"  {summary}{more}\n" +
            $"  The cause is almost always that the schema files in uSync/v17 were exported from a DIFFERENT " +
            $"database than this one. They must be taken from prod.\n" +
            $"  If the re-keying is intended, set USYNC_ALLOW_REKEY=true.";
        Console.Error.WriteLine($"ERROR {message}");
        throw new InvalidOperationException(message);
    }

    private List<string> FindRekeyConflicts()
    {
        var conflicts = new List<string>();
        var root = Path.Combine(_env.ContentRootPath, "uSync", "v17");
        if (!Directory.Exists(root)) return conflicts;

        foreach (var (folder, element, resolver) in new (string, string, Func<string, Guid?>)[]
        {
            ("ContentTypes", "ContentType", alias => _contentTypeService.Get(alias)?.Key),
            ("DataTypes", "DataType", name => FindDataTypeKey(name)),
        })
        {
            var dir = Path.Combine(root, folder);
            if (!Directory.Exists(dir)) continue;

            foreach (var file in Directory.EnumerateFiles(dir, "*.config", SearchOption.AllDirectories))
            {
                var (fileKey, alias) = ReadKeyAndAlias(file, element);
                if (fileKey is null || string.IsNullOrWhiteSpace(alias)) continue;

                var dbKey = resolver(alias);
                // Not in the database = new type, no re-keying.
                if (dbKey is null || dbKey == fileKey) continue;

                conflicts.Add($"{folder}/{alias}: the database has {dbKey}, the file has {fileKey}");
            }
        }

        return conflicts;
    }

    private Guid? FindDataTypeKey(string name) =>
        _dataTypeService.GetAllAsync().GetAwaiter().GetResult()
            .FirstOrDefault(d => string.Equals(d.Name, name, StringComparison.OrdinalIgnoreCase))?.Key;

    private static (Guid?, string?) ReadKeyAndAlias(string file, string elementName)
    {
        try
        {
            var root = XDocument.Load(file).Root;
            if (root is null || root.Name.LocalName != elementName) return (null, null);
            var key = (string?)root.Attribute("Key");
            var alias = (string?)root.Attribute("Alias");
            return (Guid.TryParse(key, out var g) ? g : null, alias);
        }
        catch
        {
            // An unreadable file is not this guard's problem; uSync reports it itself.
            return (null, null);
        }
    }
}
