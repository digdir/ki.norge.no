using Kjac.HeadlessPreview.Models;
using Kjac.HeadlessPreview.Services;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.Models;

namespace KiNorge.Cms.Composers;

/// <summary>
/// Implements IDocumentPreviewService for Kjac.HeadlessPreview package.
/// Maps CMS content types to their Astro frontend preview URLs via the shared
/// <see cref="ContentRouteResolver"/> (content-routes.json), so editor preview and
/// search indexing build URLs the same way.
/// </summary>
public class HeadlessPreviewComposer : IComposer
{
    public void Compose(IUmbracoBuilder builder)
    {
        builder.Services.AddSingleton<ContentRouteResolver>();
        builder.Services.AddUnique<IDocumentPreviewService, KiNorgePreviewService>();
    }
}

public class KiNorgePreviewService : IDocumentPreviewService
{
    private readonly Microsoft.Extensions.Configuration.IConfiguration _config;
    private readonly ContentRouteResolver _routes;

    public KiNorgePreviewService(
        Microsoft.Extensions.Configuration.IConfiguration config,
        ContentRouteResolver routes)
    {
        _config = config;
        _routes = routes;
    }

    public Task<DocumentPreviewUrlInfo> PreviewUrlInfoAsync(IContent content, string? culture, string? segment)
    {
        var frontendUrl = _config["HeadlessPreview:FrontendUrl"];
        if (string.IsNullOrWhiteSpace(frontendUrl)) frontendUrl = "http://localhost:4321";
        var previewSecret = _config["HeadlessPreview:PreviewSecret"] ?? "";

        var path = _routes.Resolve(content);
        if (path == null)
        {
            return Task.FromResult(new DocumentPreviewUrlInfo
            {
                Info = $"Forhåndsvisning er ikke tilgjengelig for innholdstypen '{content.ContentType.Alias}'."
            });
        }

        var previewUrl = $"{frontendUrl}{path}?preview=true&secret={previewSecret}";
        return Task.FromResult(new DocumentPreviewUrlInfo { PreviewUrl = previewUrl });
    }
}
