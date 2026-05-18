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
    private IDataType _blockListCaseDt = null!;
    private IDataType _blockListOmOssDt = null!;

    public ContentTypeComponent(
        IContentTypeService contentTypeService,
        IDataTypeService dataTypeService,
        IShortStringHelper shortStringHelper,
        IRuntimeState runtimeState,
        IConfigurationEditorJsonSerializer configSerializer,
        PropertyEditorCollection propertyEditors)
    {
        _contentTypeService = contentTypeService;
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

            CreateBlockListDataTypes();

            // Prosessteg container depends on _blockListProsessStegItemsDt being created above
            if (_contentTypeService.Get("artikkelProsessteg") == null)
                CreateArtikkelProsessStegElement();

            // After all element types are created, refresh the Artikkel block list to include
            // any modules that didn't exist when CreateBlockListDataTypes() ran.
            RefreshMultiBlockListAllowedModules("Block List - Artikkel Innhold", BaseArticleModules);

            // Refresh Case block list too
            RefreshMultiBlockListAllowedModules("Block List - Case Innhold", CaseModules);

            if (_contentTypeService.Get("merkelapp") == null)
                CreateMerkelapp();
            else
                MigrateMerkelapp();
            if (_contentTypeService.Get("artikkel") == null)
                CreateArtikkel();
            MigrateArtikkelType();
            if (_contentTypeService.Get("case") == null)
                CreateCase();
            else
                MigrateCaseType();
            if (_contentTypeService.Get("side") == null)
                CreateSide();

            IContentType? eksempel;
            if (_contentTypeService.Get("eksempel") == null)
                eksempel = CreateEksempel();
            else
                eksempel = _contentTypeService.Get("eksempel");

            if (_contentTypeService.Get("veiledningGuide") == null)
                CreateVeiledningGuide();
            MigrateVeiledningGuideStegtitler();
            if (_contentTypeService.Get("veiledningSteg") == null)
                CreateVeiledningSteg();
            if (_contentTypeService.Get("faq") == null)
                CreateFAQ();
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
            if (_contentTypeService.Get("veiledningOversikt") == null)
                CreateVeiledningOversikt();

            // Create container types if missing
            CreateContainerIfMissing("artikler", "Artikler", "icon-newspaper-alt", "artikkel");
            CreateContainerIfMissing("sider", "Sider", "icon-document", "side");
            // Lock sider container: existing Side children (kontakt, om-oss) stay,
            // but no new Side can be created. Editors must use specific content types.
            LockSiderContainer();
            CreateContainerIfMissing("eksempler", "Eksempler", "icon-science", "eksempel");
            // Caser is an editable overview page that ALSO holds case content as children.
            // Not a bare container — has fields for hero/intro on /caser.
            if (_contentTypeService.Get("caser") == null)
                CreateCaserOversikt();
            else
                MigrateCaserOversikt();
            if (_contentTypeService.Get("veiledninger") == null)
            {
                var guideType = _contentTypeService.Get("veiledningGuide");
                var oversiktType = _contentTypeService.Get("veiledningOversikt");
                if (guideType != null && oversiktType != null)
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
                        new ContentTypeSort(oversiktType.Key, 0, oversiktType.Alias),
                        new ContentTypeSort(guideType.Key, 1, guideType.Alias)
                    };
                    _contentTypeService.Save(ct);
                }
            }
            // Migration for existing veiledninger container: update name + allowed children + add oversikt fields
            MigrateVeiledningerContainer();
            // Migration for veiledningGuide: allow veiledningSteg as child (so steg can nest)
            MigrateVeiledningGuideAllowedChildren();
            // Add oversikt fields to veiledninger so editor edits the overview page directly on the container
            AddOversiktFieldsToVeiledninger();
            CreateContainerIfMissing("faqSamling", "Ofte stilte spørsmål", "icon-help-alt", "faq");
            // Migrate existing faqSamling container display name
            MigrateFaqSamlingName();
            CreateContainerIfMissing("merkelapper", "Merkelapper", "icon-tags", "merkelapp");

            if (_contentTypeService.Get("ordbokOppslag") == null)
                CreateOrdbokOppslag();
            CreateContainerIfMissing("ordbokSamling", "KI-ordbok", "icon-book-alt", "ordbokOppslag");

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
        var existing = _dataTypeService.GetByEditorAlias(Constants.PropertyEditors.Aliases.DropDownListFlexible)
            .FirstOrDefault(dt => dt.Name == "Artikkelhode Bakgrunn");
        if (existing != null) return existing;

        var editor = _propertyEditors[Constants.PropertyEditors.Aliases.DropDownListFlexible]
            ?? throw new InvalidOperationException("DropDownListFlexible editor not found");

        var dt = new DataType(editor, _configSerializer)
        {
            Name = "Artikkelhode Bakgrunn",
            DatabaseType = ValueStorageType.Nvarchar,
            EditorUiAlias = "Umb.PropertyEditorUi.Dropdown",
            ConfigurationData = new Dictionary<string, object>
            {
                ["items"] = new[] { "hvit", "lyseblaa" },
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
        _blockListCaseDt = CreateOrGetMultiBlockListDataType(
            "Block List - Case Innhold",
            CaseModules);
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
    // build CaseModules as BaseArticleModules.Concat(...).ToArray().

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

    private static readonly string[] CaseModules = BaseArticleModules;

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
    private static readonly List<List<List<string>>> RestrictedToolbar = new()
    {
        new()
        {
            new() { "Umb.Tiptap.Toolbar.Bold", "Umb.Tiptap.Toolbar.Italic" },
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

    private IContentType CreateMerkelapp()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "merkelapp",
            Name = "Merkelapp",
            Description = "Tag for kategorisering. Bare metadata — vises ikke som egen side.",
            Icon = "icon-tag",
            AllowedAsRoot = false,
        };
        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("navn", "Navn", _textStringDt, mandatory: true), "innhold");
        // Slug stays in DB for stable filter URLs (eks /artikler?tag=helse) but is hidden
        // from editor UI. Auto-generated from navn on save by MerkelappSavingHandler.
        ct.AddPropertyGroup("teknisk", "Teknisk (skjult)");
        ct.AddPropertyType(Prop("slug", "Slug", _textStringDt, description: "Auto-generert fra navn ved lagring."), "teknisk");
        _contentTypeService.Save(ct);
        return ct;
    }

    private void MigrateMerkelapp()
    {
        var ct = _contentTypeService.Get("merkelapp");
        if (ct == null) return;

        bool changed = false;

        // Remove beskrivelse field if present
        var beskrivelseProp = ct.PropertyTypes.FirstOrDefault(p => p.Alias == "beskrivelse");
        if (beskrivelseProp != null)
        {
            ct.RemovePropertyType("beskrivelse");
            changed = true;
        }

        var slugProp = ct.PropertyTypes.FirstOrDefault(p => p.Alias == "slug");
        if (slugProp != null && slugProp.Mandatory)
        {
            slugProp.Mandatory = false;
            slugProp.Description = "Auto-generert fra navn ved lagring.";
            changed = true;
        }

        if (ct.Description != "Tag for kategorisering. Bare metadata — vises ikke som egen side.")
        {
            ct.Description = "Tag for kategorisering. Bare metadata — vises ikke som egen side.";
            changed = true;
        }

        if (changed)
        {
            _contentTypeService.Save(ct);
            Console.WriteLine("ContentTypeComposer: Migrated Merkelapp (beskrivelse removed, slug auto)");
        }
    }

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
        ct.AddPropertyType(Prop("innhold", "Innhold", _blockListArtikkelDt, description: "Hovedinnhold", sortOrder: 10), "innhold");

        ct.AddPropertyGroup("seo", "SEO");
        ct.AddPropertyType(Prop("seoTittel", "SEO-tittel", _textStringDt, description: "Overstyr tittel i søkeresultater og sosiale medier"), "seo");
        ct.AddPropertyType(Prop("seoBeskrivelse", "SEO-beskrivelse", _textAreaDt, description: "Overstyr beskrivelse i søkeresultater og sosiale medier"), "seo");
        ct.AddPropertyType(Prop("seoBilde", "SEO-bilde", _mediaPickerDt, description: "Bilde som vises ved deling på sosiale medier"), "seo");
        _contentTypeService.Save(ct);
        return ct;
    }

    /// <summary>
    /// Case content type — structurally identical to artikkel for now, but with its own
    /// Block List data type so editors and developers can later add case-specific modules.
    /// </summary>
    private IContentType CreateCase()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "case",
            Name = "Case",
            Description = "Case-eksempler fra offentlig sektor",
            Icon = "icon-science",
            AllowedAsRoot = false,
        };
        ct.AddPropertyGroup("innhold", "Innhold");
        AddArtikkelhodeFields(ct);
        ct.AddPropertyType(Prop("innhold", "Innhold", _blockListCaseDt, description: "Hovedinnhold", sortOrder: 10), "innhold");

        ct.AddPropertyGroup("seo", "SEO");
        ct.AddPropertyType(Prop("seoTittel", "SEO-tittel", _textStringDt, description: "Overstyr tittel i søkeresultater og sosiale medier"), "seo");
        ct.AddPropertyType(Prop("seoBeskrivelse", "SEO-beskrivelse", _textAreaDt, description: "Overstyr beskrivelse i søkeresultater og sosiale medier"), "seo");
        ct.AddPropertyType(Prop("seoBilde", "SEO-bilde", _mediaPickerDt, description: "Bilde som vises ved deling på sosiale medier"), "seo");
        _contentTypeService.Save(ct);
        return ct;
    }

    private void MigrateCaseType()
    {
        var ct = _contentTypeService.Get("case");
        if (ct == null) return;

        bool changed = false;

        // Add Artikkelhode fields if missing (idempotent, in case of incremental schema changes)
        if (!ct.PropertyTypes.Any(p => p.Alias == "ingress"))
        {
            ct.AddPropertyType(Prop("ingress", "Ingress", _textAreaDt, mandatory: true), "innhold");
            changed = true;
        }
        if (!ct.PropertyTypes.Any(p => p.Alias == "artikkelBilde"))
        {
            ct.AddPropertyType(Prop("artikkelBilde", "Hovedbilde", _mediaPickerDt), "innhold");
            changed = true;
        }
        if (!ct.PropertyTypes.Any(p => p.Alias == "bildeAlt"))
        {
            ct.AddPropertyType(Prop("bildeAlt", "Alternativ tekst for bilde", _textStringDt), "innhold");
            changed = true;
        }
        if (!ct.PropertyTypes.Any(p => p.Alias == "bakgrunn"))
        {
            ct.AddPropertyType(Prop("bakgrunn", "Bakgrunn", _bakgrunnDropdownDt), "innhold");
            changed = true;
        }

        if (changed)
            _contentTypeService.Save(ct);
    }

    /// <summary>
    /// Adds the standard Artikkelhode field set (title, slug, ingress, image, alt, background)
    /// to a content type. Used by both artikkel and case so the editor experience is identical.
    /// </summary>
    private void AddArtikkelhodeFields(IContentType ct)
    {
        // Explicit sortOrder so the editor sees fields in the order content
        // appears on the page: tittel → slug → ingress → bilde → bildeAlt
        // → bakgrunn. Without sortOrder, Umbraco doesn't guarantee insertion
        // order and editors have reported ingress drifting down the form.
        ct.AddPropertyType(Prop("tittel", "Tittel", _textStringDt, mandatory: true, sortOrder: 1), "innhold");
        ct.AddPropertyType(Prop("slug", "Slug", _textStringDt, mandatory: true, description: "URL-vennlig identifikator. Genereres automatisk fra tittel hvis tom.", sortOrder: 2), "innhold");
        ct.AddPropertyType(Prop("ingress", "Ingress", _textAreaDt, mandatory: true, description: "Kort introduksjonstekst som vises under tittelen.", sortOrder: 3), "innhold");
        ct.AddPropertyType(Prop("artikkelBilde", "Hovedbilde", _mediaPickerDt, description: "Hovedbilde som vises ved siden av tittelen (eller under på mobil).", sortOrder: 4), "innhold");
        ct.AddPropertyType(Prop("bildeAlt", "Alternativ tekst for bilde", _textStringDt, description: "Beskriver bildet for skjermlesere. La stå tom hvis bildet kun er dekorativt.", sortOrder: 5), "innhold");
        ct.AddPropertyType(Prop("bakgrunn", "Bakgrunn", _bakgrunnDropdownDt, description: "Velg bakgrunnsfarge for artikkelhodet. Standard er hvit.", sortOrder: 6), "innhold");
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
        if (!ct.PropertyTypes.Any(p => p.Alias == "bakgrunn"))
        {
            ct.AddPropertyType(Prop("bakgrunn", "Bakgrunn", _bakgrunnDropdownDt, description: "Velg bakgrunnsfarge for artikkelhodet. Standard er hvit."), "innhold");
            changed = true;
        }

        if (changed)
            _contentTypeService.Save(ct);
    }

    private IContentType CreateSide()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "side",
            Name = "Side",
            Description = "Generelle sider",
            Icon = "icon-document",
            AllowedAsRoot = false,
        };
        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("tittel", "Tittel", _textStringDt, mandatory: true), "innhold");
        ct.AddPropertyType(Prop("slug", "Slug", _textStringDt, mandatory: true), "innhold");
        ct.AddPropertyType(Prop("innhold", "Innhold", _richTextDt), "innhold");

        ct.AddPropertyGroup("seo", "SEO");
        ct.AddPropertyType(Prop("template", "Mal", _textStringDt, description: "standard, bred, landingsside"), "seo");
        ct.AddPropertyType(Prop("seoTittel", "SEO-tittel", _textStringDt, description: "Overstyr tittel i søkeresultater og sosiale medier"), "seo");
        ct.AddPropertyType(Prop("seoBeskrivelse", "SEO-beskrivelse", _textAreaDt, description: "Overstyr beskrivelse i søkeresultater og sosiale medier"), "seo");
        ct.AddPropertyType(Prop("seoBilde", "SEO-bilde", _mediaPickerDt, description: "Bilde som vises ved deling på sosiale medier"), "seo");
        _contentTypeService.Save(ct);
        return ct;
    }

    private IContentType CreateEksempel()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "eksempel",
            Name = "Eksempel",
            Description = "Gode eksempler / caser",
            Icon = "icon-science",
            AllowedAsRoot = false,
        };
        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("tittel", "Tittel", _textStringDt, mandatory: true), "innhold");
        ct.AddPropertyType(Prop("slug", "Slug", _textStringDt, mandatory: true), "innhold");
        ct.AddPropertyType(Prop("organisasjon", "Organisasjon", _textStringDt), "innhold");
        ct.AddPropertyType(Prop("beskrivelse", "Beskrivelse", _richTextDt), "innhold");
        ct.AddPropertyType(Prop("verktoy", "Verktøy", _textAreaDt, description: "JSON array med verktøynavn"), "innhold");
        ct.AddPropertyType(Prop("resultater", "Resultater", _richTextDt), "innhold");
        ct.AddPropertyType(Prop("status", "Status", _textStringDt, description: "i_utvikling, pilot, i_drift, avsluttet"), "innhold");
        ct.AddPropertyType(Prop("bilde", "Bilde", _mediaPickerDt), "innhold");
        ct.AddPropertyType(Prop("merkelapper", "Merkelapper", _textAreaDt, description: "JSON array med merkelapp-slugs"), "innhold");
        ct.AddPropertyType(Prop("accordionSeksjoner", "Accordion-seksjoner", _blockListAccordionDt, description: "Trekkspill-seksjoner"), "innhold");

        ct.AddPropertyGroup("seo", "SEO");
        ct.AddPropertyType(Prop("seoTittel", "SEO-tittel", _textStringDt, description: "Overstyr tittel i søkeresultater og sosiale medier"), "seo");
        ct.AddPropertyType(Prop("seoBeskrivelse", "SEO-beskrivelse", _textAreaDt, description: "Overstyr beskrivelse i søkeresultater og sosiale medier"), "seo");
        ct.AddPropertyType(Prop("seoBilde", "SEO-bilde", _mediaPickerDt, description: "Bilde som vises ved deling på sosiale medier"), "seo");
        _contentTypeService.Save(ct);
        return ct;
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
        ct.AddPropertyType(Prop("tittel", "Tittel", _textStringDt, mandatory: true), "innhold");
        ct.AddPropertyType(Prop("slug", "Slug", _textStringDt, mandatory: true), "innhold");
        ct.AddPropertyType(Prop("introTekst", "Intro-tekst", _richTextDt), "innhold");
        ct.AddPropertyType(Prop("stegGruppeTittler", "Stegtitler", _textAreaDt, description: "Tittel per steg-gruppe, én per linje. Tom linje = bruk standard 'Steg N'. Rekkefølgen følger steg-nummeret (linje 1 = steg 1, osv.)."), "innhold");

        ct.AddPropertyGroup("seo", "SEO");
        ct.AddPropertyType(Prop("seoTittel", "SEO-tittel", _textStringDt), "seo");
        ct.AddPropertyType(Prop("seoBeskrivelse", "SEO-beskrivelse", _textAreaDt), "seo");
        ct.AddPropertyType(Prop("seoBilde", "SEO-bilde", _mediaPickerDt), "seo");
        _contentTypeService.Save(ct);
        return ct;
    }

    private void MigrateVeiledningGuideStegtitler()
    {
        var ct = _contentTypeService.Get("veiledningGuide");
        if (ct == null) return;
        if (ct.PropertyTypeExists("stegGruppeTittler")) return;

        ct.AddPropertyType(Prop("stegGruppeTittler", "Stegtitler", _textAreaDt, description: "Tittel per steg-gruppe, én per linje. Tom linje = bruk standard 'Steg N'. Rekkefølgen følger steg-nummeret (linje 1 = steg 1, osv.)."), "innhold");
        _contentTypeService.Save(ct);
        Console.WriteLine("ContentTypeComposer: Added stegGruppeTittler to veiledningGuide");
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
        ct.AddPropertyType(Prop("tittel", "Tittel", _textStringDt, mandatory: true), "innhold");
        ct.AddPropertyType(Prop("slug", "Slug", _textStringDt, mandatory: true), "innhold");
        ct.AddPropertyType(Prop("guideSlug", "Guide-slug", _textStringDt, mandatory: true, description: "Slug til overordnet guide"), "innhold");
        ct.AddPropertyType(Prop("steg", "Steg", _numericDt, mandatory: true, description: "Stegnummer (1, 2, 3...)"), "innhold");
        ct.AddPropertyType(Prop("understeg", "Understeg", _numericDt, mandatory: true, description: "Understeg-nummer (1, 2, 3...)"), "innhold");
        ct.AddPropertyType(Prop("innhold", "Innhold", _richTextDt, description: "Hovedinnhold"), "innhold");
        ct.AddPropertyType(Prop("infoKortTittel", "Infokort-tittel", _textStringDt, description: "Tittel på informasjonskort (valgfritt)"), "innhold");
        ct.AddPropertyType(Prop("infoKortInnhold", "Infokort-innhold", _richTextDt, description: "Innhold i informasjonskort (valgfritt)"), "innhold");
        ct.AddPropertyType(Prop("accordionSeksjoner", "Accordion-seksjoner", _blockListAccordionDt, description: "Trekkspill-seksjoner (valgfritt)"), "innhold");
        ct.AddPropertyType(Prop("eksempelTittel", "Eksempel-tittel", _textStringDt, description: "Tittel på eksempelkort (valgfritt)"), "innhold");
        ct.AddPropertyType(Prop("eksempelTekst", "Eksempel-tekst", _richTextDt, description: "Tekst i eksempelkort (valgfritt)"), "innhold");
        _contentTypeService.Save(ct);
        return ct;
    }

    private IContentType CreateFAQ()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "faq",
            Name = "FAQ",
            Description = "Ofte stilte spørsmål",
            Icon = "icon-help-alt",
            AllowedAsRoot = false,
        };
        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("sporsmal", "Spørsmål", _textStringDt, mandatory: true), "innhold");
        ct.AddPropertyType(Prop("svar", "Svar", _richTextDt), "innhold");
        ct.AddPropertyType(Prop("kategori", "Kategori", _contentPickerDt), "innhold");
        ct.AddPropertyType(Prop("rekkefolge", "Rekkefølge", _numericDt), "innhold");
        _contentTypeService.Save(ct);
        return ct;
    }

    private IContentType CreateOrdbokOppslag()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "ordbokOppslag",
            Name = "Ordbok-oppslag",
            Description = "Et begrep i KI-ordboka",
            Icon = "icon-book-alt",
            AllowedAsRoot = false,
        };
        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("term", "Term", _textStringDt, mandatory: true), "innhold");
        ct.AddPropertyType(Prop("alternativTerm", "Alternativt term (engelsk/alias)", _textStringDt), "innhold");
        ct.AddPropertyType(Prop("definisjon", "Definisjon", _textAreaDt, mandatory: true), "innhold");
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

        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("heroTittel", "Hero-tittel", _textStringDt), "innhold");
        ct.AddPropertyType(Prop("heroUndertittel", "Hero-undertittel", _textStringDt), "innhold");
        ct.AddPropertyType(Prop("introTekst", "Intro-tekst", _richTextDt), "innhold");
        ct.AddPropertyType(Prop("misjonTekst", "Misjonstekst", _richTextDt, description: "Tekst i den blå misjonsbanneren"), "innhold");
        ct.AddPropertyType(Prop("seksjoner", "Seksjoner", _blockListOmOssDt, description: "Drag og slipp for å endre rekkefølge på seksjoner."), "innhold");

        ct.AddPropertyGroup("seo", "SEO");
        ct.AddPropertyType(Prop("seoTittel", "SEO-tittel", _textStringDt, description: "Overstyr tittel i søkeresultater og sosiale medier"), "seo");
        ct.AddPropertyType(Prop("seoBeskrivelse", "SEO-beskrivelse", _textAreaDt, description: "Overstyr beskrivelse i søkeresultater og sosiale medier"), "seo");
        ct.AddPropertyType(Prop("seoBilde", "SEO-bilde", _mediaPickerDt, description: "Bilde som vises ved deling på sosiale medier"), "seo");

        // No allowed children — sections live as blocks on the page itself
        ct.AllowedContentTypes = Array.Empty<ContentTypeSort>();

        _contentTypeService.Save(ct);
        return ct;
    }

    private void MigrateOmOss()
    {
        var ct = _contentTypeService.Get("omOss");
        if (ct == null) return;

        bool changed = false;

        // Add misjonTekst if missing (legacy migration)
        if (!ct.PropertyTypeExists("misjonTekst"))
        {
            ct.AddPropertyType(Prop("misjonTekst", "Misjonstekst", _richTextDt, description: "Tekst i den blå misjonsbanneren"), "innhold");
            changed = true;
        }

        // Add seksjoner Block List if missing (Om Oss flatten)
        if (!ct.PropertyTypeExists("seksjoner"))
        {
            ct.AddPropertyType(Prop("seksjoner", "Seksjoner", _blockListOmOssDt, description: "Drag og slipp for å endre rekkefølge på seksjoner."), "innhold");
            changed = true;
        }

        // Remove omOssSeksjon from allowed children (sections move to blocks)
        if (ct.AllowedContentTypes != null && ct.AllowedContentTypes.Any())
        {
            ct.AllowedContentTypes = Array.Empty<ContentTypeSort>();
            changed = true;
        }

        if (changed)
            _contentTypeService.Save(ct);
    }

    private IContentType CreateSandkasse()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "sandkasse",
            Name = "Sandkasse",
            Description = "Sandkasse-siden. Skal kun finnes ett eksemplar, plassert under Sider.",
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
        var hodeFields = new[] { "tittel", "slug", "ingress", "artikkelBilde", "bildeAlt", "bakgrunn" };
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

        // Tab: Hero
        ct.AddPropertyGroup("hero", "Hero");
        ct.AddPropertyType(Prop("heroOverskrift", "Overskrift", _textStringDt), "hero");
        ct.AddPropertyType(Prop("heroTekst", "Tekst", _richTextDt), "hero");
        ct.AddPropertyType(Prop("heroBilde", "Bilde", _mediaPickerDt), "hero");

        // Tab: Tre råd
        ct.AddPropertyGroup("treRaad", "Tre råd");
        ct.AddPropertyType(Prop("raadTittel", "Tittel", _textStringDt), "treRaad");
        ct.AddPropertyType(Prop("tips", "Tips", _blockListTipsDt), "treRaad");

        // Tab: Sandkassen
        ct.AddPropertyGroup("sandkassen", "Sandkassen");
        ct.AddPropertyType(Prop("sandkasseTittel", "Tittel", _textStringDt), "sandkassen");
        ct.AddPropertyType(Prop("sandkasseTekst", "Tekst", _richTextDt), "sandkassen");
        ct.AddPropertyType(Prop("sandkasseUrl", "URL", _textStringDt), "sandkassen");

        // Tab: Veiledning
        ct.AddPropertyGroup("veiledning", "Veiledning");
        ct.AddPropertyType(Prop("veiledningOverskrift", "Overskrift", _textStringDt), "veiledning");
        ct.AddPropertyType(Prop("veiledning1Tittel", "Veiledning 1 Tittel", _textStringDt), "veiledning");
        ct.AddPropertyType(Prop("veiledning1Beskrivelse", "Veiledning 1 Beskrivelse", _textStringDt), "veiledning");
        ct.AddPropertyType(Prop("veiledning1Url", "Veiledning 1 URL", _textStringDt), "veiledning");
        ct.AddPropertyType(Prop("veiledning2Tittel", "Veiledning 2 Tittel", _textStringDt), "veiledning");
        ct.AddPropertyType(Prop("veiledning2Beskrivelse", "Veiledning 2 Beskrivelse", _textStringDt), "veiledning");
        ct.AddPropertyType(Prop("veiledning2Url", "Veiledning 2 URL", _textStringDt), "veiledning");

        // Tab: Aktuelt
        ct.AddPropertyGroup("aktuelt", "Aktuelt");
        ct.AddPropertyType(Prop("aktueltOverskrift", "Overskrift", _textStringDt), "aktuelt");
        ct.AddPropertyType(Prop("aktueltLenkeTekst", "Lenketekst", _textStringDt), "aktuelt");
        ct.AddPropertyType(Prop("aktueltLenkeUrl", "Lenke-URL", _textStringDt), "aktuelt");

        // Tab: Arrangement
        ct.AddPropertyGroup("arrangement", "Arrangement");
        ct.AddPropertyType(Prop("arrangementOverskrift", "Overskrift", _textStringDt), "arrangement");
        ct.AddPropertyType(Prop("arrangementKommendeTekst", "Kommende tekst", _textStringDt), "arrangement");
        ct.AddPropertyType(Prop("arrangementAvholdteTekst", "Avholdte tekst", _textStringDt), "arrangement");

        // Tab: Bunn (Footer)
        ct.AddPropertyGroup("bunn", "Bunn (Footer)");
        ct.AddPropertyType(Prop("footerTittel", "Merkenavn", _textStringDt), "bunn");
        ct.AddPropertyType(Prop("footerBeskrivelse", "Beskrivelse", _textAreaDt), "bunn");
        ct.AddPropertyType(Prop("footerSosialInstagram", "Instagram", _textStringDt, description: "URL til Instagram-profil"), "bunn");
        ct.AddPropertyType(Prop("footerSosialLinkedin", "LinkedIn", _textStringDt, description: "URL til LinkedIn-profil"), "bunn");
        ct.AddPropertyType(Prop("footerSosialX", "X", _textStringDt, description: "URL til X-profil"), "bunn");
        ct.AddPropertyType(Prop("footerLenke1Tekst", "Lenke 1 tekst", _textStringDt), "bunn");
        ct.AddPropertyType(Prop("footerLenke1Url", "Lenke 1 URL", _textStringDt), "bunn");
        ct.AddPropertyType(Prop("footerLenke2Tekst", "Lenke 2 tekst", _textStringDt), "bunn");
        ct.AddPropertyType(Prop("footerLenke2Url", "Lenke 2 URL", _textStringDt), "bunn");
        ct.AddPropertyType(Prop("footerLenke3Tekst", "Lenke 3 tekst", _textStringDt), "bunn");
        ct.AddPropertyType(Prop("footerLenke3Url", "Lenke 3 URL", _textStringDt), "bunn");
        ct.AddPropertyType(Prop("footerLenke4Tekst", "Lenke 4 tekst", _textStringDt), "bunn");
        ct.AddPropertyType(Prop("footerLenke4Url", "Lenke 4 URL", _textStringDt), "bunn");
        ct.AddPropertyType(Prop("footerLenke5Tekst", "Lenke 5 tekst", _textStringDt), "bunn");
        ct.AddPropertyType(Prop("footerLenke5Url", "Lenke 5 URL", _textStringDt), "bunn");

        // Tab: Rekkefølge (Order)
        ct.AddPropertyGroup("rekkefolge", "Rekkefølge");
        ct.AddPropertyType(Prop("rekkefolgeVeiledning", "Veiledning", _numericDt, description: "Rekkefølge for Veiledning-seksjonen (1-5)"), "rekkefolge");
        ct.AddPropertyType(Prop("rekkefolgeAktuelt", "Aktuelt", _numericDt, description: "Rekkefølge for Aktuelt-seksjonen (1-5)"), "rekkefolge");
        ct.AddPropertyType(Prop("rekkefolgeTreRaad", "Tre råd", _numericDt, description: "Rekkefølge for Tre råd-seksjonen (1-5)"), "rekkefolge");
        ct.AddPropertyType(Prop("rekkefolgeSandkasse", "Sandkasse", _numericDt, description: "Rekkefølge for Sandkasse-seksjonen (1-5)"), "rekkefolge");
        ct.AddPropertyType(Prop("rekkefolgeArrangement", "Arrangement", _numericDt, description: "Rekkefølge for Arrangement-seksjonen (1-5)"), "rekkefolge");

        // Tab: SEO
        ct.AddPropertyGroup("seo", "SEO");
        ct.AddPropertyType(Prop("seoTittel", "SEO-tittel", _textStringDt, description: "Overstyr tittel i søkeresultater og sosiale medier"), "seo");
        ct.AddPropertyType(Prop("seoBeskrivelse", "SEO-beskrivelse", _textAreaDt, description: "Overstyr beskrivelse i søkeresultater og sosiale medier"), "seo");
        ct.AddPropertyType(Prop("seoBilde", "SEO-bilde", _mediaPickerDt, description: "Bilde som vises ved deling på sosiale medier"), "seo");

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

    private IContentType CreateVeiledningOversikt()
    {
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "veiledningOversikt",
            Name = "Veiledning Oversikt",
            Description = "Oversiktsside for veiledning",
            Icon = "icon-book-alt",
            AllowedAsRoot = true,
        };

        // Tab: Hero
        ct.AddPropertyGroup("hero", "Hero");
        ct.AddPropertyType(Prop("heroLabel", "Hero-label", _textStringDt), "hero");
        ct.AddPropertyType(Prop("heroTittel", "Hero-tittel", _textStringDt), "hero");
        ct.AddPropertyType(Prop("heroTekst", "Hero-tekst", _textStringDt), "hero");
        ct.AddPropertyType(Prop("heroBilde", "Hero-bilde", _mediaPickerDt), "hero");

        // Tab: Seksjon 1
        ct.AddPropertyGroup("seksjon1", "Seksjon 1");
        ct.AddPropertyType(Prop("seksjon1Tittel", "Seksjon 1 tittel", _textStringDt), "seksjon1");
        ct.AddPropertyType(Prop("seksjon1Kort", "Seksjon 1 kort", _blockListVeiledningKortDt), "seksjon1");

        // Tab: Seksjon 2
        ct.AddPropertyGroup("seksjon2", "Seksjon 2");
        ct.AddPropertyType(Prop("seksjon2Tittel", "Seksjon 2 tittel", _textStringDt), "seksjon2");
        ct.AddPropertyType(Prop("seksjon2Kort", "Seksjon 2 kort", _blockListVeiledningKortDt), "seksjon2");

        // Tab: Verktøy
        ct.AddPropertyGroup("verktoy", "Verktøy");
        ct.AddPropertyType(Prop("verktoyTittel", "Verktøy tittel", _textStringDt), "verktoy");
        ct.AddPropertyType(Prop("verktoyKort", "Verktøy kort", _blockListVerktoyKortDt), "verktoy");

        // Tab: SEO
        ct.AddPropertyGroup("seo", "SEO");
        ct.AddPropertyType(Prop("seoTittel", "SEO-tittel", _textStringDt, description: "Overstyr tittel i søkeresultater og sosiale medier"), "seo");
        ct.AddPropertyType(Prop("seoBeskrivelse", "SEO-beskrivelse", _textAreaDt, description: "Overstyr beskrivelse i søkeresultater og sosiale medier"), "seo");
        ct.AddPropertyType(Prop("seoBilde", "SEO-bilde", _mediaPickerDt, description: "Bilde som vises ved deling på sosiale medier"), "seo");

        _contentTypeService.Save(ct);
        return ct;
    }

    /// <summary>
    /// Removes "side" from the sider container's AllowedContentTypes so editors
    /// can't create new Side pages. Existing Side content stays untouched.
    /// </summary>
    /// <summary>
    /// Creates the Caser overview content type — editable page that also holds case children.
    /// Editor clicks "Caser" in tree → sees a form for the overview page heading and lead.
    /// Frontend /caser/index.astro reads these fields.
    /// </summary>
    private IContentType CreateCaserOversikt()
    {
        var caseType = _contentTypeService.Get("case");
        var ct = new ContentType(_shortStringHelper, -1)
        {
            Alias = "caser",
            Name = "Caser",
            Description = "Oversiktsside for caser. Redigerbart hode + case-barn under.",
            Icon = "icon-science",
            AllowedAsRoot = true,
        };
        ct.AddPropertyGroup("innhold", "Innhold");
        ct.AddPropertyType(Prop("heroTittel", "Tittel", _textStringDt, mandatory: true, description: "Vises som overskrift på /caser"), "innhold");
        ct.AddPropertyType(Prop("heroIngress", "Ingress", _textAreaDt, description: "Kort introduksjonstekst under tittelen på /caser"), "innhold");

        ct.AddPropertyGroup("seo", "SEO");
        ct.AddPropertyType(Prop("seoTittel", "SEO-tittel", _textStringDt, description: "Overstyr tittel i søkeresultater og sosiale medier"), "seo");
        ct.AddPropertyType(Prop("seoBeskrivelse", "SEO-beskrivelse", _textAreaDt, description: "Overstyr beskrivelse i søkeresultater og sosiale medier"), "seo");
        ct.AddPropertyType(Prop("seoBilde", "SEO-bilde", _mediaPickerDt, description: "Bilde som vises ved deling på sosiale medier"), "seo");

        if (caseType != null)
        {
            ct.AllowedContentTypes = new[]
            {
                new ContentTypeSort(caseType.Key, 0, caseType.Alias)
            };
        }

        _contentTypeService.Save(ct);
        return ct;
    }

    /// <summary>
    /// Migrates existing bare 'caser' container to editable overview page by adding fields.
    /// Idempotent.
    /// </summary>
    private void MigrateCaserOversikt()
    {
        var ct = _contentTypeService.Get("caser");
        if (ct == null) return;

        bool changed = false;

        if (ct.Description != "Oversiktsside for caser. Redigerbart hode + case-barn under.")
        {
            ct.Description = "Oversiktsside for caser. Redigerbart hode + case-barn under.";
            changed = true;
        }

        if (!ct.PropertyTypeExists("heroTittel"))
        {
            if (!ct.PropertyGroups.Any(g => g.Alias == "innhold"))
                ct.AddPropertyGroup("innhold", "Innhold");
            ct.AddPropertyType(Prop("heroTittel", "Tittel", _textStringDt, mandatory: false, description: "Vises som overskrift på /caser"), "innhold");
            changed = true;
        }
        if (!ct.PropertyTypeExists("heroIngress"))
        {
            ct.AddPropertyType(Prop("heroIngress", "Ingress", _textAreaDt, description: "Kort introduksjonstekst under tittelen på /caser"), "innhold");
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
            Console.WriteLine("ContentTypeComposer: Migrated caser to editable overview page");
        }
    }

    private void MigrateFaqSamlingName()
    {
        var ct = _contentTypeService.Get("faqSamling");
        if (ct == null) return;
        if (ct.Name == "Ofte stilte spørsmål") return;
        ct.Name = "Ofte stilte spørsmål";
        _contentTypeService.Save(ct);
        Console.WriteLine("ContentTypeComposer: Renamed faqSamling to 'Ofte stilte spørsmål'");
    }

    /// <summary>
    /// Sider is a catch-all FOLDER for static pages — purely organizational, no rendering of its own.
    /// Allows ALL existing content types as children EXCEPT:
    ///   - "side" (legacy generic page type — no new ones should be created; existing kontakt stays)
    ///   - "merkelapp" (lives in its own Merkelapper container)
    ///   - "case", "artikkel", "ordbokOppslag", "veiledningGuide", "veiledningSteg", "faq" (children
    ///     of their own containers)
    ///   - "forside" (always lives at root, top of tree)
    ///   - container types themselves
    /// Result: editor can drag Om Oss, Sandkasse, KI-ordbok (the page) into Sider freely.
    /// New "side" content can never be created.
    /// </summary>
    private void LockSiderContainer()
    {
        var ct = _contentTypeService.Get("sider");
        if (ct == null) return;

        // Excluded: types that should not live under Sider
        var excluded = new HashSet<string>
        {
            "side",            // legacy — no new generic Side pages
            "merkelapp",       // tag, not a page
            "case",            // child of caser
            "artikkel",        // child of artikler
            "eksempel",        // legacy
            "ordbokOppslag",   // child of ordbokSamling
            "veiledningGuide", // child of veiledninger
            "veiledningSteg",  // child of veiledningGuide
            "faq",             // child of faqSamling
            "forside",         // always at root
            // Containers themselves (sider can't contain other containers)
            "sider", "artikler", "caser", "eksempler", "veiledninger",
            "faqSamling", "merkelapper", "ordbokSamling", "tilgjengeligeIkoner",
            // Block list element types
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

        // Update allowed children: oversikt + guide (steg goes under guide, not in container)
        var oversiktType = _contentTypeService.Get("veiledningOversikt");
        var guideType = _contentTypeService.Get("veiledningGuide");
        if (oversiktType != null && guideType != null)
        {
            var desired = new[]
            {
                new ContentTypeSort(oversiktType.Key, 0, oversiktType.Alias),
                new ContentTypeSort(guideType.Key, 1, guideType.Alias)
            };
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
        // Seksjon 1
        if (!ct.PropertyGroups.Any(g => g.Alias == "seksjon1"))
        {
            ct.AddPropertyGroup("seksjon1", "Seksjon 1");
            ct.AddPropertyType(Prop("seksjon1Tittel", "Seksjon 1 tittel", _textStringDt), "seksjon1");
            ct.AddPropertyType(Prop("seksjon1Kort", "Seksjon 1 kort", _blockListVeiledningKortDt), "seksjon1");
            changed = true;
        }
        // Seksjon 2
        if (!ct.PropertyGroups.Any(g => g.Alias == "seksjon2"))
        {
            ct.AddPropertyGroup("seksjon2", "Seksjon 2");
            ct.AddPropertyType(Prop("seksjon2Tittel", "Seksjon 2 tittel", _textStringDt), "seksjon2");
            ct.AddPropertyType(Prop("seksjon2Kort", "Seksjon 2 kort", _blockListVeiledningKortDt), "seksjon2");
            changed = true;
        }
        // Verktøy
        if (!ct.PropertyGroups.Any(g => g.Alias == "verktoy"))
        {
            ct.AddPropertyGroup("verktoy", "Verktøy");
            ct.AddPropertyType(Prop("verktoyTittel", "Verktøy tittel", _textStringDt), "verktoy");
            ct.AddPropertyType(Prop("verktoyKort", "Verktøy kort", _blockListVerktoyKortDt), "verktoy");
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
        if (ct.PropertyTypeExists("veiledningOverskrift")) return; // already migrated

        // Tab: Veiledning
        ct.AddPropertyGroup("veiledning", "Veiledning");
        ct.AddPropertyType(Prop("veiledningOverskrift", "Overskrift", _textStringDt), "veiledning");
        ct.AddPropertyType(Prop("veiledning1Tittel", "Veiledning 1 Tittel", _textStringDt), "veiledning");
        ct.AddPropertyType(Prop("veiledning1Beskrivelse", "Veiledning 1 Beskrivelse", _textStringDt), "veiledning");
        ct.AddPropertyType(Prop("veiledning1Url", "Veiledning 1 URL", _textStringDt), "veiledning");
        ct.AddPropertyType(Prop("veiledning2Tittel", "Veiledning 2 Tittel", _textStringDt), "veiledning");
        ct.AddPropertyType(Prop("veiledning2Beskrivelse", "Veiledning 2 Beskrivelse", _textStringDt), "veiledning");
        ct.AddPropertyType(Prop("veiledning2Url", "Veiledning 2 URL", _textStringDt), "veiledning");

        // Tab: Aktuelt
        ct.AddPropertyGroup("aktuelt", "Aktuelt");
        ct.AddPropertyType(Prop("aktueltOverskrift", "Overskrift", _textStringDt), "aktuelt");
        ct.AddPropertyType(Prop("aktueltLenkeTekst", "Lenketekst", _textStringDt), "aktuelt");
        ct.AddPropertyType(Prop("aktueltLenkeUrl", "Lenke-URL", _textStringDt), "aktuelt");

        // Tab: Arrangement
        ct.AddPropertyGroup("arrangement", "Arrangement");
        ct.AddPropertyType(Prop("arrangementOverskrift", "Overskrift", _textStringDt), "arrangement");
        ct.AddPropertyType(Prop("arrangementKommendeTekst", "Kommende tekst", _textStringDt), "arrangement");
        ct.AddPropertyType(Prop("arrangementAvholdteTekst", "Avholdte tekst", _textStringDt), "arrangement");

        _contentTypeService.Save(ct);

        // Migrate footer fields
        if (!ct.PropertyTypeExists("footerTittel"))
        {
            ct.AddPropertyGroup("bunn", "Bunn (Footer)");
            ct.AddPropertyType(Prop("footerTittel", "Merkenavn", _textStringDt), "bunn");
            ct.AddPropertyType(Prop("footerBeskrivelse", "Beskrivelse", _textAreaDt), "bunn");
            ct.AddPropertyType(Prop("footerSosialInstagram", "Instagram", _textStringDt, description: "URL til Instagram-profil"), "bunn");
            ct.AddPropertyType(Prop("footerSosialLinkedin", "LinkedIn", _textStringDt, description: "URL til LinkedIn-profil"), "bunn");
            ct.AddPropertyType(Prop("footerSosialX", "X", _textStringDt, description: "URL til X-profil"), "bunn");
            ct.AddPropertyType(Prop("footerLenke1Tekst", "Lenke 1 tekst", _textStringDt), "bunn");
            ct.AddPropertyType(Prop("footerLenke1Url", "Lenke 1 URL", _textStringDt), "bunn");
            ct.AddPropertyType(Prop("footerLenke2Tekst", "Lenke 2 tekst", _textStringDt), "bunn");
            ct.AddPropertyType(Prop("footerLenke2Url", "Lenke 2 URL", _textStringDt), "bunn");
            ct.AddPropertyType(Prop("footerLenke3Tekst", "Lenke 3 tekst", _textStringDt), "bunn");
            ct.AddPropertyType(Prop("footerLenke3Url", "Lenke 3 URL", _textStringDt), "bunn");
            ct.AddPropertyType(Prop("footerLenke4Tekst", "Lenke 4 tekst", _textStringDt), "bunn");
            ct.AddPropertyType(Prop("footerLenke4Url", "Lenke 4 URL", _textStringDt), "bunn");
            ct.AddPropertyType(Prop("footerLenke5Tekst", "Lenke 5 tekst", _textStringDt), "bunn");
            ct.AddPropertyType(Prop("footerLenke5Url", "Lenke 5 URL", _textStringDt), "bunn");
            _contentTypeService.Save(ct);
        }

        // Migrate reorder fields
        if (!ct.PropertyTypeExists("rekkefolgeVeiledning"))
        {
            ct.AddPropertyGroup("rekkefolge", "Rekkefølge");
            ct.AddPropertyType(Prop("rekkefolgeVeiledning", "Veiledning", _numericDt, description: "Rekkefølge for Veiledning-seksjonen (1-5)"), "rekkefolge");
            ct.AddPropertyType(Prop("rekkefolgeAktuelt", "Aktuelt", _numericDt, description: "Rekkefølge for Aktuelt-seksjonen (1-5)"), "rekkefolge");
            ct.AddPropertyType(Prop("rekkefolgeTreRaad", "Tre råd", _numericDt, description: "Rekkefølge for Tre råd-seksjonen (1-5)"), "rekkefolge");
            ct.AddPropertyType(Prop("rekkefolgeSandkasse", "Sandkasse", _numericDt, description: "Rekkefølge for Sandkasse-seksjonen (1-5)"), "rekkefolge");
            ct.AddPropertyType(Prop("rekkefolgeArrangement", "Arrangement", _numericDt, description: "Rekkefølge for Arrangement-seksjonen (1-5)"), "rekkefolge");
            _contentTypeService.Save(ct);
        }
    }
}
