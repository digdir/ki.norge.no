import { UMB_DOCUMENT_WORKSPACE_CONTEXT as n } from "@umbraco-cms/backoffice/document";
import { UmbConditionBase as a } from "@umbraco-cms/backoffice/extension-registry";
import { a as u } from "./sdk.gen-0dbdZMzN.js";
class f extends a {
  constructor(e, i) {
    super(e, i), this.consumeContext(n, async (o) => {
      const t = o?.getContentTypeUnique();
      if (!t) {
        console.warn("Could not find the document type of the current document, preview is disabled."), this.permitted = !1;
        return;
      }
      const r = await c.request(t);
      this.permitted = r?.data ?? !1;
    });
  }
}
class c {
  static request(e) {
    return this._activeRequest || (this._activeRequest = u.getHeadlessPreviewDocumentTypePreviewSupported({
      query: {
        documentTypeId: e
      }
    }).finally(() => this._activeRequest = void 0)), this._activeRequest;
  }
}
export {
  f as PreviewIsSupportedCondition,
  f as api
};
//# sourceMappingURL=preview-is-supported.condition-rgeqb1nv.js.map
