using System.Text.Json;
using System.Text.Json.Nodes;
using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Cms.Core.Events;
using Umbraco.Cms.Core.Notifications;
using Umbraco.Cms.Core.Services;

namespace KiNorge.Cms.Composers;

/// <summary>
/// Vasker alle felt som bruker "Lenke / URL"-datatypen ved lagring, uansett hvor de
/// ligger: direkte på en document type, eller nede i en Block List / Block Grid.
/// Vaskingen kjenner datatypen igjen på dens key, så datatypen er modulær: ta den i
/// bruk på et hvilket som helst felt og det vaskes automatisk. Kun interne stier
/// vaskes (se <see cref="InternalUrlWasher"/>); eksterne URLer står urørt.
/// Speiler mønsteret til <c>ContentSlugHandler</c>.
/// </summary>
public class UrlFieldWashComposer : IComposer
{
    public void Compose(IUmbracoBuilder builder)
    {
        builder.AddNotificationHandler<ContentSavingNotification, UrlFieldWashHandler>();
    }
}

public class UrlFieldWashHandler : INotificationHandler<ContentSavingNotification>
{
    private const string UrlDataTypeName = "Lenke / URL";

    private readonly IContentTypeService _contentTypeService;
    private readonly IDataTypeService _dataTypeService;

    private Guid? _urlKey;
    private bool _urlKeyResolved;

    public UrlFieldWashHandler(IContentTypeService contentTypeService, IDataTypeService dataTypeService)
    {
        _contentTypeService = contentTypeService;
        _dataTypeService = dataTypeService;
    }

    public void Handle(ContentSavingNotification notification)
    {
        var urlKey = ResolveUrlKey();
        if (urlKey == null) return;

        // Memo for (contentTypeKey, alias) -> (datatype-key, editor-alias) under denne lagringen.
        var memo = new Dictionary<(Guid, string), (Guid?, string?)>();

        foreach (var content in notification.SavedEntities)
        {
            foreach (var property in content.Properties)
            {
                var pt = property.PropertyType;

                if (pt.DataTypeKey == urlKey)
                {
                    var cur = content.GetValue<string>(property.Alias);
                    var washed = InternalUrlWasher.Wash(cur);
                    if (washed != cur) content.SetValue(property.Alias, washed);
                    continue;
                }

                if (IsBlockEditor(pt.PropertyEditorAlias))
                {
                    var raw = content.GetValue<string>(property.Alias);
                    if (TryWashBlockJson(raw, urlKey.Value, memo, out var updated))
                    {
                        content.SetValue(property.Alias, updated);
                    }
                }
            }
        }
    }

    private Guid? ResolveUrlKey()
    {
        if (_urlKeyResolved) return _urlKey;
        _urlKeyResolved = true;
        _urlKey = _dataTypeService.GetByEditorAlias(Constants.PropertyEditors.Aliases.TextBox)
            .FirstOrDefault(dt => dt.Name == UrlDataTypeName)?.Key;
        return _urlKey;
    }

    private static bool IsBlockEditor(string? editorAlias) =>
        editorAlias == Constants.PropertyEditors.Aliases.BlockList ||
        editorAlias == Constants.PropertyEditors.Aliases.BlockGrid;

    // Parser block-JSON, vasker URL-verdier (rekursivt for blokker-i-blokker) og
    // serialiserer tilbake. Returnerer false (og rører ingenting) ved ugyldig JSON.
    private bool TryWashBlockJson(string? raw, Guid urlKey,
        Dictionary<(Guid, string), (Guid?, string?)> memo, out string updated)
    {
        updated = raw ?? string.Empty;
        if (string.IsNullOrWhiteSpace(raw) || raw[0] != '{') return false;

        JsonNode? root;
        try { root = JsonNode.Parse(raw); }
        catch (JsonException) { return false; }

        if (root is not JsonObject obj) return false;

        var changed = WashContainer(obj, urlKey, memo);
        if (changed) updated = obj.ToJsonString();
        return changed;
    }

    private bool WashContainer(JsonObject container, Guid urlKey,
        Dictionary<(Guid, string), (Guid?, string?)> memo)
    {
        var changed = false;
        foreach (var arrayName in new[] { "contentData", "settingsData" })
        {
            if (container[arrayName] is not JsonArray arr) continue;
            foreach (var item in arr)
            {
                if (item is JsonObject block) changed |= WashBlock(block, urlKey, memo);
            }
        }
        return changed;
    }

    private bool WashBlock(JsonObject block, Guid urlKey,
        Dictionary<(Guid, string), (Guid?, string?)> memo)
    {
        if (block["contentTypeKey"]?.GetValue<string>() is not string ctKeyStr ||
            !Guid.TryParse(ctKeyStr, out var ctKey) ||
            block["values"] is not JsonArray values)
        {
            return false;
        }

        var changed = false;
        foreach (var v in values)
        {
            if (v is not JsonObject val) continue;
            if (val["alias"]?.GetValue<string>() is not string alias) continue;

            var (dtKey, editorAlias) = ResolveProp(ctKey, alias, memo);

            if (dtKey == urlKey)
            {
                if (val["value"] is JsonValue jv && jv.TryGetValue<string>(out var cur))
                {
                    var washed = InternalUrlWasher.Wash(cur);
                    if (washed != cur) { val["value"] = washed; changed = true; }
                }
            }
            else if (IsBlockEditor(editorAlias))
            {
                // Blokk-i-blokk: verdien kan være en JSON-streng eller et JSON-objekt.
                if (val["value"] is JsonValue inner && inner.TryGetValue<string>(out var innerStr))
                {
                    if (TryWashBlockJson(innerStr, urlKey, memo, out var upd)) { val["value"] = upd; changed = true; }
                }
                else if (val["value"] is JsonObject innerObj)
                {
                    if (WashContainer(innerObj, urlKey, memo)) changed = true;
                }
            }
        }
        return changed;
    }

    private (Guid?, string?) ResolveProp(Guid ctKey, string alias,
        Dictionary<(Guid, string), (Guid?, string?)> memo)
    {
        if (memo.TryGetValue((ctKey, alias), out var cached)) return cached;

        var ct = _contentTypeService.Get(ctKey);
        var p = ct?.CompositionPropertyTypes.FirstOrDefault(x => x.Alias == alias);
        var result = (p?.DataTypeKey, p?.PropertyEditorAlias);
        memo[(ctKey, alias)] = result;
        return result;
    }
}
