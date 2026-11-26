import { UMB_DOCUMENT_WORKSPACE_CONTEXT as e } from "@umbraco-cms/backoffice/document";
import { UmbConditionBase as s } from "@umbraco-cms/backoffice/extension-registry";
class m extends s {
  constructor(t, o) {
    super(t, o), this.consumeContext(e, (i) => {
      this.permitted = i?.modalContext === void 0;
    });
  }
}
export {
  m as ListViewEditModalIsNotActiveCondition,
  m as api
};
//# sourceMappingURL=list-view-edit-modal-is-not-active.condition-DXJ58lLU.js.map
