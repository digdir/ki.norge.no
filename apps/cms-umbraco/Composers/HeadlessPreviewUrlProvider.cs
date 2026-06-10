using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Kjac.HeadlessPreview.Models;
using Kjac.HeadlessPreview.Services;
using Microsoft.Extensions.Logging;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Services;

namespace KiNorge.Cms.Composers;

/// <summary>
/// Implements IDocumentPreviewService for Kjac.HeadlessPreview package.
/// Maps CMS content types to their Astro frontend preview URLs.
///
/// URL patterns are loaded from content-routes.json (copied to publish output
/// via the csproj). This is a mirror of /shared/content-routes.json — the
/// frontend reads the source-of-truth copy directly. The sync test in the
/// frontend (content-routes-sync.test.ts) fails if they diverge.
/// </summary>
public class HeadlessPreviewComposer : IComposer
{
    public void Compose(IUmbracoBuilder builder)
        => builder.Services.AddUnique<IDocumentPreviewService, KiNorgePreviewService>();
}

public class KiNorgePreviewService : IDocumentPreviewService
{
    private static readonly Regex TokenRe = new(@"\{([a-zA-Z][a-zA-Z0-9]*)(?:\.slug)?\}", RegexOptions.Compiled);

    private readonly Microsoft.Extensions.Configuration.IConfiguration _config;
    private readonly IContentService _contentService;
    private readonly ILogger<KiNorgePreviewService> _logger;
    private readonly IReadOnlyDictionary<string, string> _routes;
    private readonly HashSet<string> _warnedMissingTypes = new();

    public KiNorgePreviewService(
        Microsoft.Extensions.Configuration.IConfiguration config,
        IContentService contentService,
        ILogger<KiNorgePreviewService> logger)
    {
        _config = config;
        _contentService = contentService;
        _logger = logger;
        _routes = LoadRoutes();
    }

    public Task<DocumentPreviewUrlInfo> PreviewUrlInfoAsync(IContent content, string? culture, string? segment)
    {
        var frontendUrl = _config["HeadlessPreview:FrontendUrl"];
        if (string.IsNullOrWhiteSpace(frontendUrl)) frontendUrl = "http://localhost:4321";
        var previewSecret = _config["HeadlessPreview:PreviewSecret"] ?? "";

        var path = ResolveUrl(content);
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

    private string? ResolveUrl(IContent content)
    {
        var contentType = content.ContentType.Alias;
        if (!_routes.TryGetValue(contentType, out var pattern))
        {
            if (_warnedMissingTypes.Add(contentType))
            {
                _logger.LogWarning(
                    "No route mapping for contentType '{ContentType}' in content-routes.json — preview unavailable.",
                    contentType);
            }
            return null;
        }

        var slug = content.GetValue<string>("slug") ?? "";
        var ancestorSlugByType = CollectAncestorSlugs(content);

        string? unresolved = null;
        var path = TokenRe.Replace(pattern, m =>
        {
            var key = m.Groups[1].Value;
            if (key == "slug") return slug;
            if (ancestorSlugByType.TryGetValue(key, out var v) && !string.IsNullOrWhiteSpace(v)) return v;
            unresolved = key;
            return "";
        });

        if (unresolved != null)
        {
            _logger.LogWarning(
                "Cannot resolve preview URL for {ContentType} (id={Id}): missing ancestor '{Ancestor}'. Pattern: {Pattern}",
                contentType, content.Id, unresolved, pattern);
            return null;
        }

        return path;
    }

    private Dictionary<string, string> CollectAncestorSlugs(IContent content)
    {
        var map = new Dictionary<string, string>();
        var parent = content.ParentId > 0 ? _contentService.GetById(content.ParentId) : null;
        while (parent != null)
        {
            var pType = parent.ContentType.Alias;
            if (!map.ContainsKey(pType))
            {
                map[pType] = parent.GetValue<string>("slug") ?? "";
            }
            parent = parent.ParentId > 0 ? _contentService.GetById(parent.ParentId) : null;
        }
        return map;
    }

    private IReadOnlyDictionary<string, string> LoadRoutes()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "content-routes.json");
        if (!System.IO.File.Exists(path))
        {
            _logger.LogError("content-routes.json not found at {Path}. Preview URLs will be unavailable.", path);
            return new Dictionary<string, string>();
        }

        try
        {
            using var stream = System.IO.File.OpenRead(path);
            var doc = JsonSerializer.Deserialize<ContentRoutesFile>(stream);
            return doc?.Routes ?? new Dictionary<string, string>();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to load content-routes.json from {Path}.", path);
            return new Dictionary<string, string>();
        }
    }

    private sealed class ContentRoutesFile
    {
        [JsonPropertyName("routes")]
        public Dictionary<string, string>? Routes { get; set; }
    }
}
