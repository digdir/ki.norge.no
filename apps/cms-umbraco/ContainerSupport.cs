using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Infrastructure.Runtime.RuntimeModeValidators;

namespace KiNorge.Cms;

public class ContainerSupport : IComposer
{
    public void Compose(IUmbracoBuilder builder)
        => builder.RuntimeModeValidators().Remove<UseHttpsValidator>();
}
