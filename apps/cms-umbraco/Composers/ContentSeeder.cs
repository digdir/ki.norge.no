using System.Text.Json;
using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Services;
using Umbraco.Cms.Core.IO;
using Umbraco.Cms.Core.Strings;
using Umbraco.Cms.Core.PropertyEditors;
using Microsoft.AspNetCore.Hosting;

namespace KiNorge.Cms.Composers;

/// <summary>
/// Seeds demo content for development. Only runs once (checks if content exists).
/// Creates container nodes (folders) and populates each with content items.
/// Must run after ContentTypeComposer so document types exist.
/// </summary>
[ComposeAfter(typeof(ContentTypeComposer))]
public class ContentSeederComposer : ComponentComposer<ContentSeeder>
{
}

public class ContentSeeder : IAsyncComponent
{
    private readonly IContentService _contentService;
    private readonly IContentTypeService _contentTypeService;
    private readonly IMediaService _mediaService;
    private readonly IMediaTypeService _mediaTypeService;
    private readonly MediaFileManager _mediaFileManager;
    private readonly IShortStringHelper _shortStringHelper;
    private readonly IContentTypeBaseServiceProvider _contentTypeBaseServiceProvider;
    private readonly MediaUrlGeneratorCollection _mediaUrlGenerators;
    private readonly IRuntimeState _runtimeState;
    private readonly IWebHostEnvironment _webHostEnvironment;

    public ContentSeeder(
        IContentService contentService,
        IContentTypeService contentTypeService,
        IMediaService mediaService,
        IMediaTypeService mediaTypeService,
        MediaFileManager mediaFileManager,
        IShortStringHelper shortStringHelper,
        IContentTypeBaseServiceProvider contentTypeBaseServiceProvider,
        MediaUrlGeneratorCollection mediaUrlGenerators,
        IRuntimeState runtimeState,
        IWebHostEnvironment webHostEnvironment)
    {
        _contentService = contentService;
        _contentTypeService = contentTypeService;
        _mediaService = mediaService;
        _mediaTypeService = mediaTypeService;
        _mediaFileManager = mediaFileManager;
        _shortStringHelper = shortStringHelper;
        _contentTypeBaseServiceProvider = contentTypeBaseServiceProvider;
        _mediaUrlGenerators = mediaUrlGenerators;
        _runtimeState = runtimeState;
        _webHostEnvironment = webHostEnvironment;
    }

    public Task InitializeAsync(bool isRestarting, CancellationToken cancellationToken)
    {
        if (_runtimeState.Level < RuntimeLevel.Run) return Task.CompletedTask;

        // Structure migrations always run (idempotent fixes for content tree organization).
        // These don't create new content — they reorganize, sort, or remove existing items.
        try { RunStructureMigrations(); }
        catch (Exception ex) { Console.WriteLine($"ContentSeeder RunStructureMigrations: {ex.Message}"); }

        // Skip ALL seeding when LAUNCH_MODE=production.
        // Prevents seeder from re-creating content that editors deleted on prod.
        // For fresh installs / local dev, leave LAUNCH_MODE unset.
        var launchMode = Environment.GetEnvironmentVariable("LAUNCH_MODE")?.ToLowerInvariant();
        if (launchMode == "production")
        {
            Console.WriteLine("ContentSeeder: LAUNCH_MODE=production, skipping all seeding");
            return Task.CompletedTask;
        }

        // Migration: seed ordbok even if other content already exists
        try { MigrateOrdbokOppslag(); }
        catch (Exception ex) { Console.WriteLine($"ContentSeeder MigrateOrdbokOppslag: {ex.Message}"); }

        // Skip if Forside already exists — RunStructureMigrations may have created
        // some root content (Caser, KI-ordbok) on its own, so a generic Any() check
        // would skip seeding on first install. Forside is created only by the main
        // seeder, so it's a reliable "have we seeded before" marker.
        var existing = _contentService.GetRootContent().ToList();
        if (existing.Any(c => c.ContentType.Alias == "forside")) return Task.CompletedTask;

        try
        {
            // Create container nodes (folders) at root
            var artiklerFolder = CreateFolder("artikler", "Artikler");
            var siderFolder = CreateFolder("sider", "Sider");
            var eksemplerFolder = CreateFolder("eksempler", "Eksempler");
            var caserFolder = CreateFolder("caser", "Caser");
            var veiledningerFolder = CreateFolder("veiledninger", "Veiledninger");
            var faqFolder = CreateFolder("faqSamling", "FAQ");
            var merkelapperFolder = CreateFolder("merkelapper", "Merkelapper");
            var ordbokFolder = CreateFolder("ordbokSamling", "KI-ordbok");

            // Ikoner deaktivert — bruk Media-mappe i stedet for ikon-content type.
            // Cleanup of existing ikoner content done in RunStructureMigrations.

            // Seed media images
            SeedMedia();

            // Create root-level content nodes
            SeedForside();
            var omOssNode = SeedOmOss();
            SeedSandkasse(siderFolder.Id);
            SeedVeiledningOversikt();

            // Seed merkelapper FIRST so we can reference them from other content
            var merkelappMap = SeedMerkelapper(merkelapperFolder.Id);

            // Seed content under each folder (with merkelapp references)
            SeedArticles(artiklerFolder.Id);
            SeedPages(siderFolder.Id);
            SeedExamples(eksemplerFolder.Id);
            SeedCases(caserFolder.Id);
            SeedVeiledninger(veiledningerFolder.Id);
            SeedFAQ(faqFolder.Id, merkelappMap);
            SeedOrdbokOppslag(ordbokFolder.Id);

            Console.WriteLine("ContentSeeder: Seeded all content under folder structure");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"ContentSeeder: {ex.Message}");
        }
        return Task.CompletedTask;
    }

    public Task TerminateAsync(bool isRestarting, CancellationToken cancellationToken) => Task.CompletedTask;

    // ── Structure migrations (idempotent, run on every startup including LAUNCH_MODE=production) ──

    private void RunStructureMigrations()
    {
        // Create root folders if missing (idempotent — only creates if not present)
        EnsureCaserFolderExists();
        // Reorganize existing content
        ForceForsideToTop();
        RemoveIkonerContent();
        RenameVeiledningerToVeiledning();
        RenameFaqContainerNode();
        MoveOmOssIntoSider();
        ClearFaqKategoriReferences();
        MoveVeiledningOversiktUnderVeiledning();
        FlattenVeiledningOversiktIntoContainer();
        NestVeiledningStegUnderGuide();
        FlattenOmOssSeksjonerToBlocks();
        MigrateEksempelToCase();
        FixBakgrunnDropdownValues();
        EnsureGlobaleInnstillingerExist();
        BackfillFaqOrdbokLeads();
        BackfillBrukDataRettStegtitler();
        EnsureSandkasseExistsForDev();
    }

    /// <summary>
    /// Ensures a single globaleInnstillinger node exists at root and backfills
    /// any empty fields with the previously hardcoded defaults. Idempotent —
    /// per-field check skips anything an editor has already set.
    /// </summary>
    private void EnsureGlobaleInnstillingerExist()
    {
        var ct = _contentTypeService.Get("globaleInnstillinger");
        if (ct == null) return;

        var node = _contentService.GetRootContent().FirstOrDefault(c => c.ContentType.Alias == "globaleInnstillinger");
        if (node == null)
        {
            node = _contentService.Create("Globale innstillinger", -1, "globaleInnstillinger");
        }

        bool changed = false;
        changed |= SetIfEmpty(node, "kontaktTittel", "Vil du vite mer?");
        changed |= SetIfEmpty(node, "kontaktIngress", "Har du spørsmål, eller ønsker du å komme i kontakt?");
        changed |= SetIfEmpty(node, "kontaktTelefon", "75006000");
        changed |= SetIfEmpty(node, "kontaktTelefonLabel", "Ring 75 00 60 00");
        changed |= SetIfEmpty(node, "kontaktEpost", "kontakt@ki.norge.no");
        changed |= SetIfEmpty(node, "kontaktEpostLabel", "Send mail");
        changed |= SetIfEmpty(node, "cookieTekst", "<p>Vi bruker kun nødvendige informasjonskapsler for at nettsiden skal fungere. Vi setter ingen sporings- eller analyse-cookies.</p>");
        changed |= SetIfEmpty(node, "cookieKnappLabel", "Greit");
        changed |= SetIfEmpty(node, "tittel404", "Siden ble ikke funnet");
        changed |= SetIfEmpty(node, "beskrivelse404", "Beklager, vi fant ikke siden du leter etter. Den kan ha blitt flyttet eller fjernet.");
        changed |= SetIfEmpty(node, "tittel503", "Vi er straks tilbake");
        changed |= SetIfEmpty(node, "beskrivelse503", "ki.norge.no er midlertidig nede for vedlikehold.");
        changed |= SetIfEmpty(node, "vedlikeholdEpost", "kontakt@ki.norge.no");

        if (!changed && node.HasIdentity) return;

        SaveAndPublish(node);
        Console.WriteLine(node.HasIdentity
            ? "ContentSeeder: Backfilled globaleInnstillinger fields"
            : "ContentSeeder: Created globaleInnstillinger at root");
    }

    /// <summary>
    /// Backfills the new lead fields on faqSamling and ordbokSamling containers
    /// with the previously hardcoded page text. Idempotent.
    /// </summary>
    private void BackfillFaqOrdbokLeads()
    {
        foreach (var root in _contentService.GetRootContent())
        {
            if (root.ContentType.Alias == "faqSamling")
            {
                bool faqChanged = SetIfEmpty(root, "lead", "<p>Her finner du svar på de mest stilte spørsmålene om KI Norge og bruk av kunstig intelligens i offentlig sektor.</p>");
                if (faqChanged) SaveAndPublish(root);
            }
            else if (root.ContentType.Alias == "ordbokSamling")
            {
                bool ordbokChanged = false;
                ordbokChanged |= SetIfEmpty(root, "tittel", "KI Ordboka");
                ordbokChanged |= SetIfEmpty(root, "lead", "<p>KI ordboken forklarer vanlige begreper innenfor kunstig intelligens på en enkel og forståelig måte.</p>");
                if (ordbokChanged) SaveAndPublish(root);
            }
        }
    }

    private bool SetIfEmpty(IContent node, string alias, string value)
    {
        var existing = node.GetValue<string>(alias);
        if (!string.IsNullOrWhiteSpace(existing)) return false;
        node.SetValue(alias, value);
        return true;
    }

    /// <summary>
    /// One-time backfill: the bruk-data-rett guide used to render with hardcoded
    /// step group titles in the frontend route. Now that veiledningGuide has a
    /// stegGruppeTittler field, copy the previous defaults onto the existing node
    /// so the page keeps rendering with the same labels. Idempotent — skips if
    /// the field already has a value, or if no such guide exists.
    /// </summary>
    private void BackfillBrukDataRettStegtitler()
    {
        var ct = _contentTypeService.Get("veiledningGuide");
        if (ct == null) return;
        if (!ct.PropertyTypeExists("stegGruppeTittler")) return;

        IContent? guide = null;
        foreach (var root in _contentService.GetRootContent())
        {
            if (root.ContentType.Alias == "veiledningGuide" && root.GetValue<string>("slug") == "bruk-data-rett")
            {
                guide = root;
                break;
            }
            var descendants = _contentService.GetPagedDescendants(root.Id, 0, int.MaxValue, out _);
            guide = descendants.FirstOrDefault(d =>
                d.ContentType.Alias == "veiledningGuide" && d.GetValue<string>("slug") == "bruk-data-rett");
            if (guide != null) break;
        }
        if (guide == null) return;

        var existing = guide.GetValue<string>("stegGruppeTittler");
        if (!string.IsNullOrWhiteSpace(existing)) return;

        guide.SetValue("stegGruppeTittler", string.Join("\n", new[]
        {
            "Finn ut hvilke data du trenger",
            "Samle inn data",
            "Forberede data til bruk",
            "Gjøre data tilgjengelig for KI-systemet",
            "Slette data",
        }));
        _contentService.Save(guide);
        if (guide.Published) _contentService.Publish(guide, new[] { "*" });
        Console.WriteLine("ContentSeeder: Backfilled stegGruppeTittler on bruk-data-rett");
    }

    /// <summary>
    /// Local-dev convenience: if there's no Sandkasse content node anywhere, seed one
    /// under Sider with placeholder content. Skipped on prod (LAUNCH_MODE=production)
    /// so the editor creates the real one with their own copy. Idempotent.
    /// </summary>
    private void EnsureSandkasseExistsForDev()
    {
        if (Environment.GetEnvironmentVariable("LAUNCH_MODE")?.ToLowerInvariant() == "production") return;

        var ct = _contentTypeService.Get("sandkasse");
        if (ct == null) return;

        // Walk every node looking for an existing sandkasse (any depth, any parent)
        bool exists = false;
        foreach (var root in _contentService.GetRootContent())
        {
            if (root.ContentType.Alias == "sandkasse") { exists = true; break; }
            var descendants = _contentService.GetPagedDescendants(root.Id, 0, int.MaxValue, out _);
            if (descendants.Any(d => d.ContentType.Alias == "sandkasse")) { exists = true; break; }
        }
        if (exists) return;

        var siderFolder = _contentService.GetRootContent().FirstOrDefault(c => c.ContentType.Alias == "sider");
        if (siderFolder == null) return;

        SeedSandkasse(siderFolder.Id);
        Console.WriteLine("ContentSeeder: Created placeholder Sandkasse under Sider (dev only)");
    }

    /// <summary>
    /// Fixes the bakgrunn dropdown field on artikkel and case content.
    /// The DropDown.Flexible editor stores values as JSON array, but earlier code
    /// set plain strings ("hvit", "lyseblaa") which breaks the Delivery API.
    /// This migration finds non-JSON values and either wraps them in JSON array form
    /// or clears them. Idempotent.
    /// </summary>
    private void FixBakgrunnDropdownValues()
    {
        var allTypes = new[] { "artikkel", "case" };
        int fixedCount = 0;

        foreach (var alias in allTypes)
        {
            // Get all root content of these types — case lives under caser, so check children too
            var allContent = _contentService.GetRootContent()
                .SelectMany(root => _contentService.GetPagedDescendants(root.Id, 0, int.MaxValue, out _))
                .Concat(_contentService.GetRootContent())
                .Where(c => c.ContentType.Alias == alias)
                .ToList();

            foreach (var c in allContent)
            {
                if (!c.HasProperty("bakgrunn")) continue;
                var raw = c.GetValue<string>("bakgrunn");
                if (string.IsNullOrEmpty(raw)) continue;
                if (raw.StartsWith("[")) continue; // already JSON array

                // Wrap plain string in JSON array
                var fixedValue = $"[\"{raw}\"]";
                c.SetValue("bakgrunn", fixedValue);
                _contentService.Save(c);
                if (c.Published) _contentService.Publish(c, new[] { "*" });
                fixedCount++;
            }
        }

        if (fixedCount > 0)
            Console.WriteLine($"ContentSeeder: Fixed bakgrunn dropdown JSON format on {fixedCount} content nodes");
    }

    /// <summary>
    /// Copies field values from the standalone Veiledning Oversikt content node onto the
    /// Veiledning container content node, then deletes the standalone Oversikt node.
    /// Editor can then click "Veiledning" in the tree and edit the overview directly.
    /// Idempotent: skips if no Oversikt node exists or if container already has the values.
    /// </summary>
    private void FlattenVeiledningOversiktIntoContainer()
    {
        var container = _contentService.GetRootContent().FirstOrDefault(c => c.ContentType.Alias == "veiledninger");
        if (container == null) return;

        // Find Oversikt node — could be at root or already under container
        var oversikt = _contentService.GetRootContent().FirstOrDefault(c => c.ContentType.Alias == "veiledningOversikt");
        if (oversikt == null)
        {
            // Check inside the container
            oversikt = _contentService.GetPagedChildren(container.Id, 0, int.MaxValue, out _)
                .FirstOrDefault(c => c.ContentType.Alias == "veiledningOversikt");
        }
        if (oversikt == null) return;

        // Copy each property from Oversikt to container (only if container has the field)
        var fieldsToCopy = new[] {
            "heroLabel", "heroTittel", "heroTekst", "heroBilde",
            "seksjon1Tittel", "seksjon1Kort",
            "seksjon2Tittel", "seksjon2Kort",
            "verktoyTittel", "verktoyKort",
            "seoTittel", "seoBeskrivelse", "seoBilde"
        };

        bool changed = false;
        foreach (var field in fieldsToCopy)
        {
            if (!container.Properties.Any(p => p.Alias == field)) continue;
            var srcValue = oversikt.GetValue(field);
            if (srcValue == null) continue;
            container.SetValue(field, srcValue);
            changed = true;
        }

        if (changed)
        {
            _contentService.Save(container);
            _contentService.Publish(container, new[] { "*" });
        }

        // Move (don't hard-delete) — preserves recoverability via the recycle bin if a
        // future ed​itor needs the original back. Cascades children to the recycle bin too.
        _contentService.MoveToRecycleBin(oversikt);
        Console.WriteLine("ContentSeeder: Flattened Veiledning Oversikt into Veiledning container (oversikt moved to recycle bin)");
    }

    private void RenameFaqContainerNode()
    {
        var faq = _contentService.GetRootContent().FirstOrDefault(c => c.ContentType.Alias == "faqSamling");
        if (faq == null) return;
        if (faq.Name == "Ofte stilte spørsmål") return;
        faq.Name = "Ofte stilte spørsmål";
        _contentService.Save(faq);
        Console.WriteLine("ContentSeeder: Renamed FAQ folder to 'Ofte stilte spørsmål'");
    }

    /// <summary>
    /// Migrates each existing eksempel content node to a new case node under Caser folder.
    /// Maps fields: tittel/slug direct, beskrivelse → ingress (plain text) + first Brødtekst
    /// block, resultater → second Brødtekst block, organisasjon → InnholdFra block at end,
    /// bilde → artikkelBilde, seo* direct.
    /// After migrating all, deletes the original Eksempler container content node and its children.
    /// Idempotent: skips eksempel content where a case with the same slug already exists under Caser.
    /// </summary>
    private void MigrateEksempelToCase()
    {
        var eksemplerContainer = _contentService.GetRootContent()
            .FirstOrDefault(c => c.ContentType.Alias == "eksempler");
        if (eksemplerContainer == null) return;

        var caserContainer = _contentService.GetRootContent()
            .FirstOrDefault(c => c.ContentType.Alias == "caser");
        if (caserContainer == null) return;

        var caseType = _contentTypeService.Get("case");
        var brodtekstType = _contentTypeService.Get("artikkelTekst");
        var innholdFraType = _contentTypeService.Get("artikkelInnholdFra");
        if (caseType == null || brodtekstType == null) return;

        var existingCaseSlugs = _contentService.GetPagedChildren(caserContainer.Id, 0, int.MaxValue, out _)
            .Where(c => c.ContentType.Alias == "case")
            .Select(c => c.GetValue<string>("slug") ?? "")
            .ToHashSet();

        var eksempler = _contentService.GetPagedChildren(eksemplerContainer.Id, 0, int.MaxValue, out _)
            .Where(c => c.ContentType.Alias == "eksempel")
            .ToList();

        int migrated = 0;
        foreach (var eks in eksempler)
        {
            var slug = eks.GetValue<string>("slug") ?? "";
            if (string.IsNullOrEmpty(slug) || existingCaseSlugs.Contains(slug)) continue;

            var nytt = _contentService.Create(eks.Name ?? "Case", caserContainer.Id, "case");
            nytt.SetValue("tittel", eks.GetValue<string>("tittel") ?? eks.Name ?? "");
            nytt.SetValue("slug", slug);

            var beskrivelse = eks.GetValue<string>("beskrivelse") ?? "";
            var resultater = eks.GetValue<string>("resultater") ?? "";

            // Ingress: first 200 chars of beskrivelse plain text
            var ingressText = StripHtml(beskrivelse);
            if (ingressText.Length > 250) ingressText = ingressText.Substring(0, 247) + "...";
            nytt.SetValue("ingress", ingressText);
            // Don't set bakgrunn — dropdown stores JSON array format, default empty is fine

            // artikkelBilde: copy bilde value (MediaPicker)
            var bilde = eks.GetValue("bilde");
            if (bilde != null) nytt.SetValue("artikkelBilde", bilde);

            // Body Block List: Brødtekst(beskrivelse), Brødtekst(resultater), optional InnholdFra
            var blocks = new List<(string, Dictionary<string, object>)>();
            if (!string.IsNullOrWhiteSpace(beskrivelse))
                blocks.Add(("artikkelTekst", new Dictionary<string, object> { ["innhold"] = beskrivelse }));
            if (!string.IsNullOrWhiteSpace(resultater))
                blocks.Add(("artikkelTekst", new Dictionary<string, object> { ["innhold"] = $"<h2>Resultater</h2>{resultater}" }));
            var organisasjon = eks.GetValue<string>("organisasjon");
            if (!string.IsNullOrWhiteSpace(organisasjon) && innholdFraType != null)
                blocks.Add(("artikkelInnholdFra", new Dictionary<string, object> { ["virksomhet"] = organisasjon }));

            if (blocks.Count > 0)
                nytt.SetValue("innhold", BuildArticleBlockList(blocks.ToArray()));

            // SEO direct copy
            nytt.SetValue("seoTittel", eks.GetValue<string>("seoTittel") ?? "");
            nytt.SetValue("seoBeskrivelse", eks.GetValue<string>("seoBeskrivelse") ?? "");
            var seoBilde = eks.GetValue("seoBilde");
            if (seoBilde != null) nytt.SetValue("seoBilde", seoBilde);

            _contentService.Save(nytt);
            _contentService.Publish(nytt, new[] { "*" });
            migrated++;
        }

        // Move container (don't hard-delete) so a future editor can dig out the original
        // eksempel content from the recycle bin if needed.
        if (migrated > 0 || eksempler.Count > 0)
        {
            _contentService.MoveToRecycleBin(eksemplerContainer);
            Console.WriteLine($"ContentSeeder: Migrated {migrated} eksempel(s) to case under Caser, moved Eksempler container to recycle bin");
        }
    }

    private static string StripHtml(string html)
    {
        if (string.IsNullOrEmpty(html)) return "";
        return System.Text.RegularExpressions.Regex.Replace(html, "<[^>]+>", " ")
            .Replace("&nbsp;", " ")
            .Trim();
    }

    /// <summary>
    /// Clears the kategori field on all FAQ items. The kategori field is a content
    /// picker pointing at merkelapper, which blocks editor from deleting merkelapper
    /// (Umbraco enforces referential integrity). After clearing, merkelapper can be
    /// freely deleted. Kategori was a demo-only field anyway.
    /// </summary>
    private void ClearFaqKategoriReferences()
    {
        var faqContainer = _contentService.GetRootContent()
            .FirstOrDefault(c => c.ContentType.Alias == "faqSamling");
        if (faqContainer == null) return;

        var faqs = _contentService.GetPagedChildren(faqContainer.Id, 0, int.MaxValue, out _)
            .Where(c => c.ContentType.Alias == "faq")
            .ToList();

        int cleared = 0;
        foreach (var faq in faqs)
        {
            var current = faq.GetValue<string>("kategori");
            if (string.IsNullOrEmpty(current)) continue;
            faq.SetValue("kategori", "");
            _contentService.Save(faq);
            cleared++;
        }
        if (cleared > 0)
            Console.WriteLine($"ContentSeeder: Cleared kategori on {cleared} FAQ items (now safe to delete merkelapper)");
    }

    /// <summary>
    /// Moves the standalone "Om Oss" content node from root into the Sider container.
    /// </summary>
    private void MoveOmOssIntoSider()
    {
        var omOss = _contentService.GetRootContent().FirstOrDefault(c => c.ContentType.Alias == "omOss");
        if (omOss == null) return;

        var sider = _contentService.GetRootContent().FirstOrDefault(c => c.ContentType.Alias == "sider");
        if (sider == null) return;

        if (omOss.ParentId == sider.Id) return;

        _contentService.Move(omOss, sider.Id);
        Console.WriteLine("ContentSeeder: Moved Om Oss into Sider container");
    }

    /// <summary>
    /// Creates the "Caser" root folder if it doesn't exist. Idempotent.
    /// Needed because the seeder is skipped on prod (LAUNCH_MODE=production) but
    /// Caser was added after the seeder originally ran on prod.
    /// </summary>
    private void EnsureCaserFolderExists()
    {
        var existing = _contentService.GetRootContent().FirstOrDefault(c => c.ContentType.Alias == "caser");
        if (existing != null) return;

        var ct = _contentTypeService.Get("caser");
        if (ct == null) return;

        var folder = _contentService.Create("Caser", -1, ct.Alias);
        _contentService.Save(folder);
        _contentService.Publish(folder, new[] { "*" });
        Console.WriteLine("ContentSeeder: Created Caser root folder");
    }

    /// <summary>
    /// Reads existing omOssSeksjon child content nodes under the Om Oss page and
    /// converts each into an omOssBlokk inside the omOss.seksjoner Block List.
    /// Then deletes the migrated omOssSeksjon nodes. Idempotent: skips if seksjoner already populated.
    /// </summary>
    private void FlattenOmOssSeksjonerToBlocks()
    {
        var omOss = _contentService.GetRootContent().FirstOrDefault(c => c.ContentType.Alias == "omOss");
        if (omOss == null) return;

        // If seksjoner already has blocks, don't overwrite
        var existingBlocks = omOss.GetValue<string>("seksjoner");
        if (!string.IsNullOrWhiteSpace(existingBlocks) && existingBlocks.Contains("contentData")) return;

        var children = _contentService.GetPagedChildren(omOss.Id, 0, int.MaxValue, out _)
            .Where(c => c.ContentType.Alias == "omOssSeksjon")
            .OrderBy(c => c.GetValue<int>("rekkefolge"))
            .ToList();

        if (children.Count == 0) return;

        // Need omOssBlokk content type to build blocks
        var blokkType = _contentTypeService.Get("omOssBlokk");
        if (blokkType == null) return;

        var contentData = new List<object>();
        var layoutItems = new List<object>();

        foreach (var seksjon in children)
        {
            var guid = Guid.NewGuid();
            var udi = $"umb://element/{guid:N}";

            layoutItems.Add(new Dictionary<string, object?>
            {
                ["contentUdi"] = udi,
                ["settingsUdi"] = null
            });

            var data = new Dictionary<string, object>
            {
                ["contentTypeKey"] = blokkType.Key.ToString(),
                ["udi"] = udi,
                ["tittel"] = seksjon.GetValue<string>("tittel") ?? "",
                ["tekst"] = seksjon.GetValue<string>("tekst") ?? "",
            };

            // Bilde is a MediaPicker — store the same value if present
            var bildeValue = seksjon.GetValue("bilde");
            if (bildeValue != null) data["bilde"] = bildeValue;

            contentData.Add(data);
        }

        var blockList = new Dictionary<string, object>
        {
            ["layout"] = new Dictionary<string, object>
            {
                ["Umbraco.BlockList"] = layoutItems
            },
            ["contentData"] = contentData,
            ["settingsData"] = new List<object>()
        };

        omOss.SetValue("seksjoner", JsonSerializer.Serialize(blockList));
        _contentService.Save(omOss);
        _contentService.Publish(omOss, new[] { "*" });

        // Move (don't hard-delete) the original seksjon nodes — recoverable from recycle bin
        foreach (var seksjon in children)
        {
            _contentService.MoveToRecycleBin(seksjon);
        }

        Console.WriteLine($"ContentSeeder: Flattened {children.Count} Om Oss seksjoner into blocks on the page");
    }

    // RemoveDuplicateSandkasseUnderSider: REMOVED 2026-05-04.
    // This migration assumed that any sandkasse-node under Sider was a duplicate
    // of one that existed at root. That assumption was wrong: when an editor
    // moved the real Sandkasse from root into Sider via the UI, the migration
    // saw it as a "duplicate" and deleted it. Never write a deletion migration
    // that targets a content type without verifying the "original" still exists.

    /// <summary>
    /// Renames the "Veiledninger" container to "Veiledning" (singular).
    /// </summary>
    private void RenameVeiledningerToVeiledning()
    {
        var folder = _contentService.GetRootContent()
            .FirstOrDefault(c => c.ContentType.Alias == "veiledninger");
        if (folder == null) return;
        if (folder.Name == "Veiledning") return;

        folder.Name = "Veiledning";
        _contentService.Save(folder);
        Console.WriteLine("ContentSeeder: Renamed Veiledninger to Veiledning");
    }

    /// <summary>
    /// Moves the standalone "Veiledning Oversikt" content node INSIDE the Veiledning folder
    /// so the editor sees a single Veiledning section instead of two siblings.
    /// </summary>
    private void MoveVeiledningOversiktUnderVeiledning()
    {
        var oversikt = _contentService.GetRootContent()
            .FirstOrDefault(c => c.ContentType.Alias == "veiledningOversikt");
        if (oversikt == null) return;

        var veiledningFolder = _contentService.GetRootContent()
            .FirstOrDefault(c => c.ContentType.Alias == "veiledninger");
        if (veiledningFolder == null) return;

        // Already inside?
        if (oversikt.ParentId == veiledningFolder.Id) return;

        _contentService.Move(oversikt, veiledningFolder.Id);
        Console.WriteLine("ContentSeeder: Moved Veiledning Oversikt under Veiledning folder");
    }

    /// <summary>
    /// Nests existing veiledningSteg nodes under their parent veiledningGuide based on guideSlug.
    /// Currently many steg are flat siblings of guides; the website hierarchy expects steg as children of guide.
    /// </summary>
    private void NestVeiledningStegUnderGuide()
    {
        var veiledningFolder = _contentService.GetRootContent()
            .FirstOrDefault(c => c.ContentType.Alias == "veiledninger");
        if (veiledningFolder == null) return;

        // Get all guides currently under the folder, indexed by their slug
        var guides = _contentService.GetPagedChildren(veiledningFolder.Id, 0, int.MaxValue, out _)
            .Where(c => c.ContentType.Alias == "veiledningGuide")
            .ToDictionary(g => g.GetValue<string>("slug") ?? "", g => g);

        // Get all steg (flat children of folder) that have a guideSlug pointing to a known guide
        var orphanSteg = _contentService.GetPagedChildren(veiledningFolder.Id, 0, int.MaxValue, out _)
            .Where(c => c.ContentType.Alias == "veiledningSteg")
            .ToList();

        int moved = 0;
        foreach (var steg in orphanSteg)
        {
            var guideSlug = steg.GetValue<string>("guideSlug");
            if (string.IsNullOrEmpty(guideSlug) || !guides.TryGetValue(guideSlug, out var guide)) continue;
            _contentService.Move(steg, guide.Id);
            moved++;
        }
        if (moved > 0)
            Console.WriteLine($"ContentSeeder: Nested {moved} VeiledningSteg under their parent VeiledningGuide");
    }

    /// <summary>
    /// Deletes the "Tilgjengelige ikoner" container and all its child icon nodes.
    /// Idempotent — only runs if the container still exists. Editors should use a
    /// Media folder named "Ikoner" for icon images instead.
    /// </summary>
    private void RemoveIkonerContent()
    {
        var ikonerFolder = _contentService.GetRootContent()
            .FirstOrDefault(c => c.ContentType.Alias == "tilgjengeligeIkoner");
        if (ikonerFolder == null) return;

        // Move to recycle bin (cascades to children) instead of hard-delete, so a
        // future editor can recover ikon-content if needed.
        _contentService.MoveToRecycleBin(ikonerFolder);
        Console.WriteLine("ContentSeeder: Moved Ikoner container to recycle bin");
    }

    /// <summary>
    /// Forces Forside to the top of the root content tree by re-sorting ALL root items.
    /// Forside first (sortOrder 0), everything else after in their current order.
    /// </summary>
    private void ForceForsideToTop()
    {
        var rootItems = _contentService.GetRootContent().ToList();
        var forside = rootItems.FirstOrDefault(c => c.ContentType.Alias == "forside");
        if (forside == null) return;

        // Already at the top?
        if (rootItems[0].Id == forside.Id) return;

        // Reorder: Forside first, then everything else preserving their relative order
        var newOrder = new List<IContent> { forside };
        newOrder.AddRange(rootItems.Where(c => c.Id != forside.Id));

        // ContentService.Sort takes the ordered list and assigns sortOrder by position
        _contentService.Sort(newOrder.Select(c => c.Id));
        Console.WriteLine("ContentSeeder: Re-sorted root content with Forside at top");
    }

    private IContent CreateFolder(string contentTypeAlias, string name)
    {
        var ct = _contentTypeService.Get(contentTypeAlias)
            ?? throw new InvalidOperationException($"Container type '{contentTypeAlias}' not found");
        var folder = _contentService.Create(name, -1, ct.Alias);
        _contentService.Save(folder);
        _contentService.Publish(folder, new[] { "*" });
        return folder;
    }

    private IContent Create(string contentTypeAlias, string name, int parentId)
    {
        var ct = _contentTypeService.Get(contentTypeAlias)
            ?? throw new InvalidOperationException($"Content type '{contentTypeAlias}' not found");
        return _contentService.Create(name, parentId, ct.Alias);
    }

    private void SaveAndPublish(IContent content)
    {
        _contentService.Save(content);
        _contentService.Publish(content, new[] { "*" });
    }

    // ── Forside ─────────────────────────────────────────────

    private void SeedForside()
    {
        var ct = _contentTypeService.Get("forside")
            ?? throw new InvalidOperationException("Content type 'forside' not found");
        var forside = _contentService.Create("Forside", -1, ct.Alias);
        forside.SetValue("heroOverskrift", "Bruk av kunstig intelligens i Norge");
        forside.SetValue("raadTittel", "Tre råd før du går i gang med KI");
        forside.SetValue("sandkasseTittel", "Regulatorisk sandkasse for KI");
        forside.SetValue("sandkasseTekst", "<p>Den regulatoriske sandkassen gir virksomheter mulighet til å teste KI-løsninger i et kontrollert miljø med veiledning fra relevante tilsynsmyndigheter.</p>");
        forside.SetValue("sandkasseUrl", "/sandkasse");
        forside.SetValue("veiledningOverskrift", "Veiledning");
        forside.SetValue("veiledning1Tittel", "Vi skal ta i bruk KI");
        forside.SetValue("veiledning1Beskrivelse", "For deg som vil ta i bruk ferdig trent KI →");
        forside.SetValue("veiledning1Url", "/veiledning");
        forside.SetValue("veiledning2Tittel", "Vi skal lage et KI-system");
        forside.SetValue("veiledning2Beskrivelse", "For deg som ønsker å bygge en KI-løsning selv →");
        forside.SetValue("veiledning2Url", "/veiledning");
        forside.SetValue("aktueltOverskrift", "Aktuelt");
        forside.SetValue("aktueltLenkeTekst", "Finn inspirasjon og lær av andre");
        forside.SetValue("aktueltLenkeUrl", "/eksempler");
        forside.SetValue("arrangementOverskrift", "Arrangement");
        forside.SetValue("arrangementKommendeTekst", "Se kommende arrangement");
        forside.SetValue("arrangementAvholdteTekst", "Se avholdte arrangement");
        // Footer
        forside.SetValue("footerTittel", "KI Norge");
        forside.SetValue("footerBeskrivelse", "Et tverrsektorielt samarbeid for å fremme ansvarlig og sikker bruk av kunstig intelligens i den norske forvaltningen.");
        forside.SetValue("footerSosialInstagram", "#");
        forside.SetValue("footerSosialLinkedin", "#");
        forside.SetValue("footerSosialX", "#");
        forside.SetValue("footerLenke1Tekst", "Om KI Norge");
        forside.SetValue("footerLenke1Url", "/om-oss");
        forside.SetValue("footerLenke2Tekst", "Kontakt");
        forside.SetValue("footerLenke2Url", "/kontakt");
        forside.SetValue("footerLenke3Tekst", "Personvern og informasjonskapsler");
        forside.SetValue("footerLenke3Url", "/personvern");
        forside.SetValue("footerLenke4Tekst", "Tilgjengelighet");
        forside.SetValue("footerLenke4Url", "/tilgjengelighet");
        forside.SetValue("footerLenke5Tekst", "Endre samtykke for informasjonskapsler");
        forside.SetValue("footerLenke5Url", "");

        // Rekkefølge (section ordering)
        forside.SetValue("rekkefolgeVeiledning", 1);
        forside.SetValue("rekkefolgeAktuelt", 2);
        forside.SetValue("rekkefolgeTreRaad", 3);
        forside.SetValue("rekkefolgeSandkasse", 4);
        forside.SetValue("rekkefolgeArrangement", 5);

        forside.SetValue("seoTittel", "KI Norge – Kunstig intelligens i norsk offentlig sektor");
        forside.SetValue("seoBeskrivelse", "KI Norge er en nasjonal satsing for ansvarlig bruk av kunstig intelligens. Veiledning, regulatorisk sandkasse og gode eksempler for offentlig sektor.");
        SaveAndPublish(forside);
    }

    // ── Om Oss ──────────────────────────────────────────────

    private IContent SeedOmOss()
    {
        var ct = _contentTypeService.Get("omOss")
            ?? throw new InvalidOperationException("Content type 'omOss' not found");
        var omOss = _contentService.Create("Om oss", -1, ct.Alias);
        omOss.SetValue("heroTittel", "KI Norge");
        omOss.SetValue("heroUndertittel", "Verdigrunnlag");
        omOss.SetValue("introTekst", "<p>KI Norge er en nasjonal satsing under Digitaliseringsdirektoratet (Digdir). Formålet er å gjøre det enklere for norske virksomheter å ta i bruk KI på en måte som er trygg, lovlig og verdiskapende, enten du driver en liten privat bedrift eller jobber i en offentlig virksomhet.</p>");
        omOss.SetValue("misjonTekst", "<p>KI Norge kobler virksomheter på tvers av offentlig sektor, næringsliv, akademia og forskning. Vi samler kunnskap gjennom kartlegginger, og gir den tilgjengelig for deg som trenger et solid grunnlag for å ta gode beslutninger.</p>");
        omOss.SetValue("seoTittel", "Om oss – KI Norge");
        omOss.SetValue("seoBeskrivelse", "Om KI Norge – en nasjonal satsing for ansvarlig bruk av kunstig intelligens.");
        SaveAndPublish(omOss);

        // Seed child sections
        var s1 = Create("omOssSeksjon", "Hvorfor KI Norge?", omOss.Id);
        s1.SetValue("tittel", "Hvorfor KI Norge?");
        s1.SetValue("slug", "hvorfor-ki-norge");
        s1.SetValue("tekst", "<p>Mange virksomheter vil ta i bruk kunstig intelligens, men vet ikke helt hvor de skal begynne, eller om de gjør det riktig. Det er der KI Norge kommer inn.</p>");
        s1.SetValue("rekkefolge", 0);
        SaveAndPublish(s1);

        var s2 = Create("omOssSeksjon", "Veiledning", omOss.Id);
        s2.SetValue("tittel", "Veiledning");
        s2.SetValue("slug", "veiledning");
        s2.SetValue("tekst", "<p>Sammen med Datatilsynet og Nasjonal kommunikasjonsmyndighet (Nkom) gir vi praktisk veiledning, særlig for deg som ikke har et eget juridisk team eller KI-eksperter i staben. Vi hjelper deg å forstå hvilke krav som gjelder, identifisere risiko og finne ut hva du faktisk trenger å forholde deg til.</p>");
        s2.SetValue("rekkefolge", 1);
        SaveAndPublish(s2);

        var s3 = Create("omOssSeksjon", "KI-sandkassen", omOss.Id);
        s3.SetValue("tittel", "KI-sandkassen");
        s3.SetValue("slug", "den-regulatoriske-ki-sandkassen");
        s3.SetValue("tekst", "<p>I KI-sandkassen kan du utvikle, teste og trene KI-løsninger i trygge og kontrollerte omgivelser, før du lanserer dem i markedet eller tar dem i bruk internt. Du får juridisk veiledning knyttet til personvern, grunnleggende rettigheter og sikkerhet, og hjelp til å oppfylle kravene i KI-forordningen og annet relevant regelverk.</p>");
        s3.SetValue("rekkefolge", 2);
        SaveAndPublish(s3);

        return omOss;
    }

    // ── Sandkasse ────────────────────────────────────────────

    private void SeedSandkasse(int siderFolderId)
    {
        var ct = _contentTypeService.Get("sandkasse")
            ?? throw new InvalidOperationException("Content type 'sandkasse' not found");
        var sandkasse = _contentService.Create("Sandkasse", siderFolderId, ct.Alias);

        sandkasse.SetValue("tittel", "Den regulatoriske KI-sandkassen");
        sandkasse.SetValue("slug", "sandkasse");
        sandkasse.SetValue("ingress", "(Plassholder) KI-sandkassen skal støtte norske virksomheter i å utvikle og ta i bruk ansvarlige og innovative KI-løsninger. Bytt ut denne teksten med endelig ingress.");

        sandkasse.SetValue("innhold", BuildArticleBlockList(
            TextBlock("<p><strong>Hvem er det til for?</strong></p><p>(Plassholder) Sandkassen er åpen for alle leverandører og fremtidige leverandører av KI-systemer. Bytt ut denne teksten med endelig innhold.</p>"),
            Prosessteg("Slik foregår prosessen",
                ("Steg", "(Plassholder) Steg 1 - bytt ut med faktisk beskrivelse"),
                ("Steg", "(Plassholder) Steg 2 - bytt ut med faktisk beskrivelse"),
                ("Steg", "(Plassholder) Steg 3 - bytt ut med faktisk beskrivelse"),
                ("Steg", "(Plassholder) Steg 4 - bytt ut med faktisk beskrivelse")
            ),
            TextBlock("<p><strong>Hva får du ut av det?</strong></p><p>(Plassholder) Deltagere i sandkassen får tett oppfølging og veiledning. Bytt ut denne teksten med endelig innhold.</p>"),
            TextBlock("<h2>Ofte stilte spørsmål</h2>"),
            Trekkspill("(Plassholder) Spørsmål 1 - bytt ut", "<p>(Plassholder) Svar 1 - bytt ut med faktisk svar.</p>"),
            Trekkspill("(Plassholder) Spørsmål 2 - bytt ut", "<p>(Plassholder) Svar 2 - bytt ut med faktisk svar.</p>"),
            Trekkspill("(Plassholder) Spørsmål 3 - bytt ut", "<p>(Plassholder) Svar 3 - bytt ut med faktisk svar.</p>")
        ));

        sandkasse.SetValue("seoTittel", "KI-sandkassen – Test KI-løsninger trygt");
        sandkasse.SetValue("seoBeskrivelse", "KI-sandkassen lar virksomheter teste og utvikle KI-løsninger i et kontrollert miljø med juridisk veiledning og regulatorisk støtte.");
        SaveAndPublish(sandkasse);
    }

    /// <summary>
    /// Builds an artikkelProsessteg block whose nested 'steg' property is itself a
    /// Block List of artikkelProsessStegItem entries.
    /// </summary>
    private (string, Dictionary<string, object>) Prosessteg(string tittel, params (string etikett, string beskrivelseHtml)[] steg)
    {
        var itemType = _contentTypeService.Get("artikkelProsessStegItem");
        var stegBlockListJson = "{}";
        if (itemType != null)
        {
            var contentData = new List<object>();
            var layoutItems = new List<object>();
            foreach (var (etikett, beskrivelse) in steg)
            {
                var guid = Guid.NewGuid();
                var udi = $"umb://element/{guid:N}";
                layoutItems.Add(new Dictionary<string, object?> { ["contentUdi"] = udi, ["settingsUdi"] = null });
                contentData.Add(new Dictionary<string, object>
                {
                    ["contentTypeKey"] = itemType.Key.ToString(),
                    ["udi"] = udi,
                    ["tittel"] = etikett,
                    ["beskrivelse"] = beskrivelse,
                });
            }
            stegBlockListJson = JsonSerializer.Serialize(new Dictionary<string, object>
            {
                ["layout"] = new Dictionary<string, object> { ["Umbraco.BlockList"] = layoutItems },
                ["contentData"] = contentData,
                ["settingsData"] = new List<object>(),
            });
        }
        return ("artikkelProsessteg", new Dictionary<string, object>
        {
            ["tittel"] = tittel,
            ["steg"] = stegBlockListJson,
        });
    }

    // ── Veiledning Oversikt ─────────────────────────────────

    private void SeedVeiledningOversikt()
    {
        var ct = _contentTypeService.Get("veiledningOversikt")
            ?? throw new InvalidOperationException("Content type 'veiledningOversikt' not found");
        var vo = _contentService.Create("Veiledning Oversikt", -1, ct.Alias);

        // Hero
        vo.SetValue("heroLabel", "Veiledning");
        vo.SetValue("heroTittel", "Lag et KI-system");
        vo.SetValue("heroTekst", "Vi veileder deg gjennom regler, krav og beste praksis.");

        // Seksjon 1
        vo.SetValue("seksjon1Tittel", "Før du går i gang");
        vo.SetValue("seksjon1Kort", BuildVeiledningKortBlockList(
            ("Definer behovet og hva KI skal løse", "", "#", "Search"),
            ("Finn ut hvilket risikonivå løsningen din har", "Hvis det du skal lage har høy risiko, må du få det godkjent før du kan sette det i drift.", "#", "ShieldLock"),
            ("Forstå KI-loven og GDPR", "Det er nytt at loven stiller krav både til leverandøren og de som setter KI i drift.", "#", "Paragraph"),
            ("Forstå krav til data og hva du må gjøre", "", "/veiledning/bruk-data-rett", "Database")
        ));

        // Seksjon 2
        vo.SetValue("seksjon2Tittel", "Utvikle KI-systemet");
        vo.SetValue("seksjon2Kort", BuildVeiledningKortBlockList(
            ("Dette er kravene du må følge for utforming", "", "#", "Ruler"),
            ("Valg av språkmodell – utvikle noe eget eller bruke en på markedet", "", "#", "Chat"),
            ("Dokumentasjon og testing", "", "#", "FileText"),
            ("Tiltak for sikkerhet og hindre misbruk", "", "#", "ShieldLock")
        ));

        // Verktøy
        vo.SetValue("verktoyTittel", "Verktøy");
        vo.SetValue("verktoyKort", BuildVerktoyKortBlockList(
            ("Bias explorer", "Utforsk hvordan dataskjevheter blir til modellskjevheter", "#", "BarChart"),
            ("Risikovurdering", "Modellen til Marie", "#", "Task")
        ));

        // SEO
        vo.SetValue("seoTittel", "Veiledning – Lag et KI-system");
        vo.SetValue("seoBeskrivelse", "Vi veileder deg gjennom regler, krav og beste praksis for å lage et KI-system.");
        SaveAndPublish(vo);
    }

    private string BuildVeiledningKortBlockList(params (string tittel, string beskrivelse, string url, string ikon)[] cards)
    {
        var contentData = new List<object>();
        var layoutItems = new List<object>();

        var elementType = _contentTypeService.Get("veiledningKort");
        if (elementType == null) return "{}";

        foreach (var (tittel, beskrivelse, url, ikon) in cards)
        {
            var guid = Guid.NewGuid();
            var udi = $"umb://element/{guid:N}";

            layoutItems.Add(new Dictionary<string, object?>
            {
                ["contentUdi"] = udi,
                ["settingsUdi"] = null
            });

            contentData.Add(new Dictionary<string, object>
            {
                ["contentTypeKey"] = elementType.Key.ToString(),
                ["udi"] = udi,
                ["tittel"] = tittel,
                ["beskrivelse"] = beskrivelse,
                ["url"] = url,
                ["ikon"] = ikon
            });
        }

        var blockList = new Dictionary<string, object>
        {
            ["layout"] = new Dictionary<string, object>
            {
                ["Umbraco.BlockList"] = layoutItems
            },
            ["contentData"] = contentData,
            ["settingsData"] = new List<object>()
        };

        return JsonSerializer.Serialize(blockList);
    }

    private string BuildVerktoyKortBlockList(params (string tittel, string beskrivelse, string url, string ikon)[] cards)
    {
        var contentData = new List<object>();
        var layoutItems = new List<object>();

        var elementType = _contentTypeService.Get("verktoyKort");
        if (elementType == null) return "{}";

        foreach (var (tittel, beskrivelse, url, ikon) in cards)
        {
            var guid = Guid.NewGuid();
            var udi = $"umb://element/{guid:N}";

            layoutItems.Add(new Dictionary<string, object?>
            {
                ["contentUdi"] = udi,
                ["settingsUdi"] = null
            });

            contentData.Add(new Dictionary<string, object>
            {
                ["contentTypeKey"] = elementType.Key.ToString(),
                ["udi"] = udi,
                ["tittel"] = tittel,
                ["beskrivelse"] = beskrivelse,
                ["url"] = url,
                ["ikon"] = ikon
            });
        }

        var blockList = new Dictionary<string, object>
        {
            ["layout"] = new Dictionary<string, object>
            {
                ["Umbraco.BlockList"] = layoutItems
            },
            ["contentData"] = contentData,
            ["settingsData"] = new List<object>()
        };

        return JsonSerializer.Serialize(blockList);
    }

    // ── Artikler ──────────────────────────────────────────────

    // ── Block List helpers ──────────────────────────────────

    private string BuildArticleBlockList(params (string elementAlias, Dictionary<string, object> properties)[] blocks)
    {
        var contentData = new List<object>();
        var layoutItems = new List<object>();

        foreach (var (alias, props) in blocks)
        {
            var elementType = _contentTypeService.Get(alias);
            if (elementType == null) continue;

            var guid = Guid.NewGuid();
            var udi = $"umb://element/{guid:N}";

            layoutItems.Add(new Dictionary<string, object?>
            {
                ["contentUdi"] = udi,
                ["settingsUdi"] = null
            });

            var data = new Dictionary<string, object>
            {
                ["contentTypeKey"] = elementType.Key.ToString(),
                ["udi"] = udi
            };
            foreach (var (key, value) in props)
            {
                data[key] = value;
            }
            contentData.Add(data);
        }

        var blockList = new Dictionary<string, object>
        {
            ["layout"] = new Dictionary<string, object>
            {
                ["Umbraco.BlockList"] = layoutItems
            },
            ["contentData"] = contentData,
            ["settingsData"] = new List<object>()
        };

        return JsonSerializer.Serialize(blockList);
    }

    private (string, Dictionary<string, object>) TextBlock(string html) =>
        ("artikkelTekst", new Dictionary<string, object> { ["innhold"] = html });

    private (string, Dictionary<string, object>) InfoBox(string title, string html) =>
        ("artikkelInfoBoks", new Dictionary<string, object> { ["tittel"] = title, ["innhold"] = html });

    // HeroBlock removed — replaced by InfoBox for now, will become Fremheving in task 5.

    // ── New module helpers (Fremheving, Prosessteg, Forfatter og dato variants) ──

    private (string, Dictionary<string, object>) Fremheving(string? tittel, string html, bool visBakgrunn = true, bool visAnforselstegn = false, string? kilde = null) =>
        ("artikkelFremheving", new Dictionary<string, object>
        {
            ["tittel"] = tittel ?? "",
            ["tekst"] = html,
            ["visBakgrunn"] = visBakgrunn ? "1" : "0",
            ["visAnforselstegn"] = visAnforselstegn ? "1" : "0",
            ["kilde"] = kilde ?? "",
        });

    private (string, Dictionary<string, object>) Byline(string navn, string? stilling = null, string? virksomhet = null, string? dato = null) =>
        ("artikkelByline", new Dictionary<string, object>
        {
            ["navn"] = navn,
            ["stilling"] = stilling ?? "",
            ["virksomhet"] = virksomhet ?? "",
            ["dato"] = dato ?? "",
        });

    private (string, Dictionary<string, object>) InnholdFra(string virksomhet, string? dato = null) =>
        ("artikkelInnholdFra", new Dictionary<string, object>
        {
            ["virksomhet"] = virksomhet,
            ["dato"] = dato ?? "",
        });

    private (string, Dictionary<string, object>) Kontaktkort(string navn, string? stilling = null, string? virksomhet = null, string? epost = null, string? telefon = null, string? tittel = null) =>
        ("artikkelKontaktkort", new Dictionary<string, object>
        {
            ["tittel"] = tittel ?? "",
            ["navn"] = navn,
            ["stilling"] = stilling ?? "",
            ["virksomhet"] = virksomhet ?? "",
            ["epost"] = epost ?? "",
            ["telefon"] = telefon ?? "",
        });

    private (string, Dictionary<string, object>) Trekkspill(string tittel, string innhold) =>
        ("artikkelTrekkspill", new Dictionary<string, object> { ["tittel"] = tittel, ["innhold"] = innhold });

    // ── Artikler ──────────────────────────────────────────────

    private void SeedArticles(int parentId)
    {
        // ── Short articles (simple, 1-2 text blocks) ──

        var a1 = Create("artikkel", "Ny nasjonal strategi for kunstig intelligens", parentId);
        a1.SetValue("tittel", "Ny nasjonal strategi for kunstig intelligens");
        a1.SetValue("slug", "ny-nasjonal-strategi-for-kunstig-intelligens");
        a1.SetValue("ingress", "Regjeringen har lansert en oppdatert nasjonal strategi for kunstig intelligens med vekt på ansvarlig bruk, åpenhet og tillit i offentlig sektor.");
        a1.SetValue("innhold", BuildArticleBlockList(
            TextBlock(@"<p>Regjeringen har lansert en oppdatert nasjonal strategi for kunstig intelligens. Strategien legger vekt på ansvarlig bruk av KI i offentlig sektor, med fokus på åpenhet, personvern og tillit.</p>
<p>Strategien følger opp EUs AI Act og setter rammer for hvordan norske virksomheter kan ta i bruk KI på en trygg og tillitvekkende måte.</p>"),
            TextBlock(@"<h2>Hovedpunkter i strategien</h2>
<ul>
<li>Styrket satsing på KI-kompetanse i offentlig forvaltning</li>
<li>Felles retningslinjer for ansvarlig KI-bruk</li>
<li>Økt deling av data mellom offentlige virksomheter</li>
<li>Etablering av nasjonalt KI-senter for offentlig sektor</li>
</ul>")
        ));
        a1.SetValue("seoTittel", "Ny nasjonal strategi for kunstig intelligens");
        a1.SetValue("seoBeskrivelse", "Regjeringens oppdaterte strategi for ansvarlig bruk av KI i offentlig sektor med fokus på åpenhet og tillit.");
        SaveAndPublish(a1);

        var a2 = Create("artikkel", "Kommuner tar i bruk KI for bedre innbyggertjenester", parentId);
        a2.SetValue("tittel", "Kommuner tar i bruk KI for bedre innbyggertjenester");
        a2.SetValue("slug", "kommuner-tar-i-bruk-ki-for-bedre-innbyggertjenester");
        a2.SetValue("ingress", "Flere norske kommuner eksperimenterer med kunstig intelligens for å forbedre tjenestene til innbyggerne, fra automatisert saksbehandling til prediktivt vedlikehold.");
        a2.SetValue("innhold", BuildArticleBlockList(
            TextBlock(@"<p>Flere norske kommuner har begynt å eksperimentere med kunstig intelligens for å forbedre tjenestene til innbyggerne. Fra automatisert saksbehandling til chatboter for innbyggerdialog — mulighetene er mange.</p>
<p>Stavanger kommune bruker maskinlæring for å predikere vedlikeholdsbehov på kommunale bygg, mens Trondheim har utviklet en KI-basert chatbot som hjelper innbyggere med å finne riktig tjeneste. Bergen kommune tester automatisk klassifisering av innkommende henvendelser, noe som har redusert svartiden med 40 prosent.</p>")
        ));
        a2.SetValue("seoTittel", "Kommuner tar i bruk KI for bedre innbyggertjenester");
        a2.SetValue("seoBeskrivelse", "Norske kommuner eksperimenterer med KI for automatisert saksbehandling, chatboter og prediktivt vedlikehold.");
        SaveAndPublish(a2);

        var a3 = Create("artikkel", "EUs AI Act og konsekvenser for norsk offentlig sektor", parentId);
        a3.SetValue("tittel", "EUs AI Act og konsekvenser for norsk offentlig sektor");
        a3.SetValue("slug", "eus-ai-act-og-konsekvenser-for-norsk-offentlig-sektor");
        a3.SetValue("innhold", BuildArticleBlockList(
            TextBlock(@"<p>EU har vedtatt verdens første helhetlige regulering av kunstig intelligens. AI Act klassifiserer KI-systemer etter risikonivå og stiller krav til åpenhet, sikkerhet og menneskerettigheter.</p>
<p>Gjennom EØS-avtalen vil AI Act også gjelde i Norge. Offentlige virksomheter som bruker KI-systemer til saksbehandling, velferdstjenester eller overvåkning må forberede seg på nye krav til dokumentasjon og risikovurdering.</p>
<p>KI Norge tilbyr veiledning for virksomheter som trenger hjelp med å forstå og etterleve de nye reglene.</p>")
        ));
        a3.SetValue("seoTittel", "EUs AI Act og konsekvenser for norsk offentlig sektor");
        a3.SetValue("seoBeskrivelse", "Hvordan EUs AI Act påvirker norske offentlige virksomheter gjennom EØS-avtalen.");
        SaveAndPublish(a3);

        var a4 = Create("artikkel", "Åpenhet og tillit i KI-prosjekter", parentId);
        a4.SetValue("tittel", "Åpenhet og tillit i KI-prosjekter");
        a4.SetValue("slug", "apenhet-og-tillit-i-ki-prosjekter");
        a4.SetValue("innhold", BuildArticleBlockList(
            TextBlock(@"<p>For at kunstig intelligens skal lykkes i offentlig sektor, er det avgjørende at innbyggerne har tillit til løsningene. Åpenhet om hvordan KI-systemer fungerer og hvilke data de bruker, er en forutsetning.</p>")
        ));
        a4.SetValue("seoTittel", "Åpenhet og tillit i KI-prosjekter");
        a4.SetValue("seoBeskrivelse", "Hvorfor åpenhet og tillit er avgjørende for vellykkede KI-prosjekter i offentlig sektor.");
        SaveAndPublish(a4);

        // ── Medium articles (text + info box) ──

        var a5 = Create("artikkel", "EU AI Act: Hva betyr det for norsk offentlig sektor?", parentId);
        a5.SetValue("tittel", "EU AI Act: Hva betyr det for norsk offentlig sektor?");
        a5.SetValue("slug", "eu-ai-act-hva-betyr-det-for-norsk-offentlig-sektor");
        a5.SetValue("ingress", "EU har vedtatt verdens første helhetlige regulering av kunstig intelligens. Slik påvirker det norske offentlige virksomheter gjennom EØS-avtalen.");
        a5.SetValue("innhold", BuildArticleBlockList(
            TextBlock(@"<p>EUs forordning om kunstig intelligens (AI Act) trådte i kraft i 2024 og innføres gradvis frem mot 2026. Gjennom EØS-avtalen vil regelverket også gjelde i Norge. Hva betyr dette i praksis for offentlige virksomheter?</p>
<h2>Risikobasert tilnærming</h2>
<p>AI Act klassifiserer KI-systemer i fire risikonivåer: uakseptabel risiko, høy risiko, begrenset risiko og minimal risiko. Systemer brukt i offentlig saksbehandling — for eksempel velferdstjenester, grensekontroll og strafferettspleie — faller typisk i kategorien høy risiko.</p>"),
            InfoBox("Krav til høyrisiko-systemer", @"<ul>
<li>Risikovurdering og kvalitetsstyring</li>
<li>Dokumentasjon av treningsdata og algoritmisk logikk</li>
<li>Menneskelig tilsyn og mulighet for overstyring</li>
<li>Logging og sporbarhet av beslutninger</li>
</ul>"),
            TextBlock(@"<p>Norske virksomheter bør begynne kartleggingen av egne KI-systemer allerede nå, slik at de er klare når regelverket trer i kraft i EØS.</p>")
        ));
        a5.SetValue("seoTittel", "EU AI Act: Hva betyr det for norsk offentlig sektor?");
        a5.SetValue("seoBeskrivelse", "En praktisk gjennomgang av EUs AI Act og hva den betyr for norske offentlige virksomheter.");
        SaveAndPublish(a5);

        var a6 = Create("artikkel", "Slik bruker Nav kunstig intelligens til saksbehandling", parentId);
        a6.SetValue("tittel", "Slik bruker Nav kunstig intelligens til saksbehandling");
        a6.SetValue("slug", "slik-bruker-nav-kunstig-intelligens-til-saksbehandling");
        a6.SetValue("innhold", BuildArticleBlockList(
            TextBlock(@"<p>Nav er blant de offentlige virksomhetene i Norge som har kommet lengst med å ta i bruk kunstig intelligens. Fra automatisert dokumenthåndtering til prediktive modeller for oppfølging — KI er i ferd med å endre hvordan Norges største velferdsetat jobber.</p>
<h2>Automatisk dokumentklassifisering</h2>
<p>Nav mottar millioner av dokumenter hvert år. En KI-modell klassifiserer innkommende dokumenter automatisk og ruter dem til riktig saksbehandler, noe som har kuttet behandlingstiden betydelig.</p>
<h2>Prediktiv oppfølging</h2>
<p>Ved hjelp av maskinlæring identifiserer Nav brukere som kan ha nytte av tidlig oppfølging, slik at rådgivere kan prioritere der behovet er størst.</p>"),
            InfoBox("Navs erfaringer", @"<p>Nav understreker viktigheten av menneskelig kontroll, transparens overfor brukerne, og løpende evaluering av modellenes treffsikkerhet og rettferdighet. Alle automatiserte beslutninger kan overstyres av en saksbehandler.</p>")
        ));
        a6.SetValue("seoTittel", "Slik bruker Nav kunstig intelligens til saksbehandling");
        a6.SetValue("seoBeskrivelse", "Hvordan Nav bruker KI til dokumentklassifisering, prediktiv oppfølging og effektivisering av saksbehandling.");
        SaveAndPublish(a6);

        var a7 = Create("artikkel", "5 ting du må vite før du anskaffer KI-løsninger", parentId);
        a7.SetValue("tittel", "5 ting du må vite før du anskaffer KI-løsninger");
        a7.SetValue("slug", "5-ting-du-ma-vite-for-du-anskaffer-ki-losninger");
        a7.SetValue("innhold", BuildArticleBlockList(
            TextBlock(@"<p>Anskaffelse av KI-løsninger i offentlig sektor krever en annen tilnærming enn tradisjonelle IT-innkjøp. Her er fem viktige ting å tenke på.</p>
<h2>1. Definer problemet, ikke løsningen</h2>
<p>Start med behovet. Hvilken prosess skal forbedres? Hvilke gevinster forventer dere? Unngå å bestille «KI» uten et tydelig bruksområde.</p>
<h2>2. Datakvalitet er avgjørende</h2>
<p>En KI-modell er bare så god som dataene den trenes på. Kartlegg tilgjengelige data og kvaliteten på disse før dere går ut i markedet.</p>
<h2>3. Still krav til åpenhet</h2>
<p>Krev at leverandøren kan forklare hvordan modellen tar beslutninger, og at dere får innsyn i treningsdata og modellarkitektur.</p>"),
            InfoBox("Husk livssyklus og etikk", @"<p><strong>4. Tenk livssyklus, ikke bare lansering.</strong> KI-systemer trenger løpende overvåking, oppdatering av modeller og nye treningsdata. Budsjetter for drift, ikke bare utvikling.</p>
<p><strong>5. Vurder personvern og etikk tidlig.</strong> Gjennomfør DPIA tidlig i prosessen, og involver personvernombud og fageksperter fra starten.</p>")
        ));
        a7.SetValue("seoTittel", "5 ting du må vite før du anskaffer KI-løsninger");
        a7.SetValue("seoBeskrivelse", "Fem viktige råd for offentlige virksomheter som skal anskaffe KI-løsninger.");
        SaveAndPublish(a7);

        // ── Long/rich articles (text + info box + hero) ──

        var a8 = Create("artikkel", "Datatilsynets risikovurdering for KI — en gjennomgang", parentId);
        a8.SetValue("tittel", "Datatilsynets risikovurdering for KI — en gjennomgang");
        a8.SetValue("slug", "datatilsynets-risikovurdering-for-ki");
        a8.SetValue("innhold", BuildArticleBlockList(
            TextBlock(@"<p>Datatilsynet har publisert en veileder for risikovurdering av KI-systemer som behandler personopplysninger. Vi oppsummerer de viktigste punktene og hva det betyr for din virksomhet.</p>
<h2>Hvem gjelder dette?</h2>
<p>Alle virksomheter som bruker KI til å behandle personopplysninger — enten det er ansiktsgjenkjenning, profilering eller automatisert saksbehandling — må gjennomføre en risikovurdering.</p>"),
            InfoBox("Sentrale vurderingspunkter", @"<ul>
<li>Nødvendighet og proporsjonalitet: Er KI riktig verktøy?</li>
<li>Dataminimering: Bruker systemet kun nødvendige data?</li>
<li>Rettferdighet: Er det risiko for diskriminering eller skjevhet?</li>
<li>Transparens: Kan de registrerte forstå hvordan beslutninger tas?</li>
<li>Sikkerhet: Er data og modeller tilstrekkelig beskyttet?</li>
</ul>"),
            InfoBox("Når skal risikovurderingen gjøres?", @"<p>Datatilsynet anbefaler at risikovurderingen gjøres <strong>før</strong> systemet settes i produksjon, og at den oppdateres ved vesentlige endringer i modell, data eller bruksområde. Virksomheter som allerede har KI i drift bør gjennomføre en vurdering så snart som mulig.</p>")
        ));
        a8.SetValue("seoTittel", "Datatilsynets risikovurdering for KI — en gjennomgang");
        a8.SetValue("seoBeskrivelse", "Oppsummering av Datatilsynets veileder for risikovurdering av KI-systemer som behandler personopplysninger.");
        SaveAndPublish(a8);

        var a9 = Create("artikkel", "Generativ KI i kommunene: erfaringer fra pilotprosjekter", parentId);
        a9.SetValue("tittel", "Generativ KI i kommunene: erfaringer fra pilotprosjekter");
        a9.SetValue("slug", "generativ-ki-i-kommunene-erfaringer-fra-pilotprosjekter");
        a9.SetValue("innhold", BuildArticleBlockList(
            TextBlock(@"<p>Flere norske kommuner tester nå generativ KI — store språkmodeller som kan skrive tekst, oppsummere dokumenter og svare på spørsmål. Hva har de lært så langt?</p>
<h2>Bruksområder som fungerer</h2>
<p>Kommunene rapporterer best resultater for intern bruk: utkast til brev og vedtak, oppsummering av lange saksdokumenter, og oversettelse til klart språk. Her sparer saksbehandlere mye tid.</p>"),
            InfoBox("Utfordringer med utadrettet bruk", @"<p>Utadrettet bruk — som chatboter mot innbyggere — krever mer forsiktighet. Feilaktige svar (hallusinasjoner) kan få alvorlige konsekvenser når det gjelder rettigheter og tjenester. Kommunene anbefaler å starte internt før man vurderer innbyggerrettede løsninger.</p>"),
            InfoBox("Anbefalinger fra pilotene", @"<ul>
<li>Start med intern bruk der feiltoleransen er høyere</li>
<li>Etabler tydelige retningslinjer for hva som kan og ikke kan deles med KI</li>
<li>Sørg for at sensitive personopplysninger ikke sendes til skybaserte tjenester</li>
<li>Mål effekten: Spar dere faktisk tid, eller bruker folk like lang tid på å kvalitetssjekke?</li>
</ul>")
        ));
        a9.SetValue("seoTittel", "Generativ KI i kommunene: erfaringer fra pilotprosjekter");
        a9.SetValue("seoBeskrivelse", "Erfaringer og anbefalinger fra norske kommuner som tester generativ KI i offentlig forvaltning.");
        SaveAndPublish(a9);

        var a10 = Create("artikkel", "Åpenhet og innsyn: Krav til forklarbarhet i KI-systemer", parentId);
        a10.SetValue("tittel", "Åpenhet og innsyn: Krav til forklarbarhet i KI-systemer");
        a10.SetValue("slug", "apenhet-og-innsyn-krav-til-forklarbarhet-i-ki-systemer");
        a10.SetValue("innhold", BuildArticleBlockList(
            TextBlock(@"<p>Når offentlige virksomheter bruker KI til å fatte beslutninger som påvirker innbyggere, stiller både forvaltningsloven og GDPR krav til forklarbarhet. Men hva betyr egentlig forklarbarhet i praksis?</p>
<h2>Juridiske krav</h2>
<p>Forvaltningsloven krever at vedtak begrunnes. GDPR gir den registrerte rett til informasjon om automatiserte beslutninger. AI Act stiller ytterligere krav til dokumentasjon og transparens for høyrisiko-systemer.</p>"),
            InfoBox("Tekniske tilnærminger", @"<p>Forklarbarhet kan implementeres på ulike nivåer: fra enkle beslutningsregler og featureviktighet til mer avanserte teknikker som SHAP-verdier og kontrafaktiske forklaringer.</p>"),
            InfoBox("Praktiske råd for forklarbarhet", @"<ul>
<li>Tilpass forklaringen til mottakeren — innbygger, saksbehandler og revisor trenger ulik detaljeringsgrad</li>
<li>Dokumenter modellens virkemåte ved utvikling, ikke i etterkant</li>
<li>Test forklaringene med reelle brukere — gir de faktisk mening?</li>
</ul>")
        ));
        a10.SetValue("seoTittel", "Åpenhet og innsyn: Krav til forklarbarhet i KI-systemer");
        a10.SetValue("seoBeskrivelse", "Juridiske og tekniske krav til forklarbarhet når offentlige virksomheter bruker KI til beslutninger.");
        SaveAndPublish(a10);

        // ── Full showcase article: KI-regnekraft ──

        var aFull = Create("artikkel", "KI-regnekraft i Norge: Status, utvikling og behov fremover", parentId);
        aFull.SetValue("tittel", "KI-regnekraft i Norge: Status, utvikling og behov fremover");
        aFull.SetValue("slug", "ki-regnekraft-i-norge");
        aFull.SetValue("ingress", "Regnekraft er en grunnleggende forutsetning for utvikling og bruk av moderne kunstig intelligens. Etter hvert som modellene blir større og mer datakrevende, øker behovet for nasjonal kapasitet.");
        aFull.SetValue("innhold", BuildArticleBlockList(
            TextBlock(@"<p>Regnekraft er en grunnleggende forutsetning for utvikling, tilpasning og bruk av moderne kunstig intelligens. Etter hvert som avanserte KI-modeller blir større, mer komplekse og mer datakrevende, øker også behovet for nasjonal kapasitet til å trene, kjøre og videreutvikle dem.</p>"),
            TextBlock(@"<h2>Hva menes med KI-infrastruktur?</h2>
<p>KI-infrastruktur omfatter både teknologiske og organisatoriske ressurser som gjør det mulig å utvikle og anvende kunstig intelligens på en trygg og effektiv måte. En sentral komponent er tungregning (High Performance Computing, HPC), hvor CPU- og GPU-ressurser brukes til tungregneoppgaver.</p>"),
            InfoBox("Komponenter i KI-infrastruktur", @"<ul>
<li>Dataressurser, inkludert tilgjengelige datasett og ordnede prosesser for datadeling.</li>
<li>Programvare og verktøy, som rammeverk og plattformer for modelltrening og drift.</li>
<li>Organisatoriske strukturer, som sikrer kompetanseutvikling, forvaltning og sikker drift.</li>
<li>Regulatoriske mekanismer, inkludert tilsyn, sandkasser og ansvarlig bruk av KI.</li>
</ul>
<p>Samlet skal infrastrukturen støtte forskning, innovasjon og bruk av KI i Norge.</p>"),
            InfoBox("Status for KI-infrastruktur i Norge", @"<p>I statsbudsjettet for 2026 har regjeringen bevilget 380 millioner kroner over to år til første fase av tiltaket for å styrke nasjonal infrastruktur for tungregning. Dette er en del av den økte satsingen regjeringen har gjort de siste årene for å styrke nasjonal KI-infrastruktur gjennom investeringer i superdatamaskiner, språkmodeller og støtteordninger for forskning og utvikling.</p>
<p>Sigma2 åpnet i 2025 en ny nasjonal KI-fabrikk som huser Norges kraftigste superdatamaskin, <strong>Olivia</strong>. Maskinen inngår i det europeiske LUMI AI Factory-nettverket og er tilgjengelig for forskningsmiljøer, offentlig sektor og deler av næringslivet.</p>"),
            TextBlock(@"<h2>Nasjonale språkmodeller og datagrunnlag</h2>
<p>Nasjonalbiblioteket har fått et utvidet mandat til å klargjøre norske og samiske data for KI-trening. Dette inkluderer blant annet en nasjonal lisensordning for bruk av avisinnhold, inngått i samarbeid med Kopinor. Målet er å sikre tilgang til kvalitetsdata som gjenspeiler norske forhold.</p>
<h2>Behovsvurderinger og kapasitetsutfordringer</h2>
<p>Utredningene fra Forskningsrådet peker på at dagens kapasitet ikke er tilstrekkelig for behovene i forskning, forvaltning og næringsliv. Arbeidet med en konseptvalgutredning i 2025 anslo at behovet for GPU-kapasitet vil øke med 40–50 % årlig frem mot 2030.</p>"),
            TextBlock(@"<h2>Internasjonalt samarbeid: EuroHPC og nordisk kapasitet</h2>
<p>Som deltaker i EuroHPC får Norge tilgang til europeisk toppkapasitet, deriblant LUMI-superdatamaskinen i Finland. Deltakelsen gir også mulighet for å påvirke europeiske investeringer og delta i forsknings- og innovasjonsprosjekter.</p>
<p>Flere europeiske land, inkludert nordiske naboer, investerer tungt i KI-infrastruktur. Dette bidrar til økt samlet kapasitet, men illustrerer også viktigheten av at Norge selv bygger og opprettholder nasjonalt kontrollert regnekraft.</p>
<h2>Hvorfor nasjonal kapasitet er viktig</h2>
<p>Uten tilstrekkelig nasjonal kapasitet blir Norge i større grad avhengig av globale skyleverandører, hvor reguleringsmuligheter, tilgangskontroll og databehandling foregår utenfor landets jurisdiksjon.</p>")
        ));
        aFull.SetValue("seoTittel", "KI-regnekraft i Norge: Status, utvikling og behov fremover");
        aFull.SetValue("seoBeskrivelse", "En oversikt over norsk KI-infrastruktur, regnekraft og kapasitetsbehov frem mot 2030.");
        SaveAndPublish(aFull);
    }

    // ── Sider ──────────────────────────────────────────────────

    private void SeedPages(int parentId)
    {
        var kontakt = Create("side", "Kontakt", parentId);
        kontakt.SetValue("tittel", "Kontakt oss");
        kontakt.SetValue("slug", "kontakt");
        kontakt.SetValue("innhold", @"<p>Har du spørsmål om kunstig intelligens i offentlig sektor?
Ta gjerne kontakt med oss.</p>
<h3>E-post</h3>
<p>post@ki.norge.no</p>
<h3>Besøksadresse</h3>
<p>Digitaliseringsdirektoratet<br>Brattørkaia 15B<br>7010 Trondheim</p>");
        SaveAndPublish(kontakt);

        var sandkasse = Create("side", "Sandkasse", parentId);
        sandkasse.SetValue("tittel", "Regulatorisk sandkasse for KI");
        sandkasse.SetValue("slug", "sandkasse");
        sandkasse.SetValue("innhold", @"<p>Den regulatoriske sandkassen gir virksomheter mulighet til å teste
KI-løsninger i et kontrollert miljø med veiledning fra relevante tilsynsmyndigheter.</p>
<h2>Hva er en regulatorisk sandkasse?</h2>
<p>En regulatorisk sandkasse er et rammeverk der virksomheter kan teste innovative
løsninger under tilsyn, uten å bryte med gjeldende regelverk. Dette gir mulighet
for å utvikle og teste nye KI-tjenester på en trygg måte.</p>
<h2>Hvem kan søke?</h2>
<p>Alle offentlige virksomheter som ønsker å utvikle KI-løsninger kan søke om
deltakelse i sandkassen.</p>");
        sandkasse.SetValue("seoBeskrivelse", "Regulatorisk sandkasse for utprøving av KI-løsninger i offentlig sektor.");
        SaveAndPublish(sandkasse);
    }

    // ── Eksempler ──────────────────────────────────────────────

    private void SeedExamples(int parentId)
    {
        var e1 = Create("eksempel", "KI-chatbot for innbyggerdialog", parentId);
        e1.SetValue("tittel", "KI-chatbot for innbyggerdialog");
        e1.SetValue("slug", "ki-chatbot-for-innbyggerdialog");
        e1.SetValue("organisasjon", "Trondheim kommune");
        e1.SetValue("beskrivelse", @"<p>Trondheim kommune har utviklet en KI-basert chatbot som hjelper
innbyggere med å finne riktig kommunal tjeneste. Chatboten forstår naturlig språk
og kan svare på vanlige spørsmål om åpningstider, søknadsprosesser og tjenestetilbud.</p>
<p>Løsningen er bygget på en stor språkmodell som er finjustert på kommunens
egne data, med strenge personvernregler og full sporbarhet.</p>");
        e1.SetValue("verktoy", "[\"Azure OpenAI\", \"LangChain\", \"Pinecone\"]");
        e1.SetValue("resultater", "40% reduksjon i henvendelser til servicekontoret. 85% av innbyggerne oppgir at de fikk svar på spørsmålet sitt.");
        e1.SetValue("status", "i_drift");
        e1.SetValue("merkelapper", "[\"chatbot\", \"naturlig-sprak\", \"kommune\"]");
        SaveAndPublish(e1);

        var e2 = Create("eksempel", "Prediktivt vedlikehold av kommunale bygg", parentId);
        e2.SetValue("tittel", "Prediktivt vedlikehold av kommunale bygg");
        e2.SetValue("slug", "prediktivt-vedlikehold-kommunale-bygg");
        e2.SetValue("organisasjon", "Stavanger kommune");
        e2.SetValue("beskrivelse", @"<p>Stavanger kommune bruker maskinlæring for å forutsi når kommunale bygg
trenger vedlikehold. Systemet analyserer sensordata fra bygningene — temperatur,
fuktighet, energiforbruk — og varsler før problemer oppstår.</p>
<p>Prosjektet har spart kommunen for betydelige kostnader ved å unngå
akutte reparasjoner og forlenge levetiden på tekniske installasjoner.</p>");
        e2.SetValue("verktoy", "[\"Python\", \"scikit-learn\", \"Azure IoT Hub\"]");
        e2.SetValue("resultater", "25% reduksjon i vedlikeholdskostnader. 60% færre akutte reparasjoner.");
        e2.SetValue("status", "pilot");
        e2.SetValue("merkelapper", "[\"maskinlaering\", \"automatisering\", \"kommune\"]");
        SaveAndPublish(e2);

        var e3 = Create("eksempel", "Automatisk klassifisering av henvendelser", parentId);
        e3.SetValue("tittel", "Automatisk klassifisering av henvendelser");
        e3.SetValue("slug", "automatisk-klassifisering-av-henvendelser");
        e3.SetValue("organisasjon", "Bergen kommune");
        e3.SetValue("beskrivelse", @"<p>Bergen kommune har tatt i bruk maskinlæring for automatisk klassifisering
av innkommende henvendelser fra innbyggere. Systemet sorterer e-post, skjemaer
og meldinger til riktig avdeling basert på innholdet.</p>
<p>Dette har redusert behandlingstiden betydelig og sikrer at henvendelser
raskt kommer til rett saksbehandler.</p>");
        e3.SetValue("verktoy", "[\"Python\", \"spaCy\", \"Azure ML\"]");
        e3.SetValue("resultater", "40% reduksjon i svartid. 92% korrekt klassifisering.");
        e3.SetValue("status", "i_drift");
        e3.SetValue("merkelapper", "[\"maskinlaering\", \"automatisering\", \"kommune\"]");
        SaveAndPublish(e3);

        var e4 = Create("eksempel", "KI-assistert oversettelse av offentlige dokumenter", parentId);
        e4.SetValue("tittel", "KI-assistert oversettelse av offentlige dokumenter");
        e4.SetValue("slug", "ki-assistert-oversettelse");
        e4.SetValue("organisasjon", "Digitaliseringsdirektoratet");
        e4.SetValue("beskrivelse", @"<p>Digitaliseringsdirektoratet tester KI-basert oversettelse for å gjøre
offentlig informasjon tilgjengelig på flere språk. Løsningen kombinerer
maskinoversettelse med menneskelig kvalitetskontroll.</p>
<p>Målet er at viktig offentlig informasjon skal være tilgjengelig på
norsk, samisk, engelsk og de mest utbredte innvandrerspråkene.</p>");
        e4.SetValue("verktoy", "[\"Azure Translator\", \"GPT-4\", \"Custom glossary\"]");
        e4.SetValue("resultater", "70% raskere oversettelsesprosess. Tilgjengelig på 8 språk.");
        e4.SetValue("status", "i_utvikling");
        e4.SetValue("merkelapper", "[\"naturlig-sprak\", \"automatisering\"]");
        SaveAndPublish(e4);

        // Full-featured example using all CMS fields
        var eFull = Create("eksempel", "Kunnskapsassistenten", parentId);
        eFull.SetValue("tittel", "Kunnskapsassistenten");
        eFull.SetValue("slug", "kunnskapsassistenten");
        eFull.SetValue("organisasjon", "Digitaliseringsdirektoratet");
        eFull.SetValue("beskrivelse", @"<p>Kunnskapsassistenten skal styrke – ikke erstatte – faglige vurderinger i staten. Piloten viser at den har størst verdi i starten av en kunnskapsprosess, og at vi må øke presisjonen, kunnskapsforberedelsen og kontrolltiltakene videre når oppgavene krever flere steg.</p>

<h2>Utfordringen vi skulle løse</h2>
<p>Målet har vært å undersøke hvordan KI kan støtte raske utredningsprosesser – på en trygg, åpen og faglig forsvarlig måte.</p>
<p>Kunnskapsproduksjon i staten er krevende og tidkrevende. Informasjon er fragmentert, spredt på tvers av mange kilder og i stadig endring. I tillegg utvikler vi ikke kunnskapsgrunnlaget godt nok, og det øker risikoen for feilaktige beslutninger.</p>

<h2>Løsning</h2>
<p>Kunnskapsassistenten er et spesialisert KI-verktøy for kunnskapsarbeid i offentlig sektor. Den hjelper brukerne med å finne, sammenstille og vurdere informasjon fra store mengder kilder, og har innebygde mekanismer for kontroll og etterprøvelighet.</p>
<p>Kunnskapsassistenten skal støtte utforskende analyse, styrke menneskelig vurdering og faglig forankring slik at utredningsarbeidet og verifisering av informasjon blir bedre.</p>

<h2>Resultat</h2>
<p>Kunnskapsassistenten:</p>
<ul>
<li>Gir økt kunnskapstilgjengelighet for alle ansatte</li>
<li>Reduserer tid brukt på informasjonsinnhenting og databehandling</li>
<li>Økt kvalitet ved å presentere flere relevante datakilder</li>
<li>Redusert behov for manuell koordinering på tvers av virksomheter</li>
<li>Teknisk system som demonstrerer en ansvarlig, etterprøvelig og transparent bruk av KI</li>
</ul>");
        eFull.SetValue("verktoy", "[\"Azure OpenAI\", \"RAG\", \"Kudos-databasen\", \"LangChain\"]");
        eFull.SetValue("resultater", @"<p>Den største utfordringen er ikke teknologisk, men institusjonell: KI må oppleves som trygg, etterprøvbar og tillitsvekkende.</p>
<p>Piloten viste at kunnskapsassistenten gir størst verdi i tidlige faser av arbeidet – når brukeren skal orientere seg, oppsummere og finne relevante dokumenter.</p>");
        eFull.SetValue("status", "pilot");
        eFull.SetValue("merkelapper", "[\"naturlig-sprak\", \"automatisering\", \"etikk\"]");
        eFull.SetValue("seoTittel", "Kunnskapsassistenten – KI for kunnskapsarbeid i staten");
        eFull.SetValue("seoBeskrivelse", "Kunnskapsassistenten er et KI-verktøy som støtter faglige vurderinger og utredningsprosesser i offentlig sektor.");
        SaveAndPublish(eFull);
    }

    // ── Caser (new content type, mirror of artikkel) ──────────

    private void SeedCases(int parentId)
    {
        // Case 1: minimal — just Artikkelhode, no body modules
        var c1 = Create("case", "Test-case uten moduler", parentId);
        c1.SetValue("tittel", "Test-case uten moduler");
        c1.SetValue("slug", "test-case-uten-moduler");
        c1.SetValue("ingress", "Dette er en case uten body-moduler. Kun Artikkelhode-feltene (tittel + ingress + bilde + bakgrunn).");
        // bakgrunn omitted — defaults to empty (frontend treats as 'hvit')
        SaveAndPublish(c1);

        // Case 2: mixed — a few common modules
        var c2 = Create("case", "Test-case med blandet innhold", parentId);
        c2.SetValue("tittel", "Test-case med blandet innhold");
        c2.SetValue("slug", "test-case-med-blandet-innhold");
        c2.SetValue("ingress", "En typisk case med tekst, bilde og en byline.");
        c2.SetValue("bakgrunn", "lyseblaa");
        c2.SetValue("innhold", BuildArticleBlockList(
            Byline("Sara Neziri", "Rådgiver", "Digitaliseringsdirektoratet", "2026-04-15"),
            TextBlock(@"<p>Dette er en kortfattet case som demonstrerer en typisk struktur:
en byline øverst, deretter brødtekst, og til slutt en innhold-fra-organisasjon-blokk.</p>
<h2>Bakgrunn</h2>
<p>Eksempelteksten er kort fordi formålet er å verifisere at modulene rendres korrekt.</p>"),
            InnholdFra("Direktoratet for medisinske produkter (DMP)", "2026-04-20")
        ));
        SaveAndPublish(c2);

        // Case 3: comprehensive — uses most available modules
        var c3 = Create("case", "Test-case med alle moduler", parentId);
        c3.SetValue("tittel", "Test-case med alle moduler");
        c3.SetValue("slug", "test-case-med-alle-moduler");
        c3.SetValue("ingress", "En komplett case som bruker hver av de tilgjengelige modulene minst én gang. Brukes for å verifisere visning på frontend.");
        c3.SetValue("bakgrunn", "lyseblaa");
        c3.SetValue("innhold", BuildArticleBlockList(
            Byline("Per Persen", "Seniorrådgiver", "Digdir", "2026-04-10"),
            TextBlock(@"<p>Dette er en omfattende test-case som inneholder eksempler på hver modultype.
Den brukes til å verifisere visuell rendering, mobilvisning og editor-UX.</p>
<h2>Hvorfor brukes denne casen?</h2>
<p>For å sikre at alle moduler virker som forventet før vi går i produksjon.</p>"),
            Fremheving("Faktaboks-eksempel", "<p>Dette er en standard Fremheving med lyseblå bakgrunn. Brukes for å fremheve faktainformasjon.</p>"),
            Fremheving(null, "<p>Dette er et sitat-eksempel uten tittel.</p>", visBakgrunn: false, visAnforselstegn: true, kilde: "Anonym kilde"),
            Trekkspill("Hva er en case?", "<p>En case er et eksempel på hvordan KI brukes i praksis i offentlig sektor.</p>"),
            Trekkspill("Hvordan brukes denne testen?", "<p>For å verifisere at editor og frontend fungerer som forventet.</p>"),
            TextBlock(@"<h2>Mer informasjon</h2>
<p>Etter alle modulene avsluttes casen med kontaktinfo og en innhold-fra-blokk.</p>"),
            Kontaktkort("Kari Nordmann", "Prosjektleder", "Digdir", "kari@digdir.no", "+47 12 34 56 78", "Spørsmål om casen?"),
            InnholdFra("Stavanger kommune", "2026-04-25")
        ));
        SaveAndPublish(c3);

        Console.WriteLine("ContentSeeder: Seeded 3 test cases");
    }

    // ── Veiledninger ───────────────────────────────────────────

    private void SeedVeiledninger(int parentId)
    {
        // Create guide
        var guide = Create("veiledningGuide", "Bruk data rett når du lager KI", parentId);
        guide.SetValue("tittel", "Bruk data rett når du lager KI");
        guide.SetValue("slug", "bruk-data-rett");
        guide.SetValue("introTekst", "<p>God dataforvaltning er avgjørende for at KI-systemer skal fungere ordentlig og bidra til at du når målet. KI-loven har krav om hvordan vi skal forvalte data både når vi bruker KI og utvikler KI-systemer.</p>");
        guide.SetValue("seoTittel", "Bruk data rett når du lager KI – Veiledning");
        guide.SetValue("seoBeskrivelse", "Lær hvordan du bruker data riktig når du utvikler KI-systemer. Steg-for-steg veiledning.");
        SaveAndPublish(guide);

        // Step 1.1
        var s = Create("veiledningSteg", "Forstå informasjonskrav", parentId);
        s.SetValue("tittel", "Finn ut hvilken informasjon du trenger");
        s.SetValue("slug", "forsta-informasjonskrav");
        s.SetValue("guideSlug", "bruk-data-rett");
        s.SetValue("steg", 1);
        s.SetValue("understeg", 1);
        s.SetValue("innhold", "<p>Når vi lager et KI-system, har vi et mål for hva vi skal oppnå med det. Å forstå informasjonskravet til KI-systemet handler om å finne ut hvilken informasjon det trenger for å nå målet.</p><p>Ta utgangspunkt i problemet KI-systemet skal løse eller behovet det skal dekke. Hvilke data trenger du for å at det du lager når målet?</p>");
        s.SetValue("eksempelTittel", "Eksempel: Den smarte insulinpumpen");
        s.SetValue("eksempelTekst", "<p>Først må vi analysere løsningen vi vil lage og målet vi vil nå – i dette tilfellet å bestemme hvor mye insulin en diabetiker trenger til enhver tid. Da må vi samle inn data som blodsukkernivå, puls og oksygennivå i blodet.</p>");
        SaveAndPublish(s);

        // Step 1.2
        s = Create("veiledningSteg", "Sensitive personopplysninger", parentId);
        s.SetValue("tittel", "Forstå behandling av spesielle kategorier av personopplysninger");
        s.SetValue("slug", "sensitive-personopplysninger");
        s.SetValue("guideSlug", "bruk-data-rett");
        s.SetValue("steg", 1);
        s.SetValue("understeg", 2);
        s.SetValue("innhold", "<p>Når vi utvikler KI-systemer må vi følge regelverket om vern av personopplysninger. Noen kategorier av opplysninger kan innebære en særlig risiko for enkeltpersoners rettigheter og friheter. Det er regler for når vi kan bruke slik data i KI-systemer?</p>");
        s.SetValue("infoKortTittel", "Slik kan du verne om personopplysninger");
        s.SetValue("infoKortInnhold", "<p>Vurder hvilke tiltak som er relevante for ditt prosjekt.</p>");
        SaveAndPublish(s);

        // Step 2.1
        s = Create("veiledningSteg", "Finn datakilder", parentId);
        s.SetValue("tittel", "Finn datakilder");
        s.SetValue("slug", "finn-datakilder");
        s.SetValue("guideSlug", "bruk-data-rett");
        s.SetValue("steg", 2);
        s.SetValue("understeg", 1);
        s.SetValue("innhold", "<ol><li>Finn ut hvilke kilder du kan hente data fra.</li><li>Finn ut hvilke metoder du skal bruke til å hente data</li></ol><p>Les om ulike metoder for å samle inn data (lenke til ny side)</p>");
        s.SetValue("eksempelTittel", "Eksempel: Registrere fremmøte på jobb");
        s.SetValue("eksempelTekst", "<p>Ta et AI-system for registrering av frammøte på jobb med biometrisk gjenkjenning som eksempel. Hvis du trener systemet med bilder som er skjeve når det gjelder kjønn og rase, er det stor risiko for at systemet også blir skjevt og diskriminerende.</p><p>Hvis du for eksempel hovedsakelig bruker bilder av hvite menn for å trene ansiktsgjenkjenningssystemet, vil systemet trolig slite med å gjenkjenne og klassifisere personer av andre kjønn og raser. Dette kan føre til at systemet gjør feil når det skal identifisere personer av visse raser eller kjønn, og dermed diskriminerer.</p>");
        SaveAndPublish(s);

        // Step 2.2
        s = Create("veiledningSteg", "Samle inn data", parentId);
        s.SetValue("tittel", "Samle inn data");
        s.SetValue("slug", "samle-inn-data");
        s.SetValue("guideSlug", "bruk-data-rett");
        s.SetValue("steg", 2);
        s.SetValue("understeg", 2);
        s.SetValue("innhold", "<ol><li>Hent data fra de identifiserte kildene</li><li>Dokumenter hvor dataene kommer fra</li></ol>");
        SaveAndPublish(s);

        // Step 3.1
        s = Create("veiledningSteg", "Måle og forbedre datakvalitet", parentId);
        s.SetValue("tittel", "Måle og forbedre datakvalitet");
        s.SetValue("slug", "male-og-forbedre-datakvalitet");
        s.SetValue("guideSlug", "bruk-data-rett");
        s.SetValue("steg", 3);
        s.SetValue("understeg", 1);
        s.SetValue("innhold", "<p>Å vurdere kvaliteten på dataene handler om å finne ut hvor godt dataene passer til formålet. Det gjør vi ved å analysere aspekter ved dataene. Analysen forteller oss hva vi må justere for å forbedre dataene.</p><p>Dette må du gjøre for hvert datasett.</p>");
        s.SetValue("infoKortTittel", "Slik måler du datakvalitet");
        s.SetValue("infoKortInnhold", "<ol><li>Velg hvilke aspekter av datane du skal måle kvaliteten på.</li><li>Finn ut hvordan du skal måle kvaliteten.</li><li>Implementer kontrollen teknisk.</li><li>Lag en rapport med resultatene fra kontrollen.</li><li>Lag tiltak og plan for å forbedre dataene.</li></ol>");
        s.SetValue("eksempelTittel", "Eksempel: Implementere kontrollen teknisk");
        s.SetValue("eksempelTekst", "<p>La oss anta at vi har definert kvalitetskontrollene fra forrige eksempel for de tre punktene i datalivssyklusen. Nå må vi implementere disse kontrollene, og som vi har forklart vil hvordan vi gjør det avhenge av hver plattform.</p>");
        SaveAndPublish(s);

        // Step 3.2
        s = Create("veiledningSteg", "Datatransformasjon", parentId);
        s.SetValue("tittel", "Datatransformasjon");
        s.SetValue("slug", "datatransformasjon");
        s.SetValue("guideSlug", "bruk-data-rett");
        s.SetValue("steg", 3);
        s.SetValue("understeg", 2);
        s.SetValue("innhold", "<p>Å endre dataene slik at de har likt format, er ekstra viktig når dataene kommer fra ulike kilder. Ulikt format kan for eksempel være at dataene bruker ulike måleenheter eller har indekser på ulike skalaer.</p>");
        s.SetValue("infoKortTittel", "Slik gir du datene likt format");
        s.SetValue("infoKortInnhold", "<p>1. Identifiser data som ikke er ensartede, og finn ut hvorfor de er ulike. Sjekk om data</p><ul><li>har ulike formater, for eksempel datoformater</li><li>bruker ulike måleenheter</li><li>har ulike skalaer eller indekser</li></ul><p>2. Gjør data ensartede.</p><ul><li>Normalisere - justere verdier til en felles skala</li><li>Skalere - tilpasse størrelsesorden</li><li>Konvertere - endre format eller enhet</li></ul>");
        s.SetValue("eksempelTittel", "Konkret eksempel på transformasjon");
        s.SetValue("eksempelTekst", "<ul><li>Konverter valuta (f.eks. Yen → Euro)</li><li>Konverter måleenheter (f.eks. miles → kilometer)</li><li>Standardiser datoformater (f.eks. DD/MM/ÅÅÅÅ → ÅÅÅÅ-MM-DD)</li><li>Konverter kategoriske verdier (f.eks. \"Ja/Nei\" → 1/0)</li></ul>");
        SaveAndPublish(s);

        // Step 3.3
        s = Create("veiledningSteg", "Aggregere data", parentId);
        s.SetValue("tittel", "Aggregere data");
        s.SetValue("slug", "aggregere-data");
        s.SetValue("guideSlug", "bruk-data-rett");
        s.SetValue("steg", 3);
        s.SetValue("understeg", 3);
        s.SetValue("innhold", "<p>Hvis du trenger å vite egenskaper ved grupper av dataene, må du gruppere dem for å kunne analysere dem og trekke konklusjoner.</p>");
        s.SetValue("infoKortTittel", "Slik går du frem");
        s.SetValue("infoKortInnhold", "<ol><li>Finn ut om du trenger å analysere data på gruppenivå.</li><li>Velg egenskaper du vil gruppere data etter (f.eks. per ansatt, per avdeling, per dato)</li><li>Bestem hvordan du vil oppsummere dataene, for eksempel gjennomsnitt, sum eller antall.</li><li>Endre de originale dataene: grupper dem etter karakteristikkene du har valgt, beregn aggregeringsfunksjon for hver gruppe, lag nytt aggregert datasett.</li></ol>");
        s.SetValue("eksempelTittel", "Konkret eksempel på transformasjon");
        s.SetValue("eksempelTekst", "<ul><li>Konverter valuta (f.eks. Yen → Euro)</li><li>Konverter måleenheter (f.eks. miles → kilometer)</li><li>Standardiser datoformater (f.eks. DD/MM/ÅÅÅÅ → ÅÅÅÅ-MM-DD)</li><li>Konverter kategoriske verdier (f.eks. \"Ja/Nei\" → 1/0)</li></ul>");
        SaveAndPublish(s);

        // Step 3.4
        s = Create("veiledningSteg", "Trekke ut data", parentId);
        s.SetValue("tittel", "Trekke ut data");
        s.SetValue("slug", "trekke-ut-data");
        s.SetValue("guideSlug", "bruk-data-rett");
        s.SetValue("steg", 3);
        s.SetValue("understeg", 4);
        s.SetValue("innhold", "<p>Det kan i noen tilfeller være nødvendig å trekke ut data fra et datasett. Det kan for eksempel være hvis du vil teste AI-systemet raskt uten å bruke hele datasettet eller skal dele data i treningssett, valideringssett og testsett.</p>");
        s.SetValue("infoKortTittel", "Velg metode for å trekke ut data");
        s.SetValue("infoKortInnhold", "<p>Forskjellen på tilfeldig og stratifisert uttrekk er at ved tilfeldig utvalg har alle datapunkter like stor sjanse for å bli valgt, mens ved stratifisert utvalg deler du først dataene i undergrupper og velger deretter fra hver gruppe for å sikre at alle grupper er representert.</p>");
        s.SetValue("eksempelTittel", "Konkret eksempel på transformasjon");
        s.SetValue("eksempelTekst", "<ul><li>Konverter valuta (f.eks. Yen → Euro)</li><li>Konverter måleenheter (f.eks. miles → kilometer)</li><li>Standardiser datoformater (f.eks. DD/MM/ÅÅÅÅ → ÅÅÅÅ-MM-DD)</li><li>Konverter kategoriske verdier (f.eks. \"Ja/Nei\" → 1/0)</li></ul>");
        SaveAndPublish(s);

        // Steps 4.1-4.3 (placeholder)
        s = Create("veiledningSteg", "Tilgang", parentId);
        s.SetValue("tittel", "Tilgang");
        s.SetValue("slug", "tilgang");
        s.SetValue("guideSlug", "bruk-data-rett");
        s.SetValue("steg", 4);
        s.SetValue("understeg", 1);
        s.SetValue("innhold", "<p>Innhold kommer snart.</p>");
        SaveAndPublish(s);

        s = Create("veiledningSteg", "Dokumentasjon", parentId);
        s.SetValue("tittel", "Dokumentasjon");
        s.SetValue("slug", "dokumentasjon");
        s.SetValue("guideSlug", "bruk-data-rett");
        s.SetValue("steg", 4);
        s.SetValue("understeg", 2);
        s.SetValue("innhold", "<p>Innhold kommer snart.</p>");
        SaveAndPublish(s);

        s = Create("veiledningSteg", "Personvern og sikkerhet", parentId);
        s.SetValue("tittel", "Personvern og sikkerhet");
        s.SetValue("slug", "personvern-og-sikkerhet");
        s.SetValue("guideSlug", "bruk-data-rett");
        s.SetValue("steg", 4);
        s.SetValue("understeg", 3);
        s.SetValue("innhold", "<p>Innhold kommer snart.</p>");
        SaveAndPublish(s);

        // Steps 5.1-5.4 (placeholder)
        s = Create("veiledningSteg", "Før du sletter", parentId);
        s.SetValue("tittel", "Før du sletter");
        s.SetValue("slug", "for-du-sletter");
        s.SetValue("guideSlug", "bruk-data-rett");
        s.SetValue("steg", 5);
        s.SetValue("understeg", 1);
        s.SetValue("innhold", "<p>Innhold kommer snart.</p>");
        SaveAndPublish(s);

        s = Create("veiledningSteg", "Når du sletter", parentId);
        s.SetValue("tittel", "Når du sletter");
        s.SetValue("slug", "nar-du-sletter");
        s.SetValue("guideSlug", "bruk-data-rett");
        s.SetValue("steg", 5);
        s.SetValue("understeg", 2);
        s.SetValue("innhold", "<p>Innhold kommer snart.</p>");
        SaveAndPublish(s);

        s = Create("veiledningSteg", "Dokumentasjon av sletting", parentId);
        s.SetValue("tittel", "Dokumentasjon av sletting");
        s.SetValue("slug", "dokumentasjon-sletting");
        s.SetValue("guideSlug", "bruk-data-rett");
        s.SetValue("steg", 5);
        s.SetValue("understeg", 3);
        s.SetValue("innhold", "<p>Innhold kommer snart.</p>");
        SaveAndPublish(s);

        s = Create("veiledningSteg", "Slett deler av dataen", parentId);
        s.SetValue("tittel", "Slett deler av dataen");
        s.SetValue("slug", "slett-deler-av-dataen");
        s.SetValue("guideSlug", "bruk-data-rett");
        s.SetValue("steg", 5);
        s.SetValue("understeg", 4);
        s.SetValue("innhold", "<p>Innhold kommer snart.</p>");
        SaveAndPublish(s);

        // Merke data (step 3 sub-step)
        s = Create("veiledningSteg", "Merke data", parentId);
        s.SetValue("tittel", "Merke data");
        s.SetValue("slug", "merke-data");
        s.SetValue("guideSlug", "bruk-data-rett");
        s.SetValue("steg", 3);
        s.SetValue("understeg", 5);
        s.SetValue("innhold", "<p>Innhold kommer snart.</p>");
        SaveAndPublish(s);
    }

    // ── FAQ ────────────────────────────────────────────────────

    private void SeedFAQ(int parentId, Dictionary<string, IContent> merkelapper)
    {
        var q1 = Create("faq", "Hva er kunstig intelligens?", parentId);
        q1.SetValue("sporsmal", "Hva er kunstig intelligens?");
        q1.SetValue("svar", @"<p>Kunstig intelligens (KI) er et samlebegrep for datasystemer som
kan utføre oppgaver som normalt krever menneskelig intelligens. Dette inkluderer
maskinlæring, naturlig språkbehandling, bildegjenkjenning og beslutningstaking.</p>
<p>I offentlig sektor brukes KI typisk til å automatisere rutineoppgaver,
forbedre innbyggertjenester og effektivisere saksbehandling.</p>");
        q1.SetValue("kategori", Udi(merkelapper["maskinlaering"]));
        q1.SetValue("rekkefolge", 1);
        SaveAndPublish(q1);

        var q2 = Create("faq", "Er det trygt å bruke KI i offentlig sektor?", parentId);
        q2.SetValue("sporsmal", "Er det trygt å bruke KI i offentlig sektor?");
        q2.SetValue("svar", @"<p>Ja, men det krever at man følger etablerte retningslinjer for
ansvarlig KI-bruk. Dette innebærer grundig risikovurdering, ivaretakelse
av personvern, og transparent bruk av teknologien.</p>
<p>EUs AI Act setter tydelige krav til KI-systemer som brukes i offentlig
sektor, spesielt for systemer med høy risiko.</p>");
        q2.SetValue("kategori", Udi(merkelapper["personvern"]));
        q2.SetValue("rekkefolge", 2);
        SaveAndPublish(q2);

        var q3 = Create("faq", "Hvordan komme i gang med KI?", parentId);
        q3.SetValue("sporsmal", "Hvordan komme i gang med KI i min virksomhet?");
        q3.SetValue("svar", @"<p>Start med å identifisere konkrete utfordringer eller prosesser
som kan forbedres med KI. Kartlegg datakvalitet og digital modenhet.
Se vår <em>veiledning for å komme i gang</em> for en steg-for-steg-guide.</p>
<p>Vi anbefaler å starte med små pilotprosjekter for å bygge kompetanse
og erfaring før man skalerer opp.</p>");
        q3.SetValue("kategori", Udi(merkelapper["automatisering"]));
        q3.SetValue("rekkefolge", 3);
        SaveAndPublish(q3);

        var q4 = Create("faq", "Hva er EUs AI Act?", parentId);
        q4.SetValue("sporsmal", "Hva er EUs AI Act, og gjelder den i Norge?");
        q4.SetValue("svar", @"<p>EUs AI Act er verdens første helhetlige regulering av kunstig intelligens.
Den klassifiserer KI-systemer etter risikonivå og stiller strengere krav
jo høyere risikoen er.</p>
<p>Ja, gjennom EØS-avtalen vil regelverket også gjelde i Norge. Norske
virksomheter bør begynne å forberede seg allerede nå.</p>");
        q4.SetValue("kategori", Udi(merkelapper["etikk"]));
        q4.SetValue("rekkefolge", 4);
        SaveAndPublish(q4);

        var q5 = Create("faq", "Kan KI erstatte saksbehandlere?", parentId);
        q5.SetValue("sporsmal", "Kan KI erstatte saksbehandlere?");
        q5.SetValue("svar", @"<p>KI kan automatisere deler av saksbehandlingsprosessen, men bør
ikke erstatte menneskelig vurdering i beslutninger som har stor
betydning for enkeltpersoner.</p>
<p>I praksis fungerer KI best som et verktøy som støtter saksbehandlere —
for eksempel ved å sortere henvendelser, foreslå vedtak basert på
tidligere praksis, eller kvalitetssikre dokumenter.</p>");
        q5.SetValue("kategori", Udi(merkelapper["automatisering"]));
        q5.SetValue("rekkefolge", 5);
        SaveAndPublish(q5);
    }

    // ── KI-ordbok ────────────────────────────────────────────────

    /// <summary>
    /// Seeds the KI-ordbok container and all 192 terms if they don't already exist.
    /// Safe to call on existing environments — checks for the container first.
    /// </summary>
    private void MigrateOrdbokOppslag()
    {
        // Check if the container already exists at root
        var rootContent = _contentService.GetRootContent();
        var existing = rootContent.FirstOrDefault(c => c.ContentType.Alias == "ordbokSamling");
        if (existing != null) return;

        // Check that the content type exists (ContentTypeComposer may not have run yet)
        if (_contentTypeService.Get("ordbokSamling") == null) return;

        var ordbokFolder = CreateFolder("ordbokSamling", "KI-ordbok");
        SeedOrdbokOppslag(ordbokFolder.Id);
        Console.WriteLine("ContentSeeder: Seeded KI-ordbok (migration)");
    }

    private void SeedOrdbokOppslag(int parentId)
    {
        var terms = new[]
        {
            ("Kunstig intelligens (KI) eller Artificial Intelligence", "AI", "Kunstig intelligens er datasystemer som kan utføre oppgaver som vanligvis krever menneskelig intelligens, for eksempel å forstå tekst, bilder eller tale og ta enkle beslutninger."),
            ("A/B-testing", "", "A/B-testing er å sammenligne to versjoner av en løsning, for eksempel to KI-modeller, for å se hvilken som gir best resultater i praksis."),
            ("A/B-testing med KI", "", "A/B-testing med KI betyr at modellen hjelper til med å lage flere varianter og finne ut hvilke budskap, bilder eller vinklinger som fungerer best."),
            ("Adaptere", "adapter layers", "Adaptere er små tilleggsmoduler som settes inn i en eksisterende modell for å tilpasse den til nye oppgaver uten å endre hele modellen."),
            ("Agent-samarbeid", "multi-agent systems, MAS", "Agent-samarbeid betyr at flere KI-agenter med ulike roller jobber sammen om en oppgave, litt som et team med spesialister."),
            ("Agentisk KI", "agentic AI", "Agentisk KI beskriver systemer der KI opptrer mer som en aktiv aktør som planlegger, tar initiativ og følger opp oppgaver på egen hånd innenfor gitte rammer."),
            ("AI governance", "KI-styring", "KI-styring, kjent som AI governance er strukturer, roller og prosesser som sikrer at KI brukes kontrollert, i tråd med lover, strategi og etiske krav."),
            ("AI policy / KI-policy", "", "En KI-policy er et sett med retningslinjer som beskriver hvordan virksomheten skal bruke kunstig intelligens på en trygg og ansvarlig måte."),
            ("AI-agent / KI-agent", "", "En KI-agent er en «arbeidende» KI som kan ta imot instrukser, hente informasjon, bruke verktøy og utføre oppgaver en etterspør mer selvstendig over tid."),
            ("AI-strategi / KI-strategi", "", "En KI-strategi beskriver hvordan virksomheten skal bruke kunstig intelligens for å støtte prioriteringer, organisering og investeringer."),
            ("Anbefalingssystem", "recommender system", "Et anbefalingssystem foreslår relevante produkter, tjenester eller innhold basert på tidligere atferd og lignende brukere."),
            ("Anomaly detection", "avviksdeteksjon", "Avviksdeteksjon brukes til å finne uvanlige mønstre som skiller seg fra normalen, for eksempel mulig svindel eller tekniske feil."),
            ("API", "Application Programming Interface", "Et API er et grensesnitt som gjør at ulike systemer kan snakke sammen og for eksempel sende forespørsler til en KI-modell og motta svar."),
            ("Arbeidsflyt / workflow", "", "En arbeidsflyt er en definert kjede av steg og beslutninger som beskriver hvordan en oppgave gjennomføres fra start til slutt."),
            ("Automatisering", "", "Automatisering betyr at oppgaver som tidligere ble gjort manuelt blir utført av systemer eller programvare, ofte ved hjelp av KI."),
            ("Automatisering av prosesser", "", "Automatisering av prosesser betyr å bruke teknologi, ofte KI, til å utføre deler av eller hele arbeidsprosesser uten manuelle steg."),
            ("Autoregressiv modell", "", "En autoregressiv modell genererer innhold steg for steg ved å forutsi neste ord eller element basert på det som allerede er skrevet."),
            ("Basismodell / grunnmodell", "foundation model", "En grunnmodell er en stor, generell KI-modell som kan brukes som utgangspunkt og tilpasses ulike oppgaver i en virksomhet."),
            ("Benchmarking", "standardtester", "Benchmarking er å teste modellen på standardiserte oppgaver og datasett for å kunne sammenligne den med andre modeller."),
            ("Beslutningsstøttesystem", "", "Et beslutningsstøttesystem er en løsning som gir analyser, anbefalinger eller visualiseringer som hjelper ledere å ta bedre beslutninger."),
            ("Bias", "skjevhet", "Bias er systematiske skjevheter i data eller modeller som gjør at enkelte grupper behandles annerledes eller urettferdig."),
            ("Bildemodell", "vision model, CV, Computer Vision", "En bildemodell er KI som kan forstå og analysere bilder og video, for eksempel gjenkjenne objekter eller lese tekst i bilder."),
            ("BLEU / ROUGE", "for språkmodeller", "BLEU og ROUGE er metrikker som sammenligner tekst generert av modellen med en «fasittekst» for å måle kvalitet, ofte brukt for oversettelse og oppsummering."),
            ("CE-merking av KI-systemer", "", "CE-merking for KI betyr at et høyrisiko KI-system er vurdert og erklært i samsvar med AI Act og andre relevante EU-regler, og kan settes lovlig på markedet i EU."),
            ("Chatbot / samtalerobot", "", "En chatbot er en løsning der brukere kan chatte med KI i et tekstvindu for å få hjelp, svar eller utføre enkle oppgaver."),
            ("Chunking", "deling i tekstbiter", "Chunking er å dele dokumenter opp i mindre tekstbiter slik at KI lettere kan hente frem og bruke de delene som er relevante."),
            ("CI/CD for KI-modeller", "", "CI/CD (Continuous Integration/Continuous Delivery or Deployment) for KI-modeller er automatiserte prosesser for å teste, godkjenne og rulle ut nye modellversjoner på en kontrollert måte."),
            ("Clusteranalyse", "clustering", "Clusteranalyse grupperer data i naturlige klynger, for eksempel å finne ulike kundegrupper basert på atferd."),
            ("Data lake", "", "En data lake er et stort lagringsområde der du kan samle rådata i ulike formater på ett sted, før de struktureres og brukes videre."),
            ("Data mesh", "", "Data mesh er en måte å organisere datadeling i større virksomheter der ulike team har ansvar for sine «dataprodukter», men deler dem via felles standarder."),
            ("Data minimization", "dataminimering", "Dataminimering betyr at virksomheten bare skal samle inn og lagre de personopplysningene som er nødvendige for et tydelig definert formål, og ikke mer."),
            ("Data pipeline / datapipeline", "", "En datapipeline er den tekniske løsningen som flytter, bearbeider og klargjør data fra kilder til der de skal brukes, for eksempel i KI-modeller."),
            ("Data, datasett", "", "Enkelt sagt, er data er informasjon som kan lagres og behandles digitalt, og et datasett er en samling av slik informasjon som hører tematisk sammen."),
            ("Databehandler vs behandlingsansvarlig", "", "Behandlingsansvarlig bestemmer hvorfor og hvordan personopplysninger behandles, mens databehandler kun behandler data på oppdrag og etter instruks fra den behandlingsansvarlige."),
            ("Datagovernance / datastyring", "", "Datastyring er de prosessene, rollene og reglene som sikrer at data behandles sikkert, korrekt og i tråd med lover, avtaler og virksomhetens egne retningslinjer."),
            ("Datakvalitet", "", "Datakvalitet handler om hvor korrekte, fullstendige, oppdaterte og konsistente dataene dine er."),
            ("Datasporbarhet", "data lineage", "Datasporbarhet beskriver hvor data kommer fra, hvordan de er behandlet og hvor de brukes, slik at man kan spore og forstå hele reisen til dataene og oppdage feil."),
            ("Datavarehus", "data warehouse", "Et datavarehus er en strukturert database som er tilpasset rapportering, analyse og styringsinformasjon på tvers av virksomheten."),
            ("Datavask", "data cleaning", "Datavask betyr å rydde opp i dataene ved å fjerne feil, duplikater og mangler, slik at de blir egnet til analyse av KI."),
            ("Deep reinforcement learning", "", "Deep reinforcement learning kombinerer dype nevrale nettverk med forsterkningslæring for å takle mer komplekse beslutningsoppgaver."),
            ("Diffusjonsmodell", "diffusion model", "En diffusjonsmodell er en type generativ KI som gradvis bygger opp et bilde eller annet innhold fra «støy» til et ferdig resultat."),
            ("Digital assistent / co-pilot", "", "En digital assistent eller co-pilot er KI som hjelper deg inne i verktøyene du allerede bruker, for eksempel i e-post, dokumenter eller CRM."),
            ("Digital tvilling", "", "En digital tvilling er en digital modell av et fysisk system, en prosess eller en organisasjon som brukes til å simulere og teste endringer."),
            ("Diskriminering i data og modeller", "", "Diskriminering oppstår når KI forsterker eller skaper ulik behandling av personer basert på for eksempel kjønn, alder, etnisitet eller andre beskyttede kjennetegn."),
            ("Dokumentlager / dokumentbase", "", "Et dokumentlager er et sted der virksomheten lagrer dokumenter som rapporter, rutiner og håndbøker som kan kobles til KI."),
            ("DoRA", "Weight-Decomposed Low-Rank Adaptation", "DoRA er en videreutvikling av LoRA som finjusterer modellens vekter enda mer effektivt for å få bedre resultater med lite ekstra trening."),
            ("DPIA", "Data Protection Impact Assessment", "En DPIA er en personvernkonsekvensvurdering som kartlegger risiko for enkeltpersoner når en behandling av personopplysninger kan være særlig inngripende, for eksempel ved bruk av ny teknologi."),
            ("Dynamiske landingssider", "", "Dynamiske landingssider tilpasser innhold og budskap automatisk til hver besøkende, for eksempel basert på bransje eller tidligere atferd."),
            ("Dyp læring", "DL, Deep Learning", "Dyp læring er en type maskinlæring som bruker mange lag i nevrale nettverk for å finne mer avanserte mønstre i store datamengder."),
            ("E-postassistent", "", "En e-postassistent bruker generativ KI til å foreslå eller skrive svar på kunders e-poster, som deretter kan godkjennes eller justeres av medarbeiderne."),
            ("Edge AI", "", "Edge AI betyr at KI-kjøringen skjer nær brukeren eller enheten, for eksempel i sensorer, mobiltelefoner eller maskiner ute i felt."),
            ("Embedding", "vektorrepresentasjon", "En embedding er selve tallrekken som representerer et ord, en setning eller et dokument i en vektorisert form."),
            ("Promptkjede", "", "En promptkjede er når du deler en større oppgave opp i flere steg og bruker flere etterfølgende prompts som bygger videre på hverandre."),
            ("Eskalering til menneske", "handover", "Eskalering til menneske er når en sak som KI ikke bør løse selv, automatisk sendes videre til en medarbeider med nødvendig kontekst."),
            ("Etisk KI", "", "Etisk KI betyr at løsninger med kunstig intelligens tar hensyn til menneskerettigheter, verdighet, rettferdighet og mulige utilsiktede konsekvenser."),
            ("EU AI Act", "EUs KI-forordning, AI Act", "EU AI Act er EUs nye regelverk for kunstig intelligens som stiller ulike krav til KI-systemer avhengig av hvor høy risiko de utgjør for mennesker og samfunn."),
            ("Evalueringsmetrikker", "", "Evalueringsmetrikker er mål som brukes for å vurdere hvor godt en KI-modell fungerer."),
            ("Explainable AI", "XAI, forklarbar KI", "Forklarbar KI er metoder og verktøy som gjør det mulig å forstå hvorfor en modell gir et bestemt resultat eller anbefaling."),
            ("F1-score", "", "F1-score er et samlet mål som balanserer presisjon og recall i én verdi."),
            ("Fairness", "rettferdighet", "Fairness handler om at KI-løsninger skal behandle personer og grupper på en mest mulig rettferdig og ikke-diskriminerende måte."),
            ("Feature", "egenskap", "En feature er en enkelt egenskap eller variabel i dataene som modellen bruker for å gjøre beregninger, for eksempel alder, pris eller kundetype."),
            ("Feature store", "", "En feature store er et felles lager der du samler og gjenbruker bearbeidede datapunkter (features) som brukes i flere KI-modeller."),
            ("Few-shot learning", "", "Few-shot learning er når du gir modellen noen få eksempler i prompten for å vise hvordan du vil ha svaret."),
            ("Fine-tuning", "", "Fine-tuning er å tilpasse en ferdig pre-trent modell til en bestemt oppgave eller et bestemt domene ved å trene videre på egne data."),
            ("Foundation model / grunnmodell i EU-regulering", "", "I AI Act får grunnmodeller egne krav, blant annet til dokumentasjon, risikohåndtering og åpenhet om trening, fordi de brukes som basis i mange andre KI-løsninger."),
            ("GDPR", "personvernforordningen", "GDPR er EUs regelverk for personvern som setter krav til hvordan virksomheter samler inn, lagrer og bruker personopplysninger."),
            ("Generaliseringsevne", "", "Generaliseringsevne er modellens evne til å gi gode resultater på nye data som den ikke har sett under trening."),
            ("Generativ kunstig intelligens", "GenAI, Generative AI", "Generativ KI er systemer som kan skape nytt innhold, for eksempel tekst, bilder, lyd eller video, basert på det de har lært fra store mengder data."),
            ("Generator", "genereringsmodell i RAG", "Generatoren er KI-modellen som bruker de hentede tekstbitene til å formulere et naturlig og sammenhengende svar."),
            ("GPU", "Graphics Processing Unit", "En GPU er en type prosessor som er spesielt god til å kjøre tunge KI-beregninger raskt."),
            ("Ground truth", "fasitdata", "Ground truth er «fasiten» modellen måles mot, altså de riktige svarene som brukes til å vurdere hvor god modellen er."),
            ("Grounding", "faktagrunnlag for svar", "Grounding betyr at KI svarer med utgangspunkt i konkrete kilder, for eksempel egne dokumenter, slik at svaret får et tydelig faktagrunnlag."),
            ("Guardrails", "sikkerhets- og policy-gjerder", "Guardrails er tekniske og praktiske sikkerhetstiltak som sørger for at KI-modellen følger lover, etiske krav og virksomhetens retningslinjer."),
            ("Hallusinasjon", "model hallucination", "Hallusinasjon betyr at KI-modellen gir et svar som ser troverdig ut, men som er feil eller finner opp fakta."),
            ("Halvstrukturerte data", "", "Halvstrukturerte data har noe struktur, men ikke like strengt som en tabell, for eksempel JSON-, XML- eller loggfiler."),
            ("Handlinger", "actions", "Handlinger er konkrete operasjoner agenten utfører, for eksempel å sende en e-post, opprette en sak i et system eller hente et dokument."),
            ("Human evaluation", "menneskelig evaluering", "Menneskelig evaluering betyr at mennesker vurderer kvaliteten på modellens svar ut fra for eksempel nytte, korrekthet og forståelighet."),
            ("Hybrid søk", "semantisk + nøkkelord", "Hybrid søk kombinerer semantisk søk og tradisjonelt nøkkelordssøk for å gi mer treffsikre resultater."),
            ("Hyperautomatisering", "", "Hyperautomatisering er når en virksomhet kombinerer KI, programvare og prosessverktøy for å automatisere så mange arbeidsoppgaver og prosesser som mulig fra ende til ende."),
            ("Hyperparametere", "", "Hyperparametere er innstillinger som styrer hvordan en modell trenes, for eksempel læringsrate eller hvor mange ganger den skal gå gjennom dataene."),
            ("Høyrisikosystemer i AI Act", "", "Høyrisikosystemer er KI-løsninger som kan påvirke sikkerhet, helse, rettigheter eller viktige beslutninger og som derfor må oppfylle strenge krav til dokumentasjon, risikostyring og tilsyn."),
            ("Indeksering", "index, vector index", "Indeksering er å organisere tekstbiter og embeddings i en struktur som gjør søk og gjenfinning raskt og effektivt."),
            ("Inferens", "inference", "Inferens er når en ferdigtrent KI-modell brukes til å svare, forutsi eller anbefale noe i sanntid eller nær sanntid."),
            ("Innholdsgenerering", "", "Innholdsgenerering er når generativ KI skriver utkast til artikler, annonser, nyhetsbrev eller sosiale medier-innlegg basert på en kort instruks."),
            ("Instruct-modell", "instruksjonstrent modell", "En instruct-modell er en grunnmodell som er videre trent til å følge instruksjoner og svare mer presist på konkrete spørsmål og oppgaver."),
            ("Instruksjonstuning", "instruction tuning", "Instruksjonstuning er fine-tuning der modellen trenes spesielt på å følge menneskelige instruksjoner og svare mer strukturert og nyttig."),
            ("Jailbreak", "", "Jailbreak er forsøk på å lure modellen til å bryte sikkerhetsregler og gi svar den egentlig ikke skal gi."),
            ("Klassifikasjonsmodell", "", "En klassifikasjonsmodell deler ting inn i kategorier, for eksempel «spammail» eller «ikke spam»."),
            ("Klassisk KI vs generativ KI", "", "Klassisk KI løser spesifikke oppgaver som å sortere eller forutsi tall, mens generativ KI i tillegg kan skape nytt innhold, som tekst og bilder."),
            ("Knowledge cutoff / kunnskapsavgrensning", "", "Knowledge cutoff er tidspunktet der modellen sluttet å lære av nye data, som forklarer hvorfor den ikke kjenner hendelser eller endringer etter en viss dato."),
            ("Knowledge distillation", "modell-destillasjon", "Knowledge distillation er når en mindre modell trenes til å etterligne en stor modell, slik at man får raskere og lettere løsninger med mye av samme kunnskap."),
            ("Kontekstvindu", "context window", "Kontekstvindu er den mengden tekst og informasjon modellen kan «ha i hodet» samtidig når den svarer."),
            ("Kundeservicebot", "chatbot", "En kundeservicebot er en KI-drevet chatløsning som svarer på kundehenvendelser automatisk i kanalene deres, for eksempel på nettsiden eller i sosiale medier."),
            ("Kunnskapsbase", "knowledge base", "En kunnskapsbase er et strukturert lager med informasjon, ofte spørsmål og svar eller artikler, som KI kan hente fra."),
            ("Kunstig generell intelligens", "AGI, Artificial General Intelligence", "AGI er en teoretisk form for KI som kan løse et bredt spekter av oppgaver like godt eller bedre enn mennesker, og som ikke har blitt utviklet i skrivende stund."),
            ("Label / målvariabel", "", "Label eller målvariabel er det modellen prøver å forutsi, for eksempel om en kunde vil slutte, eller hvilken kategori et bilde tilhører."),
            ("Latens", "", "Latens er tiden det tar fra en forespørsel sendes til KI-modellen til svaret kommer tilbake."),
            ("LLMOps", "operasjonalisering av språkmodeller", "LLMOps er MLOps spesielt tilpasset store språkmodeller, fra trening og tilpasning til drift, overvåking og forbedring."),
            ("LoRA", "Low-Rank Adaptation", "LoRA er en PEFT-metode der man legger til små ekstra lag i modellen i stedet for å endre alle de opprinnelige parameterne."),
            ("Marketing automation", "", "Marketing automation er bruk av KI og regler for å automatisere utsendelser og kampanjer basert på mottakerens atferd og interesser."),
            ("Maskinlæring", "ML, Machine Learning", "Maskinlæring er en metode der datamodeller lærer mønstre fra data for å kunne forutsi, foreslå eller ta beslutninger uten å være detaljprogrammert for hver oppgave."),
            ("Metadata", "", "Metadata er «data om data», for eksempel hvem som har laget datasettet, når det ble oppdatert og hva feltene betyr."),
            ("Minne i agenter", "short-term og long-term memory", "Minne i agenter er informasjon de husker fra tidligere steg eller økter, slik at de kan tilpasse seg brukeren og jobben over tid."),
            ("MLOps", "Machine Learning Operations", "MLOps er metodikk og verktøy for å få KI-modeller trygt og effektivt fra utvikling til drift og holde dem oppdatert."),
            ("Model cards / system cards", "", "Model cards og system cards er dokumenter som beskriver formål, trening, begrensninger og risiko ved en KI-modell på en forståelig måte."),
            ("Modellarkitektur", "", "Modellarkitektur er «oppskriften» på hvordan en KI-modell er bygget opp, for eksempel hvilke lag den har og hvordan data flyter gjennom modellen."),
            ("Modellendepunkt", "inference endpoint", "Et modellendepunkt er en teknisk «adresse» der andre systemer kan sende inn data og få svar tilbake fra KI-modellen via nettverk."),
            ("Modellgjennomsiktighet", "transparency", "Modellgjennomsiktighet betyr at det finnes innsikt i hvordan modellen er bygget, hvilke data den er trent på og hvilke begrensninger den har."),
            ("Modellregister", "model registry", "Et modellregister er et system der du lagrer og versjonerer KI-modeller, med oversikt over hvilke som er godkjent og i bruk."),
            ("Modellrisiko", "", "Modellrisiko er risikoen for at KI-modellen tar feil, brukes feil eller oppfører seg uventet og dermed påvirker beslutninger eller prosesser negativt."),
            ("Multimodal modell", "", "En multimodal modell er KI som kan forstå og kombinere flere typer innhold samtidig, for eksempel tekst, bilder, lyd og video."),
            ("MVP", "Minimum Viable Product", "En MVP er en første versjon av en løsning med bare de viktigste funksjonene, slik at man kan teste verdien raskt og forbedre videre."),
            ("Nevralt nettverk", "neural network, NN", "Et nevralt nettverk er en modell inspirert av hjernen vår, bygget opp av mange enkle «noder» som samarbeider for å gjenkjenne mønstre i data."),
            ("Nøyaktighet", "accuracy", "Nøyaktighet viser hvor stor andel av alle prediksjonene modellen gjør som er riktige."),
            ("Observability for KI", "", "Observability for KI betyr å ha god innsikt i hvordan modeller og datastrømmer fungerer i praksis, slik at du kan oppdage problemer og forbedringsmuligheter."),
            ("Observasjoner", "observations", "Observasjoner er tilbakemeldinger agenten får etter en handling, for eksempel svaret fra en API eller innholdet i et dokument den har åpnet."),
            ("On-prem", "lokalt", "On-prem betyr at løsningene kjører på servere virksomheten selv eier og drifter i egne lokaler eller datasentre."),
            ("One-shot learning", "", "One-shot learning er når du gir modellen ett eksempel i prompten for å styre hvordan den skal svare."),
            ("Opphavsrett og KI-trening", "", "Når det gjelder opphavsrett og KI-trening, handler dette om når og hvordan opphavsrettslig beskyttet materiale kan brukes som treningsdata for KI-modeller, og hvilke begrensninger og krav til hjemmel som gjelder."),
            ("Opphavsrett til KI-generert innhold", "", "Opphavsrett til KI-generert innhold dreier seg om hvem som eventuelt har rettigheter til innhold skapt ved hjelp av KI, og i hvilken grad dette regnes som verk med menneskelig opphav."),
            ("Orkestrering", "orchestration", "Orkestrering er å styre samspillet mellom flere KI-agenter, verktøy og systemer slik at de utfører en prosess i riktig rekkefølge."),
            ("Overfitting", "overtilpasning", "Overfitting betyr at modellen blir for godt tilpasset treningsdataene og derfor gjør det dårligere på nye, ukjente data."),
            ("Overvåking", "monitoring", "Overvåking er å følge med på hvordan KI-systemer og infrastruktur oppfører seg, for eksempel ytelse, feil og kostnader."),
            ("Parameter-efficient fine-tuning", "PEFT", "PEFT er teknikker som gjør det mulig å tilpasse store modeller med mye mindre datamengder og beregningskraft enn full trening krever."),
            ("Perpleksitet", "perplexity", "Perpleksitet er et mål på hvor godt en språkmodell forstår og forutsier tekst, der lavere verdi betyr bedre modell."),
            ("Personaliseringsmotor", "", "En personaliseringsmotor er en løsning som tilpasser innhold, tilbud eller kommunikasjon til hver enkelt bruker basert på data og atferd."),
            ("Personvern", "privacy", "Personvern handler om den enkeltes rett til kontroll over egne personopplysninger og hvordan de brukes av offentlige og private aktører."),
            ("Pilotprosjekt", "", "Et pilotprosjekt er en test av KI-løsningen i en begrenset del av virksomheten med ekte brukere og data."),
            ("Planlegging og resonnement", "planning and reasoning", "Planlegging og resonnement er agentens evne til å bryte ned et mål i deloppgaver, ta fornuftige valg og justere kursen underveis."),
            ("Plugins / verktøy / connectors", "", "Plugins, verktøy og connectors er «adaptere» som kobler KI til andre systemer, som e-post, dokumentlager eller fagsystemer."),
            ("Pre-trening", "pre-training", "Pre-trening er den første, omfattende treningen der modellen lærer generelle mønstre fra enorme datamengder før den tilpasses konkrete oppgaver."),
            ("Predictive analytics", "", "Predictive analytics bruker data og modeller til å forutsi hva som sannsynligvis vil skje fremover, for eksempel salg, avgang eller etterspørsel."),
            ("Prescriptive analytics", "", "Prescriptive analytics går et steg videre og foreslår konkrete tiltak eller valg basert på analyser og prediksjoner."),
            ("Presisjon", "precision", "Presisjon måler hvor stor andel av det modellen har merket som «riktig» som faktisk er riktig."),
            ("Privacy by design / by default", "", "Privacy by design / by default betyr at personvern skal bygges inn i løsninger fra starten av, og at høyeste grad av personvern skal være standardinnstilling."),
            ("Prompt", "innprompt, instruksjon", "En prompt er teksten eller instruksjonen du gir KI-modellen for å fortelle hva den skal gjøre."),
            ("Prompt engineering", "", "Prompt engineering er kunsten å formulere gode og presise spørsmål eller instruksjoner slik at KI gir bedre og mer nyttige svar."),
            ("Prompt template", "promptmal", "En promptmal er en ferdig struktur for hvordan du stiller spørsmål til KI, som du kan gjenbruke på tvers av oppgaver."),
            ("Proof of Concept", "", "En PoC er et avgrenset forsøk som skal vise om en idé eller KI-løsning faktisk fungerer teknisk og faglig før man investerer mer."),
            ("Prosesskartlegging", "", "Prosesskartlegging er å beskrive hvordan arbeidet faktisk gjøres i dag, steg for steg, for å se hvor KI og automatisering kan gi verdi."),
            ("Recall", "", "Recall måler hvor stor andel av alle de riktige tilfellene i dataene som modellen klarer å finne."),
            ("Regresjonsmodell", "", "En regresjonsmodell forutsier et tall, for eksempel omsetning neste måned eller forventet kundelivstid."),
            ("Regularisering", "", "Regularisering er teknikker som hindrer modellen i å lære for mye «støy» i dataene og hjelper den å generalisere bedre."),
            ("Reinforcement learning", "orsterkningslæring", "Forsterkningslæring betyr at en modell lærer ved å prøve seg frem og få belønning eller «straff» basert på hvor gode beslutninger den tar."),
            ("Ansvarlig KI", "", "Ansvarlig KI handler om å utvikle og bruke kunstig intelligens på en måte som er trygg, rettferdig, lovlig og i tråd med samfunnets verdier."),
            ("Retrieval-Augmented Generation", "RAG", "RAG er en måte å kombinere KI med egne dokumenter, der modellen først henter relevant informasjon og så skriver et svar basert på denne informasjonen."),
            ("Retriever", "hentekomponent i RAG", "Retrieveren er den delen av RAG-løsningen som finner og henter de mest relevante dokumentene eller tekstbitene før svaret genereres."),
            ("Risikoanalyse", "", "Risikoanalyse for KI er en systematisk vurdering av mulige negative konsekvenser ved å ta i bruk en KI-løsning og hvordan disse kan håndteres."),
            ("ROI for KI-prosjekter", "", "ROI (Return on Investment) for KI-prosjekter er forholdet mellom gevinstene prosjektet skaper og kostnadene ved å gjennomføre det."),
            ("Sales intelligence", "", "Sales intelligence er bruk av KI til å samle og analysere kunde- og markedsdata for å gi selgere bedre innsikt før møter og oppfølging."),
            ("Self-supervised learning", "", "Self-supervised learning er en teknikk der modellen lager sine egne «treningsoppgaver» fra rådata for å lære mønstre uten manuelt merkearbeid."),
            ("Selvbetjent førstelinje", "", "Selvbetjent førstelinje betyr at KI håndterer de vanligste og enkleste henvendelsene før saken eventuelt sendes videre til et menneske."),
            ("Semantisk søk", "", "Semantisk søk betyr at systemet søker etter mening og sammenheng i teksten, ikke bare nøyaktige ord og uttrykk."),
            ("Semi-supervised learning", "", "Semi-supervised learning kombinerer litt merkede data med mye umerkede data for å trene modeller mer effektivt."),
            ("Sentimentanalyse", "", "Sentimentanalyse er når KI vurderer om kunden virker fornøyd, frustrert eller sint, slik at alvorlige saker kan prioriteres."),
            ("Skalerbarhet", "scalability", "Skalerbarhet er systemets evne til å håndtere flere brukere eller mer trafikk uten å stoppe opp eller bli veldig tregt."),
            ("Skyplattform", "cloud", "En skyplattform er infrastruktur levert over internett der du kan leie datakraft, lagring og KI-tjenester etter behov."),
            ("Smal KI", "narrow AI", "Smal KI er kunstig intelligens som er laget for én avgrenset oppgave, for eksempel å anbefale produkter eller oppdage svindel i betalinger."),
            ("Stor språkmodell", "Large Language Model, LLM", "En stor språkmodell er en type KI som er trent på store mengder tekst og kan skrive, oppsummere, oversette og svare på spørsmål i naturlig språk."),
            ("Strukturerte data", "", "Strukturerte data er informasjon som er organisert i faste formater, for eksempel rader og kolonner i en tabell eller database."),
            ("Supervised learning", "overvåket læring", "Overvåket læring betyr at modellen lærer fra data der fasiten allerede er kjent, for eksempel bilder merket som «kunde» eller «ikke kunde»."),
            ("Systemprompt", "", "En systemprompt er en «grunninstruks» som setter rolle, stil og rammer for hvordan KI-modellen skal opptre i en samtale."),
            ("Tale til tekst", "ASR, automatic speech recognition", "Tale til tekst er teknologi som omgjør lydopptak eller tale i sanntid til skriftlig tekst."),
            ("Tekst til bilde", "text-to-image", "Text-to-image til bilde betyr at du skriver inn en beskrivelse og KI genererer et nytt bilde basert på teksten."),
            ("Tekst til tale", "TTS, text-to-speech", "Text-to-speech er teknologi som leser opp tekst med syntetisk stemme, for eksempel lydbøker eller opplesning av artikler."),
            ("Tekst til tekst", "text-to-text", "Text-to-text til tekst betyr at du skriver inn tekst og modellen svarer med ny tekst, for eksempel et utkast, en oppsummering eller en oversettelse."),
            ("Tekst til video", "text-to-video", "Text-to-video betyr at du beskriver en scene eller et innhold og KI lager en enkel video som matcher beskrivelsen."),
            ("Temperatur", "sampling temperature", "Temperatur styrer hvor kreative svarene blir, lav temperatur gir tryggere og mer forutsigbare svar mens høy temperatur gir mer varierte og kreative svar."),
            ("Testdata", "test set", "Testdata er et eget datasett som brukes til å sjekke hvor godt en ferdigtrent modell fungerer på nye data."),
            ("Testdata, valideringsdata, hold-out set", "", "Testdata, valideringsdata og hold-out set er egne datasett som holdes utenfor treningen og brukes til å måle hvor godt modellen fungerer på nye data."),
            ("Throughput", "", "Throughput er hvor mange forespørsler eller beregninger et system kan håndtere per sekund eller per tidsenhet."),
            ("Tidsserieanalyse", "", "Tidsserieanalyse er metoder som analyserer utvikling over tid, for eksempel salg per uke eller strømpris per time, for å kunne forstå og forutsi trender."),
            ("Token", "", "En token er en liten tekstbit (ofte et ord eller en del av et ord) som modellen teller når den leser og skriver. Siden den bare kan håndtere et begrenset antall om gangen, er det antallet tokens som bestemmer hvor mye av samtalen den kan «ha i hodet» på en gang."),
            ("Tokenisering", "", "Tokenisering er prosessen der tekst deles opp i tokens som modellen kan behandle."),
            ("Top-k sampling", "", "Top-k er en metode som begrenser valgene modellen gjør til de k mest sannsynlige ordene, for eksempel de 40 mest sannsynlige."),
            ("Top-p / nucleus sampling", "", "Top-p er en metode som begrenser valgene modellen gjør til de mest sannsynlige ordene som samlet utgjør en viss sannsynlighet, for eksempel 90 prosent."),
            ("Total cost of ownership", "TCO", "TCO er den samlede kostnaden ved en KI-løsning over tid, inkludert lisens, drift, vedlikehold, opplæring og endringer."),
            ("TPU", "Tensor Processing Unit", "En TPU er en spesiallaget prosessor fra Google som er optimalisert for maskinlæring og KI-arbeidslaster."),
            ("Transfer learning", "", "Transfer learning betyr at en modell som allerede kan mye fra ett område finjusteres til en ny oppgave med mindre data."),
            ("Transformer-arkitektur", "Transformer", "Transformer er en moderne modellarkitektur som er spesielt god til å håndtere tekst og sekvenser, og som ligger til grunn for dagens store språkmodeller."),
            ("Trening", "training", "Trening er prosessen der en KI-modell lærer mønstre ved å gå gjennom store mengder data mange ganger."),
            ("Treningsdata", "training data", "Treningsdata er de dataene en KI-modell lærer fra for å finne mønstre og sammenhenger."),
            ("Underfitting", "", "Underfitting betyr at modellen er for enkel eller for dårlig trent til å fange de viktige mønstrene i dataene."),
            ("Unsupervised learning", "uovervåket læring", "Uovervåket læring brukes når modellen skal finne mønstre og grupper i data uten at det finnes en kjent fasit."),
            ("Use case", "bruksområde", "Et use case er en konkret beskrivelse av hvordan KI skal brukes i praksis for å gi verdi, for eksempel «automatisere kundeservice» eller «forutsi etterspørsel»."),
            ("Ustrukturerte data", "", "Ustrukturerte data er informasjon uten fast struktur, som e-poster, dokumenter, bilder, video eller fritekst."),
            ("Valideringsdata", "validation set", "Valideringsdata er et datasett som brukes under trening for å finjustere modellen og unngå at den blir for tilpasset treningsdataene."),
            ("Vektordatabase", "vector database, vector store", "En vektordatabase er en database som lagrer embeddings slik at systemet raskt kan finne innhold som ligner på det brukeren spør om."),
            ("Vektorisering", "", "Vektorisering betyr å gjøre tekst eller innhold om til tall som gjør det mulig for KI å sammenligne betydning og likhet mellom ulike tekster."),
            ("Verktøyskalling / tool calling", "function calling", "Verktøyskalling betyr at KI-modellen kan kalle eksterne verktøy eller funksjoner, for eksempel søk i CRM eller oppslag i et fagsystem, mens den løser en oppgave."),
            ("Zero-shot learning", "", "Zero-shot learning er når modellen løser en oppgave kun basert på instruksjonen, uten at du gir eksempler i prompten."),
        };

        foreach (var (term, altTerm, definisjon) in terms)
        {
            var item = Create("ordbokOppslag", term, parentId);
            item.SetValue("term", term);
            if (!string.IsNullOrEmpty(altTerm))
                item.SetValue("alternativTerm", altTerm);
            item.SetValue("definisjon", definisjon);
            SaveAndPublish(item);
        }
    }

    // ── Merkelapper ────────────────────────────────────────────

    private Dictionary<string, IContent> SeedMerkelapper(int parentId)
    {
        var tags = new[]
        {
            ("Maskinlæring", "maskinlaering", "Maskinlæring og nevrale nettverk"),
            ("Naturlig språk", "naturlig-sprak", "Naturlig språkbehandling (NLP)"),
            ("Chatbot", "chatbot", "Chatboter og konversasjonsgrensesnitt"),
            ("Personvern", "personvern", "Personvern og GDPR i KI-systemer"),
            ("Helse", "helse", "KI i helsesektoren"),
            ("Kommune", "kommune", "KI i kommunal sektor"),
            ("Automatisering", "automatisering", "Prosessautomatisering med KI"),
            ("Etikk", "etikk", "Etiske problemstillinger rundt KI"),
            ("Sikkerhet", "sikkerhet", "Informasjonssikkerhet og KI"),
            ("Innkjøp", "innkjop", "Anskaffelse av KI-løsninger"),
            ("Transparens", "transparens", "Åpenhet og forklarbarhet i KI-systemer"),
        };

        var map = new Dictionary<string, IContent>();
        foreach (var (navn, slug, _) in tags)
        {
            var m = Create("merkelapp", navn, parentId);
            m.SetValue("navn", navn);
            m.SetValue("slug", slug); // overridden by MerkelappSlugHandler on save anyway
            SaveAndPublish(m);
            map[slug] = m;
        }
        return map;
    }

    // SeedIkoner removed — Ikoner content type deactivated. Use Media folder instead.

    private string Udi(IContent content) => $"umb://document/{content.Key:N}";

    // ── Media ──────────────────────────────────────────────────

    private void SeedMedia()
    {
        // Check if media already exists
        var existing = _mediaService.GetRootMedia();
        if (existing != null && existing.Any()) return;

        var seedMediaPath = Path.Combine(_webHostEnvironment.WebRootPath ?? _webHostEnvironment.ContentRootPath, "seed-media");
        if (!Directory.Exists(seedMediaPath))
        {
            Console.WriteLine($"ContentSeeder: No seed-media folder found at {seedMediaPath}");
            return;
        }

        // Create a folder in the media library
        var folder = _mediaService.CreateMediaWithIdentity("Seed bilder", -1, "Folder");

        foreach (var filePath in Directory.GetFiles(seedMediaPath, "*.png"))
        {
            var fileName = Path.GetFileName(filePath);
            try
            {
                var media = _mediaService.CreateMedia(fileName, folder.Id, "Image");
                var fileBytes = System.IO.File.ReadAllBytes(filePath);
                var stream = new MemoryStream(fileBytes);
                media.SetValue(_mediaFileManager, _mediaUrlGenerators, _shortStringHelper, _contentTypeBaseServiceProvider, "umbracoFile", fileName, stream);
                _mediaService.Save(media);
                Console.WriteLine($"ContentSeeder: Uploaded media '{fileName}'");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"ContentSeeder: Failed to upload '{fileName}': {ex.Message}");
            }
        }
    }
}
