# Password rules for CMS users

Normal login to the backoffice goes through Entra ID, with the "Microsoft" button. Then the user has no password in Umbraco. The rules below apply only to local accounts with a password, and local login is still enabled alongside Entra ID.

## What the password must contain

- **At least 10 characters**
- **At least 2 unique characters** (the same character cannot be repeated throughout)
- **At least one uppercase letter** (A-Z)
- **At least one lowercase letter** (a-z)
- **At least one special character** (`!@#$%^&*()-_+=` etc.)

Digits are not required, but recommended.

## Examples

| The password has | Accepted | Why |
| --- | --- | --- |
| 8 characters | No | Too short |
| 12 characters, only lowercase letters and digits | No | Missing uppercase letter and special character |
| 12 characters with uppercase and lowercase letters and digits | No | Missing special character |
| 14 characters with uppercase and lowercase letters and one special character | Yes | Meets all requirements |

## Why this is necessary

The CMS gives access to all content. A weak password is easy to guess or crack, and can be used to publish false content or sabotage the site.

## If changing the password fails

You should get a message that says which rule is missing, for example "Passordet må være minst 10 tegn". Follow the message, and try again.

If you only get "Unknown failure" without details, tell a developer. Then something has broken.

The rules are defined in `apps/cms-umbraco/appsettings.json` under `Umbraco.CMS.Security.UserPasswordConfiguration`. The Norwegian error messages come from `NorwegianIdentityErrorDescriber.cs`.
