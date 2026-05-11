using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;

namespace KiNorge.Cms.Composers;

/// <summary>
/// Replaces ASP.NET Core Identity's default English password-validation
/// errors with Norwegian, descriptive messages.
///
/// Background: Umbraco's backoffice change-password dialog showed only
/// "Unknown failure" when validation failed (issue 2026-05-10). The
/// upstream API was returning IdentityError objects, but Umbraco's UI
/// rendered them as a generic toast. After this composer, the same flow
/// surfaces messages like "Passordet må være minst 10 tegn." inline, so
/// the editor can correct the input without guessing.
///
/// Only the password-related codes are overridden — other Identity errors
/// (login, lockout, two-factor) keep their default English text since
/// editors rarely encounter them.
/// </summary>
public class NorwegianIdentityErrorDescriberComposer : IComposer
{
    public void Compose(IUmbracoBuilder builder)
    {
        builder.Services.Replace(
            ServiceDescriptor.Singleton<IdentityErrorDescriber, NorwegianIdentityErrorDescriber>());
    }
}

public class NorwegianIdentityErrorDescriber : IdentityErrorDescriber
{
    public override IdentityError PasswordTooShort(int length) => new()
    {
        Code = nameof(PasswordTooShort),
        Description = $"Passordet må være minst {length} tegn."
    };

    public override IdentityError PasswordRequiresNonAlphanumeric() => new()
    {
        Code = nameof(PasswordRequiresNonAlphanumeric),
        Description = "Passordet må inneholde minst ett spesialtegn (f.eks. !, @, #, $, %)."
    };

    public override IdentityError PasswordRequiresLower() => new()
    {
        Code = nameof(PasswordRequiresLower),
        Description = "Passordet må inneholde minst én liten bokstav (a-z)."
    };

    public override IdentityError PasswordRequiresUpper() => new()
    {
        Code = nameof(PasswordRequiresUpper),
        Description = "Passordet må inneholde minst én stor bokstav (A-Z)."
    };

    public override IdentityError PasswordRequiresDigit() => new()
    {
        Code = nameof(PasswordRequiresDigit),
        Description = "Passordet må inneholde minst ett tall (0-9)."
    };

    public override IdentityError PasswordRequiresUniqueChars(int uniqueChars) => new()
    {
        Code = nameof(PasswordRequiresUniqueChars),
        Description = $"Passordet må inneholde minst {uniqueChars} ulike tegn."
    };

    public override IdentityError PasswordMismatch() => new()
    {
        Code = nameof(PasswordMismatch),
        Description = "Feil passord."
    };
}
