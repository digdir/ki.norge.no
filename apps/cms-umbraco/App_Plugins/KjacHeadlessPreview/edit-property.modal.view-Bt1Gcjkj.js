import { UmbModalToken as T } from "@umbraco-cms/backoffice/modal";
import { P as f } from "./bundle.manifests-BoaDbVvs.js";
import { html as h, property as y, state as d, customElement as v } from "@umbraco-cms/backoffice/external/lit";
import { UmbLitElement as E } from "@umbraco-cms/backoffice/lit-element";
import { UMB_DOCUMENT_WORKSPACE_CONTEXT as C } from "@umbraco-cms/backoffice/document";
import { UMB_PROPERTY_DATASET_CONTEXT as w } from "@umbraco-cms/backoffice/property";
import { UmbDataTypeDetailRepository as $ } from "@umbraco-cms/backoffice/data-type";
var P = Object.defineProperty, x = Object.getOwnPropertyDescriptor, _ = (t) => {
  throw TypeError(t);
}, s = (t, e, a, r) => {
  for (var i = r > 1 ? void 0 : r ? x(e, a) : e, u = t.length - 1, l; u >= 0; u--)
    (l = t[u]) && (i = (r ? l(e, a, i) : l(i)) || i);
  return r && i && P(e, a, i), i;
}, D = (t, e, a) => e.has(t) || _("Cannot " + a), O = (t, e, a) => e.has(t) ? _("Cannot add the same private member more than once") : e instanceof WeakSet ? e.add(t) : e.set(t, a), n = (t, e, a) => (D(t, e, "access private method"), a), p, m, c, b;
const S = new T(
  `${f}.Modal.EditProperty`,
  {
    modal: {
      type: "sidebar",
      size: "large"
    }
  }
);
let o = class extends E {
  constructor() {
    super(), O(this, p), this._propertyValues = [], this.consumeContext(C, async (t) => {
      if (!t)
        return;
      this._documentName = t.getName(), await t.structure.whenLoaded();
      const e = t.structure.getContentTypes().flatMap((r) => r.properties).find((r) => r.alias === this.data.alias);
      if (!e) {
        console.warn(`The property type with alias "${this.data.alias}" could not be found on the document type with alias "${t.structure.getOwnerContentType()?.alias}" (nor on any of its compositions)`);
        return;
      }
      this._propertyType = e;
      const a = await new $(this).requestByUnique(this._propertyType.dataType.unique);
      this._dataType = a.data;
    }), this.consumeContext(w, async (t) => {
      this._propertyDatasetContext = t, this.observe(await t?.propertyValueByAlias(this.data.alias), (e) => {
        this._propertyValues = [
          {
            alias: this.data.alias,
            value: e
          }
        ];
      });
    });
  }
  render() {
    return !this._propertyValues.length || !this._propertyType || !this._dataType ? h`
                <umb-body-layout header-transparent>
                    <uui-box>
                        <uui-loader></uui-loader>
                    </uui-box>
                </umb-body-layout>
            ` : h`
            <umb-body-layout headline="${this._documentName}">
                <uui-box>
                    <umb-property-dataset .value=${this._propertyValues} @change=${n(this, p, m)}>
                        <umb-property
                                label="${this._propertyType.name}"
                                description="${this._propertyType.description}"
                                alias="${this._propertyType.alias}"
                                property-editor-ui-alias="${this._dataType.editorUiAlias}"
                                .config=${this._dataType.values}></umb-property>
                    </umb-property-dataset>
                </uui-box>
                <div slot="actions">
                    <uui-button label=${this.localize.term("general_cancel")} @click=${n(this, p, c)}></uui-button>
                    <uui-button
                            id="submitButton"
                            label=${this.localize.term("buttons_save")}
                            look="primary"
                            color="positive"
                            @click=${n(this, p, b)}></uui-button>
                </div>
            </umb-body-layout>
        `;
  }
};
p = /* @__PURE__ */ new WeakSet();
m = function(t) {
  const e = this._propertyValues;
  this._propertyValues = t.target.value, this.requestUpdate("_propertyValues", e);
};
c = function() {
  this.modalContext?.reject();
};
b = function() {
  this._propertyDatasetContext.setPropertyValue(
    this.data.alias,
    this._propertyValues[0].value
  ), this.modalContext?.submit();
};
s([
  y({ attribute: !1 })
], o.prototype, "modalContext", 2);
s([
  y({ attribute: !1 })
], o.prototype, "data", 2);
s([
  y({ attribute: !1 })
], o.prototype, "value", 2);
s([
  d()
], o.prototype, "_propertyValues", 2);
s([
  d()
], o.prototype, "_propertyType", 2);
s([
  d()
], o.prototype, "_dataType", 2);
o = s([
  v("headless-preview-edit-property-modal-view")
], o);
export {
  S as HEADLESS_PREVIEW_EDIT_PROPERTY_MODAL_TOKEN,
  o as default
};
//# sourceMappingURL=edit-property.modal.view-Bt1Gcjkj.js.map
