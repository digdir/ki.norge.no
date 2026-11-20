import { UmbContextBase as o } from "@umbraco-cms/backoffice/class-api";
import { UmbContextToken as e } from "@umbraco-cms/backoffice/context-api";
import { P as i } from "./bundle.manifests-BoaDbVvs.js";
class a extends o {
  constructor(t) {
    super(t, l), this.updateLastDevice = (s) => {
      this._lastDevice = s;
    }, this.getLastDevice = () => this._lastDevice, this.updateLastScrollPos = (s) => {
      this._lastScrollPos = s;
    }, this.getLastScrollPos = () => this._lastScrollPos;
  }
  initializeContext(t) {
    this._lastDocumentId !== t && (this._lastScrollPos = void 0, this._lastDocumentId = t);
  }
}
const _ = a, l = new e(
  `${i}.Workspace.Context`
);
export {
  l as HEADLESS_PREVIEW_CONTEXT_TOKEN,
  a as WorkspaceContext,
  _ as api
};
//# sourceMappingURL=workspace.context-CAxfaCZa.js.map
