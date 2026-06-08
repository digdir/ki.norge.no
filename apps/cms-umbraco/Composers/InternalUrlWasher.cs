using System.Text.RegularExpressions;

namespace KiNorge.Cms.Composers;

/// <summary>
/// Vasker lenkefelt som redaktører fyller ut for hånd. KUN interne stier vaskes.
/// Eksterne URLer lar vi stå helt urørt (bortsett fra trimming), fordi en redaktør
/// som limer inn en ekte URL ikke skal risikere at den blir ødelagt.
///
/// Ekstern = noe som har et skjema (http:, https:, mailto:, tel:, ftp: ...),
/// er protokoll-relativ (//host), er et anker (#...) eller ser ut som et bart
/// domene (datatilsynet.no/...). Alt annet behandles som intern sti.
///
/// Intern vask: trim, ett innledende skråstrek, ingen avsluttende skråstrek,
/// kollapser doble skråstreker. Query (?) og fragment (#) bevares uendret.
/// Idempotent: en allerede vasket verdi returneres uendret.
/// </summary>
public static class InternalUrlWasher
{
    // Skjema som http:, https:, mailto:, tel:, ftp: ... (RFC 3986 scheme).
    private static readonly Regex SchemeRegex =
        new(@"^[a-zA-Z][a-zA-Z0-9+.\-]*:", RegexOptions.Compiled);

    // Bart domene uten skjema: "datatilsynet.no", "example.com/sti". Sjekkes på
    // første segment (før /, ? eller #). Krever minst én prikk og bokstav-TLD.
    private static readonly Regex BareDomainRegex =
        new(@"^[a-z0-9\-]+(\.[a-z0-9\-]+)*\.[a-z]{2,}$", RegexOptions.Compiled | RegexOptions.IgnoreCase);

    public static string? Wash(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return value;

        var v = value.Trim();

        // Ekstern eller spesiell: la stå (kun trimmet).
        if (SchemeRegex.IsMatch(v) || v.StartsWith("//") || v.StartsWith("#")) return v;

        // Skill path fra query/fragment så vi aldri rører ?...  eller #...
        var cut = v.IndexOfAny(new[] { '?', '#' });
        var path = cut >= 0 ? v.Substring(0, cut) : v;
        var suffix = cut >= 0 ? v.Substring(cut) : string.Empty;

        // Bart domene (uten skjema) i path-delen -> ekstern, ikke prefiks skråstrek
        // (ellers blir "datatilsynet.no/x" til "/datatilsynet.no/x" og ødelagt).
        var firstSegment = path.Split('/')[0];
        if (BareDomainRegex.IsMatch(firstSegment)) return v;

        // Intern sti: rydd opp.
        path = path.Replace(" ", string.Empty);
        if (!path.StartsWith("/")) path = "/" + path;
        while (path.Contains("//")) path = path.Replace("//", "/");
        if (path.Length > 1 && path.EndsWith("/")) path = path.TrimEnd('/');

        return path + suffix;
    }
}
