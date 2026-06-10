using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;
using KiNorge.Cms.Search.Elasticsearch;
using Microsoft.Extensions.Options;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Services;

namespace KiNorge.Cms.Search;

/// <summary>
/// Turns an Umbraco content node into a <see cref="SearchDocument"/> for the
/// ki-content hybrid index. ki.norge.no content is culture-invariant (all bokmål),
/// so each node is indexed once with language "nb".
///
/// Title is taken from the tittel/sporsmal/term property (falling back to the node
/// name); body is harvested from every text-bearing property (TextBox/TextArea,
/// RichText, Block List/Grid), mirroring the proven Delivery-API crawler: container
/// content types are skipped and nodes with almost no prose (&lt; 20 chars) are dropped.
/// </summary>
public class ContentTextExtractor
{
    private readonly IDataTypeService _dataTypeService;
    private readonly ContentRouteResolver _routes;
    private readonly ElasticsearchOptions _options;
    private readonly ILogger<ContentTextExtractor> _logger;
    private readonly Dictionary<Guid, string?> _editorAliasCache = new();

    private static readonly Regex HtmlTagRegex = new(@"<[^>]+>", RegexOptions.Compiled);
    private static readonly Regex WhitespaceRegex = new(@"\s+", RegexOptions.Compiled);
    private static readonly Regex RteBlockRegex = new(
        @"<umb-rte-block(?:-inline)? data-content-key=""(?<guid>[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12})""></umb-rte-block(?:-inline)?>",
        RegexOptions.Compiled);

    // Listing/taxonomy containers + site settings — no real searchable content of their own.
    // Keep in sync with SKIP_TYPES in infrastructure/elasticsearch/crawl-umbraco.mjs.
    // Everything else is indexed (exclude-list), so new page types are picked up automatically.
    private static readonly HashSet<string> NonIndexableContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "artikler", "faqSamling", "ordbokSamling", "sider", "caser",
        "veiledninger", "merkelapper", "merkelapp", "forside",
        "globaleInnstillinger", "eksempler", "kalender",
    };

    // Property aliases that hold the display title, in priority order.
    private static readonly string[] TitleAliases = ["tittel", "sporsmal", "term"];

    private static readonly HashSet<string> TextEditors = new(StringComparer.Ordinal)
    {
        "Umbraco.TextBox",
        "Umbraco.TextArea",
    };

    public ContentTextExtractor(
        IDataTypeService dataTypeService,
        ContentRouteResolver routes,
        IOptions<ElasticsearchOptions> options,
        ILogger<ContentTextExtractor> logger)
    {
        _dataTypeService = dataTypeService;
        _routes = routes;
        _options = options.Value;
        _logger = logger;
    }

    public SearchDocument? ExtractDocument(IContent content)
    {
        if (content.Trashed)
            return null;

        if (NonIndexableContentTypes.Contains(content.ContentType.Alias))
            return null;

        var textSegments = new List<string>();

        foreach (var property in content.Properties)
        {
            if (_options.ExcludedProperties.Contains(property.Alias))
                continue;

            var editorAlias = GetEditorAlias(property.PropertyType);
            if (editorAlias == null)
                continue;

            var value = property.GetValue();
            if (value == null)
                continue;

            var text = ExtractTextFromValue(value, editorAlias);
            if (!string.IsNullOrWhiteSpace(text))
                textSegments.Add(text);
        }

        var body = WhitespaceRegex.Replace(string.Join(" ", textSegments), " ").Trim();

        // Drop nodes with effectively no prose (containers, stubs) — matches the crawler.
        if (body.Length < 20)
            return null;

        return new SearchDocument
        {
            Title = GetTitle(content),
            Url = GetContentUrl(content) ?? "",
            Body = body,
            Type = content.ContentType.Alias,
            Language = "nb",
        };
    }

    private static string GetTitle(IContent content)
    {
        foreach (var alias in TitleAliases)
        {
            var value = content.GetValue(alias)?.ToString();
            if (!string.IsNullOrWhiteSpace(value))
                return value.Trim();
        }

        return content.Name ?? "";
    }

    private string? GetEditorAlias(IPropertyType propertyType)
    {
        if (_editorAliasCache.TryGetValue(propertyType.DataTypeKey, out var cached))
            return cached;

        var dataType = _dataTypeService.GetAsync(propertyType.DataTypeKey).GetAwaiter().GetResult();
        var alias = dataType?.EditorAlias;
        _editorAliasCache[propertyType.DataTypeKey] = alias;
        return alias;
    }

    private string ExtractTextFromValue(object value, string editorAlias)
    {
        if (TextEditors.Contains(editorAlias))
            return value.ToString() ?? "";

        if (editorAlias == "Umbraco.RichText")
            return ExtractRichText(value.ToString());

        if (editorAlias is "Umbraco.BlockList" or "Umbraco.BlockGrid")
            return ExtractBlockListText(value.ToString());

        return "";
    }

    private string ExtractRichText(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return "";

        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;

            var markup = root.TryGetProperty("markup", out var markupElement)
                ? markupElement.GetString() ?? ""
                : "";

            // Expand inline blocks referenced in the markup
            markup = RteBlockRegex.Replace(markup, match =>
            {
                if (Guid.TryParse(match.Groups["guid"].Value, out var blockGuid)
                    && root.TryGetProperty("blocks", out var blocks)
                    && blocks.TryGetProperty("contentData", out var contentData))
                {
                    return " " + ExtractBlockContentByGuid(contentData, blockGuid) + " ";
                }
                return "";
            });

            return StripHtml(markup);
        }
        catch (JsonException)
        {
            // Older/plain RTE values are raw HTML, not the JSON envelope.
            return StripHtml(json);
        }
    }

    private string ExtractBlockContentByGuid(JsonElement contentData, Guid blockGuid)
    {
        if (contentData.ValueKind != JsonValueKind.Array)
            return "";

        foreach (var block in contentData.EnumerateArray())
        {
            if (block.TryGetProperty("key", out var keyProp)
                && Guid.TryParse(keyProp.GetString(), out var key)
                && key == blockGuid
                && block.TryGetProperty("values", out var values))
            {
                return ExtractTextFromBlockValues(values);
            }
        }

        return "";
    }

    private string ExtractTextFromBlockValues(JsonElement values)
    {
        var segments = new List<string>();

        if (values.ValueKind == JsonValueKind.Array)
        {
            foreach (var val in values.EnumerateArray())
            {
                if (val.TryGetProperty("value", out var valueProp))
                {
                    var text = valueProp.ValueKind == JsonValueKind.String
                        ? StripHtml(valueProp.GetString() ?? "")
                        : "";
                    if (!string.IsNullOrWhiteSpace(text))
                        segments.Add(text);
                }
            }
        }

        return string.Join(" ", segments);
    }

    private string ExtractBlockListText(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return "";

        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;

            if (root.TryGetProperty("contentData", out var contentData)
                && contentData.ValueKind == JsonValueKind.Array)
            {
                var segments = new List<string>();
                foreach (var block in contentData.EnumerateArray())
                {
                    if (block.TryGetProperty("values", out var values))
                    {
                        var text = ExtractTextFromBlockValues(values);
                        if (!string.IsNullOrWhiteSpace(text))
                            segments.Add(text);
                    }
                }
                return string.Join(" ", segments);
            }

            return "";
        }
        catch (JsonException ex)
        {
            _logger.LogWarning(ex, "Failed to parse Block List JSON");
            return "";
        }
    }

    // The frontend routes by content type + slug, not by Umbraco's content-tree
    // path — so a step lives at /veiledning/{guide}/{step}, not at its bare tree
    // path /{guide}/{step}. ContentRouteResolver (content-routes.json) is the
    // single source of truth, shared with the editor-preview provider.
    private string? GetContentUrl(IContent content)
    {
        try
        {
            return _routes.Resolve(content);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to resolve URL for content {ContentId}", content.Id);
            return null;
        }
    }

    private static string StripHtml(string html)
    {
        if (string.IsNullOrWhiteSpace(html))
            return "";

        var text = HtmlTagRegex.Replace(html, " ");
        text = WebUtility.HtmlDecode(text);
        text = WhitespaceRegex.Replace(text, " ").Trim();
        return text;
    }
}
