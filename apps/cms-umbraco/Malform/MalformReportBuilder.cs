using KiNorge.Cms.Search;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Services;

namespace KiNorge.Cms.Malform;

/// <summary>
/// Counts how much of the published content is nynorsk. Reuses
/// the text extraction from the search indexing, so RTE, Block List and textbox are handled
/// the same way in both places.
///
/// The report is computed anew every time it is requested. With under a hundred nodes
/// it costs milliseconds, and that spares us a stored value that can go stale.
/// </summary>
public sealed class MalformReportBuilder
{
    /// <summary>Språklova section 12. No written standard below 25 percent.</summary>
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
                // A single node with an odd property shape must not empty the whole report.
                _logger.LogError(ex, "Målform analysis failed for content {ContentId}", content.Id);
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
            dom.Andel);
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
            // Without measurable text the requirement is neither met nor broken. Without this
            // check the gap becomes 0 and an empty content tree appears green.
            tegnTotalt > 0 && mangler == 0,
            sider);
    }

    private static string Navn(Malform malform) => malform switch
    {
        Malform.Nynorsk => "nn",
        Malform.Bokmal => "nb",
        _ => "ukjent",
    };
}
