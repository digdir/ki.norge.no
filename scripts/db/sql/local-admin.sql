-- Gives the LOCAL copy a backoffice admin that can log in with a password.
--
-- Run only against the local container (set-local-admin.sh guards that).
-- Editors in prod and tt02 log in with Entra ID, which is off locally, so
-- without this nobody can log in to a copied database.
--
-- sqlcmd variable: LOGIN. $(HASH) is replaced by set-local-admin.sh before the run,
-- because sqlcmd -v strips the trailing "=" of a base64 value.
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

DECLARE @login nvarchar(255) = N'$(LOGIN)';
DECLARE @hash nvarchar(500) = N'$(HASH)';
DECLARE @config nvarchar(500) = N'{"hashAlgorithm":"PBKDF2.ASPNETCORE.V3"}';
DECLARE @userId int = (SELECT id FROM umbracoUser WHERE userLogin = @login);

IF @userId IS NULL
BEGIN
  INSERT INTO umbracoUser
    (userDisabled, [key], userNoConsole, userName, userLogin, userPassword, passwordConfig,
     userEmail, userLanguage, securityStampToken, failedLoginAttempts, createDate, updateDate, kind)
  VALUES
    (0, NEWID(), 0, N'Local admin', @login, @hash, @config,
     @login, N'en-US', CONVERT(nvarchar(36), NEWID()), 0, GETUTCDATE(), GETUTCDATE(), 0);
  SET @userId = SCOPE_IDENTITY();
  PRINT 'created ' + @login;
END
ELSE
BEGIN
  UPDATE umbracoUser
  SET userPassword = @hash,
      passwordConfig = @config,
      userDisabled = 0,
      userNoConsole = 0,
      failedLoginAttempts = 0,
      lastLockoutDate = NULL,
      securityStampToken = CONVERT(nvarchar(36), NEWID()),
      updateDate = GETUTCDATE()
  WHERE id = @userId;
  PRINT 'reset ' + @login;
END

INSERT INTO umbracoUser2UserGroup (userId, userGroupId)
SELECT @userId, g.id
FROM umbracoUserGroup g
WHERE g.userGroupAlias = N'admin'
  AND NOT EXISTS (SELECT 1 FROM umbracoUser2UserGroup x WHERE x.userId = @userId AND x.userGroupId = g.id);

COMMIT;
