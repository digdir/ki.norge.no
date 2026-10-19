using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Cms.Core.Events;
using Umbraco.Cms.Core.Notifications;
using Umbraco.Cms.Core.Services;

namespace KiNorge.Cms.Composers;

/// <summary>
/// Sets veiledningSteg.guideSlug automatically from the parent guide's slug on save.
/// A step sits as a child of veiledningGuide in the content tree, so guideSlug does not need to be filled in
/// manually. Free text easily gave a mismatch (casing/ø), and then the frontend found no steps to link to.
/// The field is overwritten on every save, so it matches the guide by construction.
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
