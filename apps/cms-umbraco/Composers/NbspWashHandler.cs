using System.Text.RegularExpressions;
using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Cms.Core.Events;
using Umbraco.Cms.Core.Notifications;

namespace KiNorge.Cms.Composers;

/// <summary>
/// Turns all non-breaking spaces (U+00A0) and literal nbsp entities into ordinary
/// spaces on save. They sneak in when pasting from Word and the like, and give a fixed
/// space that does not break at line wraps, or a visible "&amp;nbsp;" when the entity
/// is pasted as plain text. Hits text and RichText fields directly on a document type,
/// and everything down in Block List / Block Grid (a blind replacement on block JSON is safe, because
/// nbsp only appears in text content, never in JSON or HTML syntax). Mirrors the pattern
/// of <see cref="UrlFieldWashHandler"/>.
///
/// Affects content saved after the handler is deployed. Existing nodes are washed
/// only when they are re-saved. The frontend normalizes nbsp at render anyway, so the public
/// sees clean text right away (see normalizeNbsp in the frontend).
/// </summary>
public class NbspWashComposer : IComposer
{
    public void Compose(IUmbracoBuilder builder)
    {
        builder.AddNotificationHandler<ContentSavingNotification, NbspWashHandler>();
    }
}

public class NbspWashHandler : INotificationHandler<ContentSavingNotification>
{
    // U+00A0 and the entity forms &nbsp; &#160; &#xA0; (with optional leading zeros) -> space.
    private static readonly Regex Nbsp =
        new("\u00A0|&nbsp;|&#0*160;|&#x0*A0;", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    // Field types where nbsp realistically shows up. Block List/Grid are washed as a whole JSON string.
    private static readonly HashSet<string> WashableEditors = new()
    {
        Constants.PropertyEditors.Aliases.RichText,
        Constants.PropertyEditors.Aliases.TextBox,
        Constants.PropertyEditors.Aliases.TextArea,
        Constants.PropertyEditors.Aliases.BlockList,
        Constants.PropertyEditors.Aliases.BlockGrid,
    };

    public void Handle(ContentSavingNotification notification)
    {
        foreach (var content in notification.SavedEntities)
        {
            foreach (var property in content.Properties)
            {
                if (!WashableEditors.Contains(property.PropertyType.PropertyEditorAlias)) continue;

                var cur = content.GetValue<string>(property.Alias);
                if (string.IsNullOrEmpty(cur)) continue;

                var washed = Nbsp.Replace(cur, " ");
                if (washed != cur) content.SetValue(property.Alias, washed);
            }
        }
    }
}
