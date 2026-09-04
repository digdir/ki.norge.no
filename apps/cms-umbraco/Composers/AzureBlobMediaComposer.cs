using Azure.Identity;
using Azure.Storage.Blobs;
using Microsoft.Extensions.Configuration;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.StorageProviders.AzureBlob.IO;

namespace KiNorge.Cms.Composers;

/// <summary>
/// Flytter media til Azure Blob Storage i miljø der en storage-konto er konfigurert.
/// Podden autentiserer med workload identity, samme mekanisme som mot Key Vault,
/// så ConnectionString er endepunkt-URL-en til kontoen og ikke en nøkkel.
/// </summary>
/// <remarks>
/// Registreringen er betinget. Providerens options er merket Required og valideres,
/// så en tom ConnectionString ville tatt ned oppstarten lokalt der media skal ligge
/// på disk. Loggen sier hvilken backend som faktisk er i bruk, slik at feil
/// konfigurasjon ikke kan gå upåaktet hen slik den gjorde i tre måneder.
/// </remarks>
public class AzureBlobMediaComposer : IComposer
{
    public void Compose(IUmbracoBuilder builder)
    {
        var connectionString = builder.Config["Umbraco:Storage:AzureBlob:Media:ConnectionString"];
        var containerName = builder.Config["Umbraco:Storage:AzureBlob:Media:ContainerName"];

        if (string.IsNullOrWhiteSpace(connectionString))
        {
            Console.WriteLine("[Media] Lagring: lokalt filsystem (wwwroot/media)");
            return;
        }

        builder.AddAzureBlobMediaFileSystem(options =>
            options.TryCreateBlobContainerClientUsingUri(
                uri => new BlobContainerClient(uri, new DefaultAzureCredential())));

        Console.WriteLine($"[Media] Lagring: Azure Blob {connectionString}/{containerName}");
    }
}
