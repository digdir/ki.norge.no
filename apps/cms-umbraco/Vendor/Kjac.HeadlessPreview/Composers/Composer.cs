using Kjac.HeadlessPreview.Models.Configuration;
using Kjac.HeadlessPreview.Services;
using Microsoft.Extensions.DependencyInjection;
using Umbraco.Cms.Api.Common.OpenApi;
using Umbraco.Cms.Api.Management.OpenApi;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Extensions;

namespace Kjac.HeadlessPreview.Composers
{
    // Patched for Umbraco 18 (see ../README.md). Umbraco 18 replaced Swashbuckle with
    // Microsoft.AspNetCore.OpenApi, so the 3.0.1 SwaggerGen options, security filter and the
    // ISchemaIdHandler/IOperationIdHandler subclasses are replaced by AddBackOfficeOpenApiDocument,
    // which applies Umbraco's operation ids, schema ids and backoffice auth to the document.
    public sealed class Composer : IComposer
    {
        public void Compose(IUmbracoBuilder builder)
        {
            builder.AddBackOfficeOpenApiDocument(
                Constants.ApiName,
                document => document
                    .WithTitle("Headless Preview API")
                    .WithBackOfficeAuthentication());

            builder.Services.AddUnique<IDocumentPreviewService, NoopDocumentPreviewService>();
            builder.Services.AddUnique<IDocumentTypePreviewService, ConfigurableDocumentTypePreviewService>();
            builder.Services.Configure<HeadlessPreviewConfiguration>(
                builder.Config.GetSection(nameof(HeadlessPreview))
            );
        }
    }
}
