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

        // The backoffice login goes straight to Entra (autoRedirect), and with an active Entra
        // session Entra answers without user interaction. Sending every failure back to the login
        // would therefore loop forever on a persistent failure, like an expired client secret.
        // Same handling as info.altinn.no. Only stale attempts are retried, and only once:
        // - the correlation cookie expired, or the user pressed back into Entra's /authorize URL,
        //   replaying an old state;
        // - the same callback reached us twice (reload or double submit), so Entra had already
        //   redeemed the code (AADSTS54005).
        options.Events.OnRemoteFailure = async context =>
        {
            var logger = context.HttpContext.RequestServices
                .GetRequiredService<ILogger<ConfigureMicrosoftEntraIdAuthenticationOptions>>();
            var message = context.Failure?.Message ?? string.Empty;
            context.HandleResponse();

            if (IsOpenedWithoutEntra(context.Request))
            {
                // The browser opened the callback URL itself, e.g. Enter in the address bar.
                logger.LogInformation("Entra ID callback URL opened without a login in progress: {Reason}", message);
                context.Response.Redirect(BackOfficePath);
                return;
            }

            if (context.Failure is OpenIdConnectProtocolException protocolException &&
                protocolException.Data[OpenIdConnectParameterNames.Error] as string == AccessDeniedError)
            {
                // Redirecting to /umbraco would send the user straight back to Entra.
                logger.LogInformation("Entra ID login cancelled: {Reason}", message);
                await EntraLoginMessagePage.WriteAsync(context.HttpContext, EntraLoginMessagePage.Kind.Cancelled);
                return;
            }

            // The retry marker travels in the protected OIDC state, not in a cookie, since a browser
            // that drops the correlation cookie would drop a retry cookie too.
            var properties = context.Properties;
            var isStaleAttempt = (message == CorrelationFailedMessage || IsCodeAlreadyRedeemed(context.Failure))
                && properties is not null;
            if (isStaleAttempt && !properties!.Items.ContainsKey(RetryMarker))
            {
                // Same properties as the original challenge, so Umbraco's callback and return URL are
                // kept. The handler adds a new PKCE verifier and redirect URI on every challenge (and
                // throws if they are already there), so remove the ones from the stale attempt.
                logger.LogInformation("Entra ID login aborted (stale attempt), retrying once: {Reason}", message);
                properties.Items.Remove(OAuthConstants.CodeVerifierKey);
                properties.Items.Remove(OpenIdConnectDefaults.RedirectUriForCodePropertiesKey);
                properties.Items[RetryMarker] = "1";
                await context.HttpContext.ChallengeAsync(context.Scheme.Name, properties);
                return;
            }

            // Persistent failure, or the retry failed too: stop instead of looping.
            // The TraceId is the error reference shown on the page.
            if (isStaleAttempt)
            {
                // Usually a single user (back pressed twice, reload, cookies dropped), so a warning:
                // errors trigger alerts.
                logger.LogWarning("Entra ID login failed again after retry: {Reason} (TraceId {TraceId})",
                    message, context.HttpContext.TraceIdentifier);
            }
            else
            {
                // Configuration or Entra problem, e.g. an expired client secret: nobody can log in.
                logger.LogError(context.Failure, "Entra ID login failed: {Reason} (TraceId {TraceId})",
                    message, context.HttpContext.TraceIdentifier);
            }

            await EntraLoginMessagePage.WriteAsync(context.HttpContext, EntraLoginMessagePage.Kind.Failed);
        };
    }

    // Failure message from RemoteAuthenticationHandler when the correlation cookie is missing or invalid.
    private const string CorrelationFailedMessage = "Correlation failed.";

    // Set in the authentication properties (protected into the OIDC state) when a stale attempt is retried.
    private const string RetryMarker = "KiNorge.EntraLoginRetry";

    private const string AccessDeniedError = "access_denied";
    private const string InvalidGrantError = "invalid_grant";

    // Entra's answer when an authorization code is redeemed a second time. Only this code is
    // retried, other invalid_grant errors (like a PKCE mismatch) can be persistent.
    private const string CodeAlreadyRedeemedError = "AADSTS54005";

    private const string BackOfficePath = "/umbraco";

    // Entra always answers with a form post, so a GET without a state is not a callback, and
    // redirecting it to a new login cannot loop. A POST without a state is left as an error,
    // since it comes from Entra or a proxy, where a redirect could loop.
    private static bool IsOpenedWithoutEntra(HttpRequest request) =>
        HttpMethods.IsGet(request.Method) &&
        string.IsNullOrEmpty(request.Query[OpenIdConnectParameterNames.State]);

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
