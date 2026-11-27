import { UMB_DOCUMENT_WORKSPACE_CONTEXT as a } from "@umbraco-cms/backoffice/document";
import { UmbWorkspaceActionBase as c } from "@umbraco-cms/backoffice/workspace";
class u extends c {
  // TODO: need to implement this at some point (UmbDocumentUserPermissionCondition is not available atm)
  // constructor(host: UmbControllerHost, args: any) {
  //     super(host, args);
  //
  //     /* The action is disabled by default because the onChange callback
  //      will first be triggered when the condition is changed to permitted */
  //     this.disable();
  //
  //     // TODO: this check is not sufficient. It will show the save button if a use
  //     // has only create options. The best solution would be to split the two buttons into two separate actions
  //     // with a condition on isNew to show/hide them
  //     // The server will throw a permission error if this scenario happens
  //     const condition = new UmbDocumentUserPermissionCondition(host, {
  //         host,
  //         config: {
  //             alias: 'Umb.Condition.UserPermission.Document',
  //             oneOf: [UMB_USER_PERMISSION_DOCUMENT_CREATE, UMB_USER_PERMISSION_DOCUMENT_UPDATE],
  //         },
  //         onChange: () => {
  //             if (condition.permitted) {
  //                 this.enable();
  //             } else {
  //                 this.disable();
  //             }
  //         },
  //     });
  // }
  async execute() {
    const e = await this.getContext(a);
    if (!e)
      throw new Error("Document workspace context not found");
    const i = window.open;
    try {
      window.open = (s) => null, await e.saveAndPreview();
    } finally {
      window.open = i;
    }
    const r = e.getUnique(), o = window.location.href.replace(/\/+$/, ""), n = o.match(new RegExp(`.*/${r}/(?<variant>[\\w-]*)(?<view>\\S*)`));
    if (!n || !n.length) {
      console.error("Could not match against current location, unable to switch to preview.");
      return;
    }
    const t = `${o.replace(n.groups?.view ?? "", "")}/view/headless-preview`;
    o !== t && window.history.pushState(null, "", t);
  }
}
export {
  u as DocumentSaveAndPreviewWorkspaceAction,
  u as api
};
//# sourceMappingURL=save-and-preview.workspace.action-CoeAdYNd.js.map
