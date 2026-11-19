using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OAuth;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;

namespace KiNorge.Cms.CustomAuthentication;

/// <summary>
/// Sets OpenID Connect options for Microsoft Entra ID sign-in.
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
        options.RequireHttpsMetadata = true;

        options.ResponseType = "code";
        // The default, but IsOpenedWithoutEntra relies on it.
        options.ResponseMode = OpenIdConnectResponseMode.FormPost;

        options.Scope.Clear();
        options.Scope.Add("openid");
        options.Scope.Add("profile");
        options.Scope.Add("email");

        options.GetClaimsFromUserInfoEndpoint = true;

        // Claim types that match what Entra ID delivers
        options.TokenValidationParameters.NameClaimType = "name";
        options.TokenValidationParameters.RoleClaimType =
            "http://schemas.microsoft.com/ws/2008/06/identity/claims/role";

        options.SaveTokens = false;

        options.NonceCookie.SecurePolicy = CookieSecurePolicy.Always;
        options.CorrelationCookie.SecurePolicy = CookieSecurePolicy.Always;

        // Traefik rewrites the host internally, so build the redirect URI from the
        // public backoffice host when it is set (per environment in syncroot).
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

        // autoRedirect plus a silent Entra session means a failure sent back to /umbraco would
        // loop, so failures end on a page instead (same as info.altinn.no).
        options.Events.OnRemoteFailure = HandleRemoteFailureAsync;
    }

    private static async Task HandleRemoteFailureAsync(RemoteFailureContext context)
    {
        var logger = context.HttpContext.RequestServices
            .GetRequiredService<ILogger<ConfigureMicrosoftEntraIdAuthenticationOptions>>();
        var message = context.Failure?.Message ?? string.Empty;
        context.HandleResponse();

        // Callback URL opened by hand, e.g. Enter in the address bar.
        if (IsOpenedWithoutEntra(context.Request))
        {
            logger.LogInformation("Entra ID callback URL opened without a login in progress: {Reason}", message);
            context.Response.Redirect(BackOfficePath);
            return;
        }

        if (context.Failure is OpenIdConnectProtocolException protocolException &&
            protocolException.Data[OpenIdConnectParameterNames.Error] as string == AccessDeniedError)
        {
            logger.LogInformation("Entra ID login cancelled: {Reason}", message);
            await EntraLoginMessagePage.WriteAsync(context.HttpContext, EntraLoginMessagePage.Kind.Cancelled);
            return;
        }

        // Back button, expired correlation cookie, reload or double submit: retry once.
        // The marker is kept in the OIDC state, since a browser that drops cookies would drop it too.
        var properties = context.Properties;
        var isStaleAttempt = (message == CorrelationFailedMessage || IsCodeAlreadyRedeemed(context.Failure))
            && properties is not null;
        if (isStaleAttempt && !properties!.Items.ContainsKey(RetryMarker))
        {
            logger.LogInformation("Entra ID login aborted (stale attempt), retrying once: {Reason}", message);
            // The handler adds these on every challenge and throws if they already exist.
            properties.Items.Remove(OAuthConstants.CodeVerifierKey);
            properties.Items.Remove(OpenIdConnectDefaults.RedirectUriForCodePropertiesKey);
            properties.Items[RetryMarker] = "1";
            await context.HttpContext.ChallengeAsync(context.Scheme.Name, properties);
            return;
        }

        // Errors trigger alerts, so a failed retry (usually one user) is only a warning.
        if (isStaleAttempt)
        {
            logger.LogWarning("Entra ID login failed again after retry: {Reason} (TraceId {TraceId})",
                message, context.HttpContext.TraceIdentifier);
        }
        else
        {
            logger.LogError(context.Failure, "Entra ID login failed: {Reason} (TraceId {TraceId})",
                message, context.HttpContext.TraceIdentifier);
        }

        await EntraLoginMessagePage.WriteAsync(context.HttpContext, EntraLoginMessagePage.Kind.Failed);
    }

    private const string CorrelationFailedMessage = "Correlation failed.";
    private const string RetryMarker = "KiNorge.EntraLoginRetry";
    private const string AccessDeniedError = "access_denied";
    private const string InvalidGrantError = "invalid_grant";
    private const string CodeAlreadyRedeemedError = "AADSTS54005";
    private const string BackOfficePath = "/umbraco";

    // Entra always answers with a form post, so a GET without state is not a real callback.
    private static bool IsOpenedWithoutEntra(HttpRequest request) =>
        HttpMethods.IsGet(request.Method) &&
        string.IsNullOrEmpty(request.Query[OpenIdConnectParameterNames.State]);

    // Only AADSTS54005 (code already redeemed) is retried; other invalid_grant errors can be persistent.
    private static bool IsCodeAlreadyRedeemed(Exception? failure) =>
        failure is OpenIdConnectProtocolException exception &&
        exception.Data[OpenIdConnectParameterNames.Error] as string == InvalidGrantError &&
        exception.Data[OpenIdConnectParameterNames.ErrorDescription] is string description &&
        description.StartsWith(CodeAlreadyRedeemedError, StringComparison.Ordinal);

    public void Configure(string? name, OpenIdConnectOptions options)
    {
        if (name == Umbraco.Cms.Api.Management.Security.BackOfficeAuthenticationBuilder.SchemeForBackOffice(
                MicrosoftEntraIdBackOfficeExternalLoginProviderOptions.SchemeName))
        {
            Configure(options);
        }
    }
}
