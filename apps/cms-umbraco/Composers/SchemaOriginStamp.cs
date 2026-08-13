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
/// Stempler hver uSync-eksport med hvilket miljø den kom fra.
///
/// Skjemafilene som committes SKAL være tatt fra prod. Uten et merke i selve
/// eksporten er det umulig å se i etterkant hvor filene kom fra, og en eksport fra
/// en lokal database ser helt lik ut i en diff.
///
/// Merket skrives av kode, ikke av per-maskin-config, så det følger repoet til alle
/// som kjører CMS-et. CI leser det og avviser en PR der opprinnelsen ikke er prod
/// (scripts/check-usync-schema.sh).
///
/// Miljøet utledes av UmbracoApplicationUrl, som allerede skiller miljøene fra
/// hverandre. Ingen ny env-var å huske å sette.
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
        // Bare skjema-eksporter er interessante. Finnes ikke mappa, ble det ikke eksportert skjema.
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
            // Et manglende merke skal aldri velte en eksport.
            _logger.LogWarning(ex, "Fikk ikke skrevet uSync .origin-merket.");
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
