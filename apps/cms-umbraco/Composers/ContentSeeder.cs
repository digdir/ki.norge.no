using System.Text.Json;
using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Services;

namespace KiNorge.Cms.Composers;

/// <summary>
/// Runs idempotent structure migrations and ensures the KI-ordbok terms exist
/// on environments that didn't get them. New demo content is no longer seeded
/// from code — bootstrap content via uSync instead. Must run after
/// ContentTypeComposer so document types exist.
/// </summary>
[ComposeAfter(typeof(ContentTypeComposer))]
public class ContentSeederComposer : ComponentComposer<ContentSeeder>
{
}

public class ContentSeeder : IAsyncComponent
{
    private readonly IContentService _contentService;
    private readonly IContentTypeService _contentTypeService;
    private readonly IRuntimeState _runtimeState;

    public ContentSeeder(
        IContentService contentService,
        IContentTypeService contentTypeService,
        IRuntimeState runtimeState)
    {
        _contentService = contentService;
        _contentTypeService = contentTypeService;
        _runtimeState = runtimeState;
    }

    public Task InitializeAsync(bool isRestarting, CancellationToken cancellationToken)
    {
        if (_runtimeState.Level < RuntimeLevel.Run) return Task.CompletedTask;

        // Structure migrations: idempotent fixes for the content tree (rename, move,
        // backfill required fields, convert legacy types). Safe to run on every startup.
        try { RunStructureMigrations(); }
        catch (Exception ex) { Console.WriteLine($"ContentSeeder RunStructureMigrations: {ex.Message}"); }

        // KI-ordbok migration: creates the container and 192 terms in environments
        // that don't already have them. Idempotent — no-op once present.
        try { MigrateOrdbokOppslag(); }
        catch (Exception ex) { Console.WriteLine($"ContentSeeder MigrateOrdbokOppslag: {ex.Message}"); }

        return Task.CompletedTask;
    }

    public Task TerminateAsync(bool isRestarting, CancellationToken cancellationToken) => Task.CompletedTask;

    // ── Structure migrations (idempotent, run on every startup) ──

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
    /// Needed because Caser was added after the initial seed ran on prod.
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

    private (string, Dictionary<string, object>) Trekkspill(string tittel, string innhold) =>
        ("artikkelTrekkspill", new Dictionary<string, object> { ["tittel"] = tittel, ["innhold"] = innhold });

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

}
