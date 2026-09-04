import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { html, css, nothing } from '@umbraco-cms/backoffice/external/lit';
import { UMB_AUTH_CONTEXT } from '@umbraco-cms/backoffice/auth';

const tall = new Intl.NumberFormat('nb-NO');
const prosent = (n) => (n * 100).toLocaleString('nb-NO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const ETIKETT = { nn: 'Nynorsk', nb: 'Bokmål', ukjent: 'Ukjent' };

// Rapporten sender content.Key, som er den samme GUID-en redigeringsvisningen bruker.
// Vanlig lenke framfor klikk-håndtering, så midtklikk og "åpne i ny fane" virker.
const redigerLenke = (id) => `/umbraco/section/content/workspace/document/edit/${id}/invariant/`;

export default class KiNorgeMalformDashboard extends UmbLitElement {
  static properties = {
    _rapport: { state: true },
    _feil: { state: true },
    _laster: { state: true },
    _sortKol: { state: true },
    _sortStigende: { state: true },
    _visForklaring: { state: true },
  };

  #auth;

  constructor() {
    super();
    this._rapport = null;
    this._feil = null;
    this._laster = true;
    this._sortKol = 'tegn';
    this._sortStigende = false;
    this._visForklaring = false;

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

  #sorter(kol) {
    if (this._sortKol === kol) {
      this._sortStigende = !this._sortStigende;
    } else {
      this._sortKol = kol;
      // Tekst leses naturlig A til Å, tall er mest interessante fra toppen.
      this._sortStigende = kol === 'navn' || kol === 'innholdstype' || kol === 'malform';
    }
  }

  #sorterteSider() {
    const kol = this._sortKol;
    const retning = this._sortStigende ? 1 : -1;

    return [...this._rapport.sider].sort((a, b) => {
      // Målformkolonnen viser både hvilken målform som dominerer og hvor rein siden
      // er. Sortering følger det som vises: først gruppe, så blandingsgrad, så at
      // ukjente alltid havner nederst.
      if (kol === 'malform') {
        const rang = (s) => (s.malform === 'ukjent' ? 2 : s.malform === 'nb' ? 0 : 1);
        const ra = rang(a);
        const rb = rang(b);
        // Ukjente er ikke en målform og hører nederst uansett retning. Bokmål og
        // nynorsk bytter derimot plass, ellers gjør pilen ingenting synlig.
        if (ra !== rb) return ra === 2 || rb === 2 ? ra - rb : (ra - rb) * retning;
        if (a.malform === 'ukjent') return (a.nynorskTreff + a.bokmalTreff) - (b.nynorskTreff + b.bokmalTreff);
        return (a.andel - b.andel) * retning;
      }

      const x = a[kol];
      const y = b[kol];
      const primaer = typeof x === 'number' && typeof y === 'number'
        ? (x - y) * retning
        : String(x).localeCompare(String(y), 'nb') * retning;
      // Ved lik verdi er den største siden mest interessant. Det gjør at et klikk på
      // Målform samler bokmålssidene med de største øverst, som er det man er ute
      // etter når man leter etter hva som skal oversettes.
      return primaer !== 0 ? primaer : b.tegn - a.tegn;
    });
  }

  #hode(kol, tekst, hjelp) {
    const aktiv = this._sortKol === kol;
    const pil = aktiv ? (this._sortStigende ? '\u2191' : '\u2193') : '';
    return html`
      <uui-table-head-cell>
        <button class="sorter ${aktiv ? 'aktiv' : ''}" @click=${() => this.#sorter(kol)}
          aria-label=${`Sorter på ${tekst}`}>
          ${tekst}<span class="pil">${pil}</span>
        </button>
        ${hjelp
          ? html`<button class="hjelpeknapp" aria-expanded=${this._visForklaring}
              aria-label="Hva betyr konsistens" @click=${() => { this._visForklaring = !this._visForklaring; }}>?</button>`
          : nothing}
      </uui-table-head-cell>`;
  }

  /// Rein målform trenger ingen prosent. Den vises bare når siden faktisk blander,
  /// slik at tallet er et unntak som betyr noe og ikke støy på hver rad.
  #blanding(s) {
    if (s.malform === 'ukjent') {
      return html`<span class="svak">${s.nynorskTreff + s.bokmalTreff} markørord</span>`;
    }
    if (s.andel >= 1) return nothing;
    return html`<span class="svak">${prosent(s.andel)} %</span>`;
  }

  #tabell() {
    if (!this._rapport.sider.length) return nothing;
    return html`
      <uui-box headline="Alle sider">
        ${this._visForklaring
          ? html`<p class="forklaring">
              De fleste sider er skrevet i én målform, og da står bare målformen. Er siden en
              blanding, vises hvor stor del av den som er i den dominerende målformen. «75 %
              Nynorsk» betyr at en fjerdedel av teksten er bokmål, og at siden bør leses gjennom.
              Sider uten nok norsk tekst til å avgjøres står som ukjent, med antall funne
              markørord.
            </p>`
          : nothing}
        <uui-table>
          <uui-table-head>
            ${this.#hode('navn', 'Side')}
            ${this.#hode('innholdstype', 'Type')}
            ${this.#hode('malform', 'Målform', true)}
            ${this.#hode('tegn', 'Tegn')}
          </uui-table-head>
          ${this.#sorterteSider().map(
            (s) => html`
              <uui-table-row>
                <uui-table-cell>
                  <a class="sidelenke" href=${redigerLenke(s.id)}>
                    ${s.navn}
                    ${s.url ? html`<span class="url">${s.url}</span>` : nothing}
                  </a>
                </uui-table-cell>
                <uui-table-cell>${s.innholdstype}</uui-table-cell>
                <uui-table-cell>
                  <uui-tag look="secondary" color=${s.malform === 'nn' ? 'positive' : 'default'}>
                    ${ETIKETT[s.malform] ?? s.malform}
                  </uui-tag>
                  ${this.#blanding(s)}
                </uui-table-cell>
                <uui-table-cell>${tall.format(s.tegn)}</uui-table-cell>
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
    .sorter {
      background: none;
      border: 0;
      padding: 0;
      font: inherit;
      color: inherit;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .sorter:hover {
      text-decoration: underline;
    }
    .sorter.aktiv {
      font-weight: 700;
    }
    .sorter:focus-visible,
    .hjelpeknapp:focus-visible {
      outline: 2px solid var(--uui-color-focus);
      outline-offset: 2px;
    }
    .pil {
      font-size: 0.8em;
      width: 0.8em;
    }
    .hjelpeknapp {
      margin-left: 6px;
      width: 17px;
      height: 17px;
      border-radius: 50%;
      border: 1px solid var(--uui-color-border);
      background: var(--uui-color-surface);
      color: var(--uui-color-text-alt);
      font-size: 11px;
      line-height: 1;
      cursor: pointer;
      vertical-align: middle;
    }
    .hjelpeknapp:hover {
      border-color: var(--uui-color-focus);
      color: var(--uui-color-text);
    }
    .forklaring {
      background: var(--uui-color-surface-alt);
      border-radius: 4px;
      padding: var(--uui-size-space-4);
      margin: 0 0 var(--uui-size-space-4);
      color: var(--uui-color-text-alt);
      font-size: var(--uui-type-small-size);
    }
    .svak {
      color: var(--uui-color-text-alt);
    }
    .sidelenke {
      display: block;
      color: inherit;
      text-decoration: none;
    }
    .sidelenke:hover .url,
    .sidelenke:focus-visible .url {
      color: var(--uui-color-interactive-emphasis);
    }
    .sidelenke:hover {
      text-decoration: underline;
      color: var(--uui-color-interactive-emphasis);
    }
    .sidelenke:focus-visible {
      outline: 2px solid var(--uui-color-focus);
      outline-offset: 2px;
    }
    .url {
      display: block;
      font-size: var(--uui-type-small-size);
      color: var(--uui-color-text-alt);
    }
  `;
}

customElements.define('kinorge-malform-dashboard', KiNorgeMalformDashboard);
