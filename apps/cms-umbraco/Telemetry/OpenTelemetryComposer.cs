using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using OpenTelemetry.Trace;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;

namespace KiNorge.Cms.Telemetry;

/// <summary>
/// Wires up OTLP trace export to the otel-collector in the cluster. OTEL_* comes from
/// syncroot/base/umbraco/deployment.yaml, and is unset locally, so this is a no-op in dev.
/// Traces only: logs are bridged from Umbraco's Serilog pipeline via the sink in
/// appsettings.Production.json, because CreateUmbracoBuilder calls ClearProviders()
/// and would wipe a log provider registered here.
/// </summary>
public class OpenTelemetryComposer : IComposer
{
    public void Compose(IUmbracoBuilder builder)
    {
        string? otlpEndpoint = builder.Config["OTEL_EXPORTER_OTLP_ENDPOINT"];
        if (string.IsNullOrWhiteSpace(otlpEndpoint))
        {
            return;
        }

        Uri otlpUri = new(otlpEndpoint);

        builder.Services.AddOpenTelemetry()
            .WithTracing(tracing => tracing
                .AddAspNetCoreInstrumentation(opt =>
                {
                    opt.Filter = ctx =>
                    {
                        PathString path = ctx.Request.Path;
                        return !path.StartsWithSegments("/umbraco/backoffice")
                            && !path.StartsWithSegments("/umbraco/management/api")
                            && !path.StartsWithSegments("/umbraco/preview")
                            && !path.StartsWithSegments("/app_plugins")
                            && !path.StartsWithSegments("/css")
                            && !path.StartsWithSegments("/scripts")
                            && !path.StartsWithSegments("/lib")
                            && !path.StartsWithSegments("/media")
                            && !path.StartsWithSegments("/api/health");
                    };
                })
                .AddHttpClientInstrumentation(opt =>
                {
                    // Elasticsearch is deliberately not filtered; indexing calls are worth tracing.
                    opt.FilterHttpRequestMessage = req =>
                    {
                        string? host = req.RequestUri?.Host;
                        if (host is null) return true;
                        return !host.EndsWith(".vault.azure.net", StringComparison.OrdinalIgnoreCase)
                            && !host.EndsWith(".blob.core.windows.net", StringComparison.OrdinalIgnoreCase)
                            && !host.EndsWith(".queue.core.windows.net", StringComparison.OrdinalIgnoreCase)
                            && !host.EndsWith(".table.core.windows.net", StringComparison.OrdinalIgnoreCase)
                            && !host.Equals("login.microsoftonline.com", StringComparison.OrdinalIgnoreCase)
                            && !host.Equals("login.windows.net", StringComparison.OrdinalIgnoreCase)
                            && !host.EndsWith("our.umbraco.com", StringComparison.OrdinalIgnoreCase)
                            && !host.EndsWith("telemetry.umbraco.com", StringComparison.OrdinalIgnoreCase)
                            && !host.Equals(builder.Config["Cloudflare:ApiHost"], StringComparison.OrdinalIgnoreCase);
                    };
                })
                .AddOtlpExporter(opt => opt.Endpoint = otlpUri));
    }
}
