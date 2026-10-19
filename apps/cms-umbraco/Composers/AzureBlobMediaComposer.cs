using Azure.Identity;
using Azure.Storage.Blobs;
using Microsoft.Extensions.Configuration;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.StorageProviders.AzureBlob.IO;

namespace KiNorge.Cms.Composers;

/// <summary>
/// Moves media to Azure Blob Storage in environments where a storage account is configured.
/// The pod authenticates with workload identity, the same mechanism as for Key Vault,
/// so ConnectionString is the account's endpoint URL and not a key.
/// </summary>
/// <remarks>
/// The registration is conditional. The provider's options are marked Required and validated,
/// so an empty ConnectionString would take down startup locally, where media is meant to live
/// on disk. The log says which backend is actually in use, so that wrong
/// configuration cannot go unnoticed the way it did for three months.
/// </remarks>
public class AzureBlobMediaComposer : IComposer
{
    public void Compose(IUmbracoBuilder builder)
    {
        var connectionString = builder.Config["Umbraco:Storage:AzureBlob:Media:ConnectionString"];
        var containerName = builder.Config["Umbraco:Storage:AzureBlob:Media:ContainerName"];

        if (string.IsNullOrWhiteSpace(connectionString))
        {
            Console.WriteLine("[Media] Storage: local file system (wwwroot/media)");
            return;
        }

        builder.AddAzureBlobMediaFileSystem(options =>
            options.TryCreateBlobContainerClientUsingUri(
                uri => new BlobContainerClient(uri, new DefaultAzureCredential())));

        Console.WriteLine($"[Media] Storage: Azure Blob {connectionString}/{containerName}");
    }
}
