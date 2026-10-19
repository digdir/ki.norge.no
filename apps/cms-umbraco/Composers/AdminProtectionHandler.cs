using Umbraco.Cms.Core.Composing;
using Umbraco.Cms.Core.DependencyInjection;
using Umbraco.Cms.Core.Events;
using Umbraco.Cms.Core.Notifications;

namespace KiNorge.Cms.Composers;

/// <summary>
/// Prevents the seeded admin account (admin@ki.norge.no) from being deleted.
/// Without this, an editor with user-management permissions could lock
/// everyone out by deleting the only admin.
///
/// To intentionally rotate the admin: change ProtectedAdminEmail below first,
/// then deploy, then perform the change in the UI.
/// </summary>
public class AdminProtectionComposer : IComposer
{
    public void Compose(IUmbracoBuilder builder)
    {
        builder.AddNotificationHandler<UserDeletingNotification, AdminProtectionHandler>();
    }
}

public class AdminProtectionHandler : INotificationHandler<UserDeletingNotification>
{
    private const string ProtectedAdminEmail = "admin@ki.norge.no";

    public void Handle(UserDeletingNotification notification)
    {
        foreach (var user in notification.DeletedEntities)
        {
            if (string.Equals(user.Email, ProtectedAdminEmail, System.StringComparison.OrdinalIgnoreCase))
            {
                notification.CancelOperation(new EventMessage(
                    "Beskyttet konto",
                    $"Brukeren '{ProtectedAdminEmail}' er beskyttet og kan ikke slettes. " +
                    "Endre 'ProtectedAdminEmail' i AdminProtectionHandler.cs hvis du må rotere admin.",
                    EventMessageType.Error));
                return;
            }
        }
    }
}
