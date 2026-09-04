using Microsoft.Extensions.DependencyInjection;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;

namespace KiNorge.Cms.Malform;

/// <summary>
/// Registrerer målformrapporten. Scoped fordi den bruker ContentTextExtractor,
/// som selv er scoped. Ingen notification handlers, rapporten regnes ut på kall.
/// </summary>
public class MalformComposer : IComposer
{
    public void Compose(IUmbracoBuilder builder)
    {
        builder.Services.AddScoped<MalformReportBuilder>();
    }
}
