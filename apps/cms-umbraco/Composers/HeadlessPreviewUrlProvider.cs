using Kjac.HeadlessPreview.Models;
using Kjac.HeadlessPreview.Services;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.Models;

namespace KiNorge.Cms.Composers;

/// <summary>
/// Implements IDocumentPreviewService for Kjac.HeadlessPreview package.
/// Maps CMS content types to their Astro frontend preview URLs.
/// </summary>
public class HeadlessPreviewComposer : IComposer
{
    public void Compose(IUmbracoBuilder builder)
        => builder.Services.AddUnique<IDocumentPreviewService, KiNorgePreviewService>();
}

public class KiNorgePreviewService : IDocumentPreviewService
{
    private readonly Microsoft.Extensions.Configuration.IConfiguration _config;

    public KiNorgePreviewService(Microsoft.Extensions.Configuration.IConfiguration config)
    {
        _config = config;
    }

    public Task<DocumentPreviewUrlInfo> PreviewUrlInfoAsync(IContent content, string? culture, string? segment)
    {
        var frontendUrl = _config["HeadlessPreview:FrontendUrl"];
        if (string.IsNullOrWhiteSpace(frontendUrl)) frontendUrl = "http://localhost:4321";
        var previewSecret = _config["HeadlessPreview:PreviewSecret"] ?? "";
        var contentType = content.ContentType.Alias;
        var slug = content.GetValue<string>("slug") ?? "";
        var guideSlug = content.GetValue<string>("guideSlug") ?? "";

        // Shared with the search indexer — see FrontendRoutes. stegartikkel needs
        // ancestor traversal we don't do here, so it falls through to the Info case.
        var path = FrontendRoutes.Path(contentType, slug, guideSlug);

        if (path == null)
        {
            return Task.FromResult(new DocumentPreviewUrlInfo { Info = $"Forhåndsvisning er ikke tilgjengelig for innholdstypen '{contentType}'." });
        }

        var previewUrl = $"{frontendUrl}{path}?preview=true&secret={previewSecret}";

        return Task.FromResult(new DocumentPreviewUrlInfo { PreviewUrl = previewUrl });
    }
}
