import { UmbLitElement } from "@umbraco-cms/backoffice/lit-element";
import { html, css, nothing } from "@umbraco-cms/backoffice/external/lit";
import { UMB_DOCUMENT_WORKSPACE_CONTEXT } from "@umbraco-cms/backoffice/document";
import { UMB_INVARIANT_CULTURE } from "@umbraco-cms/backoffice/variant";
import { UmbPreviewRepository } from "@umbraco-cms/backoffice/preview";
import { PREVIEW_URL_PROVIDER_ALIAS } from "./preview-constants.js";

/**
 * The "Forhåndsvisning" workspace view: shows the frontend preview of the active variant in an
 * iframe. The preview URL comes from Preview/PreviewUrlProvider.cs through Umbraco's
 * document preview-url endpoint. It is fetched again every time the document is saved, and gets a
 * fresh rnd parameter so the iframe reloads even though the URL itself is unchanged.
 */
export class KiNorgePreviewWorkspaceViewElement extends UmbLitElement {
    static properties = {
        _status: { state: true }, // "loading" | "unsaved" | "ready" | "error"
        _previewUrl: { state: true },
        _message: { state: true },
        _frameLoading: { state: true },
    };

    #repository;
    #workspace;
    #activeVariant;
    #persistedVariants = [];
    #lastKey;
    #requestId = 0;

    constructor() {
        super();
        // Lit state is initialised here, not as class fields, which would shadow the reactive accessors.
        this._status = "loading";
        this._previewUrl = undefined;
        this._message = undefined;
        this._frameLoading = false;

        this.#repository = new UmbPreviewRepository(this);

        this.consumeContext(UMB_DOCUMENT_WORKSPACE_CONTEXT, (workspace) => {
            this.#workspace = workspace;
            if (!workspace) return;

            this.observe(
                workspace.splitView.activeVariantsInfo,
                (variants) => {
                    this.#activeVariant = variants?.[0];
                    this.#refresh();
                },
                "_kinorgePreviewActiveVariants",
            );

            this.observe(
                workspace.persistedData,
                (data) => {
                    this.#persistedVariants = data?.variants ?? [];
                    this.#refresh();
                },
                "_kinorgePreviewPersistedData",
            );
        });
    }

    async #refresh() {
        const unique = this.#workspace?.getUnique();
        const active = this.#activeVariant;
        if (!unique || !active) return;

        const culture = active.culture && active.culture !== UMB_INVARIANT_CULTURE ? active.culture : null;
        const segment = active.segment ?? null;

        const persisted = this.#persistedVariants.find(
            (variant) => (variant.culture ?? null) === culture && (variant.segment ?? null) === segment,
        );

        if (!persisted?.createDate) {
            this.#lastKey = undefined;
            this._previewUrl = undefined;
            this._status = "unsaved";
            return;
        }

        // Only fetch a new URL when the document, the variant or the saved version changes.
        const key = [unique, culture, segment, persisted.updateDate].join("|");
        if (key === this.#lastKey) return;
        this.#lastKey = key;

        const requestId = ++this.#requestId;
        this._status = "loading";

        try {
            const info = await this.#repository.getPreviewUrl(
                unique,
                PREVIEW_URL_PROVIDER_ALIAS,
                culture ?? undefined,
                segment ?? undefined,
            );
            if (requestId !== this.#requestId) return;

            if (info?.url) {
                // Same cache buster as Umbraco's own preview. Without it the src is unchanged
                // after a save, and the iframe keeps showing the old version.
                const url = new URL(info.url, window.document.baseURI);
                url.searchParams.set("rnd", Date.now().toString());
                this._previewUrl = url.toString();
                this._frameLoading = true;
                this._status = "ready";
            } else {
                this._message = info?.message;
                this._status = "error";
            }
        } catch (error) {
            if (requestId !== this.#requestId) return;
            this.#lastKey = undefined;
            this._message = error?.message;
            this._status = "error";
        }
    }

    #renderMessage(text) {
        return html`
            <umb-body-layout header-transparent>
                <uui-box><div class="message">${text}</div></uui-box>
            </umb-body-layout>
        `;
    }

    render() {
        switch (this._status) {
            case "unsaved":
                return this.#renderMessage("Lagre dokumentet før du forhåndsviser det.");
            case "error":
                return this.#renderMessage(this._message || "Dette dokumentet kan ikke forhåndsvises.");
            case "loading":
                return html`<uui-loader></uui-loader>`;
        }

        return html`
            <iframe
                title="Forhåndsvisning"
                src=${this._previewUrl}
                @load=${() => (this._frameLoading = false)}>
            </iframe>
            ${this._frameLoading ? html`<uui-loader></uui-loader>` : nothing}
        `;
    }

    static styles = css`
        :host {
            display: block;
            position: relative;
            height: 100%;
        }

        .message {
            white-space: pre-line;
        }

        iframe {
            display: block;
            width: 100%;
            height: 100%;
            border: 0;
            background-color: white;
        }

        uui-loader {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
        }
    `;
}

customElements.define("kinorge-preview-workspace-view", KiNorgePreviewWorkspaceViewElement);

export default KiNorgePreviewWorkspaceViewElement;
