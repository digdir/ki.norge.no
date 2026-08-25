using KiNorge.Cms.Search;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Services;

namespace KiNorge.Cms.Malform;

/// <summary>
/// Teller opp hvor mye av det publiserte innholdet som er nynorsk. Gjenbruker
/// tekstuttrekket fra søkeindekseringen, så RTE, Block List og textbox behandles
/// likt de to stedene.
///
/// Rapporten regnes ut på nytt hver gang den etterspørres. Med under hundre noder
/// koster det millisekunder, og da slipper vi en lagret verdi som kan bli utdatert.
/// </summary>
public sealed class MalformReportBuilder
{
    /// <summary>Språklova paragraf 12. Ingen målform under 25 prosent.</summary>
    public const double Kravet = 0.25;

    private readonly IContentService _contentService;
    private readonly ContentTextExtractor _extractor;
    private readonly ILogger<MalformReportBuilder> _logger;

    public MalformReportBuilder(
        IContentService contentService,
        ContentTextExtractor extractor,
        ILogger<MalformReportBuilder> logger)
    {
        _contentService = contentService;
        _extractor = extractor;
        _logger = logger;
    }

    public MalformRapport Bygg()
    {
        var sider = new List<MalformSide>();

        foreach (var content in PublishedContentWalker.CollectAllPublished(_contentService))
        {
            try
            {
                var side = TilSide(content);
                if (side != null)
                    sider.Add(side);
            }
            catch (Exception ex)
            {
                // En enkelt node med rar property-form skal ikke tømme hele rapporten.
                _logger.LogError(ex, "Målformanalyse feilet for innhold {ContentId}", content.Id);
            }
        }

        sider.Sort((a, b) => b.Tegn.CompareTo(a.Tegn));
        return Summer(sider);
    }

    private MalformSide? TilSide(IContent content)
    {
        var dokument = _extractor.ExtractDocument(content);
        if (dokument == null)
            return null;

        var dom = MalformClassifier.Klassifiser(dokument.Body);

        return new MalformSide(
            content.Key.ToString(),
            dokument.Title,
            dokument.Url,
            dokument.Type,
            dokument.Body.Length,
            Navn(dom.Malform),
            dom.NynorskTreff,
            dom.BokmalTreff,
            dom.Sikkerhet);
    }

    private static MalformRapport Summer(List<MalformSide> sider)
    {
        var nynorsk = sider.Where(s => s.Malform == "nn").ToList();
        var bokmal = sider.Where(s => s.Malform == "nb").ToList();
        var ukjent = sider.Count - nynorsk.Count - bokmal.Count;

        long tegnTotalt = nynorsk.Sum(s => (long)s.Tegn) + bokmal.Sum(s => (long)s.Tegn);
        long tegnNynorsk = nynorsk.Sum(s => (long)s.Tegn);
        var klassifiserte = nynorsk.Count + bokmal.Count;

        var mangler = (long)Math.Max(0, Math.Round(Kravet * tegnTotalt - tegnNynorsk));

        return new MalformRapport(
            Kravet,
            sider.Count,
            nynorsk.Count,
            bokmal.Count,
            ukjent,
            tegnTotalt,
            tegnNynorsk,
            tegnTotalt == 0 ? 0 : (double)tegnNynorsk / tegnTotalt,
            klassifiserte == 0 ? 0 : (double)nynorsk.Count / klassifiserte,
            mangler,
            // Uten målbar tekst er kravet verken innfridd eller brutt. Uten denne
            // sjekken blir gapet 0 og et tomt innholdstre framstår som grønt.
            tegnTotalt > 0 && mangler == 0,
            Plukkliste(bokmal, mangler),
            sider);
    }

    /// <summary>
    /// Største bokmålssider først, til gapet er dekket. Det gir færrest sider å
    /// oversette, ikke minst arbeid per side, som er avveiningen en redaktør
    /// selv må ta i dashboardet.
    /// </summary>
    private static List<MalformSide> Plukkliste(List<MalformSide> bokmal, long mangler)
    {
        var plukk = new List<MalformSide>();
        long dekket = 0;

        foreach (var side in bokmal.OrderByDescending(s => s.Tegn))
        {
            if (dekket >= mangler)
                break;

            dekket += side.Tegn;
            plukk.Add(side);
        }

        return plukk;
    }

    private static string Navn(Malform malform) => malform switch
    {
        Malform.Nynorsk => "nn",
        Malform.Bokmal => "nb",
        _ => "ukjent",
    };
}
