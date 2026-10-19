using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Umbraco.Cms.Api.Management.Security;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Infrastructure.Manifest;

namespace KiNorge.Cms.CustomAuthentication;

/// <summary>
/// Registers Microsoft Entra ID as external sign-in for the Umbraco backoffice,
/// including the Microsoft button on the login screen (via MicrosoftEntraIdManifestReader).
/// Only enabled when all config under MicrosoftEntraId exists, otherwise it is inert,
/// no button is shown and local password sign-in is unchanged.
/// </summary>
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

        // The Microsoft button on the login screen is delivered via MicrosoftEntraIdManifestReader,
        // registered only here (same secrets gate). Without config there is no button.
        builder.Services.AddSingleton<IPackageManifestReader, MicrosoftEntraIdManifestReader>();

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
                            // Config is set in ConfigureMicrosoftEntraIdAuthenticationOptions
                        });
                });
        });
    }
}
