using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.Extensions.Options;

namespace KiNorge.Cms.CustomAuthentication;

/// <summary>
/// Setter OpenID Connect-opsjoner for Microsoft Entra ID-paalogging.
/// </summary>
public class ConfigureMicrosoftEntraIdAuthenticationOptions : IConfigureNamedOptions<OpenIdConnectOptions>
{
    private readonly IConfiguration _configuration;

    public ConfigureMicrosoftEntraIdAuthenticationOptions(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    public void Configure(OpenIdConnectOptions options)
    {
        var clientId = _configuration["MicrosoftEntraId:ClientId"]
            ?? throw new Exception("Missing MicrosoftEntraId:ClientId");

        var clientSecret = _configuration["MicrosoftEntraId:ClientSecret"]
            ?? throw new Exception("Missing MicrosoftEntraId:ClientSecret");

        var authority = _configuration["MicrosoftEntraId:Authority"]
            ?? throw new Exception("Missing MicrosoftEntraId:Authority");

        var callbackPath = _configuration["MicrosoftEntraId:CallbackPath"]
            ?? throw new Exception("Missing MicrosoftEntraId:CallbackPath");

        options.CallbackPath = callbackPath;
        options.ClientId = clientId;
        options.ClientSecret = clientSecret;
        options.Authority = authority;
        options.RequireHttpsMetadata = false;

        options.ResponseType = "code";

        options.Scope.Clear();
        options.Scope.Add("openid");
        options.Scope.Add("profile");
        options.Scope.Add("email");

        options.GetClaimsFromUserInfoEndpoint = true;

        // Claim-typer som matcher det Entra ID leverer
        options.TokenValidationParameters.NameClaimType = "name";
        options.TokenValidationParameters.RoleClaimType =
            "http://schemas.microsoft.com/ws/2008/06/identity/claims/role";

        options.SaveTokens = false;

        options.NonceCookie.SecurePolicy = CookieSecurePolicy.Always;
        options.CorrelationCookie.SecurePolicy = CookieSecurePolicy.Always;

        // Traefik skriver om host internt, saa bygg redirect-URI fra den
        // offentlige backoffice-hosten naar den er satt (per miljoe i syncroot).
        var applicationUrl = _configuration["Umbraco:CMS:Security:BackOfficeHost"];
        if (!string.IsNullOrEmpty(applicationUrl))
        {
            options.Events.OnRedirectToIdentityProvider = context =>
            {
                context.ProtocolMessage.RedirectUri =
                    $"{applicationUrl.TrimEnd('/')}{callbackPath}";
                return Task.CompletedTask;
            };
        }
    }

    public void Configure(string? name, OpenIdConnectOptions options)
    {
        if (name == Umbraco.Cms.Api.Management.Security.BackOfficeAuthenticationBuilder.SchemeForBackOffice(
                MicrosoftEntraIdBackOfficeExternalLoginProviderOptions.SchemeName))
        {
            Configure(options);
        }
    }
}
