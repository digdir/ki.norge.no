using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;

namespace KiNorge.Cms.Preview;

/// <summary>
/// Registers the preview URL provider. The backoffice part (the "Forhåndsvisning" view with the
/// frontend in an iframe, and the "Lagre og forhåndsvis" button) lives in App_Plugins/Preview.
/// </summary>
public class PreviewComposer : IComposer
{
    public void Compose(IUmbracoBuilder builder)
        => builder.AddUrlProvider<PreviewUrlProvider>();
}
