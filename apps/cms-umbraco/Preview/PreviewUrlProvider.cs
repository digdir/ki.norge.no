using Microsoft.Extensions.Configuration;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Models.PublishedContent;
using Umbraco.Cms.Core.Routing;

namespace KiNorge.Cms.Preview;

/// <summary>
/// Builds the frontend preview URL for a document: HeadlessPreview:FrontendUrl, the path from
/// <see cref="ContentRouteResolver"/> (content-routes.json) and ?preview=true&amp;secret= with
/// HeadlessPreview:PreviewSecret. Used only for preview; published URLs come from Umbraco.
/// The backoffice shows the URL in an iframe, see App_Plugins/Preview.
/// </summary>
public class PreviewUrlProvider : IUrlProvider
{
    /// <summary>Must match PREVIEW_URL_PROVIDER_ALIAS in App_Plugins/Preview/preview-constants.js.</summary>
    public const string ProviderAlias = "KiNorgePreviewUrlProvider";

    private readonly IConfiguration _config;
    private readonly ContentRouteResolver _routes;

    public PreviewUrlProvider(IConfiguration config, ContentRouteResolver routes)
    {
        _config = config;
        _routes = routes;
    }

    public string Alias => ProviderAlias;

    public UrlInfo? GetUrl(IPublishedContent content, UrlMode mode, string? culture, Uri current)
        => null;

    public IEnumerable<UrlInfo> GetOtherUrls(int id, Uri current)
        => [];

    public Task<UrlInfo?> GetPreviewUrlAsync(IContent content, string? culture, string? segment)
    {
        var path = _routes.Resolve(content);
        if (path == null)
        {
            return Task.FromResult<UrlInfo?>(new UrlInfo(
                url: null,
                provider: Alias,
                culture: culture,
                message: $"Forhåndsvisning er ikke tilgjengelig for innholdstypen '{content.ContentType.Alias}'.",
                isExternal: true));
        }

        var frontendUrl = _config["HeadlessPreview:FrontendUrl"];
        if (string.IsNullOrWhiteSpace(frontendUrl)) frontendUrl = "http://localhost:4321";
        var previewSecret = _config["HeadlessPreview:PreviewSecret"] ?? "";

        return Task.FromResult<UrlInfo?>(new UrlInfo(
            url: new Uri($"{frontendUrl.TrimEnd('/')}{path}?preview=true&secret={previewSecret}"),
            provider: Alias,
            culture: culture,
            message: null,
            isExternal: true));
    }
}
