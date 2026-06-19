using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace KiNorge.Cms.CachePurge.Cloudflare;

public class CloudflareCachePurgeService : ICloudflareCachePurgeService
{
    private readonly HttpClient _http;
    private readonly IOptionsMonitor<CloudflareOptions> _options;
    private readonly ILogger<CloudflareCachePurgeService> _logger;

    public CloudflareCachePurgeService(
        HttpClient http,
        IOptionsMonitor<CloudflareOptions> options,
        ILogger<CloudflareCachePurgeService> logger)
    {
        _http = http;
        _options = options;
        _logger = logger;
    }

    public async Task PurgeUrlsAsync(IReadOnlyCollection<string> absoluteUrls, CancellationToken ct = default)
    {
        CloudflareOptions opts = _options.CurrentValue;
        if (!IsConfigured(opts) || absoluteUrls.Count == 0) return;

        foreach (string[] batch in absoluteUrls.Chunk(Math.Max(1, opts.MaxUrlsPerRequest)))
        {
            await PostPurgeAsync(opts, new { files = batch }, ct);
        }
    }

    public async Task PurgeEverythingAsync(CancellationToken ct = default)
    {
        CloudflareOptions opts = _options.CurrentValue;
        if (!IsConfigured(opts)) return;
        await PostPurgeAsync(opts, new { purge_everything = true }, ct);
    }

    public async Task<CloudflarePurgeProbe> SelfTestAsync(CancellationToken ct = default)
    {
        CloudflareOptions opts = _options.CurrentValue;
        if (!IsConfigured(opts))
            return new CloudflarePurgeProbe(false, null, false, "Enabled/ApiToken/ZoneId mangler (ikke lastet)");

        string url = (opts.SiteBaseUrl?.TrimEnd('/') ?? "") + "/__cf-purge-selftest";
        try
        {
            using HttpRequestMessage request = new(
                HttpMethod.Post, $"client/v4/zones/{opts.ZoneId}/purge_cache")
            {
                Headers = { Authorization = new AuthenticationHeaderValue("Bearer", opts.ApiToken.Trim()) },
                Content = JsonContent.Create(new { files = new[] { url } }),
            };
            using HttpResponseMessage response = await _http.SendAsync(request, ct);
            string body = await response.Content.ReadAsStringAsync(ct);
            if (body.Length > 400) body = body[..400];
            return new CloudflarePurgeProbe(true, (int)response.StatusCode, response.IsSuccessStatusCode, body);
        }
        catch (Exception ex)
        {
            return new CloudflarePurgeProbe(true, null, false, ex.Message);
        }
    }

    private bool IsConfigured(CloudflareOptions opts)
    {
        if (opts.Enabled
            && !string.IsNullOrWhiteSpace(opts.ApiToken)
            && !string.IsNullOrWhiteSpace(opts.ZoneId))
        {
            return true;
        }

        _logger.LogDebug(
            "Cloudflare purge hoppet over — Enabled={Enabled}, ApiToken {TokenState}, ZoneId {ZoneState}",
            opts.Enabled,
            string.IsNullOrWhiteSpace(opts.ApiToken) ? "tom" : "satt",
            string.IsNullOrWhiteSpace(opts.ZoneId) ? "tom" : "satt");
        return false;
    }

    private async Task PostPurgeAsync(CloudflareOptions opts, object body, CancellationToken ct)
    {
        using HttpRequestMessage request = new(
            HttpMethod.Post, $"client/v4/zones/{opts.ZoneId}/purge_cache")
        {
            Headers = { Authorization = new AuthenticationHeaderValue("Bearer", opts.ApiToken.Trim()) },
            Content = JsonContent.Create(body),
        };

        using HttpResponseMessage response = await _http.SendAsync(request, ct);
        if (!response.IsSuccessStatusCode)
        {
            string detail = await response.Content.ReadAsStringAsync(ct);
            _logger.LogError(
                "Cloudflare purge_cache feilet for sone {ZoneId}: {Status} {Detail}",
                opts.ZoneId, (int)response.StatusCode, detail);
            response.EnsureSuccessStatusCode();
        }
    }
}
