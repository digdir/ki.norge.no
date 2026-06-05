using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Cms.Core.Events;
using Umbraco.Cms.Core.Notifications;
using Umbraco.Cms.Core.Services;

namespace KiNorge.Cms.Composers;

/// <summary>
/// Setter veiledningSteg.guideSlug automatisk fra den overordnede guiden sin slug ved lagring.
/// Et steg ligger som barn av veiledningGuide i innholdstreet, så guideSlug trenger ikke fylles
/// manuelt. Fritekst ga lett mismatch (casing/ø), og da fant frontend ingen steg å lenke til.
/// Feltet overskrives hver lagring, så det matcher guiden by construction.
/// </summary>
public class VeiledningStegGuideSlugComposer : IComposer
{
    public void Compose(IUmbracoBuilder builder)
    {
        builder.AddNotificationHandler<ContentSavingNotification, VeiledningStegGuideSlugHandler>();
    }
}

public class VeiledningStegGuideSlugHandler : INotificationHandler<ContentSavingNotification>
{
    private readonly IContentService _contentService;

    public VeiledningStegGuideSlugHandler(IContentService contentService)
    {
        _contentService = contentService;
    }

    public void Handle(ContentSavingNotification notification)
    {
        foreach (var content in notification.SavedEntities)
        {
            if (content.ContentType.Alias != "veiledningSteg") continue;

            var parent = content.ParentId > 0 ? _contentService.GetById(content.ParentId) : null;
            if (parent is null || parent.ContentType.Alias != "veiledningGuide") continue;

            var guideSlug = parent.GetValue<string>("slug");
            if (string.IsNullOrWhiteSpace(guideSlug)) continue;

            content.SetValue("guideSlug", guideSlug);
        }
    }
}
