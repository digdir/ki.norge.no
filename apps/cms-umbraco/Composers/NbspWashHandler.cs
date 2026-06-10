using System.Text.RegularExpressions;
using Umbraco.Cms.Core;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Cms.Core.Events;
using Umbraco.Cms.Core.Notifications;

namespace KiNorge.Cms.Composers;

/// <summary>
/// Gjør alle non-breaking spaces (U+00A0) og literal nbsp-entiteter om til vanlige
/// mellomrom ved lagring. De snik seg inn ved innliming fra Word o.l. og gir fast
/// mellomrom som ikke bryter ved linjeskift, eller en synlig "&amp;nbsp;" når entiteten
/// limes inn som ren tekst. Treffer tekst- og RichText-felt direkte på en document type,
/// og alt nede i Block List / Block Grid (blank erstatning på blokk-JSON er trygt, fordi
/// nbsp bare opptrer i tekstinnhold, aldri i JSON- eller HTML-syntaks). Speiler mønsteret
/// til <see cref="UrlFieldWashHandler"/>.
///
/// Påvirker innhold som lagres etter at handleren er deployet. Eksisterende noder vaskes
/// først når de re-lagres. Frontend normaliserer uansett nbsp ved rendering, så publikum
/// ser ren tekst med en gang (se normalizeNbsp i frontend).
/// </summary>
public class NbspWashComposer : IComposer
{
    public void Compose(IUmbracoBuilder builder)
    {
        builder.AddNotificationHandler<ContentSavingNotification, NbspWashHandler>();
    }
}

public class NbspWashHandler : INotificationHandler<ContentSavingNotification>
{
    // U+00A0 og entitet-formene &nbsp; &#160; &#xA0; (med valgfrie ledende nuller) -> mellomrom.
    private static readonly Regex Nbsp =
        new("\u00A0|&nbsp;|&#0*160;|&#x0*A0;", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    // Felt-typer hvor nbsp realistisk dukker opp. Block List/Grid vaskes som hel JSON-streng.
    private static readonly HashSet<string> WashableEditors = new()
    {
        Constants.PropertyEditors.Aliases.RichText,
        Constants.PropertyEditors.Aliases.TextBox,
        Constants.PropertyEditors.Aliases.TextArea,
        Constants.PropertyEditors.Aliases.BlockList,
        Constants.PropertyEditors.Aliases.BlockGrid,
    };

    public void Handle(ContentSavingNotification notification)
    {
        foreach (var content in notification.SavedEntities)
        {
            foreach (var property in content.Properties)
            {
                if (!WashableEditors.Contains(property.PropertyType.PropertyEditorAlias)) continue;

                var cur = content.GetValue<string>(property.Alias);
                if (string.IsNullOrEmpty(cur)) continue;

                var washed = Nbsp.Replace(cur, " ");
                if (washed != cur) content.SetValue(property.Alias, washed);
            }
        }
    }
}
