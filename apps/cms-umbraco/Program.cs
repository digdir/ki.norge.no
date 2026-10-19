using Microsoft.AspNetCore.DataProtection;

// ── Guard: prevent two instances (protects SQLite from corruption) ──
// Must run BEFORE WebApplication.CreateBuilder, because Umbraco's boot
// sequence can overwrite the database file.
{
    // 1. Port check — the most reliable guard
    foreach (var port in new[] { 5000, 44391 })
    {
        try
        {
            using var tcp = new System.Net.Sockets.TcpClient();
            tcp.Connect("127.0.0.1", port);
            Console.ForegroundColor = ConsoleColor.Red;
            Console.Error.WriteLine($"Port {port} is already in use! Another CMS instance is probably running.");
            Console.Error.WriteLine("Stop it with: pkill -f KiNorge.Cms");
            Console.ResetColor();
            Environment.Exit(1);
        }
        catch (System.Net.Sockets.SocketException) { /* Port is free */ }
    }

    // 2. DB file lock — keeps the DB file locked while running
    var dbPath = Path.Combine(Directory.GetCurrentDirectory(), "umbraco", "Data", "Umbraco.sqlite.db");
    if (File.Exists(dbPath) && new FileInfo(dbPath).Length > 8192)
    {
        try
        {
            var dbLock = new FileStream(dbPath + ".lock", FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
            AppDomain.CurrentDomain.ProcessExit += (_, _) => { dbLock.Dispose(); try { File.Delete(dbPath + ".lock"); } catch {} };
        }
        catch (IOException)
        {
            Console.ForegroundColor = ConsoleColor.Red;
            Console.Error.WriteLine("CMS is already running! Stop the other instance first (Ctrl+C / pkill -f KiNorge.Cms).");
            Console.ResetColor();
            Environment.Exit(1);
        }
    }
}

WebApplicationBuilder builder = WebApplication.CreateBuilder(args);

// ── DataProtection keys on disk ──
// Without this, ASP.NET creates the keys under $HOME/.aspnet/DataProtection-Keys, which is
// pod-local. Every new pod gets new keys, and then the backoffice cookies
// (__Host-umbAccessToken, __Host-umbRefreshToken, UMB_UCONTEXT) can no longer be decrypted.
// All editors are logged out on every deploy. umbraco-data is ReadWriteOnce with
// replicas: 1 and strategy: Recreate, so only one pod writes here at a time.
// The path only exists in the deployed environments; locally it falls back to the default.
var dpKeys = builder.Configuration["DataProtection:KeyPath"];
if (!string.IsNullOrWhiteSpace(dpKeys))
{
    builder.Services.AddDataProtection()
        .PersistKeysToFileSystem(new DirectoryInfo(dpKeys))
        .SetApplicationName("KiNorge.Cms");
}

// ── Azure Key Vault config (prod/tt02 on dis-core) ──
// dis-core provisions an Azure Key Vault per environment and gives the pod a workload
// identity (AZURE_* env + federated token) with access to it, plus the vault URI as
// KeyVault:AkvUri. Pull secrets into configuration so secret values (e.g.
// Umbraco:CMS:DeliveryApi:ApiKey) live in the vault, not in git. Secret names use "--"
// as the section separator (Foo--Bar -> Foo:Bar). Skipped locally where AkvUri is empty.
var akvUri = builder.Configuration["KeyVault:AkvUri"];
if (!string.IsNullOrWhiteSpace(akvUri))
{
    try
    {
        builder.Configuration.AddAzureKeyVault(new Uri(akvUri), new Azure.Identity.DefaultAzureCredential());
    }
    catch (Exception ex)
    {
        // A vault problem must never take down the CMS. Log and continue without it:
        // secret config (e.g. the Delivery API preview key) just won't load until the
        // vault is reachable again, but published content keeps serving.
        Console.Error.WriteLine($"[KeyVault] Could not load from {akvUri}: {ex.Message}. Continuing without it.");
    }
}

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
app.UseForwardedHeaders();

// Traefik rewrites :authority to the internal Kubernetes service hostname before
// forwarding to the pod. Normalize Request.Host back to the public hostname so
// Umbraco builds correct OAuth redirect URLs and media URLs.
string? configuredBackOfficeHost = app.Configuration["Umbraco:CMS:Security:BackOfficeHost"];
if (!string.IsNullOrEmpty(configuredBackOfficeHost) &&
    Uri.TryCreate(configuredBackOfficeHost, UriKind.Absolute, out Uri? backOfficeUri))
{
    app.Use(async (context, next) =>
    {
        if (!context.Request.Host.Host.Equals(backOfficeUri.Host, StringComparison.OrdinalIgnoreCase))
        {
            context.Request.Host = new HostString(backOfficeUri.Host);
        }
        await next(context);
    });
}

// The backoffice must not be frameable from other sites. The frontend in
// the preview is another matter, it is governed by the frontend's own CSP.
app.Use(async (context, next) =>
{
    context.Response.OnStarting(() =>
    {
        var headers = context.Response.Headers;
        if (headers.ContentType.ToString().StartsWith("text/html", StringComparison.OrdinalIgnoreCase))
        {
            if (!headers.ContentSecurityPolicy.ToString().Contains("frame-ancestors", StringComparison.OrdinalIgnoreCase))
            {
                headers.Append("Content-Security-Policy", "frame-ancestors 'self'");
            }
            if (!headers.ContainsKey("X-Frame-Options"))
            {
                headers.XFrameOptions = "SAMEORIGIN";
            }
        }
        return Task.CompletedTask;
    });
    await next(context);
});

// ── Health endpoints (before Umbraco middleware so they always respond) ──
// /api/health: liveness — process is alive, no DB check. Used for fast probes.
// /api/health/ready: readiness — DB reachable, Umbraco initialized. Used for traffic decisions.
app.MapGet("/api/health", () => Results.Ok(new { status = "ok", ts = DateTime.UtcNow }));

app.MapGet("/api/health/ready", (Umbraco.Cms.Core.Services.IContentTypeService cts, ILogger<Program> logger) =>
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
        logger.LogError(ex, "The readiness check failed");
        return Results.Json(new { status = "not_ready", reason = "readiness check failed" }, statusCode: 503);
    }
});

// Shows the state the composer creates. The composer only runs locally and in CI, so
// the endpoint only exists there.
if (app.Environment.IsDevelopment())
{
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
}

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
