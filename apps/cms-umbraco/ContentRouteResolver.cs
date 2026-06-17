using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Services;

namespace KiNorge.Cms;

/// <summary>
/// Resolves an Umbraco node to its public ki.norge.no frontend path (e.g.
/// /veiledning/{guide}/{slug}) using the route patterns in content-routes.json.
/// The frontend routes by content type + slug, NOT by Umbraco's content-tree
/// path, so every headless consumer (editor preview, search indexing) must build
/// URLs through here. The single source is /shared/content-routes.json; this
/// content-routes.json is generated from it at build time
/// (scripts/sync-content-routes.js) because the Docker build context is this
/// directory alone and cannot reach /shared. The generated copy is git-ignored.
///
/// Returns null when the content type has no route, or when a required ancestor
/// slug is missing.
/// </summary>
public sealed class ContentRouteResolver
{
    private static readonly Regex TokenRe = new(@"\{([a-zA-Z][a-zA-Z0-9]*)(?:\.slug)?\}", RegexOptions.Compiled);

    private readonly IContentService _contentService;
    private readonly ILogger<ContentRouteResolver> _logger;
    private readonly IReadOnlyDictionary<string, string> _routes;
    private readonly HashSet<string> _warnedMissingTypes = new();

    public ContentRouteResolver(IContentService contentService, ILogger<ContentRouteResolver> logger)
    {
        _contentService = contentService;
        _logger = logger;
        _routes = LoadRoutes();
    }

    public string? Resolve(IContent content)
    {
        var contentType = content.ContentType.Alias;
        if (!_routes.TryGetValue(contentType, out var pattern))
        {
            if (_warnedMissingTypes.Add(contentType))
            {
                _logger.LogWarning(
                    "No route mapping for contentType '{ContentType}' in content-routes.json — URL unavailable.",
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
                "Cannot resolve URL for {ContentType} (id={Id}): missing ancestor '{Ancestor}'. Pattern: {Pattern}",
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
            _logger.LogError("content-routes.json not found at {Path}. Frontend URLs will be unavailable.", path);
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
