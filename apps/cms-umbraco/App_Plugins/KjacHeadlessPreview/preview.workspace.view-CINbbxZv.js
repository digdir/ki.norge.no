import { UmbLitElement as b } from "@umbraco-cms/backoffice/lit-element";
import { html as l, nothing as f, when as w, repeat as g, css as x, state as h, query as y, customElement as k } from "@umbraco-cms/backoffice/external/lit";
import { UMB_DOCUMENT_WORKSPACE_CONTEXT as I } from "@umbraco-cms/backoffice/document";
import { UMB_INVARIANT_CULTURE as C } from "@umbraco-cms/backoffice/variant";
import { HEADLESS_PREVIEW_CONTEXT_TOKEN as S } from "./workspace.context-CAxfaCZa.js";
import { D as E } from "./sdk.gen-0dbdZMzN.js";
import { UMB_SERVER_CONTEXT as T } from "@umbraco-cms/backoffice/server";
import { HEADLESS_PREVIEW_EDIT_PROPERTY_MODAL_TOKEN as U } from "./edit-property.modal.view-Bt1Gcjkj.js";
import { UmbModalRouteRegistrationController as $ } from "@umbraco-cms/backoffice/router";
var D = Object.defineProperty, P = Object.getOwnPropertyDescriptor, u = (e, t, r, i) => {
  for (var o = i > 1 ? void 0 : i ? P(t, r) : t, n = e.length - 1, a; n >= 0; n--)
    (a = e[n]) && (o = (i ? a(t, r, o) : a(o)) || o);
  return i && o && D(t, r, o), o;
};
let c = class extends b {
  constructor() {
    super(), this._maximized = !1, this._loading = !0, this._boundMessageHandler = this._messageHandler.bind(this), this._devices = [
      {
        alias: "desktop",
        label: "Desktop",
        isDevice: !1,
        icon: "icon-display",
        flipIcon: !1,
        dimensions: { height: "100%", width: "100%" }
      },
      {
        alias: "laptop",
        label: "Laptop",
        isDevice: !0,
        icon: "icon-laptop",
        flipIcon: !1,
        dimensions: { height: "768px", width: "1366px" }
      },
      {
        alias: "ipad-portrait",
        label: "Tablet portrait",
        isDevice: !0,
        icon: "icon-ipad",
        flipIcon: !1,
        dimensions: { height: "929px", width: "769px" }
      },
      {
        alias: "ipad-landscape",
        label: "Tablet landscape",
        isDevice: !0,
        icon: "icon-ipad",
        flipIcon: !0,
        dimensions: { height: "675px", width: "1024px" }
      },
      {
        alias: "smartphone-portrait",
        label: "Smartphone portrait",
        isDevice: !0,
        icon: "icon-iphone",
        flipIcon: !1,
        dimensions: { height: "640px", width: "360px" }
      },
      {
        alias: "smartphone-landscape",
        label: "Smartphone landscape",
        isDevice: !0,
        icon: "icon-iphone",
        flipIcon: !0,
        dimensions: { height: "360px", width: "640px" }
      }
    ], this._device = this._devices[0], this.consumeContext(I, (e) => {
      const t = e?.getData();
      if (!t)
        return;
      this._documentWorkspaceContext = e, this._documentId = t.unique, this._documentTypeId = t.documentType.unique;
      const r = t.variants.filter((i) => !!i.createDate);
      this.consumeContext(S, (i) => {
        this._workspaceContext = i, this._workspaceContext?.initializeContext(this._documentId), this._device = this._workspaceContext?.getLastDevice() ?? this._device;
      }), e && this.observe(e.splitView.activeVariantsInfo, async (i) => {
        const o = i.length ? i[0] : void 0;
        this._activeVariant = o && r.find(
          (a) => (a.culture === o.culture || a.culture === null && o.culture === C) && a.segment === o.segment
        ) ? o : void 0;
        const n = await E.getHeadlessPreviewDocumentPreviewUrlInfo({
          query: {
            documentId: this._documentId,
            culture: this._activeVariant?.culture ?? void 0,
            segment: this._activeVariant?.segment ?? void 0
          }
        });
        n.error ? console.error("The preview URL info endpoint yielded an error", n.error) : this._previewUrlInfo = n?.data;
      });
    }), this.consumeContext(T, (e) => {
      this._serverUrl = e?.getServerUrl();
    });
  }
  connectedCallback() {
    if (super.connectedCallback(), window.addEventListener("message", this._boundMessageHandler), !this._serverUrl || !this._documentId) {
      console.warn("No document ID and/or server URL found, cannot connect to preview hub - live updates are disabled.");
      return;
    }
    const e = `${this._serverUrl.replace("https://", "wss://")}/umbraco/PreviewHub`;
    this._webSocket = new WebSocket(e), this._webSocket.addEventListener("open", () => {
      this._webSocket?.send('{"protocol":"json","version":1}');
    }), this._webSocket.addEventListener("message", (t) => {
      if (!t?.data)
        return;
      const r = t.data.substring(0, t.data.length - 1), i = JSON.parse(r);
      i.type === 1 && i.target === "refreshed" && i.arguments && i.arguments.indexOf(this._documentId) >= 0 && this._reloadIFrame();
    });
  }
  disconnectedCallback() {
    super.disconnectedCallback(), window.removeEventListener("message", this._boundMessageHandler), this._webSocket && (this._webSocket.close(), this._webSocket = void 0);
  }
  render() {
    return this._activeVariant ? this._previewUrlInfo ? this._previewUrlInfo.previewUrl ? l`
            <div class="iframe-container">
                <iframe
                        src="${this._previewUrlInfo.previewUrl}"
                        class="${this._device.isDevice ? "device" : f}"
                        style="width: ${this._device.dimensions.width}; height: ${this._device.dimensions.height}"
                        @load=${this._onIFrameLoad}>
                </iframe>
            </div>
            ${w(
      this._loading,
      () => l`<uui-loader></uui-loader>`,
      () => l`
                        <div class="toolbar-container" id="toolbar-container">
                            <uui-button popovertarget="devices-popover" look="primary">
                                <div class="button-content">
                                    <uui-icon name="${this._device.icon}" class=${this._device.flipIcon ? "flip" : f}></uui-icon>
                                    <span>${this._device.label}</span>
                                </div>
                            </uui-button>
                            <uui-button look="primary" @click=${this._toggleMaximized}>
                                <div class="button-content">
                                    <uui-icon name="${this._maximized ? "icon-exit-fullscreen" : "icon-fullscreen-alt"}"></uui-icon>
                                    <span>${this._maximized ? "Restore" : "Maximize"}</span>
                                </div>
                            </uui-button>
                            <uui-button look="primary" href="${this._previewUrlInfo.previewUrl}" target="_blank">
                                <div class="button-content">
                                    <uui-icon name="icon-out"></uui-icon>
                                    <span>New window</span>
                                </div>
                            </uui-button>
                            <uui-popover-container id="devices-popover">
                                <umb-popover-layout>
                                    ${g(
        this._devices,
        (e) => e.alias,
        (e) => l`
                                                <uui-menu-item
                                                        label=${e.label}
                                                        ?active=${e === this._device}
                                                        @click=${() => this._changePreviewDevice(e)}>
                                                    <uui-icon slot="icon" name=${e.icon}
                                                              class=${e.flipIcon ? "flip" : f}></uui-icon>
                                                </uui-menu-item>
                                            `
      )}
                                </umb-popover-layout>
                            </uui-popover-container>
                        </div>`
    )}
        ` : l`
                <umb-body-layout header-transparent>
                    <uui-box><div style="white-space: pre-line">${this._previewUrlInfo.info ?? "This document cannot be previewed."}</div></uui-box>
                </umb-body-layout>
            ` : l`<uui-loader></uui-loader>` : l`
                <umb-body-layout header-transparent>
                    <uui-box>Please save the document before previewing it.</uui-box>
                </umb-body-layout>
            `;
  }
  _changePreviewDevice(e) {
    this._device = e, this._workspaceContext?.updateLastDevice(e), this._popoverContainer.togglePopover();
  }
  _toggleMaximized() {
    this.getHostElement().classList.toggle("maximized"), this._maximized = !this._maximized;
  }
  _reloadIFrame() {
    this._iframe?.contentWindow && (this._loading = !0, this._iframe.src = this._iframe.src);
  }
  _onIFrameLoad(e) {
    this._loading = !1, this._iframe = e.target;
  }
  _updateIFrameScrollPos() {
    if (!this._iframe)
      return;
    const e = this._workspaceContext?.getLastScrollPos();
    e && this._iframe.contentWindow?.postMessage(`umb.preview|scrollTo|${e}`, "*");
  }
  async _editProperty(e) {
    const t = e.split(":");
    e = t[0];
    const r = t.length > 1 ? t[1] : "default", i = r == "modal" && t.length == 3 ? t[2] : "large";
    if (!this._documentId || !this._documentTypeId || !this._documentWorkspaceContext) {
      console.error("No document or document type ID found yet. Cannot edit property. This really should not have happened.");
      return;
    }
    const o = this._documentWorkspaceContext.structure;
    await o.whenLoaded();
    const n = o.getContentTypes(), a = n.flatMap((s) => s.properties).find((s) => s.alias === e);
    if (!a) {
      console.warn(`The property type with alias "${e}" could not be found on the document type with alias "${o.getOwnerContentType()?.alias}" (nor on any of its compositions)`);
      return;
    }
    if (r === "default") {
      const s = n.flatMap((d) => d.containers);
      let p = null, m = a.container;
      for (; m?.id; ) {
        const d = s.find((_) => _.id === m.id);
        if (!d)
          break;
        if (d.type !== "Tab") {
          m = d.parent;
          continue;
        }
        p = d.name;
        break;
      }
      let v = window.location.href.replace("/view/headless-preview", "/view/content");
      p && (v = `${v}/tab/${p.toLowerCase().replace(" ", "-")}`), window.history.pushState(null, "", v);
      return;
    }
    r.startsWith("modal") && (this._workspaceModal?.destroy(), this._workspaceModal = new $(
      this,
      U
    ).onSetup(() => ({
      data: {
        alias: e
      },
      value: {},
      modal: {
        size: i
      }
    })).onSubmit(async (s) => {
      await this._documentWorkspaceContext?.requestSubmit();
    }).observeRouteBuilder((s) => {
      const p = s({ key: e });
      window.history.pushState(null, "", p);
    }));
  }
  async _messageHandler(e) {
    if (typeof e.data != "string" || e.data.indexOf("umb.preview") !== 0)
      return;
    const t = e.data.split("|");
    if (t.length !== 3 && t.length !== 4) {
      console.warn("Malformed message received", e);
      return;
    }
    switch (t[1]) {
      case "edit":
        await this._editProperty(t[2]);
        break;
      case "scrollPos":
        this._workspaceContext?.updateLastScrollPos(t[2]);
        break;
      case "init":
        switch (t[2]) {
          case "ready":
            this._updateIFrameScrollPos();
            break;
        }
        break;
    }
  }
};
c.styles = [
  x`
            umb-popover-layout {
                --uui-color-surface: var(--uui-color-header-surface);
                color: var(--uui-color-header-contrast);
            }

            uui-icon.flip {
                rotate: 90deg;
            }

            .iframe-container {
                height: 100%;
                display: flex;
                justify-content: center;
                align-items: center;
                background-color: white;
            }

            iframe {
                border: 0;
                transition: 240ms cubic-bezier(0.165, 0.84, 0.44, 1);
            }

            iframe.device {
                box-shadow: rgba(0, 0, 0, 0.26) 0px 5px 20px 0px;
                border: 1px solid var(--uui-color-border-standalone);
                border-radius: 4px;
                max-width: 100%;
                max-height: calc(100% - 2px);
            }

            uui-loader {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
            }

            .toolbar-container {
                position: absolute;
                bottom: 0;
                left: 50%;
                transform: translateX(-50%);
                background: rgb(27, 38, 79);
                --uui-button-border-radius: 0;
                --uui-button-font-weight: normal;
                display: flex;
            }

            .toolbar-container uui-button {
                border: 1px solid var(--uui-color-border);
            }

            .toolbar-container uui-button .button-content {
                display: flex;
                gap: 5px;
            }

            .toolbar-container.maximized {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                z-index: 9998;
            }
            
            :host(.maximized) {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                z-index: 9998;
            }
        `
];
u([
  h()
], c.prototype, "_maximized", 2);
u([
  h()
], c.prototype, "_previewUrlInfo", 2);
u([
  h()
], c.prototype, "_device", 2);
u([
  h()
], c.prototype, "_loading", 2);
u([
  y("#devices-popover")
], c.prototype, "_popoverContainer", 2);
c = u([
  k("kjac-headless-preview-workspace-view")
], c);
export {
  c as default
};
//# sourceMappingURL=preview.workspace.view-CINbbxZv.js.map
