# Kjac.HeadlessPreview (vendored)

Source copy of [Kjac.HeadlessPreview](https://github.com/kjac/Kjac.HeadlessPreview) 3.0.1
(commit `1a58b06`), MIT licensed, see `LICENSE`.

Why vendored: 3.0.1 targets Umbraco `[17, 18)`. On Umbraco 18 the NuGet DLL fails to load
(`TypeLoadException`), because it subclasses OpenAPI types that Umbraco 18 removed when it
moved from Swashbuckle to Microsoft.AspNetCore.OpenApi.

- C# source: compiled into `KiNorge.Cms`.
- Backoffice client: the prebuilt bundle from the 3.0.1 package, unchanged, in
  `App_Plugins/KjacHeadlessPreview/` (source maps left out).
- Only change: `Composers/Composer.cs` registers the API document with
  `AddBackOfficeOpenApiDocument` instead of SwaggerGen options and id handlers.

When Kjac ships a release for Umbraco 18, delete this folder and
`App_Plugins/KjacHeadlessPreview/`, and go back to the NuGet package.
