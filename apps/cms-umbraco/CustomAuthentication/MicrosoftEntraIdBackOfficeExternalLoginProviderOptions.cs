using System.Security.Claims;
using Microsoft.Extensions.Options;
using Umbraco.Cms.Api.Management.Security;
using Umbraco.Cms.Core;

namespace KiNorge.Cms.CustomAuthentication;

/// <summary>
/// Configuration options for Microsoft Entra ID (Azure AD) backoffice external login provider.
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
                var nameClaim = loginInfo.Principal.FindFirst("name");
                if (nameClaim != null)
                {
                    user.Name = nameClaim.Value;
                }

                var roles = loginInfo.Principal
                    .FindAll(ClaimTypes.Role)
                    .Select(r => r.Value)
                    .ToList();

                var mappedGroups = new List<string>();

                // Mapping: Entra App Role -> Umbraco user group.
                // Extend as ki-specific roles are defined in the Entra app registration.
                if (roles.Contains("umbraco-admin"))
                {
                    mappedGroups.Add("admin");
                }

                if (!mappedGroups.Any())
                {
                    mappedGroups.Add("writer");
                }

                user.Roles.Clear();
                foreach (var group in mappedGroups)
                {
                    user.AddRole(group);
                }

                return true;
            }
        };

        options.DenyLocalLogin = false;
    }
}
