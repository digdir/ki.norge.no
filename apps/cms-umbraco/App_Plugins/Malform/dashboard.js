import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { html, css, nothing } from '@umbraco-cms/backoffice/external/lit';
import { UMB_AUTH_CONTEXT } from '@umbraco-cms/backoffice/auth';

const tall = new Intl.NumberFormat('nb-NO');
const prosent = (n) => (n * 100).toLocaleString('nb-NO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const ETIKETT = { nn: 'Nynorsk', nb: 'Bokmål', ukjent: 'Ukjent' };

export default class KiNorgeMalformDashboard extends UmbLitElement {
  static properties = {
    _rapport: { state: true },
    _feil: { state: true },
    _laster: { state: true },
  };

  #auth;

  constructor() {
    super();
    this._rapport = null;
    this._feil = null;
    this._laster = true;

    this.consumeContext(UMB_AUTH_CONTEXT, (auth) => {
      if (!auth) return;
      this.#auth = auth;
      this.#hent();
    });
  }

  async #hent() {
    this._laster = true;
    this._feil = null;
    try {
      const token = await this.#auth.getLatestToken();
      const svar = await fetch('/umbraco/management/api/v1/malform', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!svar.ok) throw new Error(`HTTP ${svar.status}`);
      this._rapport = await svar.json();
    } catch (feil) {
      this._feil = feil.message ?? String(feil);
    } finally {
      this._laster = false;
    }
  }

  render() {
    if (this._laster) return html`<uui-box><uui-loader></uui-loader></uui-box>`;
    if (this._feil) {
      return html`<uui-box headline="Kunne ikke hente rapporten">
        <p>${this._feil}</p>
        <uui-button look="secondary" @click=${() => this.#hent()}>Prøv igjen</uui-button>
      </uui-box>`;
    }
    if (!this._rapport) return nothing;

    return html`
      ${this.#tall()}
      ${this.#plukkliste()}
      ${this.#tabell()}
    `;
  }

  #tall() {
    const r = this._rapport;
    if (!r.tegnTotalt) {
      return html`<uui-box headline="Andel nynorsk">
        <p class="hjelp">
          Ingen publiserte sider med nok tekst til å måles. Kravet kan verken bekreftes
          eller avkreftes.
        </p>
        <uui-button look="secondary" compact @click=${() => this.#hent()}>Oppdater</uui-button>
      </uui-box>`;
    }
    const bredde = Math.min(100, r.andelTegn * 100);
    return html`
      <uui-box headline="Andel nynorsk">
        <div class="topp">
          <span class="stortall ${r.kravetErNadd ? 'ok' : 'under'}">${prosent(r.andelTegn)} %</span>
          <uui-tag color=${r.kravetErNadd ? 'positive' : 'warning'}>
            ${r.kravetErNadd ? 'Over kravet' : 'Under kravet'}
          </uui-tag>
          <uui-button look="secondary" compact @click=${() => this.#hent()}>Oppdater</uui-button>
        </div>

        <div class="spor">
          <div class="fyll ${r.kravetErNadd ? 'ok' : ''}" style="width:${bredde}%"></div>
          <div class="grense" style="left:${r.kravet * 100}%"></div>
        </div>
        <div class="grenselapp">kravet ${prosent(r.kravet)} %</div>

        <dl>
          <div><dt>Nynorsk</dt><dd>${tall.format(r.tegnNynorsk)} av ${tall.format(r.tegnTotalt)} tegn</dd></div>
          <div><dt>Sider</dt><dd>${r.siderNynorsk} nynorsk, ${r.siderBokmal} bokmål (${prosent(r.andelSider)} %)</dd></div>
          ${this.#ukjentLinje(r)}
          ${r.kravetErNadd
            ? nothing
            : html`<div><dt>Mangler</dt><dd>${tall.format(r.tegnSomMangler)} tegn må over fra bokmål til nynorsk</dd></div>`}
        </dl>
      </uui-box>
    `;
  }

  #ukjentLinje(r) {
    const ukjente = r.sider.filter((s) => s.malform === 'ukjent');
    if (!ukjente.length) return nothing;
    const utenOrd = ukjente.filter((s) => s.nynorskTreff + s.bokmalTreff === 0).length;
    const tynt = ukjente.length - utenOrd;
    const deler = [];
    if (utenOrd) deler.push(`${utenOrd} uten norske ord`);
    if (tynt) deler.push(`${tynt} med for tynt grunnlag`);
    return html`<div>
      <dt>Ukjent</dt>
      <dd>${ukjente.length} side${ukjente.length === 1 ? '' : 'r'} holdt utenfor, ${deler.join(' og ')}</dd>
    </div>`;
  }

  #plukkliste() {
    const r = this._rapport;
    if (r.kravetErNadd || !r.plukkliste.length) return nothing;
    return html`
      <uui-box headline="Færrest mulig sider å oversette">
        <p class="hjelp">
          De ${r.plukkliste.length} største bokmålssidene lukker gapet. Færrest sider, ikke minst
          arbeid per side.
        </p>
        <ul class="plukk">
          ${r.plukkliste.map(
            (s) => html`<li><span>${s.navn}</span><span class="tegn">${tall.format(s.tegn)} tegn</span></li>`,
          )}
        </ul>
      </uui-box>
    `;
  }

  #tabell() {
    if (!this._rapport.sider.length) return nothing;
    return html`
      <uui-box headline="Alle sider">
        <uui-table>
          <uui-table-head>
            <uui-table-head-cell>Side</uui-table-head-cell>
            <uui-table-head-cell>Type</uui-table-head-cell>
            <uui-table-head-cell>Målform</uui-table-head-cell>
            <uui-table-head-cell>Tegn</uui-table-head-cell>
            <uui-table-head-cell>Sikkerhet</uui-table-head-cell>
          </uui-table-head>
          ${this._rapport.sider.map(
            (s) => html`
              <uui-table-row>
                <uui-table-cell>
                  ${s.navn}
                  ${s.url ? html`<div class="url">${s.url}</div>` : nothing}
                </uui-table-cell>
                <uui-table-cell>${s.innholdstype}</uui-table-cell>
                <uui-table-cell>
                  <uui-tag look="secondary" color=${s.malform === 'nn' ? 'positive' : 'default'}>
                    ${ETIKETT[s.malform] ?? s.malform}
                  </uui-tag>
                </uui-table-cell>
                <uui-table-cell>${tall.format(s.tegn)}</uui-table-cell>
                <uui-table-cell>
                  ${s.malform === 'ukjent' ? s.nynorskTreff + s.bokmalTreff + ' markører' : prosent(s.sikkerhet) + ' %'}
                </uui-table-cell>
              </uui-table-row>
            `,
          )}
        </uui-table>
      </uui-box>
    `;
  }

  static styles = css`
    :host {
      display: block;
      padding: var(--uui-size-layout-1);
    }
    uui-box {
      margin-bottom: var(--uui-size-layout-1);
    }
    .topp {
      display: flex;
      align-items: center;
      gap: var(--uui-size-space-4);
      flex-wrap: wrap;
      margin-bottom: var(--uui-size-space-4);
    }
    .stortall {
      font-size: 2.5rem;
      font-weight: 700;
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }
    .stortall.ok {
      color: var(--uui-color-positive);
    }
    .stortall.under {
      color: var(--uui-color-warning-standalone);
    }
    .spor {
      position: relative;
      height: 20px;
      background: var(--uui-color-surface-alt);
      border-radius: 4px;
      overflow: hidden;
    }
    .fyll {
      position: absolute;
      inset: 0 auto 0 0;
      background: var(--uui-color-warning-standalone);
      border-radius: 4px;
    }
    .fyll.ok {
      background: var(--uui-color-positive);
    }
    .grense {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 2px;
      background: var(--uui-color-text);
    }
    .grenselapp {
      font-size: var(--uui-type-small-size);
      color: var(--uui-color-text-alt);
      margin: var(--uui-size-space-2) 0 var(--uui-size-space-5);
    }
    dl {
      margin: 0;
      display: grid;
      gap: var(--uui-size-space-2);
    }
    dl div {
      display: flex;
      gap: var(--uui-size-space-3);
    }
    dt {
      font-weight: 700;
      min-width: 7rem;
    }
    dd {
      margin: 0;
    }
    .hjelp {
      color: var(--uui-color-text-alt);
      margin-top: 0;
    }
    .plukk {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .plukk li {
      display: flex;
      justify-content: space-between;
      gap: var(--uui-size-space-4);
      padding: var(--uui-size-space-3) 0;
      border-bottom: 1px solid var(--uui-color-divider);
    }
    .tegn {
      color: var(--uui-color-text-alt);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .url {
      font-size: var(--uui-type-small-size);
      color: var(--uui-color-text-alt);
    }
  `;
}

customElements.define('kinorge-malform-dashboard', KiNorgeMalformDashboard);
