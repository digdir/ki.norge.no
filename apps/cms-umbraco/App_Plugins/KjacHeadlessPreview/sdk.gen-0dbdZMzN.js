import { c as t } from "./client.gen-ozdNv-Gs.js";
class c {
  static getHeadlessPreviewDocumentTypePreviewSupported(e) {
    return (e?.client ?? t).get({
      security: [
        {
          scheme: "bearer",
          type: "http"
        }
      ],
      url: "/umbraco/management/api/v1/headless-preview/document-type/preview-supported",
      ...e
    });
  }
}
class s {
  static getHeadlessPreviewDocumentPreviewUrlInfo(e) {
    return (e?.client ?? t).get({
      security: [
        {
          scheme: "bearer",
          type: "http"
        }
      ],
      url: "/umbraco/management/api/v1/headless-preview/document/preview-url-info",
      ...e
    });
  }
}
export {
  s as D,
  c as a
};
//# sourceMappingURL=sdk.gen-0dbdZMzN.js.map
