using Azure.Identity;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

namespace Portals.Shared.Configuration;

public static class KeyVaultConfigurationExtensions
{
    public static IConfigurationBuilder AddPortalsKeyVault(
        this IConfigurationBuilder configuration,
        IConfiguration source,
        IHostEnvironment environment)
    {
        KeyVaultOptions options = source
            .GetSection(KeyVaultOptions.SectionName)
            .Get<KeyVaultOptions>() ?? new();

        bool enabled = options.Enabled ?? !environment.IsDevelopment();
        if (!enabled)
        {
            return configuration;
        }

        if (string.IsNullOrWhiteSpace(options.AkvUri))
        {
            throw new InvalidOperationException(
                $"Configuration value '{KeyVaultOptions.AkvUriKey}' must be configured when Key Vault is enabled.");
        }

        if (!Uri.TryCreate(options.AkvUri, UriKind.Absolute, out Uri? endpoint))
        {
            throw new InvalidOperationException(
                $"Configuration value '{KeyVaultOptions.AkvUriKey}' must be an absolute URI.");
        }

        configuration.AddAzureKeyVault(endpoint, new DefaultAzureCredential());
        return configuration;
    }
}
