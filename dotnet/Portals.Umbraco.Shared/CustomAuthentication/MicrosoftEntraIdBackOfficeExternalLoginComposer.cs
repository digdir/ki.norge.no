using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Umbraco.Cms.Api.Management.Security;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Extensions;

namespace Portals.Shared.CustomAuthentication;

public class MicrosoftEntraIdBackOfficeExternalLoginComposer : IComposer
{
    public void Compose(IUmbracoBuilder builder)
    {
        var explicitEnabled = builder.Config.GetValue<bool?>("MicrosoftEntraId:Enabled");
        var clientId = builder.Config["MicrosoftEntraId:ClientId"];
        var clientSecret = builder.Config["MicrosoftEntraId:ClientSecret"];
        var authority = builder.Config["MicrosoftEntraId:Authority"];
        var callbackPath = builder.Config["MicrosoftEntraId:CallbackPath"];

        var hasRequiredConfiguration =
            !string.IsNullOrWhiteSpace(clientId) &&
            !string.IsNullOrWhiteSpace(clientSecret) &&
            !string.IsNullOrWhiteSpace(authority) &&
            !string.IsNullOrWhiteSpace(callbackPath);

        var shouldEnable = explicitEnabled ?? hasRequiredConfiguration;

        if (!shouldEnable)
        {
            return;
        }

        if (!hasRequiredConfiguration)
        {
            throw new InvalidOperationException(
                "Microsoft Entra ID backoffice login is enabled, but one or more required settings are missing: " +
                "MicrosoftEntraId:ClientId, MicrosoftEntraId:ClientSecret, MicrosoftEntraId:Authority, MicrosoftEntraId:CallbackPath.");
        }

        builder.Services.ConfigureOptions<MicrosoftEntraIdBackOfficeExternalLoginProviderOptions>();
        builder.Services.ConfigureOptions<ConfigureMicrosoftEntraIdAuthenticationOptions>();

        builder.AddBackOfficeExternalLogins(logins =>
        {
            logins.AddBackOfficeLogin(
                backOfficeAuthenticationBuilder =>
                {
                    var schemeName = BackOfficeAuthenticationBuilder.SchemeForBackOffice(
                        MicrosoftEntraIdBackOfficeExternalLoginProviderOptions.SchemeName);

                    ArgumentNullException.ThrowIfNull(schemeName);

                    backOfficeAuthenticationBuilder.AddOpenIdConnect(
                        schemeName,
                        options =>
                        {
                            // Config handled in ConfigureMicrosoftEntraIdAuthenticationOptions.
                        });
                });
        });
    }
}
