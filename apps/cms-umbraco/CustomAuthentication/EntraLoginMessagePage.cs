using System.Text.Encodings.Web;

namespace KiNorge.Cms.CustomAuthentication;

/// <summary>
/// The page shown when an Entra ID login is cancelled or fails. Markup in EntraLoginMessagePage.html.
/// </summary>
public static class EntraLoginMessagePage
{
    public enum Kind
    {
        Cancelled,
        Failed,
    }

    private const string ResourceName = "KiNorge.Cms.CustomAuthentication.EntraLoginMessagePage.html";

    private static readonly Lazy<string> Template = new(LoadTemplate);

    public static Task WriteAsync(HttpContext context, Kind kind)
    {
        var response = context.Response;
        response.StatusCode = kind == Kind.Failed
            ? StatusCodes.Status500InternalServerError
            : StatusCodes.Status200OK;
        response.ContentType = "text/html; charset=utf-8";
        response.Headers.CacheControl = "no-store";

        return response.WriteAsync(Render(context, kind));
    }

    public static string Render(HttpContext context, Kind kind) =>
        Template.Value
            .Replace("{{kind}}", kind == Kind.Failed ? "failed" : "cancelled")
            .Replace("{{traceId}}", HtmlEncoder.Default.Encode(context.TraceIdentifier));

    private static string LoadTemplate()
    {
        using var stream = typeof(EntraLoginMessagePage).Assembly.GetManifestResourceStream(ResourceName)
            ?? throw new InvalidOperationException(
                $"Embedded resource not found: {ResourceName}. " +
                "Ensure the file is included as <EmbeddedResource> in the .csproj.");

        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
