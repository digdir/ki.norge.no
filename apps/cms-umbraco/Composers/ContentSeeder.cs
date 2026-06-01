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

}
