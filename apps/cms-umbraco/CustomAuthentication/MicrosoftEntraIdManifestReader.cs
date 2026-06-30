using System.Text.Json.Nodes;
using Umbraco.Cms.Core.Manifest;
using Umbraco.Cms.Infrastructure.Manifest;

namespace KiNorge.Cms.CustomAuthentication;

/// <summary>
/// Leverer authProvider-manifestet (Microsoft-knappen på backoffice-login) via kode
/// i stedet for en statisk App_Plugins-fil. Registreres KUN av composeren når Entra-
/// konfig finnes, så uten secrets finnes ingen knapp og login-skjermen er helt som
/// standard (kun lokal pålogging). Det gjør artefakten trygg i prod uansett om
/// secrets er lagt i vaulten eller ikke.
/// </summary>
public class MicrosoftEntraIdManifestReader : IPackageManifestReader
{
    // Samme innhold som det gamle App_Plugins/ExternalLoginProviders/umbraco-package.json.
    // Parses som JsonNode så nøklene serialiseres ordrett (uavhengig av naming-policy).
    private const string ExtensionsJson = """
    [
      {
        "type": "authProvider",
        "alias": "Digdir.AuthProvider.MicrosoftEntraId",
        "name": "Microsoft Entra ID Auth Provider",
        "forProviderName": "Umbraco.MicrosoftEntraId",
        "meta": {
          "label": "Microsoft",
          "defaultView": { "icon": "icon-microsoft", "color": "default" },
          "behavior": { "autoRedirect": false },
          "linking": { "allowManualLinking": true }
        }
      }
    ]
    """;

    public Task<IEnumerable<PackageManifest>> ReadPackageManifestsAsync()
    {
        var extensions = ((JsonArray)JsonNode.Parse(ExtensionsJson)!)
            .Select(node => (object)node!.DeepClone())
            .ToArray();

        var manifest = new PackageManifest
        {
            Name = "Microsoft Entra ID Authentication",
            AllowPublicAccess = true,
            Extensions = extensions,
        };

        return Task.FromResult<IEnumerable<PackageManifest>>(new[] { manifest });
    }
}
