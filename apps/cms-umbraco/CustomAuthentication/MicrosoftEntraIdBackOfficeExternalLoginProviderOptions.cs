using Microsoft.Extensions.Options;
using Umbraco.Cms.Api.Management.Security;
using Umbraco.Cms.Core;
using System.Security.Claims;

namespace KiNorge.Cms.CustomAuthentication;

/// <summary>
/// Options for Microsoft Entra ID external sign-in. Auto-links users on first
/// sign-in, syncs names, and maps Entra app roles to Umbraco groups.
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
                // Without this the user is created unapproved and thrown back to
                // the login screen. Belongs here, not in OnExternalLogin, which would
                // revive users that were deliberately disabled at offboarding.
                autoLinkUser.IsApproved = true;

                var nameClaim = loginInfo.Principal.FindFirst("name");
                if (nameClaim != null)
                {
                    autoLinkUser.Name = nameClaim.Value;
                }
            },

            OnExternalLogin = (user, loginInfo) =>
            {
                // Sync name from Entra
                var nameClaim = loginInfo.Principal.FindFirst("name");
                if (nameClaim != null)
                {
                    user.Name = nameClaim.Value;
                }

                // Get app roles from Entra
                var roles = loginInfo.Principal
                    .FindAll(ClaimTypes.Role)
                    .Select(r => r.Value)
                    .ToList();

                var mappedGroups = new List<string>();

                // Mapping from Entra app role to Umbraco group
                if (roles.Contains("umbraco-admin"))
                    mappedGroups.Add("admin");

                if (roles.Contains("umbraco-redaktor"))
                    mappedGroups.Add("editor");

                // Deny sign-in if no role matches
                if (!mappedGroups.Any())
                {
                    return false;
                }

                // Set the groups in Umbraco
                user.Roles.Clear();
                foreach (var group in mappedGroups)
                {
                    user.AddRole(group);
                }

                return true;
            }
        };

        // Keep local password sign-in alongside Entra during rollout.
        // Set to true for pure Entra-only later.
        options.DenyLocalLogin = false;
    }
}
