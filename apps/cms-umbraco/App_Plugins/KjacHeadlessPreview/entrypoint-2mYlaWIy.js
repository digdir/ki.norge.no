import { UMB_AUTH_CONTEXT as i } from "@umbraco-cms/backoffice/auth";
import { c as s } from "./client.gen-ozdNv-Gs.js";
const a = (e, o) => {
  o.unregister("Umb.WorkspaceAction.Document.SaveAndPreview"), e.consumeContext(i, async (t) => {
    const n = t?.getOpenApiConfiguration();
    s.setConfig({
      auth: n?.token ?? void 0,
      baseUrl: n?.base ?? "",
      credentials: n?.credentials ?? "same-origin"
    });
  });
}, m = (e, o) => {
};
export {
  a as onInit,
  m as onUnload
};
//# sourceMappingURL=entrypoint-2mYlaWIy.js.map
