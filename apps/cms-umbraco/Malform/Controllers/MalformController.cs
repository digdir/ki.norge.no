using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Umbraco.Cms.Api.Management.Controllers;
using Umbraco.Cms.Api.Management.Routing;
using Umbraco.Cms.Web.Common.Authorization;

namespace KiNorge.Cms.Malform.Controllers;

/// <summary>
/// The målform distribution for all published content. Reads on every call, since
/// the analysis takes milliseconds at this amount of content.
/// </summary>
[ApiVersion("1.0")]
[VersionedApiBackOfficeRoute("malform")]
[ApiExplorerSettings(GroupName = "Malform")]
[Authorize(Policy = AuthorizationPolicies.SectionAccessContent)]
public class MalformController : ManagementApiControllerBase
{
    private readonly MalformReportBuilder _builder;

    public MalformController(MalformReportBuilder builder)
    {
        _builder = builder;
    }

    [HttpGet]
    [MapToApiVersion("1.0")]
    [ProducesResponseType(typeof(MalformRapport), StatusCodes.Status200OK)]
    [EndpointSummary("Share of nynorsk in published content.")]
    [EndpointDescription("Classifies each published node as nynorsk or bokmål and sums up the share measured in characters and in pages, with how much is missing to meet the 25 percent requirement.")]
    public IActionResult Rapport() => Ok(_builder.Bygg());
}
