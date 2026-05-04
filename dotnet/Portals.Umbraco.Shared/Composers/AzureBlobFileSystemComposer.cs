using Azure.Identity;
using Azure.Storage.Blobs;
using Microsoft.Extensions.Configuration;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.StorageProviders.AzureBlob.IO;

namespace Portals.Shared.Composers;

public class AzureBlobFileSystemComposer : IComposer
{
    public void Compose(IUmbracoBuilder builder)
    {
        var connectionString = builder.Config["Umbraco:Storage:AzureBlob:Media:ConnectionString"];
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            return;
        }

        builder.AddAzureBlobMediaFileSystem(options =>
        {
            options.TryCreateBlobContainerClientUsingUri(uri =>
                new BlobContainerClient(uri, new DefaultAzureCredential()));
        })
        .AddAzureBlobImageSharpCache();
    }
}
