using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Cms.Core.Events;
using Umbraco.Cms.Core.Notifications;
using Umbraco.Cms.Core.Strings;

namespace KiNorge.Cms.Composers;

/// <summary>
/// Vasker det redaktor-synlige slug-feltet til en URL-vennlig verdi ved lagring.
/// Gjelder alle innholdstyper med et 'slug'-felt (artikkel, eksempel, side, veiledning,
/// sandkasse, omOss osv.). Er slug tom, utledes den fra tittel (ellers nodenavnet).
/// Idempotent: en allerede ren slug endres ikke. merkelapp handteres separat
/// (MerkelappSlugHandler, fra navn).
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
            // merkelapp har egen handler som utleder slug fra navn.
            if (content.ContentType.Alias == "merkelapp") continue;
            if (!content.HasProperty("slug")) continue;

            var current = content.GetValue<string>("slug");
            var source = !string.IsNullOrWhiteSpace(current)
                ? current
                : (content.GetValue<string>("tittel") ?? content.Name);

            if (string.IsNullOrWhiteSpace(source)) continue;

            var cleaned = _shortStringHelper.CleanStringForUrlSegment(source);
            if (!string.IsNullOrWhiteSpace(cleaned) && cleaned != current)
            {
                content.SetValue("slug", cleaned);
            }
        }
    }
}
