using Microsoft.Extensions.DependencyInjection;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;

namespace KiNorge.Cms.Malform;

/// <summary>
/// Registers the målform report. Scoped because it uses ContentTextExtractor,
/// which is itself scoped. No notification handlers, the report is computed on request.
/// </summary>
public class MalformComposer : IComposer
{
    public void Compose(IUmbracoBuilder builder)
    {
        builder.Services.AddScoped<MalformReportBuilder>();
    }
}
