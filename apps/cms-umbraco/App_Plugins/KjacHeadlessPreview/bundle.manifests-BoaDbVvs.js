import { UMB_WORKSPACE_CONDITION_ALIAS as t } from "@umbraco-cms/backoffice/workspace";
import { UMB_DOCUMENT_WORKSPACE_ALIAS as a } from "@umbraco-cms/backoffice/document";
import { UMB_ENTITY_IS_NOT_TRASHED_CONDITION_ALIAS as n } from "@umbraco-cms/backoffice/recycle-bin";
const e = "Headless Preview", i = "Kjac.HeadlessPreview", s = `${i}.Condition.SplitViewIsNotActive`, p = `${i}.Condition.ListViewEditModalIsNotActive`, o = `${i}.Condition.PreviewIsSupported`, r = [
  {
    name: `${e} Preview Entrypoint`,
    alias: `${i}.Entrypoint`,
    type: "backofficeEntryPoint",
    js: () => import("./entrypoint-2mYlaWIy.js")
  }
], c = [
  {
    type: "workspaceContext",
    alias: `${i}.Workspace.Context`,
    name: `${e} Workspace Context`,
    api: () => import("./workspace.context-CAxfaCZa.js"),
    conditions: [
      {
        alias: t,
        match: a
      }
    ]
  },
  {
    type: "workspaceView",
    alias: `${i}.WorkspaceView`,
    element: () => import("./preview.workspace.view-CINbbxZv.js"),
    name: `${e} Workspace View`,
    meta: {
      label: "#general_preview",
      pathname: "headless-preview",
      icon: "icon-eye"
    },
    conditions: [
      {
        alias: t,
        match: a
      },
      {
        alias: n
      },
      {
        alias: s
      },
      {
        alias: o
      }
    ]
  },
  {
    type: "workspaceAction",
    kind: "default",
    alias: `${i}.WorkspaceAction.Document.SaveAndPreview`,
    api: () => import("./save-and-preview.workspace.action-CoeAdYNd.js"),
    name: `${i} Save And Preview Document Workspace Action`,
    weight: 90,
    meta: {
      label: "#buttons_saveAndPreview"
    },
    conditions: [
      {
        alias: t,
        match: a
      },
      {
        alias: n
      },
      {
        alias: p
      },
      {
        alias: o
      }
    ]
  },
  {
    type: "modal",
    alias: `${i}.Modal.EditProperty`,
    name: `${e} Edit Property Modal View`,
    element: () => import("./edit-property.modal.view-Bt1Gcjkj.js")
  }
], m = [
  {
    type: "condition",
    name: `${e} Split View Is Not Active Condition`,
    alias: s,
    api: () => import("./split-view-is-not-active.condition-DC-CS_sX.js")
  },
  {
    type: "condition",
    name: `${e} List View Edit Modal Is Not Active Condition`,
    alias: p,
    api: () => import("./list-view-edit-modal-is-not-active.condition-DXJ58lLU.js")
  },
  {
    type: "condition",
    name: `${e} Preview Is Supported Condition`,
    alias: o,
    api: () => import("./preview-is-supported.condition-rgeqb1nv.js")
  }
], _ = [
  ...r,
  ...c,
  ...m
];
export {
  i as P,
  _ as m
};
//# sourceMappingURL=bundle.manifests-BoaDbVvs.js.map
