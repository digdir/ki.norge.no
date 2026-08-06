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
/// Stopper en uSync-import som ville gitt eksisterende content-typer eller datatyper
/// NYE nøkler.
///
/// Hvorfor: innhold refererer blokker via typens nøkkel. Importerer vi en skjemaeksport
/// som er tatt fra en ANNEN database enn denne, re-nøkles typene og alt blokkinnhold blir
/// «Unsupported». uSync 17.3.6 re-nøkler uten å spørre (målt på tt02: 468 nøkkelendringer).
///
/// Guarden er siste skanse. Den bryr seg ikke om hvordan filene havnet i repoet, så den
/// dekker også hånd-redigerte filer og filer skrevet av en agent.
///
/// Bevisst re-nøkling (f.eks. å aligne tt02 mot prod) krever env-var USYNC_ALLOW_REKEY=true.
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
/// Gjør en skjema-import som faktisk ENDRET noe synlig.
///
/// Prod logger på Warning-nivå (appsettings.Production.json), så uSync sin egen
/// oppsummering på Info-nivå finnes ikke i loggen der. En import som endrer skjema i prod
/// er nettopp det man vil oppdage, så den logges på Error og skrives til stdout.
///
/// Null endringer er den normale tilstanden og logges ikke.
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
            "uSync-import ENDRET skjema: {Count} elementer. {Summary}{More}. " +
            "Forventet tilstand er 0 endringer. Er dette uventet, sjekk om skjemafilene " +
            "i uSync/v17 kommer fra en annen database enn denne.",
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
        var more = conflicts.Count > 10 ? $"\n  … og {conflicts.Count - 10} til" : "";

        if (allowed)
        {
            Console.WriteLine(
                $"ADVARSEL SchemaRekeyGuard: importen re-nøkler {conflicts.Count} typer, " +
                $"men USYNC_ALLOW_REKEY=true så den slippes gjennom.\n  {summary}{more}");
            return;
        }

        // notification.Cancel respekteres IKKE av uSync 17.3.6 (verifisert: importen kjørte
        // videre og re-nøklet 80 elementer). Vi kaster i stedet, som avbryter operasjonen.
        notification.Cancel = true;
        var message =
            $"SchemaRekeyGuard STOPPET uSync-importen. Den ville gitt {conflicts.Count} " +
            $"eksisterende typer nye nøkler, og alt blokkinnhold ville blitt «Unsupported».\n" +
            $"  {summary}{more}\n" +
            $"  Årsak er nesten alltid at skjemafilene i uSync/v17 er eksportert fra en ANNEN " +
            $"database enn denne. De skal tas fra prod.\n" +
            $"  Er re-nøklingen tilsiktet, sett USYNC_ALLOW_REKEY=true.";
        Console.Error.WriteLine($"FEIL {message}");
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
                // Finnes ikke i databasen = ny type, ingen re-nøkling.
                if (dbKey is null || dbKey == fileKey) continue;

                conflicts.Add($"{folder}/{alias}: databasen har {dbKey}, fila har {fileKey}");
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
            // Ulesbar fil er ikke denne guardens problem; uSync rapporterer den selv.
            return (null, null);
        }
    }
}
