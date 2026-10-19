using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Cms.Core.Events;
using Umbraco.Cms.Core.Notifications;
using Umbraco.Cms.Core.Strings;

namespace KiNorge.Cms.Composers;

/// <summary>
/// Washes the editor-visible slug field to a URL-friendly value on save.
/// Applies to all content types with a 'slug' field (artikkel, eksempel, side, veiledning,
/// sandkasse, omOss etc.). If slug is empty, it is derived from tittel (otherwise the node name).
/// Idempotent: an already clean slug is not changed. merkelapp is handled separately
/// (MerkelappSlugHandler, from navn).
/// </summary>
public class ContentSlugComposer : IComposer
{
    public void Compose(IUmbracoBuilder builder)
    {
        builder.AddNotificationHandler<ContentSavingNotification, ContentSlugHandler>();
    }
}

public class ContentSlugHandler : INotificationHandler<ContentSavingNotification>
{
    private readonly IShortStringHelper _shortStringHelper;

    public ContentSlugHandler(IShortStringHelper shortStringHelper)
    {
        _shortStringHelper = shortStringHelper;
    }

    public void Handle(ContentSavingNotification notification)
    {
        foreach (var content in notification.SavedEntities)
        {
            // merkelapp has its own handler that derives slug from navn.
            if (content.ContentType.Alias == "merkelapp") continue;
            if (!content.HasProperty("slug")) continue;

            var current = content.GetValue<string>("slug");
            var source = !string.IsNullOrWhiteSpace(current)
                ? current
                : (content.GetValue<string>("tittel") ?? content.Name);

            if (string.IsNullOrWhiteSpace(source)) continue;

            var cleaned = _shortStringHelper.CleanStringForUrlSegment(Transliterate(source));
            if (!string.IsNullOrWhiteSpace(cleaned) && cleaned != current)
            {
                content.SetValue("slug", cleaned);
            }
        }
    }

    /// <summary>Norwegian transliteration for slug: ø-&gt;o, å-&gt;a, æ-&gt;e (differs from Umbraco's oe/aa/ae).</summary>
    private static string Transliterate(string s) => s
        .Replace("Æ", "E").Replace("æ", "e")
        .Replace("Ø", "O").Replace("ø", "o")
        .Replace("Å", "A").Replace("å", "a");
}
