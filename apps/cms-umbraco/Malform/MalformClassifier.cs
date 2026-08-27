using System.Text;

namespace KiNorge.Cms.Malform;

public enum Malform
{
    Ukjent,
    Bokmal,
    Nynorsk,
}

/// <param name="Sikkerhet">
/// 0 til 1. Hvor stor overvekt den vinnende målformen har blant markørtreffene.
/// Lave verdier betyr blandet tekst, ikke nødvendigvis feilklassifisering.
/// </param>
public sealed record MalformDom(Malform Malform, int NynorskTreff, int BokmalTreff, double Sikkerhet)
{
    public int Markortreff => NynorskTreff + BokmalTreff;
}

/// <summary>
/// Avgjør om en tekst er nynorsk eller bokmål ved å telle markørord, altså ord som
/// bare finnes i den ene målformen (ikkje/ikke, frå/fra, offentleg/offentlig).
/// Ord som er like i begge bærer ingen informasjon og fjernes fra begge listene
/// ved oppstart, slik at en glipp i listene ikke gir systematisk slagside.
/// </summary>
public static class MalformClassifier
{
    /// <summary>
    /// Antall markørord som må til for å felle en dom. Under dette er grunnlaget for
    /// tynt, og siden vises som ukjent framfor å gjettes på.
    ///
    /// Grensen går på bevis, ikke på tekstlengde. En lengdegrense teller ikke ordene
    /// i det hele tatt, og gjør begge feilene: den gir dom til lange sider med ett
    /// tilfeldig markørord, og nekter dom til korte sider som er utvetydige. Målt på
    /// de 74 prod-nodene har 67 sider 6 eller flere markører, så terskelen rammer
    /// bare det som faktisk er tvilsomt.
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
        "anbefalinger", "bare", "ble", "blir", "bruker", "brukt", "dere", "deres",
        "derfor", "disse", "flere", "fra", "først", "gjør", "gjøre", "hensyn",
        "heter", "hva", "hver", "hverken", "hvem", "hvilke", "hvilken", "hvordan",
        "hvorfor", "ikke", "jeg", "krever", "mens", "mer", "midlertidig", "mulig",
        "mulighet", "muligheter", "mye", "noe", "noen", "også", "offentlig",
        "sammen", "samtidig", "selv", "siden", "spørre", "tjeneste",
        "tjenester", "uten", "vet", "videre", "viktigste", "virksomhet",
        "virksomheter", "være",
    ];

    // "samme" er en fristende bokmålsmarkør (nynorsk har "same"), men holdes ute
    // så lenge Node-prototypen er fasit for verifiseringen. Legg den inn begge
    // steder samtidig, ellers blir listeavvik forvekslet med implementasjonsfeil.

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

        // Treffene rapporteres også når de er for få til en dom, så dashboardet kan
        // skille en side uten norsk tekst fra en side med for tynt grunnlag.
        var treff = nynorsk + bokmal;
        if (treff < MinsteMarkortreff)
            return new MalformDom(Malform.Ukjent, nynorsk, bokmal, 0);

        return new MalformDom(
            nynorsk > bokmal ? Malform.Nynorsk : Malform.Bokmal,
            nynorsk,
            bokmal,
            Math.Abs(nynorsk - bokmal) / (double)treff);
    }

    /// <summary>
    /// Deler teksten i småbokstavede ord av a-z pluss æøå. Alt annet, inkludert
    /// siffer og aksenttegn, er skilletegn. Markørlistene må holde seg innenfor
    /// samme alfabet, ellers blir ordet umulig å treffe.
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
