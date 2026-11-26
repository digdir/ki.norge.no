import { UMB_DOCUMENT_WORKSPACE_CONTEXT as s } from "@umbraco-cms/backoffice/document";
import { UmbConditionBase as n } from "@umbraco-cms/backoffice/extension-registry";
class m extends n {
  constructor(t, i) {
    super(t, i), this.consumeContext(s, (e) => {
      this.observe(
        e?.splitView.activeVariantsInfo,
        (o) => {
          this.permitted = o?.length === 1;
        }
      );
    });
  }
}
export {
  m as SplitViewIsNotActiveCondition,
  m as api
};
//# sourceMappingURL=split-view-is-not-active.condition-DC-CS_sX.js.map
