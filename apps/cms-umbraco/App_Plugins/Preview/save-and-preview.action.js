import { UMB_DOCUMENT_WORKSPACE_CONTEXT } from "@umbraco-cms/backoffice/document";
import { UmbWorkspaceActionBase } from "@umbraco-cms/backoffice/workspace";
import { PREVIEW_URL_PROVIDER_ALIAS, PREVIEW_VIEW_PATHNAME } from "./preview-constants.js";

/**
 * "Lagre og forhåndsvis": saves the document and switches to the "Forhåndsvisning" workspace view,
 * which shows the frontend preview in an iframe.
 */
export class KiNorgeSaveAndPreviewWorkspaceAction extends UmbWorkspaceActionBase {
    async execute() {
        const workspace = await this.getContext(UMB_DOCUMENT_WORKSPACE_CONTEXT);
        if (!workspace) {
            throw new Error("Document workspace context not found");
        }

        // Documents opened in a modal (e.g. from a collection view) have their own routing, so the
        // view switch below cannot reach them. Fall back to opening the preview in a new tab.
        if (workspace.modalContext) {
            await workspace.saveAndPreview(PREVIEW_URL_PROVIDER_ALIAS);
            return;
        }

        // saveAndPreview() runs the same variant selection, validation and save as the built-in
        // button, but ends by opening a new tab. Suppress that tab; the workspace view shows it instead.
        const originalOpen = window.open;
        try {
            window.open = () => null;
            await workspace.saveAndPreview(PREVIEW_URL_PROVIDER_ALIAS);
        } finally {
            window.open = originalOpen;
        }

        // URL looks like .../workspace/document/edit/{id}/{variant}[/view/content/tab/...]
        const unique = workspace.getUnique();
        const href = window.location.href.replace(/\/+$/, "");
        const match = href.match(new RegExp(`^(.*/${unique}/[\\w-]+)(/.*)?$`));
        if (!match) {
            console.error("Could not find the document in the current URL, unable to switch to preview.");
            return;
        }

        const target = `${match[1]}/view/${PREVIEW_VIEW_PATHNAME}`;
        if (target !== href) {
            window.history.pushState(null, "", target);
        }
    }
}

export { KiNorgeSaveAndPreviewWorkspaceAction as api };
