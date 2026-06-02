using System.Text.Json;
using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.Services;

namespace KiNorge.Cms.Composers;

/// <summary>
/// Runs idempotent structure migrations on the content tree (rename, move,
/// backfill required fields, flatten legacy child nodes into Block Lists).
/// New demo content is no longer seeded from code — bootstrap content via
/// uSync instead. Must run after ContentTypeComposer so document types exist.
/// </summary>
[ComposeAfter(typeof(ContentTypeComposer))]
public class ContentSeederComposer : ComponentComposer<ContentSeeder>
{
}

public class ContentSeeder : IAsyncComponent
{
    private readonly IContentService _contentService;
    private readonly IContentTypeService _contentTypeService;
    private readonly IKeyValueService _keyValueService;
    private readonly IRuntimeState _runtimeState;

    public ContentSeeder(
        IContentService contentService,
        IContentTypeService contentTypeService,
        IKeyValueService keyValueService,
        IRuntimeState runtimeState)
    {
        _contentService = contentService;
        _contentTypeService = contentTypeService;
        _keyValueService = keyValueService;
        _runtimeState = runtimeState;
    }

    public Task InitializeAsync(bool isRestarting, CancellationToken cancellationToken)
    {
        if (_runtimeState.Level < RuntimeLevel.Run) return Task.CompletedTask;

        // Structure migrations: idempotent fixes for the content tree (rename, move,
        // backfill required fields, convert legacy types). Safe to run on every startup.
        try { RunStructureMigrations(); }
        catch (Exception ex) { Console.WriteLine($"ContentSeeder RunStructureMigrations: {ex.Message}"); }

        return Task.CompletedTask;
    }

    public Task TerminateAsync(bool isRestarting, CancellationToken cancellationToken) => Task.CompletedTask;

    // ── Structure migrations (idempotent, run on every startup) ──

    private void RunStructureMigrations()
    {
        // Reorganize existing content
        ForceForsideToTop();
        RemoveIkonerContent();
        RenameVeiledningerToVeiledning();
        MoveOmOssIntoSider();
        MoveVeiledningOversiktUnderVeiledning();
        FlattenVeiledningOversiktIntoContainer();
        NestVeiledningStegUnderGuide();
        FlattenOmOssSeksjonerToBlocks();
        FixBakgrunnDropdownValues();
        EnsureGlobaleInnstillingerExist();
        BackfillBrukDataRettStegtitler();
        DeleteLegacySideNodes();
        EnsureSandkasseExistsForDev();
        SeedDemoContentForDev();
    }

    private const string SideBlocklistMigratedKey = "ki:migrated-side-blocklist";

    /// <summary>
    /// side-CT changed schema from (tittel + richtext innhold) to artikkelhode + blocklist.
    /// Legacy side nodes have richtext HTML in the 'innhold' field which now fails block-list
    /// JSON deserialization, so those nodes are moved to the recycle bin (never hard-deleted)
    /// once, so editors can recreate clean.
    ///
    /// One-shot: guarded by a key-value flag so it runs at most once. Without this guard the
    /// routine wiped editor-created Personvern/Cookies/Tilgjengelighet pages on every startup.
    /// Only legacy richtext nodes are touched (innhold without "contentData"); nodes that
    /// already hold valid block-list JSON are left alone.
    /// </summary>
    private void DeleteLegacySideNodes()
    {
        if (!string.IsNullOrEmpty(_keyValueService.GetValue(SideBlocklistMigratedKey)))
            return;

        var rootContent = _contentService.GetRootContent().ToList();
        foreach (var root in rootContent)
        {
            MoveLegacySideNodesRecursive(root);
        }

        _keyValueService.SetValue(SideBlocklistMigratedKey, DateTime.UtcNow.ToString("O"));
    }

    private void MoveLegacySideNodesRecursive(IContent node)
    {
        var children = _contentService.GetPagedChildren(node.Id, 0, int.MaxValue, out _).ToList();
        foreach (var child in children)
        {
            MoveLegacySideNodesRecursive(child);
            if (child.ContentType.Alias != "side") continue;

            // Only touch legacy richtext nodes. A node whose 'innhold' already holds
            // block-list JSON ("contentData") is on the new schema and must be left alone.
            var innhold = child.GetValue<string>("innhold");
            if (!string.IsNullOrEmpty(innhold) && innhold.Contains("contentData"))
            {
                Console.WriteLine($"ContentSeeder: Skipped side node '{child.Name}' (already on blocklist schema)");
                continue;
            }

            Console.WriteLine($"ContentSeeder: WARNING — moving legacy side node '{child.Name}' to recycle bin (schema changed to blocklist)");
            _contentService.MoveToRecycleBin(child);
        }
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
        changed |= SetIfEmpty(node, "cookieTekst", "<p>Vi bruker kun nødvendige informasjonskapsler for at nettsiden skal fungere. Vi setter ingen sporings- eller analyse-cookies.</p>");
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

    private bool SetIfEmpty(IContent node, string alias, string value)
    {
        // Defensive: removed property aliases no longer exist on the content type.
        // Calling SetValue on a missing alias throws on a fresh install and aborts
        // later migrations, so early-return when the node lacks the property.
        if (!node.HasProperty(alias)) return false;
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
    /// Fixes the bakgrunn dropdown field on artikkel content.
    /// The DropDown.Flexible editor stores values as JSON array, but earlier code
    /// set plain strings ("hvit", "lyseblaa") which breaks the Delivery API.
    /// This migration finds non-JSON values and either wraps them in JSON array form
    /// or clears them. Idempotent.
    /// </summary>
    private void FixBakgrunnDropdownValues()
    {
        var allTypes = new[] { "artikkel" };
        int fixedCount = 0;

        foreach (var alias in allTypes)
        {
            // Get all root content of these types — check descendants too
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

    // ── Demo block helpers (dev seeding only) ──────────────────────────
    // Boolean (TrueFalse) blocks store "1"/"0"; richtext stores HTML; dates ISO.

    private (string, Dictionary<string, object>) Fremheving(string tittel, string tekstHtml, bool bakgrunn, bool sitat, string kilde = "") =>
        ("artikkelFremheving", new Dictionary<string, object>
        {
            ["tittel"] = tittel,
            ["tekst"] = tekstHtml,
            ["visBakgrunn"] = bakgrunn ? "1" : "0",
            ["visAnforselstegn"] = sitat ? "1" : "0",
            ["kilde"] = kilde,
        });

    private (string, Dictionary<string, object>) Byline(string navn, string stilling, string virksomhet, string dato = "") =>
        ("artikkelByline", new Dictionary<string, object>
        {
            ["navn"] = navn, ["stilling"] = stilling, ["virksomhet"] = virksomhet, ["dato"] = dato,
        });

    private (string, Dictionary<string, object>) InnholdFra(string virksomhet, string dato = "") =>
        ("artikkelInnholdFra", new Dictionary<string, object> { ["virksomhet"] = virksomhet, ["dato"] = dato });

    private (string, Dictionary<string, object>) Kontaktkort(string tittel, string navn, string stilling, string virksomhet, string epost, string telefon = "") =>
        ("artikkelKontaktkort", new Dictionary<string, object>
        {
            ["tittel"] = tittel, ["navn"] = navn, ["stilling"] = stilling,
            ["virksomhet"] = virksomhet, ["epost"] = epost, ["telefon"] = telefon,
        });

    private (string, Dictionary<string, object>) VTekst(string html) =>
        ("veiledningTekst", new Dictionary<string, object> { ["innhold"] = html });

    private (string, Dictionary<string, object>) VInfo(string tittel, string html, string lesMerTittel = "", string lesMerUrl = "") =>
        ("veiledningInfo", new Dictionary<string, object>
        {
            ["tittel"] = tittel, ["innhold"] = html, ["lesMerTittel"] = lesMerTittel, ["lesMerUrl"] = lesMerUrl,
        });

    private (string, Dictionary<string, object>) VEksempel(string tittel, string html) =>
        ("veiledningEksempel", new Dictionary<string, object> { ["tittel"] = tittel, ["innhold"] = html });

    private (string, Dictionary<string, object>) VObs(string tittel, string html) =>
        ("veiledningObs", new Dictionary<string, object> { ["tittel"] = tittel, ["tekst"] = html });

    private (string, Dictionary<string, object>) VTrekkspill(string tittel, string html) =>
        ("veiledningTrekkspill", new Dictionary<string, object> { ["tittel"] = tittel, ["innhold"] = html });

    // ── Demo content seeding (dev only, one-shot, idempotent) ──────────

    private const string DemoContentSeededKey = "ki:seeded-demo-content-v1";

    /// <summary>
    /// Local-dev convenience: seeds a broad set of demo content covering content types and
    /// every current block, including editor edge cases (very long titles, empty optional
    /// fields, special chars/emoji, deep nesting, single- and many-item lists). Lets frontend
    /// devs work without a populated CMS. Skipped on prod (LAUNCH_MODE=production). One-shot
    /// via a key-value flag so it never fights editor deletions or re-creates on restart.
    /// Covers text/richtext modules across articles, examples, guidance and the calendar.
    /// Image blocks and the eksempler overview picker sections are seeded in a follow-up
    /// change (they require media upload and cross-references between nodes).
    /// </summary>
    private void SeedDemoContentForDev()
    {
        if (Environment.GetEnvironmentVariable("LAUNCH_MODE")?.ToLowerInvariant() == "production") return;
        if (!string.IsNullOrEmpty(_keyValueService.GetValue(DemoContentSeededKey))) return;

        try
        {
            var artiklerId = EnsureRootContainer("artikler", "Aktuelt");
            var eksemplerId = EnsureRootContainer("eksempler", "Eksempler");
            var kalenderId = EnsureRootContainer("kalender", "Kalender");
            var veiledningerId = EnsureRootContainer("veiledninger", "Veiledning");

            if (artiklerId > 0) SeedDemoArtikler(artiklerId);
            if (eksemplerId > 0) SeedDemoEksempler(eksemplerId);
            if (kalenderId > 0) SeedDemoKalender(kalenderId);
            if (veiledningerId > 0) SeedDemoVeiledning(veiledningerId);

            _keyValueService.SetValue(DemoContentSeededKey, DateTime.UtcNow.ToString("O"));
            Console.WriteLine("ContentSeeder: Seeded demo content (text modules, dev only)");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"ContentSeeder SeedDemoContentForDev: {ex.Message}");
        }
    }

    /// <summary>Find-or-create a root-level container node by content type alias. Returns its id, or -1 if the type is missing.</summary>
    private int EnsureRootContainer(string alias, string name)
    {
        var existing = _contentService.GetRootContent().FirstOrDefault(c => c.ContentType.Alias == alias);
        if (existing != null) return existing.Id;

        var ct = _contentTypeService.Get(alias);
        if (ct == null) return -1;

        var node = _contentService.Create(name, -1, alias);
        var ingressTekst = $"(Plassholder) Oversiktsside for {name.ToLowerInvariant()}. Bytt ut med endelig tekst.";
        // Container types differ in field names: eksempler/artikler use heroTittel,
        // kalender uses tittel/ingress (mandatory). Set both variants; SetIfEmpty skips
        // properties the type does not have.
        SetIfEmpty(node, "tittel", name);
        SetIfEmpty(node, "heroTittel", name);
        SetIfEmpty(node, "ingress", ingressTekst);
        SetIfEmpty(node, "heroIngress", ingressTekst);
        _contentService.Save(node);
        var r = _contentService.Publish(node, new[] { "*" });
        if (!r.Success)
            Console.WriteLine($"ContentSeeder: WARNING — could not publish demo container '{alias}': {r.Result}");
        return node.Id;
    }

    /// <summary>Create an artikkel-like leaf (artikkel/eksempel) with the shared head + block-list body, then publish.</summary>
    private void CreateArticleLike(string alias, int parentId, string name, string tittel, string slug, string ingress, string blockListJson)
    {
        var node = _contentService.Create(name, parentId, alias);
        node.SetValue("tittel", tittel);
        node.SetValue("slug", slug);
        if (!string.IsNullOrEmpty(ingress)) node.SetValue("ingress", ingress);
        node.SetValue("innhold", blockListJson);
        node.SetValue("seoTittel", tittel.Length > 60 ? tittel.Substring(0, 60) : tittel);
        node.SetValue("seoBeskrivelse", string.IsNullOrEmpty(ingress) ? tittel : ingress);
        _contentService.Save(node);
        var result = _contentService.Publish(node, new[] { "*" });
        if (!result.Success)
            Console.WriteLine($"ContentSeeder: WARNING — could not publish demo {alias} '{name}': {result.Result}");
    }

    private void SeedDemoArtikler(int parentId)
    {
        // 1. Realistic, normal article exercising the common blocks.
        CreateArticleLike("artikkel", parentId,
            "Slik kom NAV i gang med KI", "Slik kom NAV i gang med kunstig intelligens", "slik-kom-nav-i-gang-med-ki",
            "NAV har tatt i bruk KI for å sortere henvendelser raskere. Her er erfaringene deres.",
            BuildArticleBlockList(
                TextBlock("<h2>Bakgrunn</h2><p>NAV mottar millioner av henvendelser i året. Med <strong>maskinlæring</strong> kan de rutes raskere til riktig saksbehandler.</p><ul><li>Mindre manuell sortering</li><li>Raskere svar</li><li>Bedre datagrunnlag</li></ul>"),
                Fremheving("Kort fortalt", "<p>KI-modellen sorterer henvendelser med over 90 prosent treffsikkerhet.</p>", true, false),
                Prosessteg("Slik gikk de frem",
                    ("Steg", "<p>Kartla de vanligste henvendelsestypene.</p>"),
                    ("Steg", "<p>Trente en modell på historiske, anonymiserte data.</p>"),
                    ("Steg", "<p>Testet i en kontrollert pilot før full utrulling.</p>")),
                Fremheving("", "<p>Vi var redde for at KI skulle ta over jobben. I praksis ga den oss mer tid til de vanskelige sakene.</p>", false, true, "Avdelingsleder, NAV"),
                Byline("Kari Nordmann", "Seniorrådgiver", "Digitaliseringsdirektoratet", "2026-05-12T00:00:00")));

        // 2. Edge: very long title, emoji + special chars, NO ingress, heavy richtext, many trekkspill.
        CreateArticleLike("artikkel", parentId,
            "Lang tittel-edge-case", "Dette er en bevisst veldig lang artikkeltittel som tester hvordan frontend håndterer overflyt, linjebryting og «typografiske» tegn i overskrifter — pluss emoji 🤖 og &-tegn",
            "lang-tittel-edge-case", "Ingress med spesialtegn: æøå, «anførsel», – tankestrek og emoji ✨. Tester også en ganske lang ingress som strekker seg over flere linjer for å se hvordan kortvisning og toppen av artikkelen takler det.",
            BuildArticleBlockList(
                TextBlock("<h2>Overskrift med æøå & <spesialtegn></h2><h3>Underoverskrift</h3><p>Tekst med <strong>fet</strong>, <em>kursiv</em>, <a href=\"https://www.digdir.no\">lenke</a> og emoji 🚀. Sjekk «anførselstegn» og – tankestrek.</p><ol><li>Punkt én</li><li>Punkt to</li></ol><blockquote>Et innfelt sitat i brødteksten.</blockquote>"),
                Trekkspill("Første spørsmål?", "<p>Svar med <strong>formatering</strong>.</p>"),
                Trekkspill("Andre spørsmål med en ganske lang tittel som også kan brytes over flere linjer?", "<p>Et lengre svar her.</p>"),
                Trekkspill("Tredje?", "<p>Kort.</p>"),
                Kontaktkort("Spørsmål?", "Ola Nordmann", "Fagdirektør", "Digitaliseringsdirektoratet", "ola@digdir.no", "+47 90000000")));

        // 3. Edge: minimal article — only one text block, short slug.
        CreateArticleLike("artikkel", parentId,
            "Minimal", "Minimal artikkel", "minimal",
            "En artikkel med så lite innhold som mulig.",
            BuildArticleBlockList(
                TextBlock("<p>Bare ett avsnitt.</p>")));

        // 4. Edge: "innhold fra" ekstern virksomhet + faktaboks + prosessteg med ett steg.
        CreateArticleLike("artikkel", parentId,
            "Bidrag fra ekstern virksomhet", "Bidrag fra en ekstern virksomhet", "bidrag-ekstern",
            "Denne artikkelen er levert av en samarbeidspartner.",
            BuildArticleBlockList(
                TextBlock("<p>Innholdet under er skrevet av en ekstern virksomhet.</p>"),
                Prosessteg("Én-stegs prosess", ("Fase", "<p>Eneste steg, for å teste lister med ett element.</p>")),
                InnholdFra("Eksempelbedriften AS", "2026-04-01T00:00:00")));

        // 5. Stress: a stack of many block types in one article.
        CreateArticleLike("artikkel", parentId,
            "Alle moduler stablet", "Alle artikkelmoduler stablet i én artikkel", "alle-moduler",
            "Tester rendering når alle blokktyper opptrer etter hverandre.",
            BuildArticleBlockList(
                TextBlock("<h2>Tekst</h2><p>Et avsnitt.</p>"),
                Fremheving("Faktaboks", "<p>Med bakgrunn.</p>", true, false),
                Fremheving("Sitat", "<p>Uten bakgrunn, med anførselstegn.</p>", false, true, "En kilde"),
                Fremheving("Ren fremheving", "<p>Uten bakgrunn og uten anførselstegn.</p>", false, false),
                Prosessteg("Prosess",
                    ("Steg", "<p>Ett.</p>"), ("Steg", "<p>To.</p>"), ("Steg", "<p>Tre.</p>"),
                    ("Steg", "<p>Fire.</p>"), ("Steg", "<p>Fem.</p>")),
                Trekkspill("Et trekkspill", "<p>Innhold.</p>"),
                Byline("Av redaksjonen", "", "Digitaliseringsdirektoratet", ""),
                Kontaktkort("", "Per Hansen", "", "Digitaliseringsdirektoratet", "per@digdir.no", "")));
    }

    private void SeedDemoEksempler(int parentId)
    {
        // Eksempel uses the same block catalogue as artikkel. Cover the spread + an edge case.
        CreateArticleLike("eksempel", parentId,
            "Chatbot i kommunen", "KI-chatbot svarer innbyggere i kommunen", "chatbot-i-kommunen",
            "En mellomstor kommune tok i bruk en chatbot for å svare på vanlige spørsmål.",
            BuildArticleBlockList(
                TextBlock("<h2>Utfordringen</h2><p>Servicetorget fikk de samme spørsmålene om og om igjen.</p>"),
                Fremheving("Resultat", "<p>40 prosent av henvendelsene løses nå automatisk.</p>", true, false),
                Prosessteg("Gjennomføring",
                    ("Steg", "<p>Samlet de vanligste spørsmålene.</p>"),
                    ("Steg", "<p>Bygde svarbasen.</p>"),
                    ("Steg", "<p>Lanserte og forbedret løpende.</p>")),
                Kontaktkort("Kontakt", "Linda Berg", "Digitaliseringssjef", "Eksempelkommune", "linda@eksempel.kommune.no", "")));

        CreateArticleLike("eksempel", parentId,
            "Dokumentanalyse", "Automatisk analyse av saksdokumenter", "dokumentanalyse",
            "Et direktorat bruker KI til å hente nøkkelinformasjon ut av lange dokumenter.",
            BuildArticleBlockList(
                TextBlock("<p>Saksbehandlere brukte mye tid på å lese gjennom lange PDF-er.</p>"),
                Fremheving("", "<p>KI sparer oss for timer hver uke.</p>", false, true, "Saksbehandler"),
                Trekkspill("Hvordan er personvernet ivaretatt?", "<p>All data behandles innenfor EU og slettes etter bruk.</p>")));

        // Edge: emoji + special chars in eksempel, no ingress, single block.
        CreateArticleLike("eksempel", parentId,
            "Eksempel med rare tegn", "Eksempel med æøå, & og emoji 📄", "eksempel-rare-tegn", "Kort ingress med rare tegn: <, >, &amp;, «...» og 📄.",
            BuildArticleBlockList(
                TextBlock("<p>Tester spesialtegn i et eksempel: «sitat», – tankestrek, &amp;-tegn.</p>")));

        CreateArticleLike("eksempel", parentId,
            "Prediksjon av etterspørsel", "Prediksjon av etterspørsel i helsetjenesten", "prediksjon-etterspoersel",
            "Et helseforetak forutsier pasientstrømmer for bedre bemanning.",
            BuildArticleBlockList(
                TextBlock("<h2>Bakgrunn</h2><p>Bemanningen var vanskelig å planlegge.</p>"),
                Prosessteg("Slik jobbet de", ("Steg", "<p>Analyserte historiske data.</p>"), ("Steg", "<p>Bygde prognosemodell.</p>")),
                Byline("Anne Lie", "Prosjektleder", "Eksempel helseforetak", "")));

        CreateArticleLike("eksempel", parentId,
            "Minimalt eksempel", "Minimalt eksempel", "minimalt-eksempel",
            "Kortest mulig eksempel.",
            BuildArticleBlockList(TextBlock("<p>Ett avsnitt.</p>")));
    }

    private void SeedDemoVeiledning(int parentId)
    {
        var guide = _contentService.Create("Kom i gang med KI", parentId, "veiledningGuide");
        guide.SetValue("tittel", "Kom i gang med kunstig intelligens");
        guide.SetValue("slug", "kom-i-gang-med-ki");
        guide.SetValue("ingress", "En praktisk veiledning for virksomheter som vil ta i bruk KI ansvarlig.");
        guide.SetValue("stegGruppeTittler", "Forberedelse\nGjennomføring\nOppfølging");
        guide.SetValue("innholdBlokker", BuildArticleBlockList(
            VTekst("<h2>Om veiledningen</h2><p>Denne veiledningen tar deg gjennom de viktigste stegene, fra idé til drift.</p><ul><li>Forberedelse</li><li>Gjennomføring</li><li>Oppfølging</li></ul>"),
            VObs("Viktig", "<p>Vurder personvern og juss tidlig i prosessen.</p>"),
            VTrekkspill("Hvem er veiledningen for?", "<p>Ledere og fagfolk i offentlig sektor.</p>")));
        _contentService.Save(guide);
        var gr = _contentService.Publish(guide, new[] { "*" });
        if (!gr.Success)
        {
            Console.WriteLine($"ContentSeeder: WARNING — could not publish demo veiledningGuide: {gr.Result}");
            return;
        }

        SeedSteg(guide.Id, "kom-i-gang-med-ki", "Kartlegg behovet", "kartlegg-behovet", 1,
            "Start med å forstå hvilket problem du faktisk vil løse.",
            BuildArticleBlockList(
                VTekst("<h2>Hva vil du oppnå?</h2><p>Beskriv problemet før du velger teknologi.</p>"),
                VInfo("Tips", "<p>Snakk med dem som skal bruke løsningen.</p>", "Les mer hos Digdir", "https://www.digdir.no"),
                VEksempel("Eksempel fra praksis", "<p>En kommune startet med å kartlegge de vanligste henvendelsene.</p>")));

        SeedSteg(guide.Id, "kom-i-gang-med-ki", "Vurder data og personvern", "vurder-data-personvern", 2,
            "Sjekk at du har lov til å bruke dataene, og at de holder kvalitet.",
            BuildArticleBlockList(
                VTekst("<p>Data er grunnlaget for all KI.</p>"),
                VObs("Personvern", "<p>Gjør en vurdering etter personvernforordningen (GDPR) før du starter.</p>"),
                VTrekkspill("Hva med DPIA?", "<p>En personvernkonsekvensvurdering kan være påkrevd ved høy risiko.</p>")));

        SeedSteg(guide.Id, "kom-i-gang-med-ki", "Test i liten skala", "test-i-liten-skala", 3,
            "Kjør en pilot før full utrulling.",
            BuildArticleBlockList(
                VTekst("<p>En pilot avdekker problemer billig.</p>"),
                VEksempel("Pilot", "<p>Test på en avgrenset gruppe først, og mål effekten.</p>")));
    }

    private void SeedSteg(int guideId, string guideSlug, string name, string slug, int stegNr, string ingress, string blockListJson)
    {
        var s = _contentService.Create(name, guideId, "veiledningSteg");
        s.SetValue("tittel", name);
        s.SetValue("slug", slug);
        s.SetValue("guideSlug", guideSlug);
        s.SetValue("ingress", ingress);
        s.SetValue("steg", stegNr);
        s.SetValue("understeg", 1);
        s.SetValue("innholdBlokker", blockListJson);
        _contentService.Save(s);
        var r = _contentService.Publish(s, new[] { "*" });
        if (!r.Success)
            Console.WriteLine($"ContentSeeder: WARNING — could not publish demo veiledningSteg '{name}': {r.Result}");
    }

    private void SeedDemoKalender(int parentId)
    {
        var now = DateTime.Now;
        // Future single-day
        SeedKalenderhendelse(parentId, "Frokostseminar om KI", "frokostseminar-ki", "Frokostseminar",
            "Bli med på et uformelt frokostseminar om KI i offentlig sektor.",
            "<p>Vi serverer kaffe og inspirasjon, og deler konkrete erfaringer.</p>",
            now.AddDays(14), null, "08:30-10:00", "Digitaliseringsdirektoratet, Oslo", "https://example.no/paamelding", "KI, frokost");
        // Future multi-day
        SeedKalenderhendelse(parentId, "KI-konferansen 2026", "ki-konferansen-2026", "Konferanse",
            "Årets store KI-konferanse over to dager.",
            "<p>To dager med foredrag og workshops om kunstig intelligens i forvaltningen.</p>",
            now.AddDays(40), now.AddDays(41), "09:00-16:00", "Trondheim", "https://example.no/konf", "konferanse, KI, nettverk");
        // Today, digital, hele dagen
        SeedKalenderhendelse(parentId, "Webinar i dag", "webinar-i-dag", "Webinar",
            "Et digitalt webinar du kan følge hjemmefra.", "<p>Lenke sendes til påmeldte.</p>",
            now, null, "Hele dagen", "Digitalt", "", "");
        // Past
        SeedKalenderhendelse(parentId, "Workshop som var", "workshop-som-var", "Workshop",
            "Et arrangement som allerede har vært.", "<p>Takk til alle som deltok.</p>",
            now.AddDays(-30), null, "13:00-15:00", "Bergen", "", "workshop");
        // Minimal (only mandatory + lite)
        SeedKalenderhendelse(parentId, "Enkel hendelse", "enkel-hendelse", "",
            "Minimal hendelse med bare det nødvendige.", "", now.AddDays(7), null, "", "", "", "");
        // Edge: emoji + special chars + long tag
        SeedKalenderhendelse(parentId, "Hendelse med rare tegn 🎉", "hendelse-rare-tegn", "Møte",
            "Tester spesialtegn æøå, & og «...» i kalenderen.",
            "<p>Detaljer med <strong>formatering</strong> og en <a href=\"https://www.digdir.no\">lenke</a>.</p>",
            now.AddDays(21), now.AddDays(21), "10:00-11:00", "Digitalt & fysisk", "", "tag1, tag2, en-ganske-lang-tagg-som-tester-bryting");
    }

    private void SeedKalenderhendelse(int parentId, string name, string slug, string type, string ingress, string detaljertHtml, DateTime start, DateTime? slutt, string tid, string sted, string lenke, string tagger)
    {
        var n = _contentService.Create(name, parentId, "kalenderhendelse");
        n.SetValue("tittel", name);
        n.SetValue("slug", slug);
        n.SetValue("startDato", start);
        if (!string.IsNullOrEmpty(type)) n.SetValue("type", type);
        if (!string.IsNullOrEmpty(ingress)) n.SetValue("ingress", ingress);
        if (!string.IsNullOrEmpty(detaljertHtml)) n.SetValue("detaljertBeskrivelse", detaljertHtml);
        if (slutt.HasValue) n.SetValue("sluttDato", slutt.Value);
        if (!string.IsNullOrEmpty(tid)) n.SetValue("tid", tid);
        if (!string.IsNullOrEmpty(sted)) n.SetValue("sted", sted);
        if (!string.IsNullOrEmpty(lenke)) n.SetValue("lenke", lenke);
        if (!string.IsNullOrEmpty(tagger)) n.SetValue("tagger", tagger);
        _contentService.Save(n);
        var r = _contentService.Publish(n, new[] { "*" });
        if (!r.Success)
            Console.WriteLine($"ContentSeeder: WARNING — could not publish demo kalenderhendelse '{name}': {r.Result}");
    }

}
