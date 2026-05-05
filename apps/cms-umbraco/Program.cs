using Portals.Shared.Configuration;

WebApplicationBuilder builder = WebApplication.CreateBuilder(args);

builder.Configuration.AddPortalsKeyVault(builder.Configuration, builder.Environment);

builder.CreateUmbracoBuilder()
    .AddBackOffice()
    .AddWebsite()
    .AddDeliveryApi()
    .AddComposers()
    .Build();

// Allow OpenIddict (backoffice auth) to work over HTTP in development
if (builder.Environment.IsDevelopment())
{
    builder.Services.Configure<Microsoft.AspNetCore.Authentication.AuthenticationOptions>(options => { });
    builder.Services.AddOpenIddict()
        .AddServer(options =>
        {
            options.UseAspNetCore().DisableTransportSecurityRequirement();
        });
}

WebApplication app = builder.Build();

await app.BootUmbracoAsync();

// ── Health endpoints (before Umbraco middleware so they always respond) ──
// /api/health: liveness — process is alive, no DB check. Used for fast probes.
// /api/health/ready: readiness — DB reachable, Umbraco initialized. Used for traffic decisions.
app.MapGet("/api/health", () => Results.Ok(new { status = "ok", ts = DateTime.UtcNow }));

app.MapGet("/api/health/ready", (Umbraco.Cms.Core.Services.IContentTypeService cts) =>
{
    try
    {
        // Read a known content type — proves DB connection + Umbraco initialized
        var artikkel = cts.Get("artikkel");
        if (artikkel == null) return Results.Json(new { status = "not_ready", reason = "artikkel content type missing" }, statusCode: 503);
        return Results.Ok(new { status = "ready", ts = DateTime.UtcNow });
    }
    catch (Exception ex)
    {
        return Results.Json(new { status = "not_ready", reason = ex.Message }, statusCode: 503);
    }
});

// Diagnostic endpoint — check composer state (before Umbraco middleware)
app.MapGet("/api/diagnostics", (Umbraco.Cms.Core.Services.IContentTypeService cts,
    Umbraco.Cms.Core.Services.IDataTypeService dts) =>
{
    var artikkel = cts.Get("artikkel");
    var hasIngress = artikkel?.PropertyTypes.Any(p => p.Alias == "ingress") ?? false;
    var hasBilde = artikkel?.PropertyTypes.Any(p => p.Alias == "artikkelBilde") ?? false;

    var rteDts = dts.GetByEditorAlias("Umbraco.RichText").ToList();
    var toolbarInfo = rteDts.Select(dt =>
    {
        var config = dt.ConfigurationData;
        var toolbar = config?.TryGetValue("toolbar", out var tb) == true
            ? System.Text.Json.JsonSerializer.Serialize(tb)
            : "none";
        return new { dt.Name, dt.Id, ToolbarPreview = toolbar.Length > 200 ? toolbar.Substring(0, 200) : toolbar };
    });

    return Results.Ok(new
    {
        artikkelFields = new { hasIngress, hasBilde },
        richTextDataTypes = toolbarInfo
    });
});

app.UseUmbraco()
    .WithMiddleware(u =>
    {
        u.UseBackOffice();
        u.UseWebsite();
    })
    .WithEndpoints(u =>
    {
        u.UseBackOfficeEndpoints();
        u.UseWebsiteEndpoints();
    });

await app.RunAsync();
