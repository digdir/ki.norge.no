using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.Models;
using Umbraco.Cms.Core.PropertyEditors;
using Umbraco.Cms.Core.Serialization;
using Umbraco.Cms.Core.Services;
using Umbraco.Cms.Core.Strings;

namespace KiNorge.Cms.Composers;

/// <summary>
/// Creates document types for KI Norge CMS on first boot.
/// Creates both content types and container types (folders with list views).
/// </summary>
public class ContentTypeComposer : ComponentComposer<ContentTypeComponent>
{
}

public class ContentTypeComponent : IAsyncComponent
{
    private readonly IContentTypeService _contentTypeService;
    private readonly IContentService _contentService;
    private readonly IDataTypeService _dataTypeService;
    private readonly IShortStringHelper _shortStringHelper;
    private readonly IRuntimeState _runtimeState;
    private readonly IConfigurationEditorJsonSerializer _configSerializer;
    private readonly PropertyEditorCollection _propertyEditors;

    // Data types (resolved at init time)
    private IDataType _textStringDt = null!;
    private IDataType _textAreaDt = null!;
    private IDataType _richTextDt = null!;            // Standard RichText (full toolbar)
    private IDataType _richTextDtRestricted = null!;  // Restricted RichText (no headings, no source editor)
    private IDataType _numericDt = null!;
    private IDataType _mediaPickerDt = null!;
    private IDataType _contentPickerDt = null!;
    private IDataType _calloutVariantDt = null!;
    private IDataType _bakgrunnDropdownDt = null!;    // Hvit / Lys blå dropdown for Artikkelhode
    private IDataType _kolonneDropdownDt = null!;     // 1/2/3/4 kolonner for eksempel-grupper
    private IDataType _blockListEksemplerSeksjonerDt = null!;
    private IDataType _trueFalseDt = null!;           // Boolean checkbox
    private IDataType _datePickerDt = null!;          // Date picker

    // Block List data types (created at init time)
    private IDataType _blockListAccordionDt = null!;
    private IDataType _blockListTipsDt = null!;
    private IDataType _blockListArtikkelDt = null!;
    // _blockListSandkasseStegDt + _blockListSandkasseFaqDt: REMOVED 2026-05-04.
    // Sandkasse now uses _blockListArtikkelDt (the same Block List as articles).
    private IDataType _blockListVeiledningKortDt = null!;
    private IDataType _blockListVerktoyKortDt = null!;
    private IDataType _blockListProsessStegItemsDt = null!;
    private IDataType _blockListEksempelDt = null!;
    private IDataType _blockListOmOssDt = null!;
    private IDataType _blockListVeiledningStegDt = null!;
    private IDataType _blockListVeiledningGuideDt = null!;
    private IDataType _blockListForsideDt = null!;

    public ContentTypeComponent(
        IContentTypeService contentTypeService,
        IContentService contentService,
        IDataTypeService dataTypeService,
        IShortStringHelper shortStringHelper,
        IRuntimeState runtimeState,
        IConfigurationEditorJsonSerializer configSerializer,
        PropertyEditorCollection propertyEditors)
    {
        _contentTypeService = contentTypeService;
        _contentService = contentService;
        _dataTypeService = dataTypeService;
        _shortStringHelper = shortStringHelper;
        _runtimeState = runtimeState;
        _configSerializer = configSerializer;
        _propertyEditors = propertyEditors;
    }

    public Task InitializeAsync(bool isRestarting, CancellationToken cancellationToken)
    {
        if (_runtimeState.Level < RuntimeLevel.Run) return Task.CompletedTask;

        try
        {
            ResolveDataTypes();

            // Create each type only if it doesn't already exist
            if (_contentTypeService.Get("accordionSection") == null)
                CreateAccordionSectionElement();
            if (_contentTypeService.Get("tipItem") == null)
                CreateTipItemElement();
            else
                MigrateTipItemElement();

            // Article element types
            if (_contentTypeService.Get("artikkelTekst") == null)
                CreateArtikkelTekstElement();
            else
                MigrateArtikkelTekst();
            if (_contentTypeService.Get("artikkelInfoBoks") == null)
                CreateArtikkelInfoBoksElement();
            // artikkelHero element type is deprecated (replaced by Artikkelhode top-level fields).
            // Existing seed data may still reference it; renderer handles missing type gracefully.
            if (_contentTypeService.Get("artikkelBildeSeksjon") == null)
                CreateArtikkelBildeSeksjonElement();
            else
                MigrateArtikkelBildeSeksjon();
            if (_contentTypeService.Get("artikkelTrekkspill") == null)
                CreateArtikkelTrekkspillElement();
            // Settings element for artikkelTrekkspill — exposes "Innstillinger" tab on each
            // accordion block in the editor. Currently lets the editor split groups via
            // gruppeTittel: when set, that accordion starts a new group with that title.
            if (_contentTypeService.Get("artikkelTrekkspillSettings") == null)
                CreateArtikkelTrekkspillSettingsElement();
            if (_contentTypeService.Get("artikkelSitat") == null)
                CreateArtikkelSitatElement();
            if (_contentTypeService.Get("artikkelCallout") == null)
                CreateArtikkelCalloutElement();
            if (_contentTypeService.Get("artikkelFremheving") == null)
                CreateArtikkelFremhevingElement();
            // Prosessteg item must be created before the container (container's Block List references item)
            if (_contentTypeService.Get("artikkelProsessStegItem") == null)
                CreateArtikkelProsessStegItemElement();
            // Om Oss seksjon block (replaces standalone omOssSeksjon child content)
            if (_contentTypeService.Get("omOssBlokk") == null)
                CreateOmOssBlokkElement();
            // Forfatter og dato variants
            if (_contentTypeService.Get("artikkelByline") == null)
                CreateArtikkelBylineElement();
            if (_contentTypeService.Get("artikkelInnholdFra") == null)
                CreateArtikkelInnholdFraElement();
            if (_contentTypeService.Get("artikkelKontaktkort") == null)
                CreateArtikkelKontaktkortElement();

            // Sandkasse element types: REMOVED 2026-05-04 (sandkasseSteg, sandkasseFaq)
            // The new Sandkasse uses the same article block list, so sandkasse-specific
            // step/FAQ element types are gone. Resurrect via git if needed.

            // Veiledning Oversikt element types
            if (_contentTypeService.Get("veiledningKort") == null)
                CreateVeiledningKortElement();
            if (_contentTypeService.Get("verktoyKort") == null)
                CreateVerktoyKortElement();

            MigrateVeiledningKort();
            MigrateVerktoyKort();

            // veiledningInfo sitt trekkspill-felt bruker accordion-block-list-datatypen.
            // På fresh install kjører CreateBlockListDataTypes() lenger ned, så vi må
            // sikre at datatypen finnes her. CreateOrGetBlockListDataType er idempotent,
            // så det senere kallet er uberørt. Uten dette krasjer InitializeAsync med
            // "Value cannot be null (Parameter 'dataType')" og 0 content types seedes.
            _blockListAccordionDt = CreateOrGetBlockListDataType(
                "Block List - Accordion Sections", "accordionSection");

            if (_contentTypeService.Get("veiledningTekst") == null)
                CreateVeiledningTekstElement();
            if (_contentTypeService.Get("veiledningInfo") == null)
                CreateVeiledningInfoElement();
            if (_contentTypeService.Get("veiledningEksempel") == null)
                CreateVeiledningEksempelElement();
            if (_contentTypeService.Get("veiledningObs") == null)
                CreateVeiledningObsElement();
            if (_contentTypeService.Get("veiledningTrekkspill") == null)
                CreateVeiledningTrekkspillElement();

            if (_contentTypeService.Get("eksempelFeatured") == null)
                CreateEksempelFeaturedElement();
            if (_contentTypeService.Get("eksempelGruppe") == null)
                CreateEksempelGruppeElement();
            if (_contentTypeService.Get("eksempelRelatert") == null)
                CreateEksempelRelatertElement();
            if (_contentTypeService.Get("eksempelKontakt") == null)
                CreateEksempelKontaktElement();

            // Forside-moduler (block list)
            if (_contentTypeService.Get("forsideHero") == null)
                CreateForsideHeroElement();
            if (_contentTypeService.Get("forsideAktuelt") == null)
                CreateForsideAktueltElement();
            if (_contentTypeService.Get("forsideArrangementer") == null)
                CreateForsideArrangementerElement();
            if (_contentTypeService.Get("forsideVeiledning") == null)
                CreateForsideVeiledningElement();
            if (_contentTypeService.Get("forsideLaerAvAndre") == null)
                CreateForsideLaerAvAndreElement();
            if (_contentTypeService.Get("forsideSandkasse") == null)
                CreateForsideSandkasseElement();

            CreateBlockListDataTypes();

            MigrateVeiledningElementNames();
            MigrateVeiledningObsRemoveVariant();
            MigrateVeiledningInfo();

            // Prosessteg container depends on _blockListProsessStegItemsDt being created above
            if (_contentTypeService.Get("artikkelProsessteg") == null)
                CreateArtikkelProsessStegElement();

            // After all element types are created, refresh the Artikkel block list to include
            // any modules that didn't exist when CreateBlockListDataTypes() ran.
            RefreshMultiBlockListAllowedModules("Block List - Artikkel Innhold", BaseArticleModules);

            // Refresh Case block list too
            RefreshMultiBlockListAllowedModules("Block List - Eksempel Innhold", EksempelModules);

            RefreshMultiBlockListAllowedModules("Block List - Veiledning Steg", VeiledningStegModules);
            RefreshMultiBlockListAllowedModules("Block List - Veiledning Guide", VeiledningGuideModules);
            RefreshMultiBlockListAllowedModules("Block List - Forside Seksjoner", ForsideModules);

            // One-shot removal of legacy CTs that are no longer part of the product
            // (FAQ, KI-ordbok, Merkelapper, veiledningOversikt). Runs early so containers
            // are gone before the rest of the bootstrap tries to reference them.
            MigrateRemoveLegacyCleanup();

            if (_contentTypeService.Get("artikkel") == null)
                CreateArtikkel();
            MigrateArtikkelType();

            // Caser → Eksempler all-in: drop legacy case/caser + the old skeleton eksempel
            // before recreating eksempel + eksempler with artikkel-like structure.
            MigrateCaserToEksempler();

            if (_contentTypeService.Get("side") == null)
                CreateSide();
            MigrateSide();

            if (_contentTypeService.Get("eksempel") == null)
                CreateEksempel();

            if (_contentTypeService.Get("veiledningGuide") == null)
                CreateVeiledningGuide();
            MigrateVeiledningGuideEditorLayout();
            MigrateVeiledningGuideStegtitler();
            MigrateVeiledningGuideInnhold();
            if (_contentTypeService.Get("veiledningSteg") == null)
                CreateVeiledningSteg();
            MigrateVeiledningSteg();
            if (_contentTypeService.Get("stegartikkel") == null)
                CreateStegartikkel();
            MigrateVeiledningStegAllowedChildren();
            if (_contentTypeService.Get("enkelVeiledning") == null)
                CreateEnkelVeiledning();
            if (_contentTypeService.Get("forside") == null)
                CreateForside();
            else
                MigrateForside();
            if (_contentTypeService.Get("omOssSeksjon") == null)
                CreateOmOssSeksjon();
            if (_contentTypeService.Get("omOss") == null)
                CreateOmOss();
            else
                MigrateOmOss();
            if (_contentTypeService.Get("sandkasse") == null)
                CreateSandkasse();
            else
                MigrateSandkasse();

            // Farge (bakgrunn) kun på rik artikkelmal (artikkel + eksempel), Lars 2026-06-05.
            // Sikrer feltet der og fjerner det fra de enkle sidetypene.
            EnforceBakgrunnScope();

            // Slug ikke-obligatorisk på rike maler (auto fra tittel ved lagring, ContentSlugHandler).
            EnsureSlugOptional();

            // Create container types if missing
            if (_contentTypeService.Get("artikler") == null)
                CreateArtiklerOversikt();
            MigrateArtiklerToOversikt();
            CreateContainerIfMissing("sider", "Andre sider", "icon-folder", "side");
            MigrateSiderToAndreSider();
            LockSiderContainer();
            if (_contentTypeService.Get("eksempler") == null)
                CreateEksemplerOversikt();
            MigrateEksemplerOversikt();
            if (_contentTypeService.Get("veiledninger") == null)
            {
                var guideType = _contentTypeService.Get("veiledningGuide");
                if (guideType != null)
                {
                    var ct = new ContentType(_shortStringHelper, -1)
                    {
                        Alias = "veiledninger",
                        Name = "Veiledning",
                        Icon = "icon-book-alt",
                        AllowedAsRoot = true,
                    };
                    ct.AllowedContentTypes = new[]
                    {
                        new ContentTypeSort(guideType.Key, 0, guideType.Alias)
                    };
                    _contentTypeService.Save(ct);
                }
            }
            MigrateVeiledningerContainer();
            MigrateVeiledningGuideAllowedChildren();
            AddOversiktFieldsToVeiledninger();

            if (_contentTypeService.Get("kalenderhendelse") == null)
                CreateKalenderhendelse();
            if (_contentTypeService.Get("kalender") == null)
                CreateKalender();

            if (_contentTypeService.Get("globaleInnstillinger") == null)
                CreateGlobaleInnstillinger();
            MigrateGlobaleInnstillinger();

            // RichText data types are ensured by ResolveDataTypes() at the very start of this method.
            // Standard + Restricted variants get correct toolbar+extensions config every startup.
            // No need to call again here.
        }
        catch (Exception ex)
        {
            Console.WriteLine($"ContentTypeComposer: {ex.Message}");
        }
        return Task.CompletedTask;
    }

    public Task TerminateAsync(bool isRestarting, CancellationToken cancellationToken) => Task.CompletedTask;

    private void ResolveDataTypes()
    {
        _textStringDt = FindDataType(Constants.PropertyEditors.Aliases.TextBox);
        _textAreaDt = FindDataType(Constants.PropertyEditors.Aliases.TextArea);
        // RichText: ensure both standard and restricted variants exist with correct config.
        // Toolbar/extension configs live in StandardToolbar/StandardExtensions and
        // RestrictedToolbar/RestrictedExtensions constants near EnsureRichTextDataTypes().
        EnsureRichTextDataTypes();
        _richTextDt = FindRichTextByName(StandardRichTextName);
        _richTextDtRestricted = FindRichTextByName(RestrictedRichTextName);
        _numericDt = FindDataType(Constants.PropertyEditors.Aliases.Integer);
        _mediaPickerDt = FindDataType(Constants.PropertyEditors.Aliases.MediaPicker3);
        _contentPickerDt = FindDataType(Constants.PropertyEditors.Aliases.ContentPicker);
        _calloutVariantDt = CreateOrGetCalloutVariantDropdown();
        _bakgrunnDropdownDt = CreateOrGetBakgrunnDropdown();
        _kolonneDropdownDt = CreateOrGetKolonneDropdown();
        _trueFalseDt = FindDataType(Constants.PropertyEditors.Aliases.Boolean);
        _datePickerDt = FindDataTypeByName(Constants.PropertyEditors.Aliases.DateTime, "Date Picker");
    }

    private IDataType FindDataTypeByName(string editorAlias, string name)
    {
        return _dataTypeService.GetByEditorAlias(editorAlias).FirstOrDefault(dt => dt.Name == name)
            ?? _dataTypeService.GetByEditorAlias(editorAlias).FirstOrDefault()
            ?? throw new InvalidOperationException($"No DataType found for editor {editorAlias}");
    }

    private IDataType FindRichTextByName(string name)
    {
        return _dataTypeService.GetByEditorAlias(Constants.PropertyEditors.Aliases.RichText)
            .FirstOrDefault(dt => dt.Name == name)
            ?? throw new InvalidOperationException($"RichText data type '{name}' not found after EnsureRichTextDataTypes");
    }

    private IDataType CreateOrGetBakgrunnDropdown()
    {
        // Redaksjonell farge for artikkelen (brand1/2/3). "accent" = accent brand-farge (standard).
        // Items asserts hver oppstart slik at en eksisterende datatype også oppdateres.
        var items = new[] { "accent", "brand1", "brand2", "brand3" };
        var existing = _dataTypeService.GetByEditorAlias(Constants.PropertyEditors.Aliases.DropDownListFlexible)
            .FirstOrDefault(dt => dt.Name == "Artikkelhode Bakgrunn");
        if (existing != null)
        {
            var cfg = existing.ConfigurationData ?? new Dictionary<string, object>();
            cfg["items"] = items;
            existing.ConfigurationData = cfg;
            _dataTypeService.Save(existing);
            return existing;
        }

        var editor = _propertyEditors[Constants.PropertyEditors.Aliases.DropDownListFlexible]
            ?? throw new InvalidOperationException("DropDownListFlexible editor not found");

        var dt = new DataType(editor, _configSerializer)
        {
            Name = "Artikkelhode Bakgrunn",
            DatabaseType = ValueStorageType.Nvarchar,
            EditorUiAlias = "Umb.PropertyEditorUi.Dropdown",
            ConfigurationData = new Dictionary<string, object>
            {
                ["items"] = items,
            },
        };
        _dataTypeService.Save(dt);
        return dt;
    }

    private IDataType CreateOrGetKolonneDropdown()
    {
        var existing = _dataTypeService.GetByEditorAlias(Constants.PropertyEditors.Aliases.DropDownListFlexible)
            .FirstOrDefault(dt => dt.Name == "Eksempel-gruppe Kolonner");
        if (existing != null) return existing;

        var editor = _propertyEditors[Constants.PropertyEditors.Aliases.DropDownListFlexible]
            ?? throw new InvalidOperationException("DropDownListFlexible editor not found");

        var dt = new DataType(editor, _configSerializer)
        {
            Name = "Eksempel-gruppe Kolonner",
            DatabaseType = ValueStorageType.Nvarchar,
            EditorUiAlias = "Umb.PropertyEditorUi.Dropdown",
            ConfigurationData = new Dictionary<string, object>
            {
                ["items"] = new[] { "1", "2", "3", "4" },
            },
        };
        _dataTypeService.Save(dt);
        return dt;
    }

    private IDataType CreateOrGetCalloutVariantDropdown()
    {
        var existing = _dataTypeService.GetByEditorAlias(Constants.PropertyEditors.Aliases.DropDownListFlexible)
            .FirstOrDefault(dt => dt.Name == "Callout Variant");
        if (existing != null) return existing;

        var editor = _propertyEditors[Constants.PropertyEditors.Aliases.DropDownListFlexible]
            ?? throw new InvalidOperationException("DropDownListFlexible editor not found");

        var dt = new DataType(editor, _configSerializer)
        {
            Name = "Callout Variant",
            DatabaseType = ValueStorageType.Nvarchar,
            EditorUiAlias = "Umb.PropertyEditorUi.Dropdown",
            ConfigurationData = new Dictionary<string, object>
            {
                ["items"] = new[] { "info", "obs", "advarsel", "suksess" },
            },
        };
        _dataTypeService.Save(dt);
        return dt;
    }

    private IDataType FindDataType(string editorAlias)
    {
        var dts = _dataTypeService.GetByEditorAlias(editorAlias);
        var dt = dts.FirstOrDefault();
        if (dt == null) throw new InvalidOperationException($"No DataType found for editor {editorAlias}");
        return dt;
    }

    private PropertyType Prop(string alias, string name, IDataType dataType,
        bool mandatory = false, string? description = null, int sortOrder = 0)
    {
        return new PropertyType(_shortStringHelper, dataType)
        {
            Alias = alias,
            Name = name,
            Description = description,
            Mandatory = mandatory,
            SortOrder = sortOrder,
        };
    }

    // --- Element types for Block Lists ---

    private IContentType CreateAccordionSectionElement()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "accordionSection",
            Name = "Accordion Section",
            Description = "Legacy trekkspill-element. Bruk Trekkspill-modulen i artikkel-innhold i stedet.",
            Icon = "icon-list",
            IsElement = true,
        };
        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("title", "Tittel", _textStringDt, mandatory: true, description: "Synlig tittel på trekkspillet (klikkes for å åpne)"), "innhold");
        ct.AddPropertyType(Prop("body", "Innhold", _richTextDt, description: "Innhold som vises når trekkspillet åpnes"), "innhold");
        _contentTypeService.Save(ct);
        return ct;
    }

    private IContentType CreateTipItemElement()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "tipItem",
            Name = "Tips",
            Description = "Et tips-kort. Brukes i tre-tips-seksjonen på forsiden.",
            Icon = "icon-lightbulb",
            IsElement = true,
        };
        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("tipsTitle", "Tittel", _textStringDt, mandatory: true, description: "Kort, presis tittel — vises som overskrift på tipset"), "innhold");
        ct.AddPropertyType(Prop("tipsTekst", "Tekst", _richTextDt, description: "1-3 setninger som forklarer tipset"), "innhold");
        ct.AddPropertyType(Prop("tipsBilde", "Bilde", _mediaPickerDt, description: "Valgfritt illustrasjonsbilde"), "innhold");
        _contentTypeService.Save(ct);
        return ct;
    }

    private void MigrateTipItemElement()
    {
        var ct = _contentTypeService.Get("tipItem");
        if (ct == null) return;
        if (ct.PropertyTypeExists("tipsBilde")) return;
        ct.AddPropertyType(Prop("tipsBilde", "Bilde", _mediaPickerDt), "innhold");
        _contentTypeService.Save(ct);
    }

    // --- Article element types ---

    private IContentType CreateArtikkelTekstElement()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "artikkelTekst",
            Name = "Brødtekst",
            Description = "Rik tekstblokk med overskrifter (H2/H3/H4), lister, lenker, fet, kursiv og blockquote",
            Icon = "icon-edit",
            IsElement = true,
        };
        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("innhold", "Innhold", _richTextDt), "innhold");
        _contentTypeService.Save(ct);
        return ct;
    }

    private void MigrateArtikkelTekst()
    {
        var ct = _contentTypeService.Get("artikkelTekst");
        if (ct == null) return;
        if (ct.Name == "Brødtekst") return;

        ct.Name = "Brødtekst";
        ct.Description = "Rik tekstblokk med overskrifter (H2/H3/H4), lister, lenker, fet, kursiv og blockquote";
        _contentTypeService.Save(ct);
    }

    private IContentType CreateArtikkelInfoBoksElement()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "artikkelInfoBoks",
            Name = "Artikkel Infoboks",
            Description = "Blå infoboks (#e5f2f7 bakgrunn)",
            Icon = "icon-info",
            IsElement = true,
        };
        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("tittel", "Tittel", _textStringDt), "innhold");
        ct.AddPropertyType(Prop("innhold", "Innhold", _richTextDt, mandatory: true), "innhold");
        _contentTypeService.Save(ct);
        return ct;
    }

    // CreateArtikkelHeroElement removed — replaced by Artikkelhode top-level fields on artikkel/case.

    private IContentType CreateArtikkelTrekkspillElement()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "artikkelTrekkspill",
            Name = "Trekkspill",
            Description = "Klikkbar tittel som åpner skjult innhold under. Bra for bonus-info, ofte stilte spørsmål, eller detaljer leseren kan hoppe over.",
            Icon = "icon-list",
            IsElement = true,
        };
        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("tittel", "Tittel", _textStringDt, mandatory: true), "innhold");
        ct.AddPropertyType(Prop("innhold", "Innhold", _richTextDt, mandatory: true), "innhold");
        _contentTypeService.Save(ct);
        return ct;
    }

    /// <summary>
    /// Settings element shown as the "Innstillinger" tab on each Trekkspill block in the
    /// editor. Currently exposes one optional field: gruppeTittel. When set on a trekkspill,
    /// the frontend renderer treats that block as the START of a new group with that title.
    /// Adjacent trekkspill blocks without gruppeTittel join the current group. Default
    /// behavior (all empty) = a single untitled group of all consecutive trekkspill, which
    /// matches the existing auto-grouping behavior.
    /// </summary>
    private IContentType CreateArtikkelTrekkspillSettingsElement()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "artikkelTrekkspillSettings",
            Name = "Trekkspill — innstillinger",
            Description = "Per-trekkspill innstillinger. Vises som egen tab i blokk-editoren.",
            Icon = "icon-settings",
            IsElement = true,
        };
        ct.AddPropertyGroup("gruppe", "Gruppering");
        ct.AddPropertyType(Prop("gruppeTittel", "Gruppe-tittel", _textStringDt,
            description: "Hvis satt: dette trekkspillet starter en ny gruppe med denne tittelen. La stå tom for at trekkspillet skal slå seg sammen med trekkspill rett over."),
            "gruppe");
        _contentTypeService.Save(ct);
        return ct;
    }

    private IContentType CreateArtikkelSitatElement()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "artikkelSitat",
            Name = "Artikkel Sitat",
            Description = "Uthevet sitat med valgfri kilde",
            Icon = "icon-quote",
            IsElement = true,
        };
        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("sitat", "Sitat", _textAreaDt, mandatory: true), "innhold");
        ct.AddPropertyType(Prop("kilde", "Kilde", _textStringDt), "innhold");
        _contentTypeService.Save(ct);
        return ct;
    }

    private IContentType CreateArtikkelCalloutElement()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "artikkelCallout",
            Name = "Artikkel Callout",
            Description = "Varselboks (info, obs, advarsel, suksess)",
            Icon = "icon-alert",
            IsElement = true,
        };
        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("tittel", "Tittel", _textStringDt), "innhold");
        ct.AddPropertyType(Prop("innhold", "Innhold", _richTextDt, mandatory: true), "innhold");
        ct.AddPropertyType(Prop("variant", "Variant", _calloutVariantDt, description: "Velg type varselboks"), "innhold");
        _contentTypeService.Save(ct);
        return ct;
    }

    /// <summary>
    /// Author byline. Person name + role + organization + date.
    /// Date defaults to article publishedAt if empty (handled in frontend).
    /// </summary>
    private IContentType CreateArtikkelBylineElement()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "artikkelByline",
            Name = "Forfatter (byline)",
            Description = "Personlig forfatter-byline. Vis navn, stilling, virksomhet og dato. Skjules hvis alle felt er tomme.",
            Icon = "icon-user",
            IsElement = true,
        };
        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("navn", "Navn", _textStringDt, description: "Forfatterens navn, eller 'Av redaksjonen'"), "innhold");
        ct.AddPropertyType(Prop("stilling", "Stilling", _textStringDt, description: "F.eks. 'Rådgiver'"), "innhold");
        ct.AddPropertyType(Prop("virksomhet", "Virksomhet", _textStringDt, description: "F.eks. 'Digitaliseringsdirektoratet'"), "innhold");
        ct.AddPropertyType(Prop("dato", "Dato", _datePickerDt, description: "Dato for artikkelen. Hvis tom brukes artikkelens publiseringsdato."), "innhold");
        _contentTypeService.Save(ct);
        return ct;
    }

    /// <summary>
    /// "Innhold fra [organisasjon]" footer block. Used when content was contributed by
    /// another organization rather than authored by a person. Typically placed at the bottom.
    /// </summary>
    private IContentType CreateArtikkelInnholdFraElement()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "artikkelInnholdFra",
            Name = "Innhold fra organisasjon",
            Description = "Markerer at innholdet kommer fra en annen virksomhet (ikke en navngitt forfatter).",
            Icon = "icon-shield",
            IsElement = true,
        };
        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("virksomhet", "Virksomhet", _textStringDt, mandatory: true, description: "Navn på virksomheten som har levert innholdet"), "innhold");
        ct.AddPropertyType(Prop("dato", "Sist oppdatert", _datePickerDt, description: "Dato for siste oppdatering. Hvis tom brukes artikkelens oppdateringsdato."), "innhold");
        _contentTypeService.Save(ct);
        return ct;
    }

    /// <summary>
    /// Contact card with background color. Designed for cases and about-us pages,
    /// but available on all content types per the same-everywhere principle.
    /// </summary>
    private IContentType CreateArtikkelKontaktkortElement()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "artikkelKontaktkort",
            Name = "Kontaktkort",
            Description = "Kontaktkort med navn, stilling, virksomhet, e-post og telefon. Lyseblå bakgrunn.",
            Icon = "icon-message",
            IsElement = true,
        };
        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("tittel", "Tittel", _textStringDt, description: "Valgfri overskrift, f.eks. 'Kontaktperson' eller 'Spørsmål?'"), "innhold");
        ct.AddPropertyType(Prop("navn", "Navn", _textStringDt, mandatory: true, description: "Kontaktpersonens navn"), "innhold");
        ct.AddPropertyType(Prop("stilling", "Stilling", _textStringDt), "innhold");
        ct.AddPropertyType(Prop("virksomhet", "Virksomhet", _textStringDt, description: "Anbefalt sammen med eller i stedet for e-post for å gjøre personen lett å finne"), "innhold");
        ct.AddPropertyType(Prop("epost", "E-post", _textStringDt, mandatory: true, description: "Kontaktens e-postadresse"), "innhold");
        ct.AddPropertyType(Prop("telefon", "Telefon", _textStringDt, description: "Valgfritt telefonnummer"), "innhold");
        _contentTypeService.Save(ct);
        return ct;
    }

    /// <summary>
    /// Single step within a Prosessteg container. Auto-numbered by position in frontend.
    /// </summary>
    private IContentType CreateArtikkelProsessStegItemElement()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "artikkelProsessStegItem",
            Name = "Prosesstegg-element",
            Description = "Et enkelt steg i en prosess. Nummereres automatisk fra rekkefølge.",
            Icon = "icon-list",
            IsElement = true,
        };
        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("tittel", "Etikett", _textStringDt, description: "Valgfri etikett ved siden av nummeret. Standard: 'Steg'. Kan overstyres til f.eks. 'Fase' eller 'Idé'."), "innhold");
        ct.AddPropertyType(Prop("beskrivelse", "Beskrivelse", _richTextDtRestricted, mandatory: true, description: "Beskrivelse av dette steget. Bare grunnleggende formatering tillatt."), "innhold");
        _contentTypeService.Save(ct);
        return ct;
    }

    /// <summary>
    /// Container for a numbered list of process steps. Allows ≥1 nested ProsessStegItem.
    /// </summary>
    private IContentType CreateArtikkelProsessStegElement()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "artikkelProsessteg",
            Name = "Prosessteg",
            Description = "Nummerert liste over steg i en prosess. Hvert steg får automatisk nummer.",
            Icon = "icon-ordered-list",
            IsElement = true,
        };
        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("tittel", "Tittel", _textStringDt, description: "Valgfri overskrift over hele prosessen, f.eks. 'Slik foregår prosessen'"), "innhold");
        ct.AddPropertyType(Prop("steg", "Steg", _blockListProsessStegItemsDt, mandatory: true, description: "Legg til ett eller flere steg. Nummereres automatisk."), "innhold");
        _contentTypeService.Save(ct);
        return ct;
    }

    /// <summary>
    /// Unified highlight block. Toggles control whether it shows as a colored fact box,
    /// a quote with « », or includes an image. Replaces artikkelInfoBoks, artikkelCallout,
    /// and artikkelSitat.
    /// </summary>
    private IContentType CreateArtikkelFremhevingElement()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "artikkelFremheving",
            Name = "Fremheving",
            Description = "Uthevet boks med valgfritt bilde, bakgrunnsfarge og sitat-tegn. Brukes for fakta, høydepunkter og sitater.",
            Icon = "icon-favorite",
            IsElement = true,
        };
        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("tittel", "Tittel", _textStringDt, description: "Valgfri overskrift over teksten"), "innhold");
        ct.AddPropertyType(Prop("tekst", "Tekst", _richTextDtRestricted, mandatory: true, description: "Hovedteksten i fremhevingen. Bare grunnleggende formatering tillatt (fet, kursiv, lister, lenker)."), "innhold");
        ct.AddPropertyType(Prop("bilde", "Bilde", _mediaPickerDt, description: "Valgfritt bilde til venstre for teksten på desktop, over på mobil"), "innhold");
        ct.AddPropertyType(Prop("bildeAlt", "Alternativ tekst for bilde", _textStringDt, description: "Beskriver bildet for skjermlesere. La stå tom hvis bildet kun er dekorativt."), "innhold");
        ct.AddPropertyType(Prop("visBakgrunn", "Vis bakgrunnsfarge", _trueFalseDt, description: "Slå på lyseblå bakgrunn (Faktaboks-stil). Standard på."), "innhold");
        ct.AddPropertyType(Prop("visAnforselstegn", "Vis anførselstegn", _trueFalseDt, description: "Slå på «...» rundt teksten (Sitat-stil). Standard av."), "innhold");
        ct.AddPropertyType(Prop("kilde", "Kilde", _textStringDt, description: "Valgfri kilde/citat-attribusjon, vises under teksten"), "innhold");
        _contentTypeService.Save(ct);
        return ct;
    }

    private IContentType CreateArtikkelBildeSeksjonElement()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "artikkelBildeSeksjon",
            Name = "Bilde",
            Description = "Bilde med valgfri bildetekst og fotokreditering",
            Icon = "icon-picture",
            IsElement = true,
        };
        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("bilde", "Bilde", _mediaPickerDt, mandatory: true), "innhold");
        ct.AddPropertyType(Prop("bildeAlt", "Alternativ tekst", _textStringDt, description: "Beskriver bildet for skjermlesere. La stå tom hvis bildet kun er dekorativt."), "innhold");
        ct.AddPropertyType(Prop("bildetekst", "Bildetekst", _textStringDt, description: "Bildetekst og evt. fotograf/kilde, f.eks. 'Foto: Dag Alveng'"), "innhold");
        _contentTypeService.Save(ct);
        return ct;
    }

    private void MigrateArtikkelBildeSeksjon()
    {
        var ct = _contentTypeService.Get("artikkelBildeSeksjon");
        if (ct == null) return;

        bool changed = false;

        // Rename to "Bilde" and update description
        if (ct.Name != "Bilde")
        {
            ct.Name = "Bilde";
            ct.Description = "Bilde med valgfri bildetekst og fotokreditering";
            changed = true;
        }

        // Add bildeAlt if missing
        if (!ct.PropertyTypes.Any(p => p.Alias == "bildeAlt"))
        {
            ct.AddPropertyType(Prop("bildeAlt", "Alternativ tekst", _textStringDt, description: "Beskriver bildet for skjermlesere. La stå tom hvis bildet kun er dekorativt."), "innhold");
            changed = true;
        }

        // Make bilde mandatory
        var bildeProp = ct.PropertyTypes.FirstOrDefault(p => p.Alias == "bilde");
        if (bildeProp != null && !bildeProp.Mandatory)
        {
            bildeProp.Mandatory = true;
            changed = true;
        }

        if (changed)
            _contentTypeService.Save(ct);
    }

    // --- Veiledning element types ---

    private IContentType CreateVeiledningTekstElement()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "veiledningTekst",
            Name = "Brødtekst (veiledning)",
            Description = "Rik tekstblokk med overskrifter (H2/H3/H4), lister, lenker, fet, kursiv og blockquote.",
            Icon = "icon-edit",
            IsElement = true,
        };
        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("innhold", "Innhold", _richTextDt, mandatory: true), "innhold");
        _contentTypeService.Save(ct);
        return ct;
    }

    private IContentType CreateVeiledningInfoElement()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "veiledningInfo",
            Name = "Infomodul",
            Description = "Informasjonsboks med tittel og innhold. Kan ha innebygd trekkspill og 'Les mer'-lenke.",
            Icon = "icon-info",
            IsElement = true,
        };
        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("tittel", "Tittel", _textStringDt, mandatory: true, sortOrder: 1), "innhold");
        ct.AddPropertyType(Prop("innhold", "Innhold", _richTextDt, mandatory: true, sortOrder: 2), "innhold");
        ct.AddPropertyType(Prop("trekkspill", "Trekkspill", _blockListAccordionDt, description: "Valgfri innebygd accordion under innholdet.", sortOrder: 3), "innhold");
        ct.AddPropertyType(Prop("lesMerTittel", "Les mer-tittel", _textStringDt, description: "Vises som lenketekst nederst, f.eks. 'Les mer hos Datatilsynet'.", sortOrder: 4), "innhold");
        ct.AddPropertyType(Prop("lesMerUrl", "Les mer-URL", _textStringDt, description: "URL som 'Les mer'-lenken peker til.", sortOrder: 5), "innhold");
        _contentTypeService.Save(ct);
        return ct;
    }

    private void MigrateVeiledningInfo()
    {
        var ct = _contentTypeService.Get("veiledningInfo");
        if (ct == null) return;

        bool changed = false;

        if (!ct.PropertyTypes.Any(p => p.Alias == "trekkspill"))
        {
            ct.AddPropertyType(Prop("trekkspill", "Trekkspill", _blockListAccordionDt, description: "Valgfri innebygd accordion under innholdet.", sortOrder: 3), "innhold");
            changed = true;
        }
        if (!ct.PropertyTypes.Any(p => p.Alias == "lesMerTittel"))
        {
            ct.AddPropertyType(Prop("lesMerTittel", "Les mer-tittel", _textStringDt, description: "Vises som lenketekst nederst, f.eks. 'Les mer hos Datatilsynet'.", sortOrder: 4), "innhold");
            changed = true;
        }
        if (!ct.PropertyTypes.Any(p => p.Alias == "lesMerUrl"))
        {
            ct.AddPropertyType(Prop("lesMerUrl", "Les mer-URL", _textStringDt, description: "URL som 'Les mer'-lenken peker til.", sortOrder: 5), "innhold");
            changed = true;
        }

        if (changed)
        {
            _contentTypeService.Save(ct);
            Console.WriteLine("ContentTypeComposer: Migrated veiledningInfo with trekkspill + lesMer fields");
        }
    }

    private IContentType CreateVeiledningEksempelElement()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "veiledningEksempel",
            Name = "Eksempel (veiledning)",
            Description = "Eksempel-boks med tittel og innhold. Brukes for å vise konkrete eksempler i et veiledningssteg.",
            Icon = "icon-lightbulb",
            IsElement = true,
        };
        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("tittel", "Tittel", _textStringDt, mandatory: true), "innhold");
        ct.AddPropertyType(Prop("innhold", "Innhold", _richTextDt, mandatory: true), "innhold");
        _contentTypeService.Save(ct);
        return ct;
    }

    private IContentType CreateVeiledningObsElement()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "veiledningObs",
            Name = "Obs",
            Description = "Varselboks med tittel og tekst. Brukes for å fremheve viktig informasjon i et veiledningssteg.",
            Icon = "icon-alert",
            IsElement = true,
        };
        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("tittel", "Tittel", _textStringDt, description: "Valgfri. Tom tittel vises som \"Obs\" på siden."), "innhold");
        ct.AddPropertyType(Prop("tekst", "Tekst", _richTextDt, mandatory: true), "innhold");
        _contentTypeService.Save(ct);
        return ct;
    }

    private void MigrateVeiledningObsRemoveVariant()
    {
        var ct = _contentTypeService.Get("veiledningObs");
        if (ct == null) return;

        bool changed = false;

        if (ct.PropertyTypes.Any(p => p.Alias == "variant"))
        {
            ct.RemovePropertyType("variant");
            changed = true;
            Console.WriteLine("ContentTypeComposer: Removed variant property from veiledningObs");
        }

        // Tittel er valgfri (Dorte): tom tittel vises som "Obs" i frontend. Relax eksisterende noder.
        var tittel = ct.PropertyTypes.FirstOrDefault(p => p.Alias == "tittel");
        if (tittel != null && tittel.Mandatory)
        {
            tittel.Mandatory = false;
            changed = true;
        }

        if (changed)
            _contentTypeService.Save(ct);
    }

    private IContentType CreateVeiledningTrekkspillElement()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "veiledningTrekkspill",
            Name = "Trekkspill (veiledning)",
            Description = "Klikkbar tittel som åpner skjult innhold under. Bra for bonus-info eller detaljer leseren kan hoppe over.",
            Icon = "icon-list",
            IsElement = true,
        };
        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("tittel", "Tittel", _textStringDt, mandatory: true), "innhold");
        ct.AddPropertyType(Prop("innhold", "Innhold", _richTextDt, mandatory: true), "innhold");
        _contentTypeService.Save(ct);
        return ct;
    }

    private IContentType CreateEksempelFeaturedElement()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "eksempelFeatured",
            Name = "Fremhevet eksempel",
            Description = "Stor hero-blokk på Eksempler-siden. Pek på ett eksempel som vises som featured.",
            Icon = "icon-bullhorn",
            IsElement = true,
        };
        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("eksempel", "Eksempel", _contentPickerDt, mandatory: true, description: "Velg eksempelet som skal fremheves."), "innhold");
        _contentTypeService.Save(ct);
        return ct;
    }

    private IContentType CreateEksempelGruppeElement()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "eksempelGruppe",
            Name = "Eksempel-gruppe",
            Description = "Grid av eksempler. Velg tittel (valgfri), antall kolonner (1-4) og opptil 6 eksempler.",
            Icon = "icon-grid",
            IsElement = true,
        };
        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("tittel", "Tittel", _textStringDt, description: "Valgfri overskrift over gruppen.", sortOrder: 1), "innhold");
        ct.AddPropertyType(Prop("antallKolonner", "Antall kolonner", _kolonneDropdownDt, mandatory: true, description: "Hvor mange kort per rad i grid-visningen.", sortOrder: 2), "innhold");
        for (int i = 1; i <= 6; i++)
        {
            ct.AddPropertyType(Prop($"eksempel{i}", $"Eksempel {i}", _contentPickerDt, description: i == 1 ? "Velg eksempel som vises i kortet." : "Valgfri, la stå tom hvis gruppen skal ha færre kort.", sortOrder: 2 + i), "innhold");
        }
        _contentTypeService.Save(ct);
        return ct;
    }

    private IContentType CreateEksempelRelatertElement()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "eksempelRelatert",
            Name = "Relatert innhold",
            Description = "3 kort som peker til relaterte artikler eller veiledninger.",
            Icon = "icon-link",
            IsElement = true,
        };
        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("tittel", "Tittel", _textStringDt, description: "Valgfri overskrift over de relaterte lenkene.", sortOrder: 1), "innhold");
        ct.AddPropertyType(Prop("relatert1", "Relatert 1", _contentPickerDt, description: "Velg artikkel eller veiledning.", sortOrder: 2), "innhold");
        ct.AddPropertyType(Prop("relatert2", "Relatert 2", _contentPickerDt, description: "Valgfri.", sortOrder: 3), "innhold");
        ct.AddPropertyType(Prop("relatert3", "Relatert 3", _contentPickerDt, description: "Valgfri.", sortOrder: 4), "innhold");
        _contentTypeService.Save(ct);
        return ct;
    }

    private IContentType CreateEksempelKontaktElement()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "eksempelKontakt",
            Name = "Kontakt-boks",
            Description = "Kontakt-boks med tittel, navn, e-post og stilling.",
            Icon = "icon-mailbox",
            IsElement = true,
        };
        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("tittel", "Tittel", _textStringDt, mandatory: true, description: "Eks: 'Ønsker du å dele et eksempel?'", sortOrder: 1), "innhold");
        ct.AddPropertyType(Prop("navn", "Navn", _textStringDt, description: "Kontaktpersonens navn.", sortOrder: 2), "innhold");
        ct.AddPropertyType(Prop("epost", "E-post", _textStringDt, description: "Kontaktpersonens e-postadresse.", sortOrder: 3), "innhold");
        ct.AddPropertyType(Prop("stilling", "Stilling", _textStringDt, description: "Kontaktpersonens stilling/tittel.", sortOrder: 4), "innhold");
        _contentTypeService.Save(ct);
        return ct;
    }

    // Suffikser veiledning-element-typenes display-navn så de ikke kolliderer
    // med artikkel-elementer i Document Types-listen.
    private void MigrateVeiledningElementNames()
    {
        var renames = new[]
        {
            ("veiledningTekst", "Brødtekst (veiledning)"),
            ("veiledningTrekkspill", "Trekkspill (veiledning)"),
            ("veiledningEksempel", "Eksempel (veiledning)"),
        };

        foreach (var (alias, nyttNavn) in renames)
        {
            var ct = _contentTypeService.Get(alias);
            if (ct == null) continue;
            if (ct.Name == nyttNavn) continue;
            ct.Name = nyttNavn;
            _contentTypeService.Save(ct);
        }
    }

    // --- Block List DataTypes ---

    private void CreateBlockListDataTypes()
    {
        _blockListAccordionDt = CreateOrGetBlockListDataType(
            "Block List - Accordion Sections", "accordionSection");
        _blockListTipsDt = CreateOrGetBlockListDataType(
            "Block List - Tips", "tipItem");
        _blockListArtikkelDt = CreateOrGetMultiBlockListDataType(
            "Block List - Artikkel Innhold",
            BaseArticleModules);
        // Case has its own block list so it can diverge from artikkel later (currently identical)
        _blockListEksempelDt = CreateOrGetMultiBlockListDataType(
            "Block List - Eksempel Innhold",
            EksempelModules);
        _blockListVeiledningKortDt = CreateOrGetBlockListDataType(
            "Block List - Veiledning Kort", "veiledningKort");
        _blockListVerktoyKortDt = CreateOrGetBlockListDataType(
            "Block List - Verktøy Kort", "verktoyKort");
        // Used by artikkelProsessteg (container) to nest artikkelProsessStegItem children
        _blockListProsessStegItemsDt = CreateOrGetBlockListDataType(
            "Block List - Prosessteg Items", "artikkelProsessStegItem");
        // Block list for Om Oss seksjoner (replaces standalone omOssSeksjon child content)
        _blockListOmOssDt = CreateOrGetBlockListDataType(
            "Block List - Om Oss Seksjoner", "omOssBlokk");
        _blockListVeiledningStegDt = CreateOrGetMultiBlockListDataType(
            "Block List - Veiledning Steg",
            VeiledningStegModules);
        _blockListEksemplerSeksjonerDt = CreateOrGetMultiBlockListDataType(
            "Block List - Eksempler Seksjoner",
            new[] { "eksempelFeatured", "eksempelGruppe", "eksempelRelatert", "eksempelKontakt" });
        _blockListVeiledningGuideDt = CreateOrGetMultiBlockListDataType(
            "Block List - Veiledning Guide",
            VeiledningGuideModules);
        _blockListForsideDt = CreateOrGetMultiBlockListDataType(
            "Block List - Forside Seksjoner",
            ForsideModules);
    }

    private IDataType CreateOrGetBlockListDataType(string name, string elementTypeAlias)
    {
        // Check if it already exists by name
        var existing = _dataTypeService.GetByEditorAlias(Constants.PropertyEditors.Aliases.BlockList)
            .FirstOrDefault(dt => dt.Name == name);
        if (existing != null)
        {
            if (string.IsNullOrEmpty(existing.EditorUiAlias))
            {
                existing.EditorUiAlias = "Umb.PropertyEditorUi.BlockList";
                _dataTypeService.Save(existing);
            }
            return existing;
        }

        var elementType = _contentTypeService.Get(elementTypeAlias)
            ?? throw new InvalidOperationException($"Element type '{elementTypeAlias}' not found");

        var blockListEditor = _propertyEditors[Constants.PropertyEditors.Aliases.BlockList]
            ?? throw new InvalidOperationException("Block List property editor not found");

        var dt = new DataType(blockListEditor, _configSerializer)
        {
            Name = name,
            DatabaseType = ValueStorageType.Ntext,
            EditorUiAlias = "Umb.PropertyEditorUi.BlockList",
            ConfigurationData = new Dictionary<string, object>
            {
                ["blocks"] = new object[]
                {
                    new { contentElementTypeKey = elementType.Key }
                }
            },
        };
        _dataTypeService.Save(dt);
        return dt;
    }

    /// <summary>
    /// Updates an existing Block List data type's allowed element types to match the given list.
    /// Use this to add/remove modules after initial creation. Idempotent.
    /// </summary>
    /// <summary>
    /// Per-content-element-type settings element mapping. Keys are content element
    /// type aliases; values are settings element type aliases. When a content type
    /// is added to a Block List, if its alias is in this map the block gets a
    /// settingsElementTypeKey too — adding the "Innstillinger" tab in the editor.
    /// </summary>
    private static readonly Dictionary<string, string> BlockSettingsByContent = new()
    {
        ["artikkelTrekkspill"] = "artikkelTrekkspillSettings",
    };

    /// <summary>
    /// Per-block label shown i Block List-oversikten, så redaktør ser et utdrag av hver
    /// modul uten å åpne den (Dorte-ønske, Drupal-stil). Bruker Umbraco Flavored Markdown:
    /// {umbValue: alias | filter}. Aliaser uten oppføring her får standard-label (modulnavn).
    /// </summary>
    private static readonly Dictionary<string, string> BlockLabelByContent = new()
    {
        ["artikkelTekst"]        = "{umbValue: innhold | stripHtml | wordLimit:12}",
        ["artikkelInfoBoks"]     = "{umbValue: innhold | stripHtml | wordLimit:12}",
        ["artikkelBildeSeksjon"] = "{umbValue: bildetekst | fallback:Bilde}",
        ["artikkelFremheving"]   = "{umbValue: tekst | stripHtml | wordLimit:12}",
        ["artikkelKontaktkort"]  = "{umbValue: navn | fallback:Kontaktkort}",
        ["veiledningTekst"]      = "{umbValue: innhold | stripHtml | wordLimit:12}",
        ["veiledningInfo"]       = "{umbValue: tittel | fallback:Info}",
        ["veiledningEksempel"]   = "{umbValue: tittel | fallback:Eksempel}",
        ["veiledningObs"]        = "{umbValue: tittel | fallback:Obs}",
        ["veiledningTrekkspill"] = "{umbValue: tittel | fallback:Trekkspill}",
    };

    private object? BuildBlockConfig(string alias, string contextName, string operation)
    {
        var elementType = _contentTypeService.Get(alias);
        if (elementType == null)
        {
            Console.WriteLine($"ContentTypeComposer: Element type '{alias}' not found, skipping in block list '{contextName}' ({operation})");
            return null;
        }
        var block = new Dictionary<string, object>
        {
            ["contentElementTypeKey"] = elementType.Key,
        };
        if (BlockSettingsByContent.TryGetValue(alias, out var settingsAlias))
        {
            var settingsType = _contentTypeService.Get(settingsAlias);
            if (settingsType != null)
            {
                block["settingsElementTypeKey"] = settingsType.Key;
            }
            else
            {
                Console.WriteLine($"ContentTypeComposer: Settings element type '{settingsAlias}' for '{alias}' not found in block list '{contextName}' — skipping settings");
            }
        }
        if (BlockLabelByContent.TryGetValue(alias, out var label))
        {
            block["label"] = label;
        }
        return block;
    }

    private void RefreshMultiBlockListAllowedModules(string name, string[] elementTypeAliases)
    {
        var dt = _dataTypeService.GetByEditorAlias(Constants.PropertyEditors.Aliases.BlockList)
            .FirstOrDefault(d => d.Name == name);
        if (dt == null) return;

        var blocks = elementTypeAliases
            .Select(alias => BuildBlockConfig(alias, name, "refresh"))
            .Where(b => b != null)
            .ToArray();

        var config = dt.ConfigurationData ?? new Dictionary<string, object>();
        config["blocks"] = blocks;
        dt.ConfigurationData = config;
        _dataTypeService.Save(dt);
    }

    private IDataType CreateOrGetMultiBlockListDataType(string name, string[] elementTypeAliases)
    {
        // Check if it already exists by name
        var existing = _dataTypeService.GetByEditorAlias(Constants.PropertyEditors.Aliases.BlockList)
            .FirstOrDefault(dt => dt.Name == name);
        if (existing != null)
        {
            if (string.IsNullOrEmpty(existing.EditorUiAlias))
            {
                existing.EditorUiAlias = "Umb.PropertyEditorUi.BlockList";
                _dataTypeService.Save(existing);
            }
            return existing;
        }

        // Skip missing element types so the block list can be created during incremental
        // development. Missing types are logged so they can be tracked down.
        var blocks = elementTypeAliases
            .Select(alias => BuildBlockConfig(alias, name, "create"))
            .Where(b => b != null)
            .ToArray();

        var blockListEditor = _propertyEditors[Constants.PropertyEditors.Aliases.BlockList]
            ?? throw new InvalidOperationException("Block List property editor not found");

        var dt = new DataType(blockListEditor, _configSerializer)
        {
            Name = name,
            DatabaseType = ValueStorageType.Ntext,
            EditorUiAlias = "Umb.PropertyEditorUi.BlockList",
            ConfigurationData = new Dictionary<string, object>
            {
                ["blocks"] = blocks
            },
        };
        _dataTypeService.Save(dt);
        return dt;
    }

    // ── Module lists ───────────────────────────────────────────────────
    // Single source of truth for which element types are allowed in each
    // content type's body Block List. To add a new module everywhere:
    // add it to BaseArticleModules. To diverge case from artikkel later:
    // build EksempelModules as BaseArticleModules.Concat(...).ToArray().

    private static readonly string[] BaseArticleModules =
    {
        "artikkelTekst",
        "artikkelBildeSeksjon",
        "artikkelTrekkspill",
        // New unified module replacing InfoBoks + Callout + Sitat
        "artikkelFremheving",
        // Process steps (container + nested items)
        "artikkelProsessteg",
        // Author/contact variants
        "artikkelByline",
        "artikkelInnholdFra",
        "artikkelKontaktkort",
        // Legacy (still in DB, will be removed once no content references them):
        // "artikkelHero", "artikkelInfoBoks", "artikkelCallout", "artikkelSitat"
    };

    private static readonly string[] EksempelModules = BaseArticleModules;

    private static readonly string[] VeiledningStegModules =
    {
        "veiledningTekst",
        "veiledningInfo",
        "veiledningEksempel",
        "veiledningObs",
        "veiledningTrekkspill",
    };

    private static readonly string[] VeiledningGuideModules =
    {
        "veiledningTekst",
        "veiledningTrekkspill",
        "veiledningObs",
    };

    // Forside-moduler i Figma-rekkefølge (default når redaktør bygger siden).
    private static readonly string[] ForsideModules =
    {
        "forsideHero",
        "forsideAktuelt",
        "forsideArrangementer",
        "forsideVeiledning",
        "forsideLaerAvAndre",
        "forsideSandkasse",
    };

    // ── RichText configurations ────────────────────────────────────────
    // Single source of truth for ALL RichText editors in the CMS.
    // To change a toolbar or add/remove a Tiptap feature: edit the lists below.
    // To add a new RichText variant: add a new pair of constants and one EnsureRichTextDataType call.
    //
    // Removing an extension blocks the feature entirely (no paste, no drag-drop, no shortcut).
    // Removing a toolbar button only hides it in UI — the extension must also be removed to fully block.

    private const string StandardRichTextName = "Richtext editor";
    private const string RestrictedRichTextName = "Richtext editor (begrenset)";

    private static readonly List<List<List<string>>> StandardToolbar = new()
    {
        new()
        {
            // Paragraph (= "Normal" reset) before headings so editors can revert
            // a heading back to body text without retyping. Heading extension
            // already covers paragraph as one of its toggle states; the toolbar
            // button just makes it discoverable.
            //
            // ClearFormatting (eraser icon) sits next to it as the "wash" button
            // that strips inline marks (bold, italic, color, font-family, etc).
            // The pair gives editors two buttons:
            //   - Paragraph: change current block type back to body text
            //   - ClearFormatting: strip marks/inline-styles from selection
            // Click both to fully normalize a pasted-in mess.
            new() { "Umb.Tiptap.Toolbar.Paragraph", "Umb.Tiptap.Toolbar.Heading2", "Umb.Tiptap.Toolbar.Heading3", "Umb.Tiptap.Toolbar.Heading4", "Umb.Tiptap.Toolbar.ClearFormatting" },
            new() { "Umb.Tiptap.Toolbar.SourceEditor" },
            new() { "Umb.Tiptap.Toolbar.Bold", "Umb.Tiptap.Toolbar.Italic", "Umb.Tiptap.Toolbar.Underline" },
            new() { "Umb.Tiptap.Toolbar.TextAlignLeft", "Umb.Tiptap.Toolbar.TextAlignCenter", "Umb.Tiptap.Toolbar.TextAlignRight" },
            new() { "Umb.Tiptap.Toolbar.BulletList", "Umb.Tiptap.Toolbar.OrderedList" },
            new() { "Umb.Tiptap.Toolbar.Blockquote" },
            new() { "Umb.Tiptap.Toolbar.Link", "Umb.Tiptap.Toolbar.Unlink" },
        }
    };

    private static readonly List<string> StandardExtensions = new()
    {
        "Umb.Tiptap.RichTextEssentials",
        "Umb.Tiptap.Anchor",
        "Umb.Tiptap.Block",
        "Umb.Tiptap.Blockquote",
        "Umb.Tiptap.Bold",
        "Umb.Tiptap.BulletList",
        "Umb.Tiptap.CodeBlock",
        "Umb.Tiptap.Heading",
        "Umb.Tiptap.HtmlAttributeClass",
        "Umb.Tiptap.HtmlAttributeDataset",
        "Umb.Tiptap.HtmlAttributeId",
        "Umb.Tiptap.HtmlAttributeStyle",
        "Umb.Tiptap.HtmlTagDiv",
        "Umb.Tiptap.HtmlTagSpan",
        "Umb.Tiptap.Italic",
        "Umb.Tiptap.Link",
        "Umb.Tiptap.OrderedList",
        "Umb.Tiptap.Strike",
        "Umb.Tiptap.Subscript",
        "Umb.Tiptap.Superscript",
        "Umb.Tiptap.Table",
        "Umb.Tiptap.TextAlign",
        "Umb.Tiptap.TextDirection",
        "Umb.Tiptap.TextIndent",
        "Umb.Tiptap.TrailingNode",
        "Umb.Tiptap.Underline",
        // Excluded: Image, Embed, HorizontalRule, Figure, MediaUpload
    };

    // Restricted: for highlight blocks (Fremheving) and process step descriptions.
    // No headings (block is itself a highlight, no nested sections), no source editor,
    // no alignment, no blockquote (handled by visAnforselstegn toggle).
    // ClearFormatting ("fjern formatering") is included here too — ALL RichText
    // editors must have a wash button so editors can strip pasted-in marks/styles.
    private static readonly List<List<List<string>>> RestrictedToolbar = new()
    {
        new()
        {
            new() { "Umb.Tiptap.Toolbar.Bold", "Umb.Tiptap.Toolbar.Italic", "Umb.Tiptap.Toolbar.ClearFormatting" },
            new() { "Umb.Tiptap.Toolbar.BulletList", "Umb.Tiptap.Toolbar.OrderedList" },
            new() { "Umb.Tiptap.Toolbar.Link", "Umb.Tiptap.Toolbar.Unlink" },
        }
    };

    private static readonly List<string> RestrictedExtensions = new()
    {
        "Umb.Tiptap.RichTextEssentials",
        "Umb.Tiptap.Bold",
        "Umb.Tiptap.BulletList",
        "Umb.Tiptap.HtmlAttributeClass",
        "Umb.Tiptap.HtmlAttributeId",
        "Umb.Tiptap.Italic",
        "Umb.Tiptap.Link",
        "Umb.Tiptap.OrderedList",
        "Umb.Tiptap.TrailingNode",
    };

    /// <summary>
    /// Ensures all named RichText data types exist with correct toolbar+extensions config.
    /// Runs every startup and overwrites the config to match constants above.
    /// </summary>
    private void EnsureRichTextDataTypes()
    {
        EnsureRichTextDataType(StandardRichTextName, StandardToolbar, StandardExtensions);
        EnsureRichTextDataType(RestrictedRichTextName, RestrictedToolbar, RestrictedExtensions);
    }

    private IDataType EnsureRichTextDataType(string name, List<List<List<string>>> toolbar, List<string> extensions)
    {
        var existing = _dataTypeService.GetByEditorAlias(Constants.PropertyEditors.Aliases.RichText)
            .FirstOrDefault(dt => dt.Name == name);

        if (existing == null)
        {
            // Create new variant by cloning the editor reference from any existing RichText DT
            var template = _dataTypeService.GetByEditorAlias(Constants.PropertyEditors.Aliases.RichText).First();
            var editor = _propertyEditors[Constants.PropertyEditors.Aliases.RichText]
                ?? throw new InvalidOperationException("RichText editor not found");
            existing = new DataType(editor, _configSerializer)
            {
                Name = name,
                DatabaseType = ValueStorageType.Ntext,
                EditorUiAlias = template.EditorUiAlias,
                ConfigurationData = new Dictionary<string, object>(),
            };
            _dataTypeService.Save(existing);
            Console.WriteLine($"ContentTypeComposer: Created RichText data type '{name}'");
        }

        var config = existing.ConfigurationData ?? new Dictionary<string, object>();
        config["toolbar"] = toolbar;
        config["extensions"] = extensions;
        existing.ConfigurationData = config;
        _dataTypeService.Save(existing);
        return existing;
    }

    // --- Container helper ---

    private void CreateContainerIfMissing(string alias, string name, string icon, string childAlias)
    {
        if (_contentTypeService.Get(alias) != null) return;
        var childType = _contentTypeService.Get(childAlias);
        if (childType == null) return;
        CreateContainer(alias, name, icon, childType);
    }

    private void CreateContainer(string alias, string name, string icon, IContentType childType)
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = alias,
            Name = name,
            Icon = icon,
            AllowedAsRoot = true,
        };
        ct.AllowedContentTypes = new[]
        {
            new ContentTypeSort(childType.Key, 0, childType.Alias)
        };
        _contentTypeService.Save(ct);
    }

    // --- Document types ---

    private IContentType CreateArtikkel()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "artikkel",
            Name = "Artikkel",
            Description = "Artikler og nyheter",
            Icon = "icon-newspaper-alt",
            AllowedAsRoot = false,
        };
        ct.AddPropertyGroup("innhold", "Innhold");
        AddArtikkelhodeFields(ct);
        ct.AddPropertyType(Prop("innhold", "Innhold", _blockListArtikkelDt, description: "Hovedinnhold", sortOrder: 5), "innhold");

        ct.AddPropertyGroup("seo", "SEO");
        ct.AddPropertyType(Prop("seoTittel", "SEO-tittel", _textStringDt, description: "Overstyr tittel i søkeresultater og sosiale medier"), "seo");
        ct.AddPropertyType(Prop("seoBeskrivelse", "SEO-beskrivelse", _textAreaDt, description: "Overstyr beskrivelse i søkeresultater og sosiale medier"), "seo");
        ct.AddPropertyType(Prop("seoBilde", "SEO-bilde", _mediaPickerDt, description: "Bilde som vises ved deling på sosiale medier"), "seo");
        SetStandardGroupSortOrders(ct);
        _contentTypeService.Save(ct);
        return ct;
    }

    private void MigrateRemoveLegacyCleanup()
    {
        var aliasesToRemove = new[]
        {
            "faqSamling",
            "faq",
            "ordbokSamling",
            "ordbokOppslag",
            "merkelapper",
            "merkelapp",
            "veiledningOversikt",
            "veiledningTaValg",
            "veiledningTaValgItem",
            "veiledningLenkekort",
        };

        foreach (var alias in aliasesToRemove)
        {
            var ct = _contentTypeService.Get(alias);
            if (ct == null) continue;
            try
            {
                _contentService.GetPagedOfType(ct.Id, 0, 1, out long nodeCount, (Umbraco.Cms.Core.Persistence.Querying.IQuery<IContent>?)null);
                Console.WriteLine($"ContentTypeComposer: WARNING — permanently cascade-deleting content type '{alias}' and its {nodeCount} content node(s). This runs on every startup.");
                _contentTypeService.Delete(ct);
                Console.WriteLine($"ContentTypeComposer: Removed legacy '{alias}' content type and all its nodes");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"ContentTypeComposer: Failed to remove '{alias}': {ex.Message}");
            }
        }
    }

    private void MigrateCaserToEksempler()
    {
        var existing = _contentTypeService.Get("eksempel");
        if (existing != null && existing.PropertyTypes.Any(p => p.Alias == "artikkelBilde"))
        {
            return;
        }

        foreach (var alias in new[] { "case", "caser", "eksempler", "eksempel" })
        {
            var ct = _contentTypeService.Get(alias);
            if (ct == null) continue;
            try
            {
                _contentService.GetPagedOfType(ct.Id, 0, 1, out long nodeCount, (Umbraco.Cms.Core.Persistence.Querying.IQuery<IContent>?)null);
                Console.WriteLine($"ContentTypeComposer: WARNING — permanently cascade-deleting content type '{alias}' and its {nodeCount} content node(s) for Caser→Eksempler rename. This runs on every startup.");
                _contentTypeService.Delete(ct);
                Console.WriteLine($"ContentTypeComposer: Deleted legacy '{alias}' content type for Caser→Eksempler rename");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"ContentTypeComposer: Failed to delete '{alias}': {ex.Message}");
            }
        }
    }

    private void MigrateSide()
    {
        var ct = _contentTypeService.Get("side");
        if (ct == null) return;

        bool changed = false;

        if (!ct.PropertyTypes.Any(p => p.Alias == "ingress"))
        {
            ct.AddPropertyType(Prop("ingress", "Ingress", _textAreaDt, mandatory: true, description: "Kort introduksjonstekst som vises under tittelen.", sortOrder: 2), "innhold");
            changed = true;
        }
        if (!ct.PropertyTypes.Any(p => p.Alias == "artikkelBilde"))
        {
            ct.AddPropertyType(Prop("artikkelBilde", "Hovedbilde", _mediaPickerDt, description: "Hovedbilde som vises ved siden av tittelen.", sortOrder: 3), "innhold");
            changed = true;
        }
        if (!ct.PropertyTypes.Any(p => p.Alias == "bildeAlt"))
        {
            ct.AddPropertyType(Prop("bildeAlt", "Alternativ tekst for bilde", _textStringDt, description: "Beskriver bildet for skjermlesere.", sortOrder: 4), "innhold");
            changed = true;
        }
        var innholdProp = ct.PropertyTypes.FirstOrDefault(p => p.Alias == "innhold");
        if (innholdProp != null && innholdProp.DataTypeId != _blockListArtikkelDt.Id)
        {
            innholdProp.DataTypeId = _blockListArtikkelDt.Id;
            changed = true;
        }

        if (ct.PropertyTypes.Any(p => p.Alias == "template"))
        {
            ct.RemovePropertyType("template");
            changed = true;
        }

        if (EnsureInnstillingerGroup(ct, "slug")) changed = true;
        if (SetPropertySortOrders(ct,
            ("tittel", 1), ("ingress", 2), ("artikkelBilde", 3), ("bildeAlt", 4), ("innhold", 5),
            ("slug", 1))) changed = true;
        if (SetStandardGroupSortOrders(ct)) changed = true;

        if (changed)
            _contentTypeService.Save(ct);
    }

    private void MigrateVeiledningGuideEditorLayout()
    {
        var ct = _contentTypeService.Get("veiledningGuide");
        if (ct == null) return;

        bool changed = false;

        if (EnsureInnstillingerGroup(ct, "slug")) changed = true;
        if (SetPropertySortOrders(ct,
            ("tittel", 1), ("ingress", 2), ("innholdBlokker", 3), ("stegGruppeTittler", 4),
            ("slug", 1))) changed = true;
        if (SetStandardGroupSortOrders(ct)) changed = true;

        if (changed)
            _contentTypeService.Save(ct);
    }

    private void MigrateVeiledningSteg()
    {
        var ct = _contentTypeService.Get("veiledningSteg");
        if (ct == null) return;

        bool changed = false;

        if (!ct.PropertyTypes.Any(p => p.Alias == "ingress"))
        {
            ct.AddPropertyType(Prop("ingress", "Ingress", _textAreaDt, description: "Valgfri. Stegsider bruker brødtekst-modul i stedet (Dorte).", sortOrder: 2), "innhold");
            changed = true;
        }

        // Ingress er ikke lenger påkrevd på stegsider (Dorte): innhold skal ligge i en
        // brødtekst-modul slik at all tekst får lik størrelse. Relax eksisterende noder.
        var ingressProp = ct.PropertyTypes.FirstOrDefault(p => p.Alias == "ingress");
        if (ingressProp != null && ingressProp.Mandatory)
        {
            ingressProp.Mandatory = false;
            changed = true;
        }

        if (!ct.PropertyTypes.Any(p => p.Alias == "innholdBlokker"))
        {
            ct.AddPropertyType(Prop("innholdBlokker", "Innhold", _blockListVeiledningStegDt, description: "Moduler som utgjør innholdet i steget (tekst, info, eksempel, obs, trekkspill).", sortOrder: 3), "innhold");
            changed = true;
        }

        foreach (var alias in new[] { "innhold", "infoKortTittel", "infoKortInnhold", "accordionSeksjoner", "eksempelTittel", "eksempelTekst" })
        {
            if (ct.PropertyTypes.Any(p => p.Alias == alias))
            {
                ct.RemovePropertyType(alias);
                changed = true;
            }
        }

        // guideSlug settes automatisk fra guiden (VeiledningStegGuideSlugHandler), så det er ikke lenger
        // påkrevd. Relax eksisterende noder.
        var guideSlugProp = ct.PropertyTypes.FirstOrDefault(p => p.Alias == "guideSlug");
        if (guideSlugProp != null && guideSlugProp.Mandatory)
        {
            guideSlugProp.Mandatory = false;
            changed = true;
        }

        if (EnsureInnstillingerGroup(ct, "slug", "guideSlug", "steg", "understeg")) changed = true;
        if (SetPropertySortOrders(ct,
            ("tittel", 1), ("ingress", 2), ("innholdBlokker", 3),
            ("slug", 1), ("guideSlug", 2), ("steg", 3), ("understeg", 4))) changed = true;
        if (SetStandardGroupSortOrders(ct)) changed = true;

        if (changed)
            _contentTypeService.Save(ct);
    }

    private void MigrateVeiledningGuideInnhold()
    {
        var ct = _contentTypeService.Get("veiledningGuide");
        if (ct == null) return;

        bool changed = false;

        if (!ct.PropertyTypes.Any(p => p.Alias == "ingress"))
        {
            ct.AddPropertyType(Prop("ingress", "Ingress", _textAreaDt, mandatory: true, description: "Kort introduksjonstekst som vises under tittelen.", sortOrder: 2), "innhold");
            changed = true;
        }

        if (!ct.PropertyTypes.Any(p => p.Alias == "innholdBlokker"))
        {
            ct.AddPropertyType(Prop("innholdBlokker", "Innhold", _blockListVeiledningGuideDt, description: "Moduler som vises på guide-oversikten (tekst, trekkspill, obs).", sortOrder: 3), "innhold");
            changed = true;
        }

        if (ct.PropertyTypes.Any(p => p.Alias == "introTekst"))
        {
            ct.RemovePropertyType("introTekst");
            changed = true;
        }

        if (SetPropertySortOrders(ct,
            ("tittel", 1), ("ingress", 2), ("innholdBlokker", 3), ("stegGruppeTittler", 4))) changed = true;

        if (changed)
            _contentTypeService.Save(ct);
    }

    /// <summary>
    /// Adds the standard Artikkelhode field set (title, slug, ingress, image, alt, background)
    /// to a content type. Used by both artikkel and case so the editor experience is identical.
    /// </summary>
    private void AddArtikkelhodeFields(IContentType ct)
    {
        ct.AddPropertyType(Prop("tittel", "Tittel", _textStringDt, mandatory: true, sortOrder: 1), "innhold");
        ct.AddPropertyType(Prop("ingress", "Ingress", _textAreaDt, mandatory: true, description: "Kort introduksjonstekst som vises under tittelen.", sortOrder: 2), "innhold");
        ct.AddPropertyType(Prop("artikkelBilde", "Hovedbilde", _mediaPickerDt, description: "Hovedbilde som vises ved siden av tittelen (eller under på mobil).", sortOrder: 3), "innhold");
        ct.AddPropertyType(Prop("bildeAlt", "Alternativ tekst for bilde", _textStringDt, description: "Beskriver bildet for skjermlesere. La stå tom hvis bildet kun er dekorativt.", sortOrder: 4), "innhold");

        ct.AddPropertyGroup("innstillinger", "Innstillinger");
        // Ikke-obligatorisk: tom slug auto-genereres fra tittel ved lagring (ContentSlugHandler).
        ct.AddPropertyType(Prop("slug", "Slug", _textStringDt, description: "URL-vennlig identifikator. Genereres automatisk fra tittel hvis tom.", sortOrder: 1), "innstillinger");
        // Bakgrunnsfarge er IKKE en del av det delte hodet lenger — farge kun på artikkel (se MigrateArtikkelType).
    }

    /// <summary>
    /// Farge (bakgrunn) skal kun kunne velges på rik artikkelmal (Lars + designere 2026-06-05):
    /// artikkel, eksempel, enkelVeiledning, sandkasse, omOss. De enkle malene (side, stegartikkel) skal
    /// ikke ha farge. Andre farger (kort, seksjoner) baserer seg på dette valget i frontend. Sikrer feltet
    /// på de rike typene og fjerner det fra de enkle. Fjerning er destruktiv: dropper hvit/lyseblaa-verdier.
    /// </summary>
    private void EnforceBakgrunnScope()
    {
        foreach (var alias in new[] { "artikkel", "eksempel", "enkelVeiledning", "sandkasse", "omOss" })
        {
            var ct = _contentTypeService.Get(alias);
            if (ct == null) continue;
            if (ct.PropertyTypes.Any(p => p.Alias == "bakgrunn")) continue;
            if (!ct.PropertyGroups.Any(g => g.Alias == "innstillinger"))
                ct.AddPropertyGroup("innstillinger", "Innstillinger");
            ct.AddPropertyType(Prop("bakgrunn", "Bakgrunn", _bakgrunnDropdownDt, description: "Redaksjonell farge for artikkelen (brand1/2/3, eller accent). Vises på artikkelhodet og arves av kort som lenker hit.", sortOrder: 2), "innstillinger");
            _contentTypeService.Save(ct);
            Console.WriteLine($"ContentTypeComposer: Ensured bakgrunn on '{alias}' (rik artikkelmal)");
        }
        foreach (var alias in new[] { "side", "stegartikkel" })
        {
            var ct = _contentTypeService.Get(alias);
            if (ct == null) continue;
            if (!ct.PropertyTypes.Any(p => p.Alias == "bakgrunn")) continue;
            ct.RemovePropertyType("bakgrunn");
            _contentTypeService.Save(ct);
            Console.WriteLine($"ContentTypeComposer: Removed bakgrunn from '{alias}' (farge kun på rik artikkelmal)");
        }
    }

    /// <summary>
    /// Slug kan stå tom og auto-genereres fra tittel ved lagring (ContentSlugHandler), jf.
    /// feltbeskrivelsen. Gjør slug ikke-obligatorisk på de rike malene og relax eksisterende noder.
    /// </summary>
    private void EnsureSlugOptional()
    {
        foreach (var alias in new[] { "artikkel", "eksempel", "enkelVeiledning", "sandkasse", "omOss", "side", "stegartikkel" })
        {
            var ct = _contentTypeService.Get(alias);
            if (ct == null) continue;
            var slug = ct.PropertyTypes.FirstOrDefault(p => p.Alias == "slug");
            if (slug != null && slug.Mandatory)
            {
                slug.Mandatory = false;
                _contentTypeService.Save(ct);
                Console.WriteLine($"ContentTypeComposer: slug satt ikke-obligatorisk på '{alias}'");
            }
        }
    }

    private static readonly Dictionary<string, int> StandardGroupSortOrders = new()
    {
        { "innhold", 1 },
        { "innstillinger", 50 },
        { "seo", 100 },
    };

    private bool SetStandardGroupSortOrders(IContentType ct)
    {
        bool changed = false;
        foreach (var grp in ct.PropertyGroups)
        {
            if (StandardGroupSortOrders.TryGetValue(grp.Alias, out var so) && grp.SortOrder != so)
            {
                grp.SortOrder = so;
                changed = true;
            }
        }
        return changed;
    }

    private bool EnsureInnstillingerGroup(IContentType ct, params string[] fieldAliasesToMove)
    {
        bool changed = false;

        if (!ct.PropertyGroups.Any(g => g.Alias == "innstillinger"))
        {
            ct.AddPropertyGroup("innstillinger", "Innstillinger");
            changed = true;
        }

        foreach (var alias in fieldAliasesToMove)
        {
            var prop = ct.PropertyTypes.FirstOrDefault(p => p.Alias == alias);
            if (prop == null) continue;

            var currentGroup = ct.PropertyGroups.FirstOrDefault(g =>
                g.PropertyTypes != null && g.PropertyTypes.Any(p => p.Alias == alias));
            if (currentGroup?.Alias == "innstillinger") continue;

            if (ct.MovePropertyType(alias, "innstillinger"))
                changed = true;
        }

        return changed;
    }

    private bool SetPropertySortOrders(IContentType ct, params (string alias, int order)[] orders)
    {
        bool changed = false;
        foreach (var (alias, order) in orders)
        {
            var prop = ct.PropertyTypes.FirstOrDefault(p => p.Alias == alias);
            if (prop != null && prop.SortOrder != order)
            {
                prop.SortOrder = order;
                changed = true;
            }
        }
        return changed;
    }

    private void MigrateArtikkelType()
    {
        var ct = _contentTypeService.Get("artikkel");
        if (ct == null) return;

        // Migrate block list data type
        var prop = ct.PropertyTypes.FirstOrDefault(p => p.Alias == "innhold");
        if (prop != null && prop.DataTypeId != _blockListArtikkelDt.Id)
        {
            prop.DataTypeId = _blockListArtikkelDt.Id;
        }

        bool changed = false;

        // Add Artikkelhode fields if missing (idempotent)
        if (!ct.PropertyTypes.Any(p => p.Alias == "ingress"))
        {
            ct.AddPropertyType(Prop("ingress", "Ingress", _textAreaDt, mandatory: true, description: "Kort introduksjonstekst som vises under tittelen."), "innhold");
            changed = true;
        }
        if (!ct.PropertyTypes.Any(p => p.Alias == "artikkelBilde"))
        {
            ct.AddPropertyType(Prop("artikkelBilde", "Hovedbilde", _mediaPickerDt, description: "Hovedbilde som vises ved siden av tittelen (eller under på mobil)."), "innhold");
            changed = true;
        }
        if (!ct.PropertyTypes.Any(p => p.Alias == "bildeAlt"))
        {
            ct.AddPropertyType(Prop("bildeAlt", "Alternativ tekst for bilde", _textStringDt, description: "Beskriver bildet for skjermlesere. La stå tom hvis bildet kun er dekorativt."), "innhold");
            changed = true;
        }
        // bakgrunn (farge) eies av EnforceBakgrunnScope() — gjelder rik artikkelmal (artikkel + eksempel).
        if (EnsureInnstillingerGroup(ct, "slug")) changed = true;
        if (SetPropertySortOrders(ct,
            ("tittel", 1), ("ingress", 2), ("artikkelBilde", 3), ("bildeAlt", 4), ("innhold", 5),
            ("slug", 1))) changed = true;
        if (SetStandardGroupSortOrders(ct)) changed = true;

        if (changed)
            _contentTypeService.Save(ct);
    }

    private IContentType CreateSide()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "side",
            Name = "Side",
            Description = "Generelle sider (cookies, personvern, tilgjengelighet osv.)",
            Icon = "icon-document",
            AllowedAsRoot = false,
        };
        ct.AddPropertyGroup("innhold", "Innhold");
        AddArtikkelhodeFields(ct);
        ct.AddPropertyType(Prop("innhold", "Innhold", _blockListArtikkelDt, description: "Hovedinnhold", sortOrder: 5), "innhold");

        ct.AddPropertyGroup("seo", "SEO");
        ct.AddPropertyType(Prop("seoTittel", "SEO-tittel", _textStringDt, description: "Overstyr tittel i søkeresultater og sosiale medier"), "seo");
        ct.AddPropertyType(Prop("seoBeskrivelse", "SEO-beskrivelse", _textAreaDt, description: "Overstyr beskrivelse i søkeresultater og sosiale medier"), "seo");
        ct.AddPropertyType(Prop("seoBilde", "SEO-bilde", _mediaPickerDt, description: "Bilde som vises ved deling på sosiale medier"), "seo");
        SetStandardGroupSortOrders(ct);
        _contentTypeService.Save(ct);
        return ct;
    }

    private IContentType CreateEksempel()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "eksempel",
            Name = "Eksempel",
            Description = "Eksempler fra offentlig sektor",
            Icon = "icon-science",
            AllowedAsRoot = false,
        };
        ct.AddPropertyGroup("innhold", "Innhold");
        AddArtikkelhodeFields(ct);
        ct.AddPropertyType(Prop("innhold", "Innhold", _blockListEksempelDt, description: "Hovedinnhold", sortOrder: 5), "innhold");

        ct.AddPropertyGroup("seo", "SEO");
        ct.AddPropertyType(Prop("seoTittel", "SEO-tittel", _textStringDt, description: "Overstyr tittel i søkeresultater og sosiale medier"), "seo");
        ct.AddPropertyType(Prop("seoBeskrivelse", "SEO-beskrivelse", _textAreaDt, description: "Overstyr beskrivelse i søkeresultater og sosiale medier"), "seo");
        ct.AddPropertyType(Prop("seoBilde", "SEO-bilde", _mediaPickerDt, description: "Bilde som vises ved deling på sosiale medier"), "seo");
        SetStandardGroupSortOrders(ct);
        _contentTypeService.Save(ct);
        return ct;
    }

    private IContentType CreateEksemplerOversikt()
    {
        var eksempelType = _contentTypeService.Get("eksempel");
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "eksempler",
            Name = "Eksempler",
            Description = "Oversiktsside for eksempler. Redigerbart hode + eksempel-barn under.",
            Icon = "icon-science",
            AllowedAsRoot = true,
        };
        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("heroTittel", "Tittel", _textStringDt, mandatory: true, description: "Vises som overskrift på /eksempler", sortOrder: 1), "innhold");
        ct.AddPropertyType(Prop("heroIngress", "Ingress", _textAreaDt, description: "Kort introduksjonstekst under tittelen på /eksempler", sortOrder: 2), "innhold");
        ct.AddPropertyType(Prop("seksjoner", "Seksjoner", _blockListEksemplerSeksjonerDt, description: "Bygg opp /eksempler med fremhevet eksempel, grupper med 1–4 kolonner, relaterte lenker og kontakt-CTA. Reorder ved drag og drop.", sortOrder: 3), "innhold");

        ct.AddPropertyGroup("seo", "SEO");
        ct.AddPropertyType(Prop("seoTittel", "SEO-tittel", _textStringDt, description: "Overstyr tittel i søkeresultater og sosiale medier"), "seo");
        ct.AddPropertyType(Prop("seoBeskrivelse", "SEO-beskrivelse", _textAreaDt, description: "Overstyr beskrivelse i søkeresultater og sosiale medier"), "seo");
        ct.AddPropertyType(Prop("seoBilde", "SEO-bilde", _mediaPickerDt, description: "Bilde som vises ved deling på sosiale medier"), "seo");

        if (eksempelType != null)
        {
            ct.AllowedContentTypes = new[]
            {
                new ContentTypeSort(eksempelType.Key, 0, eksempelType.Alias)
            };
        }

        _contentTypeService.Save(ct);
        return ct;
    }

    private void MigrateEksemplerOversikt()
    {
        var ct = _contentTypeService.Get("eksempler");
        if (ct == null) return;
        if (ct.PropertyTypes.Any(p => p.Alias == "seksjoner")) return;
        ct.AddPropertyType(Prop("seksjoner", "Seksjoner", _blockListEksemplerSeksjonerDt, description: "Bygg opp /eksempler med fremhevet eksempel, grupper med 1–4 kolonner, relaterte lenker og kontakt-CTA. Reorder ved drag og drop.", sortOrder: 3), "innhold");
        _contentTypeService.Save(ct);
        Console.WriteLine("ContentTypeComposer: Migrated eksempler with seksjoner Block List");
    }

    private IContentType CreateArtiklerOversikt()
    {
        var artikkelType = _contentTypeService.Get("artikkel");
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "artikler",
            Name = "Artikler",
            Description = "Oversiktsside for artikler. Redigerbart hode + artikkel-barn under.",
            Icon = "icon-newspaper-alt",
            AllowedAsRoot = true,
        };
        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("heroTittel", "Tittel", _textStringDt, description: "Vises som overskrift på /artikler. Default er 'Aktuelt' hvis tom.", sortOrder: 1), "innhold");
        ct.AddPropertyType(Prop("heroSubtittel", "Subtittel", _textStringDt, description: "Kort støttetekst under tittelen. Kan stå tom.", sortOrder: 2), "innhold");
        ct.AddPropertyType(Prop("featuredArtikkel", "Fremhevet artikkel", _contentPickerDt, description: "Velg artikkel som vises stort øverst. Tom = bruk nyeste automatisk.", sortOrder: 3), "innhold");

        ct.AddPropertyGroup("seo", "SEO");
        ct.AddPropertyType(Prop("seoTittel", "SEO-tittel", _textStringDt, description: "Overstyr tittel i søkeresultater og sosiale medier"), "seo");
        ct.AddPropertyType(Prop("seoBeskrivelse", "SEO-beskrivelse", _textAreaDt, description: "Overstyr beskrivelse i søkeresultater og sosiale medier"), "seo");
        ct.AddPropertyType(Prop("seoBilde", "SEO-bilde", _mediaPickerDt, description: "Bilde som vises ved deling på sosiale medier"), "seo");

        if (artikkelType != null)
        {
            ct.AllowedContentTypes = new[]
            {
                new ContentTypeSort(artikkelType.Key, 0, artikkelType.Alias)
            };
        }

        _contentTypeService.Save(ct);
        return ct;
    }

    private void MigrateArtiklerToOversikt()
    {
        var ct = _contentTypeService.Get("artikler");
        if (ct == null) return;

        bool changed = false;

        if (!ct.PropertyGroups.Any(g => g.Alias == "innhold"))
        {
            ct.AddPropertyGroup("innhold", "Innhold");
            changed = true;
        }
        if (!ct.PropertyTypeExists("heroTittel"))
        {
            ct.AddPropertyType(Prop("heroTittel", "Tittel", _textStringDt, description: "Vises som overskrift på /artikler. Default er 'Aktuelt' hvis tom.", sortOrder: 1), "innhold");
            changed = true;
        }
        if (!ct.PropertyTypeExists("heroSubtittel"))
        {
            ct.AddPropertyType(Prop("heroSubtittel", "Subtittel", _textStringDt, description: "Kort støttetekst under tittelen. Kan stå tom.", sortOrder: 2), "innhold");
            changed = true;
        }
        if (!ct.PropertyTypeExists("featuredArtikkel"))
        {
            ct.AddPropertyType(Prop("featuredArtikkel", "Fremhevet artikkel", _contentPickerDt, description: "Velg artikkel som vises stort øverst. Tom = bruk nyeste automatisk.", sortOrder: 3), "innhold");
            changed = true;
        }
        if (!ct.PropertyTypeExists("seoTittel"))
        {
            if (!ct.PropertyGroups.Any(g => g.Alias == "seo"))
                ct.AddPropertyGroup("seo", "SEO");
            ct.AddPropertyType(Prop("seoTittel", "SEO-tittel", _textStringDt, description: "Overstyr tittel i søkeresultater og sosiale medier"), "seo");
            ct.AddPropertyType(Prop("seoBeskrivelse", "SEO-beskrivelse", _textAreaDt, description: "Overstyr beskrivelse i søkeresultater og sosiale medier"), "seo");
            ct.AddPropertyType(Prop("seoBilde", "SEO-bilde", _mediaPickerDt, description: "Bilde som vises ved deling på sosiale medier"), "seo");
            changed = true;
        }

        if (changed)
        {
            _contentTypeService.Save(ct);
            Console.WriteLine("ContentTypeComposer: Migrated artikler container to editable overview page");
        }
    }

    private IContentType CreateVeiledningGuide()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "veiledningGuide",
            Name = "Veiledning Guide",
            Description = "Oversiktsside for en veiledningsguide",
            Icon = "icon-book-alt",
            AllowedAsRoot = false,
        };
        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("tittel", "Tittel", _textStringDt, mandatory: true, sortOrder: 1), "innhold");
        ct.AddPropertyType(Prop("ingress", "Ingress", _textAreaDt, mandatory: true, description: "Kort introduksjonstekst som vises under tittelen.", sortOrder: 2), "innhold");
        ct.AddPropertyType(Prop("innholdBlokker", "Innhold", _blockListVeiledningGuideDt, description: "Moduler som vises på guide-oversikten (tekst, trekkspill, obs).", sortOrder: 3), "innhold");
        ct.AddPropertyType(Prop("stegGruppeTittler", "Stegtitler", _textAreaDt, description: "Tittel per steg-gruppe, én per linje.", sortOrder: 4), "innhold");

        ct.AddPropertyGroup("innstillinger", "Innstillinger");
        ct.AddPropertyType(Prop("slug", "Slug", _textStringDt, mandatory: true, description: "URL-vennlig identifikator.", sortOrder: 1), "innstillinger");

        ct.AddPropertyGroup("seo", "SEO");
        ct.AddPropertyType(Prop("seoTittel", "SEO-tittel", _textStringDt), "seo");
        ct.AddPropertyType(Prop("seoBeskrivelse", "SEO-beskrivelse", _textAreaDt), "seo");
        ct.AddPropertyType(Prop("seoBilde", "SEO-bilde", _mediaPickerDt), "seo");
        SetStandardGroupSortOrders(ct);
        _contentTypeService.Save(ct);
        return ct;
    }

    private void MigrateVeiledningGuideStegtitler()
    {
        var ct = _contentTypeService.Get("veiledningGuide");
        if (ct == null) return;

        const string description = "Tittel per steg-gruppe, én per linje.";
        var prop = ct.PropertyTypes.FirstOrDefault(p => p.Alias == "stegGruppeTittler");
        if (prop == null)
        {
            ct.AddPropertyType(Prop("stegGruppeTittler", "Stegtitler", _textAreaDt, description: description), "innhold");
            _contentTypeService.Save(ct);
            Console.WriteLine("ContentTypeComposer: Added stegGruppeTittler to veiledningGuide");
            return;
        }
        if (prop.Description != description)
        {
            prop.Description = description;
            _contentTypeService.Save(ct);
        }
    }

    private IContentType CreateVeiledningSteg()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "veiledningSteg",
            Name = "Veiledning Steg",
            Description = "Et steg i en veiledningsguide",
            Icon = "icon-document",
            AllowedAsRoot = false,
        };
        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("tittel", "Tittel", _textStringDt, mandatory: true, sortOrder: 1), "innhold");
        ct.AddPropertyType(Prop("ingress", "Ingress", _textAreaDt, description: "Valgfri. Stegsider bruker brødtekst-modul i stedet (Dorte).", sortOrder: 2), "innhold");
        ct.AddPropertyType(Prop("innholdBlokker", "Innhold", _blockListVeiledningStegDt, description: "Moduler som utgjør innholdet i steget (tekst, info, eksempel, obs, trekkspill).", sortOrder: 3), "innhold");

        ct.AddPropertyGroup("innstillinger", "Innstillinger");
        ct.AddPropertyType(Prop("slug", "Slug", _textStringDt, mandatory: true, description: "URL-vennlig identifikator.", sortOrder: 1), "innstillinger");
        ct.AddPropertyType(Prop("guideSlug", "Guide-slug", _textStringDt, description: "Settes automatisk fra guiden ved lagring. Trenger ikke fylles ut.", sortOrder: 2), "innstillinger");
        ct.AddPropertyType(Prop("steg", "Steg", _numericDt, mandatory: true, description: "Stegnummer (1, 2, 3...)", sortOrder: 3), "innstillinger");
        ct.AddPropertyType(Prop("understeg", "Understeg", _numericDt, mandatory: true, description: "Understeg-nummer (1, 2, 3...)", sortOrder: 4), "innstillinger");
        SetStandardGroupSortOrders(ct);
        _contentTypeService.Save(ct);
        return ct;
    }

    private IContentType CreateStegartikkel()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "stegartikkel",
            Name = "Stegartikkel",
            Description = "Supplerende artikkel under et veiledningssteg",
            Icon = "icon-document",
            AllowedAsRoot = false,
        };
        ct.AddPropertyGroup("innhold", "Innhold");
        AddArtikkelhodeFields(ct);
        ct.AddPropertyType(Prop("innhold", "Innhold", _blockListArtikkelDt, description: "Hovedinnhold", sortOrder: 5), "innhold");

        ct.AddPropertyGroup("seo", "SEO");
        ct.AddPropertyType(Prop("seoTittel", "SEO-tittel", _textStringDt, description: "Overstyr tittel i søkeresultater og sosiale medier"), "seo");
        ct.AddPropertyType(Prop("seoBeskrivelse", "SEO-beskrivelse", _textAreaDt, description: "Overstyr beskrivelse i søkeresultater og sosiale medier"), "seo");
        ct.AddPropertyType(Prop("seoBilde", "SEO-bilde", _mediaPickerDt, description: "Bilde som vises ved deling på sosiale medier"), "seo");
        SetStandardGroupSortOrders(ct);
        _contentTypeService.Save(ct);
        return ct;
    }

    private void MigrateVeiledningStegAllowedChildren()
    {
        var stegType = _contentTypeService.Get("veiledningSteg");
        var stegartikkelType = _contentTypeService.Get("stegartikkel");
        if (stegType == null || stegartikkelType == null) return;

        var current = stegType.AllowedContentTypes?.Select(a => a.Alias).ToList() ?? new List<string>();
        if (current.Contains("stegartikkel")) return;

        var existing = stegType.AllowedContentTypes?.ToList() ?? new List<ContentTypeSort>();
        existing.Add(new ContentTypeSort(stegartikkelType.Key, existing.Count, stegartikkelType.Alias));
        stegType.AllowedContentTypes = existing;
        _contentTypeService.Save(stegType);
        Console.WriteLine("ContentTypeComposer: Allowed stegartikkel under veiledningSteg");
    }

    private IContentType CreateKalenderhendelse()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "kalenderhendelse",
            Name = "Kalenderhendelse",
            Description = "Arrangement, workshop eller frokostseminar",
            Icon = "icon-calendar",
            AllowedAsRoot = false,
        };
        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("tittel", "Tittel", _textStringDt, mandatory: true, sortOrder: 1), "innhold");
        ct.AddPropertyType(Prop("type", "Type", _textStringDt, description: "Workshop, Frokostseminar, Konferanse...", sortOrder: 2), "innhold");
        ct.AddPropertyType(Prop("ingress", "Ingress", _textAreaDt, description: "Kort beskrivelse for kortvisning.", sortOrder: 3), "innhold");
        ct.AddPropertyType(Prop("detaljertBeskrivelse", "Detaljert beskrivelse", _richTextDt, description: "Vises på enkeltsiden og i featured-boksen.", sortOrder: 4), "innhold");
        ct.AddPropertyType(Prop("startDato", "Startdato", _datePickerDt, mandatory: true, sortOrder: 5), "innhold");
        ct.AddPropertyType(Prop("sluttDato", "Sluttdato", _datePickerDt, description: "Fyll ut ved flere dager.", sortOrder: 6), "innhold");
        ct.AddPropertyType(Prop("tid", "Tid", _textStringDt, description: "Klokkeslett, f.eks. \"09:00-11:00\" eller \"Hele dagen\".", sortOrder: 7), "innhold");
        ct.AddPropertyType(Prop("sted", "Sted", _textStringDt, description: "Fysisk adresse eller \"Digitalt\".", sortOrder: 8), "innhold");
        ct.AddPropertyType(Prop("lenke", "Lenke", _textStringDt, description: "URL til påmelding eller mer info.", sortOrder: 9), "innhold");
        ct.AddPropertyType(Prop("tagger", "Tagger", _textAreaDt, description: "Kommaseparert liste med tagger.", sortOrder: 10), "innhold");

        ct.AddPropertyGroup("innstillinger", "Innstillinger");
        ct.AddPropertyType(Prop("slug", "Slug", _textStringDt, mandatory: true, description: "URL-vennlig identifikator.", sortOrder: 1), "innstillinger");
        SetStandardGroupSortOrders(ct);
        _contentTypeService.Save(ct);
        return ct;
    }

    private IContentType CreateKalender()
    {
        var hendelseType = _contentTypeService.Get("kalenderhendelse");
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "kalender",
            Name = "Kalender",
            Description = "Navigasjonsside for arrangementer",
            Icon = "icon-calendar",
            AllowedAsRoot = true,
        };
        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("tittel", "Tittel", _textStringDt, mandatory: true, sortOrder: 1), "innhold");
        ct.AddPropertyType(Prop("ingress", "Ingress", _textAreaDt, mandatory: true, description: "Kort introduksjonstekst som vises under tittelen.", sortOrder: 2), "innhold");
        ct.AddPropertyType(Prop("featuredHendelse", "Fremhevet arrangement", _contentPickerDt, description: "Velg hvilken hendelse som vises i den store boksen på toppen.", sortOrder: 3), "innhold");

        ct.AddPropertyGroup("seo", "SEO");
        ct.AddPropertyType(Prop("seoTittel", "SEO-tittel", _textStringDt), "seo");
        ct.AddPropertyType(Prop("seoBeskrivelse", "SEO-beskrivelse", _textAreaDt), "seo");
        ct.AddPropertyType(Prop("seoBilde", "SEO-bilde", _mediaPickerDt), "seo");

        if (hendelseType != null)
        {
            ct.AllowedContentTypes = new[]
            {
                new ContentTypeSort(hendelseType.Key, 0, hendelseType.Alias),
            };
        }
        SetStandardGroupSortOrders(ct);
        _contentTypeService.Save(ct);
        return ct;
    }

    private IContentType CreateEnkelVeiledning()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "enkelVeiledning",
            Name = "Enkel veiledningsmal",
            Description = "Veiledning som artikkel — uten understeg eller flersides struktur. Bruk denne når veiledningen er én side med løpende innhold.",
            Icon = "icon-readonly",
            AllowedAsRoot = false,
        };
        ct.AddPropertyGroup("innhold", "Innhold");
        AddArtikkelhodeFields(ct);
        ct.AddPropertyType(Prop("innhold", "Innhold", _blockListArtikkelDt, description: "Hovedinnhold — samme moduler som artikler.", sortOrder: 5), "innhold");

        ct.AddPropertyGroup("seo", "SEO");
        ct.AddPropertyType(Prop("seoTittel", "SEO-tittel", _textStringDt, description: "Overstyr tittel i søkeresultater og sosiale medier"), "seo");
        ct.AddPropertyType(Prop("seoBeskrivelse", "SEO-beskrivelse", _textAreaDt, description: "Overstyr beskrivelse i søkeresultater og sosiale medier"), "seo");
        ct.AddPropertyType(Prop("seoBilde", "SEO-bilde", _mediaPickerDt, description: "Bilde som vises ved deling på sosiale medier"), "seo");
        SetStandardGroupSortOrders(ct);
        _contentTypeService.Save(ct);
        return ct;
    }

    /// <summary>
    /// DEPRECATED: omOssSeksjon was a standalone child content type under omOss.
    /// Replaced by omOssBlokk (element type) inside a Block List on omOss.
    /// Existing omOssSeksjon content is migrated by MigrateOmOssToBlocks.
    /// </summary>
    private IContentType CreateOmOssSeksjon()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "omOssSeksjon",
            Name = "Om Oss Seksjon (utgår)",
            Description = "Utgår — bruk seksjon-blokker på Om Oss i stedet",
            Icon = "icon-document",
            AllowedAsRoot = false,
        };
        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("tittel", "Tittel", _textStringDt, mandatory: true), "innhold");
        ct.AddPropertyType(Prop("slug", "Slug", _textStringDt, mandatory: true), "innhold");
        ct.AddPropertyType(Prop("tekst", "Tekst", _richTextDt, mandatory: true), "innhold");
        ct.AddPropertyType(Prop("bilde", "Bilde", _mediaPickerDt, mandatory: true), "innhold");
        ct.AddPropertyType(Prop("rekkefolge", "Rekkefølge", _numericDt), "innhold");
        _contentTypeService.Save(ct);
        return ct;
    }

    /// <summary>
    /// Replacement for omOssSeksjon — a draggable block on Om Oss.
    /// </summary>
    private IContentType CreateOmOssBlokkElement()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "omOssBlokk",
            Name = "Om Oss Seksjon",
            Description = "En seksjon på Om Oss-siden. Tittel, tekst og valgfritt bilde.",
            Icon = "icon-document",
            IsElement = true,
        };
        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("tittel", "Tittel", _textStringDt, mandatory: true), "innhold");
        ct.AddPropertyType(Prop("tekst", "Tekst", _richTextDt, mandatory: true), "innhold");
        ct.AddPropertyType(Prop("bilde", "Bilde", _mediaPickerDt), "innhold");
        ct.AddPropertyType(Prop("bildeAlt", "Alternativ tekst for bilde", _textStringDt, description: "Beskriver bildet for skjermlesere. La stå tom hvis bildet kun er dekorativt."), "innhold");
        _contentTypeService.Save(ct);
        return ct;
    }

    private IContentType CreateOmOss()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "omOss",
            Name = "Om Oss",
            Description = "Om Oss-siden",
            Icon = "icon-umb-members",
            AllowedAsRoot = false,  // lives under Sider container
        };

        // Om Oss bruker rik artikkelmal: samme artikkelhode og samme modul-blokkliste som artikkel
        // (Lars + designere 2026-06-05). Farge legges på av EnforceBakgrunnScope.
        ct.AddPropertyGroup("innhold", "Innhold");
        AddArtikkelhodeFields(ct);
        ct.AddPropertyType(Prop("innhold", "Innhold", _blockListArtikkelDt, description: "Hovedinnhold", sortOrder: 5), "innhold");

        ct.AddPropertyGroup("seo", "SEO");
        ct.AddPropertyType(Prop("seoTittel", "SEO-tittel", _textStringDt, description: "Overstyr tittel i søkeresultater og sosiale medier"), "seo");
        ct.AddPropertyType(Prop("seoBeskrivelse", "SEO-beskrivelse", _textAreaDt, description: "Overstyr beskrivelse i søkeresultater og sosiale medier"), "seo");
        ct.AddPropertyType(Prop("seoBilde", "SEO-bilde", _mediaPickerDt, description: "Bilde som vises ved deling på sosiale medier"), "seo");

        // No allowed children — innholdet ligger som moduler på siden
        ct.AllowedContentTypes = Array.Empty<ContentTypeSort>();

        SetStandardGroupSortOrders(ct);
        _contentTypeService.Save(ct);
        return ct;
    }

    private void MigrateOmOss()
    {
        var ct = _contentTypeService.Get("omOss");
        if (ct == null) return;

        bool changed = false;

        // Bygg om Om Oss til rik artikkelmal (Lars + designere 2026-06-05): samme artikkelhode og
        // samme modul-blokkliste som artikkel. Farge legges på av EnforceBakgrunnScope.
        if (!ct.PropertyGroups.Any(g => g.Alias == "innhold"))
        {
            ct.AddPropertyGroup("innhold", "Innhold");
            changed = true;
        }
        if (!ct.PropertyTypeExists("tittel"))
        {
            AddArtikkelhodeFields(ct);
            changed = true;
        }
        if (!ct.PropertyTypeExists("innhold"))
        {
            ct.AddPropertyType(Prop("innhold", "Innhold", _blockListArtikkelDt, description: "Hovedinnhold", sortOrder: 5), "innhold");
            changed = true;
        }

        // Fjern gamle Om Oss-spesifikke felt. Destruktivt: gammelt innhold (hero/intro/misjon/seksjoner)
        // må flyttes til modulene av redaktør.
        foreach (var alias in new[] { "heroTittel", "heroUndertittel", "introTekst", "misjonTekst", "seksjoner" })
        {
            if (ct.PropertyTypeExists(alias))
            {
                ct.RemovePropertyType(alias);
                changed = true;
            }
        }

        if (ct.AllowedContentTypes != null && ct.AllowedContentTypes.Any())
        {
            ct.AllowedContentTypes = Array.Empty<ContentTypeSort>();
            changed = true;
        }

        if (SetStandardGroupSortOrders(ct)) changed = true;

        if (changed)
            _contentTypeService.Save(ct);
    }

    private IContentType CreateSandkasse()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "sandkasse",
            Name = "Sandkasse",
            Description = "Sandkasse-siden.",
            Icon = "icon-science",
            AllowedAsRoot = false,
        };

        ct.AddPropertyGroup("innhold", "Innhold");
        AddArtikkelhodeFields(ct);
        ct.AddPropertyType(Prop("innhold", "Innhold", _blockListArtikkelDt, description: "Bygg opp siden med artikkelmoduler (tekst, prosess-steg, trekkspill, osv.).", sortOrder: 10), "innhold");

        ct.AddPropertyGroup("seo", "SEO");
        ct.AddPropertyType(Prop("seoTittel", "SEO-tittel", _textStringDt, description: "Overstyr tittel i søkeresultater og sosiale medier"), "seo");
        ct.AddPropertyType(Prop("seoBeskrivelse", "SEO-beskrivelse", _textAreaDt, description: "Overstyr beskrivelse i søkeresultater og sosiale medier"), "seo");
        ct.AddPropertyType(Prop("seoBilde", "SEO-bilde", _mediaPickerDt, description: "Bilde som vises ved deling på sosiale medier"), "seo");

        _contentTypeService.Save(ct);
        return ct;
    }

    /// <summary>
    /// Brings an existing sandkasse content type up to the new article-style schema:
    /// drops the old fixed sections (hero/hvem/prosess/resultat/faq tabs and their fields)
    /// and adds the Artikkelhode fields + a single innhold block list pointing at the
    /// shared Block List - Artikkel Innhold data type. Idempotent.
    /// </summary>
    private void MigrateSandkasse()
    {
        var ct = _contentTypeService.Get("sandkasse");
        if (ct == null) return;

        bool changed = false;

        // Lock down: must live under Sider, not at root
        if (ct.AllowedAsRoot)
        {
            ct.AllowedAsRoot = false;
            changed = true;
        }

        // Add Artikkelhode fields if missing
        var hodeFields = new[] { "tittel", "slug", "ingress", "artikkelBilde", "bildeAlt" };
        if (hodeFields.Any(f => !ct.PropertyTypeExists(f)))
        {
            // Ensure the "innhold" group exists before adding to it
            if (!ct.PropertyGroups.Any(g => g.Alias == "innhold"))
                ct.AddPropertyGroup("innhold", "Innhold");
            AddArtikkelhodeFields(ct);
            changed = true;
        }

        // Add the single innhold block list field if missing (alias collides — use innholdBlokker if needed)
        // Note: the existing field "innhold" is the property GROUP, not a property.
        if (!ct.PropertyTypeExists("innhold") || ct.PropertyTypes.First(p => p.Alias == "innhold").DataTypeId != _blockListArtikkelDt.Id)
        {
            // If a property with alias "innhold" exists with a different data type, swap it
            var existing = ct.PropertyTypes.FirstOrDefault(p => p.Alias == "innhold");
            if (existing == null)
            {
                ct.AddPropertyType(Prop("innhold", "Innhold", _blockListArtikkelDt, description: "Bygg opp siden med artikkelmoduler (tekst, prosess-steg, trekkspill, osv.).", sortOrder: 10), "innhold");
                changed = true;
            }
            else if (existing.DataTypeId != _blockListArtikkelDt.Id)
            {
                existing.DataTypeId = _blockListArtikkelDt.Id;
                changed = true;
            }
        }

        // Drop legacy property aliases that no longer make sense
        var legacyAliases = new[]
        {
            "heroTittel", "heroTekst", "nedtelling",
            "hvemTittel", "hvemTekst", "hvemBilde",
            "prosessTittel", "prosessSteg",
            "resultatTittel", "resultatTekst", "resultatBilde",
            "faqTittel", "faqSeksjoner",
        };
        foreach (var alias in legacyAliases)
        {
            var p = ct.PropertyTypes.FirstOrDefault(x => x.Alias == alias);
            if (p != null)
            {
                ct.RemovePropertyType(alias);
                changed = true;
            }
        }

        // Drop legacy property GROUPS that are now empty
        foreach (var groupAlias in new[] { "hero", "hvem", "prosess", "resultat", "faq" })
        {
            var grp = ct.PropertyGroups.FirstOrDefault(g => g.Alias == groupAlias);
            if (grp != null)
            {
                ct.PropertyGroups.Remove(grp);
                changed = true;
            }
        }

        if (changed)
        {
            _contentTypeService.Save(ct);
            Console.WriteLine("ContentTypeComposer: Migrated sandkasse to article-style schema (Artikkelhode + innhold block list)");
        }
    }

    private IContentType CreateForside()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "forside",
            Name = "Forside",
            Description = "Forsiden av nettstedet",
            Icon = "icon-home",
            AllowedAsRoot = true,
        };

        // Forsiden er modularisert: ett block-list-felt med moduler (reorderbart).
        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("seksjoner", "Seksjoner", _blockListForsideDt, description: "Bygg opp forsiden ved å legge til moduler. Reorder ved drag og slipp."), "innhold");

        // Tab: SEO
        ct.AddPropertyGroup("seo", "SEO");
        ct.AddPropertyType(Prop("seoTittel", "SEO-tittel", _textStringDt, description: "Overstyr tittel i søkeresultater og sosiale medier"), "seo");
        ct.AddPropertyType(Prop("seoBeskrivelse", "SEO-beskrivelse", _textAreaDt, description: "Overstyr beskrivelse i søkeresultater og sosiale medier"), "seo");
        ct.AddPropertyType(Prop("seoBilde", "SEO-bilde", _mediaPickerDt, description: "Bilde som vises ved deling på sosiale medier"), "seo");

        _contentTypeService.Save(ct);
        return ct;
    }

    // --- Forside-moduler (block list) ---

    private IContentType CreateForsideHeroElement()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        { Alias = "forsideHero", Name = "Forside Hero", Description = "Hero-seksjon øverst på forsiden", Icon = "icon-home", IsElement = true };
        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("overskrift", "Overskrift", _textStringDt, mandatory: true), "innhold");
        ct.AddPropertyType(Prop("komIGangTekst", "Kom i gang-ledetekst", _textStringDt, description: "Liten ledetekst foran lenken, f.eks. \"Kom i gang\"."), "innhold");
        ct.AddPropertyType(Prop("lenketekst", "Lenketekst", _textStringDt), "innhold");
        ct.AddPropertyType(Prop("lenkeUrl", "Lenke-URL", _textStringDt), "innhold");
        ct.AddPropertyType(Prop("illustrasjon", "Illustrasjon", _mediaPickerDt), "innhold");
        _contentTypeService.Save(ct);
        return ct;
    }

    private IContentType CreateForsideAktueltElement()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        { Alias = "forsideAktuelt", Name = "Forside Aktuelt", Description = "Seksjon med siste artikler (innhold hentes automatisk)", Icon = "icon-newspaper-alt", IsElement = true };
        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("overskrift", "Overskrift", _textStringDt, mandatory: true), "innhold");
        _contentTypeService.Save(ct);
        return ct;
    }

    private IContentType CreateForsideArrangementerElement()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        { Alias = "forsideArrangementer", Name = "Forside Arrangementer", Description = "Seksjon med kommende arrangement (innhold hentes automatisk)", Icon = "icon-calendar", IsElement = true };
        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("overskrift", "Overskrift", _textStringDt, mandatory: true), "innhold");
        _contentTypeService.Save(ct);
        return ct;
    }

    private IContentType CreateForsideVeiledningElement()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        { Alias = "forsideVeiledning", Name = "Forside Veiledning", Description = "Fremhevet veiledning på forsiden", Icon = "icon-book-alt", IsElement = true };
        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("label", "Label", _textStringDt, description: "Liten etikett over tittelen, f.eks. \"Veiledning\"."), "innhold");
        ct.AddPropertyType(Prop("tittel", "Tittel", _textStringDt, mandatory: true), "innhold");
        ct.AddPropertyType(Prop("ingress", "Ingress", _textAreaDt), "innhold");
        ct.AddPropertyType(Prop("lenketekst", "Lenketekst", _textStringDt), "innhold");
        ct.AddPropertyType(Prop("lenkeUrl", "Lenke-URL", _textStringDt), "innhold");
        ct.AddPropertyType(Prop("illustrasjon", "Illustrasjon", _mediaPickerDt), "innhold");
        _contentTypeService.Save(ct);
        return ct;
    }

    private IContentType CreateForsideLaerAvAndreElement()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        { Alias = "forsideLaerAvAndre", Name = "Forside Lær av andre", Description = "Seksjon med eksempler (innhold hentes automatisk)", Icon = "icon-light-bulb", IsElement = true };
        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("overskrift", "Overskrift", _textStringDt, mandatory: true), "innhold");
        _contentTypeService.Save(ct);
        return ct;
    }

    private IContentType CreateForsideSandkasseElement()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        { Alias = "forsideSandkasse", Name = "Forside Sandkasse", Description = "Sandkasse-CTA på forsiden", Icon = "icon-box", IsElement = true };
        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("overskrift", "Overskrift", _textStringDt, mandatory: true), "innhold");
        ct.AddPropertyType(Prop("tekst", "Tekst", _richTextDt), "innhold");
        ct.AddPropertyType(Prop("lenketekst", "Lenketekst", _textStringDt), "innhold");
        ct.AddPropertyType(Prop("lenkeUrl", "Lenke-URL", _textStringDt), "innhold");
        ct.AddPropertyType(Prop("illustrasjon", "Illustrasjon", _mediaPickerDt), "innhold");
        _contentTypeService.Save(ct);
        return ct;
    }

    // --- Veiledning Oversikt element types ---

    private IContentType CreateVeiledningKortElement()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "veiledningKort",
            Name = "Veiledning Kort",
            Description = "Et kort i veiledningsoversikten",
            Icon = "icon-thumbnail-list",
            IsElement = true,
        };
        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("tittel", "Tittel", _textStringDt, mandatory: true), "innhold");
        ct.AddPropertyType(Prop("beskrivelse", "Beskrivelse", _textStringDt), "innhold");
        ct.AddPropertyType(Prop("url", "URL", _textStringDt), "innhold");
        ct.AddPropertyType(Prop("ikon", "Ikon", _textStringDt, description: "Ikonnavn fra Aksel (f.eks. HandHeart, Package)"), "innhold");
        _contentTypeService.Save(ct);
        return ct;
    }

    private void MigrateVeiledningKort()
    {
        var ct = _contentTypeService.Get("veiledningKort");
        if (ct == null) return;
        if (ct.PropertyTypeExists("ikon")) return;
        ct.AddPropertyType(Prop("ikon", "Ikon", _textStringDt, description: "Ikonnavn fra Aksel (f.eks. HandHeart, Package)"), "innhold");
        _contentTypeService.Save(ct);
    }

    private IContentType CreateVerktoyKortElement()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "verktoyKort",
            Name = "Verktøy Kort",
            Description = "Et verktøy-kort i veiledningsoversikten",
            Icon = "icon-wrench",
            IsElement = true,
        };
        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("tittel", "Tittel", _textStringDt, mandatory: true), "innhold");
        ct.AddPropertyType(Prop("beskrivelse", "Beskrivelse", _textStringDt), "innhold");
        ct.AddPropertyType(Prop("url", "URL", _textStringDt), "innhold");
        ct.AddPropertyType(Prop("bilde", "Bilde", _mediaPickerDt), "innhold");
        ct.AddPropertyType(Prop("ikon", "Ikon", _textStringDt, description: "Ikonnavn fra Aksel (f.eks. HandHeart, Package)"), "innhold");
        _contentTypeService.Save(ct);
        return ct;
    }

    private void MigrateVerktoyKort()
    {
        var ct = _contentTypeService.Get("verktoyKort");
        if (ct == null) return;
        if (ct.PropertyTypeExists("ikon")) return;
        ct.AddPropertyType(Prop("ikon", "Ikon", _textStringDt, description: "Ikonnavn fra Aksel (f.eks. HandHeart, Package)"), "innhold");
        _contentTypeService.Save(ct);
    }

    private void MigrateSiderToAndreSider()
    {
        var ct = _contentTypeService.Get("sider");
        if (ct == null) return;
        if (ct.Name == "Andre sider" && ct.Icon == "icon-folder") return;
        ct.Name = "Andre sider";
        ct.Icon = "icon-folder";
        _contentTypeService.Save(ct);
        Console.WriteLine("ContentTypeComposer: Renamed sider container to 'Andre sider'");
    }

    /// <summary>
    /// "Andre sider"-container holder generelle CMS-redigerbare sider (cookies, personvern,
    /// tilgjengelighet osv.). Primær child-type er "side". Andre eksisterende CT-er
    /// (omOss, sandkasse) tillates også slik at de kan flyttes inn hit i CMS-treet.
    /// Children av andre containere (artikkel, eksempel, veiledningGuide osv.) ekskluderes.
    /// </summary>
    private void LockSiderContainer()
    {
        var ct = _contentTypeService.Get("sider");
        if (ct == null) return;

        var excluded = new HashSet<string>
        {
            "eksempel",
            "artikkel",
            "veiledningGuide",
            "veiledningSteg",
            "stegartikkel",
            "enkelVeiledning",
            "kalenderhendelse",
            "forside",
            "globaleInnstillinger",
            "sider", "artikler", "eksempler", "veiledninger", "kalender",
            "artikkelTekst", "artikkelInfoBoks", "artikkelHero", "artikkelBildeSeksjon",
            "artikkelTrekkspill", "artikkelSitat", "artikkelCallout", "artikkelFremheving",
            "artikkelProsessteg", "artikkelProsessStegItem", "artikkelByline",
            "artikkelInnholdFra", "artikkelKontaktkort", "omOssBlokk", "omOssSeksjon",
            "accordionSection", "tipItem", "eventItem", "sandkasseSteg", "sandkasseFaq",
            "veiledningKort", "verktoyKort", "tilgjengeligIkon"
        };

        // Collect every non-excluded, non-element content type
        var allTypes = _contentTypeService.GetAll().ToList();
        var allowed = allTypes
            .Where(t => !t.IsElement && !excluded.Contains(t.Alias))
            .Select((t, i) => new ContentTypeSort(t.Key, i, t.Alias))
            .ToArray();

        var current = ct.AllowedContentTypes?.OrderBy(a => a.Alias).Select(a => a.Alias).ToArray() ?? Array.Empty<string>();
        var want = allowed.OrderBy(a => a.Alias).Select(a => a.Alias).ToArray();
        if (current.SequenceEqual(want)) return;

        ct.AllowedContentTypes = allowed;
        _contentTypeService.Save(ct);
        Console.WriteLine($"ContentTypeComposer: Updated sider AllowedContentTypes — catch-all ({allowed.Length} types: {string.Join(", ", want)})");
    }

    private void MigrateVeiledningerContainer()
    {
        var ct = _contentTypeService.Get("veiledninger");
        if (ct == null) return;

        bool changed = false;

        // Rename type display name (singular)
        if (ct.Name != "Veiledning")
        {
            ct.Name = "Veiledning";
            changed = true;
        }

        var guideType = _contentTypeService.Get("veiledningGuide");
        var enkelType = _contentTypeService.Get("enkelVeiledning");
        if (guideType != null)
        {
            var list = new List<ContentTypeSort>
            {
                new(guideType.Key, 0, guideType.Alias),
            };
            if (enkelType != null)
                list.Add(new(enkelType.Key, 1, enkelType.Alias));

            var desired = list.ToArray();
            var current = ct.AllowedContentTypes?.OrderBy(a => a.Alias).Select(a => a.Alias).ToArray() ?? Array.Empty<string>();
            var want = desired.OrderBy(a => a.Alias).Select(a => a.Alias).ToArray();
            if (!current.SequenceEqual(want))
            {
                ct.AllowedContentTypes = desired;
                changed = true;
            }
        }

        if (changed)
        {
            _contentTypeService.Save(ct);
            Console.WriteLine("ContentTypeComposer: Migrated veiledninger container (name + allowed children)");
        }
    }

    /// <summary>
    /// Adds the same fields to "veiledninger" container that veiledningOversikt has,
    /// so the editor can edit the overview page directly on the container (one click instead of two).
    /// Idempotent.
    /// </summary>
    private void AddOversiktFieldsToVeiledninger()
    {
        var ct = _contentTypeService.Get("veiledninger");
        if (ct == null) return;

        bool changed = false;

        // Hero
        if (!ct.PropertyGroups.Any(g => g.Alias == "hero"))
        {
            ct.AddPropertyGroup("hero", "Hero");
            ct.AddPropertyType(Prop("heroLabel", "Hero-label", _textStringDt), "hero");
            ct.AddPropertyType(Prop("heroTittel", "Hero-tittel", _textStringDt), "hero");
            ct.AddPropertyType(Prop("heroTekst", "Hero-tekst", _textStringDt), "hero");
            ct.AddPropertyType(Prop("heroBilde", "Hero-bilde", _mediaPickerDt), "hero");
            changed = true;
        }
        // Seksjon 1 (vises som "Fremhevet veiledning og artikler" i backoffice)
        if (!ct.PropertyGroups.Any(g => g.Alias == "seksjon1"))
        {
            ct.AddPropertyGroup("seksjon1", "Fremhevet veiledning og artikler");
            ct.AddPropertyType(Prop("seksjon1Tittel", "Tittel", _textStringDt), "seksjon1");
            ct.AddPropertyType(Prop("seksjon1Kort", "Kort", _blockListVeiledningKortDt), "seksjon1");
            changed = true;
        }
        // Seksjon 2 (vises som "Rik liste" i backoffice)
        if (!ct.PropertyGroups.Any(g => g.Alias == "seksjon2"))
        {
            ct.AddPropertyGroup("seksjon2", "Rik liste");
            ct.AddPropertyType(Prop("seksjon2Tittel", "Tittel", _textStringDt), "seksjon2");
            ct.AddPropertyType(Prop("seksjon2Kort", "Kort", _blockListVeiledningKortDt), "seksjon2");
            changed = true;
        }
        // Re-label til beskrivende modulnavn (Dorte, Figma-tavle 2026-06-04). Aliasene
        // beholdes, så ingen data flyttes. Kjorer hver oppstart slik at noder opprettet
        // med de gamle "Seksjon 1/2"-navnene ogsaa oppdateres.
        // TODO: "Enkel liste" (seksjon 3) mangler fortsatt — egen oppgave, henger sammen
        // med planlagt sidetre-/modulkatalog-restrukturering.
        foreach (var (alias, name) in new[] { ("seksjon1", "Fremhevet veiledning og artikler"), ("seksjon2", "Rik liste") })
        {
            var grp = ct.PropertyGroups.FirstOrDefault(g => g.Alias == alias);
            if (grp != null && grp.Name != name) { grp.Name = name; changed = true; }
        }
        foreach (var (alias, name) in new[]
        {
            ("seksjon1Tittel", "Tittel"), ("seksjon1Kort", "Kort"),
            ("seksjon2Tittel", "Tittel"), ("seksjon2Kort", "Kort"),
        })
        {
            var pt = ct.PropertyTypes.FirstOrDefault(x => x.Alias == alias);
            if (pt != null && pt.Name != name) { pt.Name = name; changed = true; }
        }
        // Verktøy-seksjonen er borte fra Figma — fjern fra eksisterende noder
        foreach (var alias in new[] { "verktoyTittel", "verktoyKort" })
        {
            if (ct.PropertyTypes.Any(p => p.Alias == alias))
            {
                ct.RemovePropertyType(alias);
                changed = true;
            }
        }
        var verktoyGroup = ct.PropertyGroups.FirstOrDefault(g => g.Alias == "verktoy");
        if (verktoyGroup != null && !verktoyGroup.PropertyTypes.Any())
        {
            ct.PropertyGroups.Remove("verktoy");
            changed = true;
        }
        // SEO
        if (!ct.PropertyGroups.Any(g => g.Alias == "seo"))
        {
            ct.AddPropertyGroup("seo", "SEO");
            ct.AddPropertyType(Prop("seoTittel", "SEO-tittel", _textStringDt, description: "Overstyr tittel i søkeresultater og sosiale medier"), "seo");
            ct.AddPropertyType(Prop("seoBeskrivelse", "SEO-beskrivelse", _textAreaDt, description: "Overstyr beskrivelse i søkeresultater og sosiale medier"), "seo");
            ct.AddPropertyType(Prop("seoBilde", "SEO-bilde", _mediaPickerDt, description: "Bilde som vises ved deling på sosiale medier"), "seo");
            changed = true;
        }

        // Remove veiledningOversikt from allowed children (only veiledningGuide stays)
        var guideType = _contentTypeService.Get("veiledningGuide");
        if (guideType != null)
        {
            var desired = new[] { new ContentTypeSort(guideType.Key, 0, guideType.Alias) };
            var currentAliases = ct.AllowedContentTypes?.Select(a => a.Alias).OrderBy(a => a).ToArray() ?? Array.Empty<string>();
            var wantAliases = new[] { "veiledningGuide" };
            if (!currentAliases.SequenceEqual(wantAliases))
            {
                ct.AllowedContentTypes = desired;
                changed = true;
            }
        }

        if (changed)
        {
            _contentTypeService.Save(ct);
            Console.WriteLine("ContentTypeComposer: Added oversikt fields to veiledninger container (no more separate Oversikt node)");
        }
    }

    private void MigrateVeiledningGuideAllowedChildren()
    {
        var guideType = _contentTypeService.Get("veiledningGuide");
        var stegType = _contentTypeService.Get("veiledningSteg");
        if (guideType == null || stegType == null) return;

        var current = guideType.AllowedContentTypes?.Select(a => a.Alias).ToList() ?? new List<string>();
        if (current.Contains("veiledningSteg")) return;

        var existing = guideType.AllowedContentTypes?.ToList() ?? new List<ContentTypeSort>();
        existing.Add(new ContentTypeSort(stegType.Key, existing.Count, stegType.Alias));
        guideType.AllowedContentTypes = existing;
        _contentTypeService.Save(guideType);
        Console.WriteLine("ContentTypeComposer: Allowed veiledningSteg under veiledningGuide");
    }

    private void MigrateForside()
    {
        var ct = _contentTypeService.Get("forside");
        if (ct == null) return;
        // Ferdig migrert: har seksjoner-feltet og ingen gamle flate felt igjen.
        if (ct.PropertyTypeExists("seksjoner") && !ct.PropertyTypeExists("heroOverskrift")) return;

        bool changed = false;

        // Forsiden er modularisert (block list). Fjern alle gamle flate felt: Hero, Tre råd,
        // Sandkasse, Veiledning, Aktuelt, Arrangement, Footer (flyttet til globaleInnstillinger),
        // Rekkefølge (erstattet av drag-og-slipp i block lista). Ingen innhold går tapt.
        var legacyFields = new[]
        {
            "heroOverskrift", "heroTekst", "heroBilde",
            "raadTittel", "tips",
            "sandkasseTittel", "sandkasseTekst", "sandkasseUrl",
            "veiledningOverskrift",
            "veiledning1Tittel", "veiledning1Beskrivelse", "veiledning1Url",
            "veiledning2Tittel", "veiledning2Beskrivelse", "veiledning2Url",
            "aktueltOverskrift", "aktueltLenkeTekst", "aktueltLenkeUrl",
            "arrangementOverskrift", "arrangementKommendeTekst", "arrangementAvholdteTekst",
            "footerTittel", "footerBeskrivelse", "footerSosialInstagram", "footerSosialLinkedin", "footerSosialX",
            "footerLenke1Tekst", "footerLenke1Url", "footerLenke2Tekst", "footerLenke2Url",
            "footerLenke3Tekst", "footerLenke3Url", "footerLenke4Tekst", "footerLenke4Url",
            "footerLenke5Tekst", "footerLenke5Url",
            "rekkefolgeVeiledning", "rekkefolgeAktuelt", "rekkefolgeTreRaad", "rekkefolgeSandkasse", "rekkefolgeArrangement",
        };
        foreach (var alias in legacyFields)
        {
            if (ct.PropertyTypeExists(alias))
            {
                ct.RemovePropertyType(alias);
                changed = true;
            }
        }

        // Fjern de tomme gamle gruppene (samme mønster som MigrateGlobaleInnstillinger).
        foreach (var groupAlias in new[] { "hero", "treRaad", "sandkassen", "veiledning", "aktuelt", "arrangement", "bunn", "rekkefolge" })
        {
            var grp = ct.PropertyGroups.FirstOrDefault(g => g.Alias == groupAlias);
            if (grp != null && !grp.PropertyTypes.Any())
            {
                ct.PropertyGroups.Remove(groupAlias);
                changed = true;
            }
        }

        // Legg til block-list-feltet hvis det mangler.
        if (!ct.PropertyTypeExists("seksjoner"))
        {
            if (!ct.PropertyGroups.Any(g => g.Alias == "innhold"))
                ct.AddPropertyGroup("innhold", "Innhold");
            ct.AddPropertyType(Prop("seksjoner", "Seksjoner", _blockListForsideDt, description: "Bygg opp forsiden ved å legge til moduler. Reorder ved drag og slipp."), "innhold");
            changed = true;
        }

        if (changed)
        {
            _contentTypeService.Save(ct);
            Console.WriteLine("ContentTypeComposer: Modulariserte forside (block list, fjernet gamle flate felt)");
        }
    }

    private void AddFooterFields(IContentType ct)
    {
        if (!ct.PropertyGroups.Any(g => g.Alias == "footer"))
            ct.AddPropertyGroup("footer", "Footer");
        ct.AddPropertyType(Prop("footerTittel", "Merkenavn", _textStringDt), "footer");
        ct.AddPropertyType(Prop("footerBeskrivelse", "Beskrivelse", _textAreaDt), "footer");
        ct.AddPropertyType(Prop("footerSosialInstagram", "Instagram-URL", _textStringDt), "footer");
        ct.AddPropertyType(Prop("footerSosialLinkedin", "LinkedIn-URL", _textStringDt), "footer");
        ct.AddPropertyType(Prop("footerSosialX", "X-URL", _textStringDt), "footer");
        ct.AddPropertyType(Prop("footerLenke1Tekst", "Lenke 1 tekst", _textStringDt), "footer");
        ct.AddPropertyType(Prop("footerLenke1Url", "Lenke 1 URL", _textStringDt), "footer");
        ct.AddPropertyType(Prop("footerLenke2Tekst", "Lenke 2 tekst", _textStringDt), "footer");
        ct.AddPropertyType(Prop("footerLenke2Url", "Lenke 2 URL", _textStringDt), "footer");
        ct.AddPropertyType(Prop("footerLenke3Tekst", "Lenke 3 tekst", _textStringDt), "footer");
        ct.AddPropertyType(Prop("footerLenke3Url", "Lenke 3 URL", _textStringDt), "footer");
        ct.AddPropertyType(Prop("footerLenke4Tekst", "Lenke 4 tekst", _textStringDt), "footer");
        ct.AddPropertyType(Prop("footerLenke4Url", "Lenke 4 URL", _textStringDt), "footer");
        ct.AddPropertyType(Prop("footerLenke5Tekst", "Lenke 5 tekst", _textStringDt), "footer");
        ct.AddPropertyType(Prop("footerLenke5Url", "Lenke 5 URL", _textStringDt), "footer");
    }

    private IContentType CreateGlobaleInnstillinger()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "globaleInnstillinger",
            Name = "Globale innstillinger",
            Description = "Globale tekster brukt på tvers av sidene (cookie-melding, feilsider). Ett node på rot.",
            Icon = "icon-settings",
            AllowedAsRoot = true,
        };

        ct.AddPropertyGroup("cookie", "Cookie-melding");
        ct.AddPropertyType(Prop("cookieTittel", "Tittel", _textStringDt, description: "Overskrift i cookie-banneret. Eks: 'Får vi samle informasjon om hvordan du bruker nettsiden?'"), "cookie");
        ct.AddPropertyType(Prop("cookieTekst", "Tekst", _richTextDt, description: "Hovedbeskrivelse i cookie-banneret. Vises under tittelen, over knappene."), "cookie");
        ct.AddPropertyType(Prop("cookieJaLabel", "Ja-knapp-tekst", _textStringDt, description: "Tekst på Ja-knappen. Klikker brukeren denne, lagrer vi informasjon for statistikk og analyse."), "cookie");
        ct.AddPropertyType(Prop("cookieNeiLabel", "Nei-knapp-tekst", _textStringDt, description: "Tekst på Nei-knappen. Klikker brukeren denne, lagres kun strengt nødvendig informasjon."), "cookie");
        ct.AddPropertyType(Prop("cookieSekundaerTekst", "Tekst under knappene", _richTextDt, description: "Lengre informasjonstekst under knappene (f.eks. om nødvendige cookies)."), "cookie");

        ct.AddPropertyGroup("feilsider", "Feilsider");
        ct.AddPropertyType(Prop("tittel404", "404 tittel", _textStringDt, description: "Vises som overskrift når en side ikke finnes."), "feilsider");
        ct.AddPropertyType(Prop("beskrivelse404", "404 beskrivelse", _textAreaDt, description: "Forklarende tekst på 404-siden."), "feilsider");
        ct.AddPropertyType(Prop("tittel503", "503 tittel", _textStringDt, description: "Vises som overskrift på vedlikeholdssiden."), "feilsider");
        ct.AddPropertyType(Prop("beskrivelse503", "503 beskrivelse", _textAreaDt, description: "Forklarende tekst på vedlikeholdssiden."), "feilsider");
        ct.AddPropertyType(Prop("vedlikeholdEpost", "Vedlikehold-e-post", _textStringDt, description: "Kontakt-e-post for hjelp under vedlikehold."), "feilsider");

        AddFooterFields(ct);

        _contentTypeService.Save(ct);
        return ct;
    }

    private void MigrateGlobaleInnstillinger()
    {
        var ct = _contentTypeService.Get("globaleInnstillinger");
        if (ct == null) return;

        bool changed = false;

        var legacyAliases = new[]
        {
            "kontaktTittel", "kontaktIngress",
            "kontaktTelefon", "kontaktTelefonLabel",
            "kontaktEpost", "kontaktEpostLabel",
            "cookieKnappLabel",
        };
        foreach (var alias in legacyAliases)
        {
            if (ct.PropertyTypes.Any(p => p.Alias == alias))
            {
                ct.RemovePropertyType(alias);
                changed = true;
            }
        }

        var kontaktGroup = ct.PropertyGroups.FirstOrDefault(g => g.Alias == "kontakt");
        if (kontaktGroup != null && !kontaktGroup.PropertyTypes.Any())
        {
            ct.PropertyGroups.Remove("kontakt");
            changed = true;
        }

        if (!ct.PropertyTypes.Any(p => p.Alias == "cookieTittel"))
        {
            ct.AddPropertyType(Prop("cookieTittel", "Tittel", _textStringDt, description: "Overskrift i cookie-banneret. Eks: 'Får vi samle informasjon om hvordan du bruker nettsiden?'"), "cookie");
            changed = true;
        }
        if (!ct.PropertyTypes.Any(p => p.Alias == "cookieJaLabel"))
        {
            ct.AddPropertyType(Prop("cookieJaLabel", "Ja-knapp-tekst", _textStringDt, description: "Tekst på Ja-knappen. Klikker brukeren denne, lagrer vi informasjon for statistikk og analyse."), "cookie");
            changed = true;
        }
        if (!ct.PropertyTypes.Any(p => p.Alias == "cookieNeiLabel"))
        {
            ct.AddPropertyType(Prop("cookieNeiLabel", "Nei-knapp-tekst", _textStringDt, description: "Tekst på Nei-knappen. Klikker brukeren denne, lagres kun strengt nødvendig informasjon."), "cookie");
            changed = true;
        }
        if (!ct.PropertyTypes.Any(p => p.Alias == "cookieSekundaerTekst"))
        {
            ct.AddPropertyType(Prop("cookieSekundaerTekst", "Tekst under knappene", _richTextDt, description: "Lengre informasjonstekst under knappene (f.eks. om nødvendige cookies)."), "cookie");
            changed = true;
        }

        // Footer flyttet hit fra forside (global, ikke forside-spesifikk).
        if (!ct.PropertyTypes.Any(p => p.Alias == "footerTittel"))
        {
            AddFooterFields(ct);
            changed = true;
        }

        if (ct.Description != "Globale tekster brukt på tvers av sidene (cookie-melding, footer, feilsider). Ett node på rot.")
        {
            ct.Description = "Globale tekster brukt på tvers av sidene (cookie-melding, footer, feilsider). Ett node på rot.";
            changed = true;
        }

        if (changed)
        {
            _contentTypeService.Save(ct);
            Console.WriteLine("ContentTypeComposer: Migrated globaleInnstillinger (removed kontakt-kort, expanded cookie fields)");
        }
    }

}
