using System.Text.RegularExpressions;

namespace KiNorge.Cms.Composers;

/// <summary>
/// Washes link fields that editors fill in by hand. ONLY internal paths are washed.
/// External URLs are left completely untouched (apart from trimming), because an editor
/// who pastes a real URL should not risk having it broken.
///
/// External = something that has a scheme (http:, https:, mailto:, tel:, ftp: ...),
/// is protocol-relative (//host), is an anchor (#...) or looks like a bare
/// domain (datatilsynet.no/...). Everything else is treated as an internal path.
///
/// Internal wash: trim, one leading slash, no trailing slash,
/// collapses double slashes. Query (?) and fragment (#) are kept unchanged.
/// Idempotent: an already washed value is returned unchanged.
/// </summary>
public static class InternalUrlWasher
{
    // Schemes like http:, https:, mailto:, tel:, ftp: ... (RFC 3986 scheme).
    private static readonly Regex SchemeRegex =
        new(@"^[a-zA-Z][a-zA-Z0-9+.\-]*:", RegexOptions.Compiled);

    // Bare domain without a scheme: "datatilsynet.no", "example.com/sti". Checked on
    // the first segment (before /, ? or #). Requires at least one dot and a letter TLD.
    private static readonly Regex BareDomainRegex =
        new(@"^[a-z0-9\-]+(\.[a-z0-9\-]+)*\.[a-z]{2,}$", RegexOptions.Compiled | RegexOptions.IgnoreCase);

    public static string? Wash(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return value;

        var v = value.Trim();

        // External or special: leave as is (trimmed only).
        if (SchemeRegex.IsMatch(v) || v.StartsWith("//") || v.StartsWith("#")) return v;

        // Separate path from query/fragment so we never touch ?...  or #...
        var cut = v.IndexOfAny(new[] { '?', '#' });
        var path = cut >= 0 ? v.Substring(0, cut) : v;
        var suffix = cut >= 0 ? v.Substring(cut) : string.Empty;

        // Bare domain (without a scheme) in the path part -> external, do not prefix a slash
        // (otherwise "datatilsynet.no/x" becomes "/datatilsynet.no/x" and broken).
        var firstSegment = path.Split('/')[0];
        if (BareDomainRegex.IsMatch(firstSegment)) return v;

        // Internal path: clean up.
        path = path.Replace(" ", string.Empty);
        if (!path.StartsWith("/")) path = "/" + path;
        while (path.Contains("//")) path = path.Replace("//", "/");
        if (path.Length > 1 && path.EndsWith("/")) path = path.TrimEnd('/');

        return path + suffix;
    }
}
