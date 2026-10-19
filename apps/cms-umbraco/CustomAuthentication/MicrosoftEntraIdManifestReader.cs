using System.Text.Json.Nodes;
using Umbraco.Cms.Core.Manifest;
using Umbraco.Cms.Infrastructure.Manifest;

namespace KiNorge.Cms.CustomAuthentication;

/// <summary>
/// Delivers the authProvider manifest (the Microsoft button on the backoffice login) via code
/// instead of a static App_Plugins file. Registered ONLY by the composer when Entra
/// config exists, so without secrets there is no button and the login screen is exactly
/// the default (local sign-in only). That makes the artifact safe in prod whether or not
/// the secrets have been added to the vault.
/// </summary>
public class MicrosoftEntraIdManifestReader : IPackageManifestReader
{
    // Same content as the old App_Plugins/ExternalLoginProviders/umbraco-package.json.
    // Parsed as JsonNode so the keys are serialized verbatim (regardless of naming policy).
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
