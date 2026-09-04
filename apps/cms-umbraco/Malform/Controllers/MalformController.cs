using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Umbraco.Cms.Api.Management.Controllers;
using Umbraco.Cms.Api.Management.Routing;
using Umbraco.Cms.Web.Common.Authorization;

namespace KiNorge.Cms.Malform.Controllers;

/// <summary>
/// Målformfordelingen for alt publisert innhold. Leser for hvert kall, siden
/// analysen tar millisekunder på denne innholdsmengden.
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
    [EndpointSummary("Andel nynorsk i publisert innhold.")]
    [EndpointDescription("Klassifiserer hver publiserte node som nynorsk eller bokmål og summerer andelen målt i tegn og i sider, med hvor mye som mangler for å nå kravet på 25 prosent.")]
    public IActionResult Rapport() => Ok(_builder.Bygg());
}
