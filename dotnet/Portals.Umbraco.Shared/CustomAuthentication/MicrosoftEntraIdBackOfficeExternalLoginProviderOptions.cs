using System.Security.Claims;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using Umbraco.Cms.Api.Management.Security;
using Umbraco.Cms.Core;

namespace Portals.Shared.CustomAuthentication;

public class MicrosoftEntraIdBackOfficeExternalLoginProviderOptions : IConfigureNamedOptions<BackOfficeExternalLoginProviderOptions>
{
    public const string SchemeName = "MicrosoftEntraId";

    private readonly IConfiguration _configuration;

    public MicrosoftEntraIdBackOfficeExternalLoginProviderOptions(IConfiguration configuration)
    {
        _configuration = configuration;
    }

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
        var roleMappings = _configuration
            .GetSection("MicrosoftEntraId:RoleMappings")
            .Get<List<EntraRoleMapping>>() ?? new List<EntraRoleMapping>();

        var defaultGroup = _configuration["MicrosoftEntraId:DefaultUmbracoGroup"];

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
                    .ToHashSet();

                var mappedGroups = roleMappings
                    .Where(m => !string.IsNullOrWhiteSpace(m.EntraRole)
                        && !string.IsNullOrWhiteSpace(m.UmbracoGroup)
                        && roles.Contains(m.EntraRole!))
                    .Select(m => m.UmbracoGroup!)
                    .Distinct()
                    .ToList();

                if (mappedGroups.Count == 0 && !string.IsNullOrWhiteSpace(defaultGroup))
                {
                    mappedGroups.Add(defaultGroup);
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

    public sealed class EntraRoleMapping
    {
        public string? EntraRole { get; set; }
        public string? UmbracoGroup { get; set; }
    }
}
