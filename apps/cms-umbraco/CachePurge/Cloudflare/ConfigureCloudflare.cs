using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace KiNorge.Cms.CachePurge.Cloudflare;

public static class ConfigureCloudflare
{
    public static IServiceCollection AddCloudflareCachePurge(
        this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<CloudflareOptions>(configuration.GetSection("Cloudflare"));

        services.AddHttpClient<ICloudflareCachePurgeService, CloudflareCachePurgeService>((sp, http) =>
        {
            CloudflareOptions opts = sp.GetRequiredService<IOptions<CloudflareOptions>>().Value;
            string host = string.IsNullOrWhiteSpace(opts.ApiHost) ? "api.cloudflare.com" : opts.ApiHost;
            http.BaseAddress = new Uri($"https://{host}/");
            http.Timeout = TimeSpan.FromSeconds(opts.TimeoutSeconds > 0 ? opts.TimeoutSeconds : 5);
        });

        return services;
    }
}
