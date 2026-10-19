using System.Text;

namespace KiNorge.Cms.Malform;

public enum Malform
{
    Ukjent,
    Bokmal,
    Nynorsk,
}

/// <param name="Andel">
/// 0.5 to 1. How large a share of the marker words point to the winning written standard.
/// 1 means a pure written standard, values down towards 0.5 mean the page mixes nynorsk and bokmål.
/// 0 when no verdict has been reached.
/// </param>
public sealed record MalformDom(Malform Malform, int NynorskTreff, int BokmalTreff, double Andel)
{
    public int Markortreff => NynorskTreff + BokmalTreff;
}

/// <summary>
/// Decides whether a text is nynorsk or bokmål by counting marker words, that is words that
/// only exist in one of the written standards (ikkje/ikke, frå/fra, offentleg/offentlig).
/// Words that are the same in both carry no information and are removed from both lists
/// at startup, so that a slip in the lists does not give a systematic bias.
/// </summary>
public static class MalformClassifier
{
    /// <summary>
    /// Number of marker words needed to reach a verdict. Below this the basis is too
    /// thin, and the page is shown as unknown rather than guessed at.
    ///
    /// The limit is about evidence, not text length. A length limit does not count the words
    /// at all, and makes both mistakes: it gives a verdict to long pages with one
    /// random marker word, and refuses a verdict to short pages that are unambiguous. Measured on
    /// the 74 prod nodes, 67 pages have 6 or more markers, so the threshold only hits
    /// what is actually doubtful.
    /// </summary>
    public const int MinsteMarkortreff = 3;

    private static readonly string[] NynorskMarkorer =
    [
        "arbeidd", "berre", "bruka", "dei", "desse", "difor", "eg", "ein", "eit",
        "fleire", "frå", "fyrst", "føremål", "gjer", "gjere", "heiter", "høve",
        "ikkje", "korkje", "korleis", "krev", "kva", "kvar", "kvifor", "medan",
        "meir", "mellombels", "mogleg", "moglegheit", "moglegheiter", "mykje",
        "noko", "nokon", "nokre", "nytta", "nyttar", "offentleg", "omsyn", "saman",
        "samstundes", "sidan", "sjå", "sjølv", "spørje", "teneste", "tenester",
        "tilhøve", "tilrådingar", "utan", "vart", "veit", "vera", "vere", "verksemd",
        "verksemder", "vert", "verte", "vidare", "viktigaste",
    ];

    private static readonly string[] BokmalMarkorer =
    [
        "anbefalinger", "bare", "ble", "bruker", "dere", "deres",
        "derfor", "disse", "flere", "fra", "gjør", "gjøre", "hensyn",
        "heter", "hva", "hver", "hverken", "hvem", "hvilke", "hvilken", "hvordan",
        "hvorfor", "ikke", "jeg", "krever", "mens", "mer", "midlertidig", "mulig",
        "mulighet", "muligheter", "mye", "noe", "noen", "offentlig",
        "sammen", "samtidig", "selv", "siden", "spørre", "tjeneste",
        "tjenester", "uten", "vet", "videre", "viktigste", "virksomhet",
        "virksomheter", "være",
    ];

    // Words that do NOT belong above, even though they look like bokmål. Nynorsk allows
    // them, so they give false bokmål hits on pure nynorsk pages:
    //   blir, brukt   nynorsk has bli/blir/blei/blitt and brukt alongside verte/vert
    //   også          valid nynorsk, not only "òg"
    //   først         valid nynorsk alongside "fyrst"
    // Measured on the privacy statement, 11 of 15 bokmål hits were of this kind.
    //
    // The deduplication below does not catch such words, because it requires the word to be in
    // BOTH lists. "blir" never meets "vert". New markers must therefore be checked against
    // whether nynorsk actually allows the form, not just whether nynorsk has a different one.
    //
    // Still uncertain, should be reviewed by someone who knows nynorsk: derfor, samtidig,
    // spørre, midlertidig, bruker.

    private static readonly HashSet<string> Nynorsk;
    private static readonly HashSet<string> Bokmal;

    static MalformClassifier()
    {
        Nynorsk = new HashSet<string>(NynorskMarkorer, StringComparer.Ordinal);
        Bokmal = new HashSet<string>(BokmalMarkorer, StringComparer.Ordinal);

        foreach (var felles in Nynorsk.Intersect(Bokmal, StringComparer.Ordinal).ToList())
        {
            Nynorsk.Remove(felles);
            Bokmal.Remove(felles);
        }
    }

    public static MalformDom Klassifiser(string? tekst)
    {
        if (string.IsNullOrWhiteSpace(tekst))
            return new MalformDom(Malform.Ukjent, 0, 0, 0);

        var nynorsk = 0;
        var bokmal = 0;

        foreach (var ord in Ord(tekst))
        {
            if (Nynorsk.Contains(ord))
                nynorsk++;
            else if (Bokmal.Contains(ord))
                bokmal++;
        }

        // The hits are reported even when they are too few for a verdict, so the dashboard can
        // tell a page without Norwegian text from a page with too thin a basis.
        var treff = nynorsk + bokmal;
        if (treff < MinsteMarkortreff)
            return new MalformDom(Malform.Ukjent, nynorsk, bokmal, 0);

        return new MalformDom(
            nynorsk > bokmal ? Malform.Nynorsk : Malform.Bokmal,
            nynorsk,
            bokmal,
            Math.Max(nynorsk, bokmal) / (double)treff);
    }

    /// <summary>
    /// Splits the text into lowercased words of a-z plus æøå. Everything else, including
    /// numerals and accented characters, is a separator. The marker lists must stay within
    /// the same alphabet, otherwise the word becomes impossible to hit.
    /// </summary>
    private static IEnumerable<string> Ord(string tekst)
    {
        var buffer = new StringBuilder();

        foreach (var tegn in tekst)
        {
            var liten = char.ToLowerInvariant(tegn);
            if (liten is >= 'a' and <= 'z' or 'æ' or 'ø' or 'å')
            {
                buffer.Append(liten);
            }
            else if (buffer.Length > 0)
            {
                yield return buffer.ToString();
                buffer.Clear();
            }
        }

        if (buffer.Length > 0)
            yield return buffer.ToString();
    }
}
