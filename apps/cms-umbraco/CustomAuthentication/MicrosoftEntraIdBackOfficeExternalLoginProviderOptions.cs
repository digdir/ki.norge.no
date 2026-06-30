using Microsoft.Extensions.Options;
using Umbraco.Cms.Api.Management.Security;
using Umbraco.Cms.Core;
using System.Security.Claims;

namespace KiNorge.Cms.CustomAuthentication;

/// <summary>
/// Opsjoner for Microsoft Entra ID-ekstern paalogging. Auto-lenker brukere ved foerste
/// paalogging, synker navn, og mapper Entra app-roller til Umbraco-grupper.
/// </summary>
public class MicrosoftEntraIdBackOfficeExternalLoginProviderOptions : IConfigureNamedOptions<BackOfficeExternalLoginProviderOptions>
{
    public const string SchemeName = "MicrosoftEntraId";

    public void Configure(string? name, BackOfficeExternalLoginProviderOptions options)
    {
        if (name != Constants.Security.BackOfficeExternalAuthenticationTypePrefix + SchemeName)
        {
            return;
        }

        Configure(options);
    }

    public void Configure(BackOfficeExternalLoginProviderOptions options)
    {
        options.AutoLinkOptions = new ExternalSignInAutoLinkOptions(
            autoLinkExternalAccount: true,
            defaultUserGroups: Array.Empty<string>(),
            defaultCulture: null,
            allowManualLinking: true
        )
        {
            OnAutoLinking = (autoLinkUser, loginInfo) =>
            {
                var nameClaim = loginInfo.Principal.FindFirst("name");
                if (nameClaim != null)
                {
                    autoLinkUser.Name = nameClaim.Value;
                }
            },

            OnExternalLogin = (user, loginInfo) =>
            {
                // Synk navn fra Entra
                var nameClaim = loginInfo.Principal.FindFirst("name");
                if (nameClaim != null)
                {
                    user.Name = nameClaim.Value;
                }

                // Hent app-roller fra Entra
                var roles = loginInfo.Principal
                    .FindAll(ClaimTypes.Role)
                    .Select(r => r.Value)
                    .ToList();

                var mappedGroups = new List<string>();

                // Mapping fra Entra app-rolle til Umbraco-gruppe
                if (roles.Contains("umbraco-admin"))
                    mappedGroups.Add("admin");

                if (roles.Contains("umbraco-redaktor"))
                    mappedGroups.Add("editor");

                // Nekt paalogging hvis ingen rolle matcher
                if (!mappedGroups.Any())
                {
                    return false;
                }

                // Sett gruppene i Umbraco
                user.Roles.Clear();
                foreach (var group in mappedGroups)
                {
                    user.AddRole(group);
                }

                return true;
            }
        };

        // Behold lokal passord-paalogging ved siden av Entra under utrulling.
        // Settes til true for ren Entra-only senere.
        options.DenyLocalLogin = false;
    }
}
