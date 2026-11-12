// Removes Umbraco's built-in "Save and preview" button, which opens the preview in a new
// browser tab. It is replaced by save-and-preview.action.js, which saves and then shows the
// preview in the "Forhåndsvisning" workspace view (preview-workspace-view.js).
export const onInit = (_host, extensionRegistry) => {
    extensionRegistry.unregister("Umb.WorkspaceAction.Document.SaveAndPreview");
};

export const onUnload = () => {};
