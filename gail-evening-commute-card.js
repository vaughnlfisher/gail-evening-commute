// Gail Evening Commute Card v1.2.0
// 3-leg return: CTK->Farringdon (Thameslink) -> Farringdon->Paddington (Elizabeth) -> Paddington->Twyford (GWR/Lizzie)
// Anchored nesting: each leg shows connections catchable after the previous leg arrives.

const VER = '1.2.1';

function carrierLabel(opCode, operator) {
  if (!opCode && !operator) return '';
  const c = (opCode || '').toUpperCase();
  if (c === 'XR' || (operator || '').toLowerCase().includes('elizabeth')) return 'Elizabeth line';
  if (c === 'GW' || (operator || '').toLowerCase().includes('great western')) return 'GWR';
  return operator || c;
}
function carrierColor(opCode, operator) {
  const c = (opCode || '').toUpperCase();
  if (c === 'XR' || (operator || '').toLowerCase().includes('elizabeth')) return '#9364CC';
  if (c === 'GW' || (operator || '').toLowerCase().includes('great western')) return '#0A493E';
  return '#666';
}
function pctColor(p) {
  if (p === null || p === undefined) return 'var(--secondary-text-color)';
  if (p >= 90) return '#43a047';   /* good — muted green readable on dark+light */
  if (p >= 80) return '#fb8c00';   /* ok   — amber */
  if (p >= 70) return '#e53935';   /* poor — red */
  return '#b71c1c';                /* bad  — deep red */
}
function dayAbbr(dateStr) {
  try { return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short' }); }
  catch { return ''; }
}

function statusColor(status, delay) {
  if (!status) return '#9e9e9e';
  const s = status.toLowerCase();
  if (s === 'cancelled') return '#d32f2f';
  if (s === 'delayed' || (delay && delay >= 10)) return '#f44336';
  if (delay && delay >= 3) return '#ff9800';
  return '#4caf50';
}
function statusLabel(status, delay) {
  if (!status) return '';
  if (status.toLowerCase() === 'cancelled') return '\u2715 Cancelled';
  if (delay && delay > 0) return `+${delay}m`;
  return '\u2713 On time';
}

class GailEveningCommuteCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass = null;
    this._collapsed = {};  // train index -> bool
    this._histOpen = false;
  }
  static getStubConfig() {
    return { entity: 'sensor.gail_evening_commute_summary', title: 'Gail Evening Commute' };
  }
  setConfig(config) {
    if (!config.entity) throw new Error('entity is required');
    this._config = {
      title: 'Gail Evening Commute',
      show_header: true,
      show_last_updated: true,
      ...config,
    };
  }
  set hass(h) { this._hass = h; this._render(); }
  getCardSize() { return 8; }

  _summary() {
    const s = this._hass.states[this._config.entity];
    return s ? s.attributes : null;
  }

  _tflDeps(entityId, filterFn) {
    const s = this._hass?.states[entityId];
    if (!s?.attributes?.departures) return [];
    const now = new Date();
    return s.attributes.departures
      .filter(d => new Date(d.expected) > now && (!filterFn || filterFn(d)))
      .sort((a, b) => new Date(a.expected) - new Date(b.expected));
  }

  _tflTime(dep) {
    return new Date(dep.expected).toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'});
  }

  _styles() {
    return `
      :host{display:block}
      ha-card{overflow:hidden;font-family:var(--paper-font-body1_-_font-family,'Roboto',sans-serif);font-size:14px}
      .hdr{display:flex;align-items:center;padding:12px 16px 8px;border-bottom:1px solid var(--divider-color,#e0e0e0);gap:10px}
      .hdr-title{font-size:15px;font-weight:600;color:var(--primary-text-color)}
      .hdr-route{font-size:11px;color:var(--secondary-text-color);margin-top:1px}
      .train-block{border-bottom:2px solid var(--divider-color,rgba(0,0,0,.12))}
      .train-block:last-of-type{border-bottom:none}
      .leg-bar{display:flex;align-items:center;gap:6px;padding:3px 16px;font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--secondary-text-color);background:var(--secondary-background-color,#f5f5f5)}
      .leg1-toggle{cursor:pointer;user-select:none}
      .leg1-toggle:hover{background:var(--secondary-background-color,rgba(0,0,0,.06))}
      .total-time{margin-left:auto;font-size:.95em;font-weight:700;color:var(--primary-text-color);text-transform:none;letter-spacing:0}
      .caret{font-size:11px;transition:transform .2s;margin-left:6px}
      .caret.open{transform:rotate(180deg)}
      .carrier{border-radius:4px;padding:1px 6px;font-size:.92em;font-weight:700;color:#fff}
      .leg-pill{border-radius:10px;padding:1px 7px;font-size:9px;font-weight:800;color:#fff;text-shadow:0 1px 1px rgba(0,0,0,.35)}
      .p1{background:#007D32}   /* District line green */
      .p2{background:#9364CC}   /* Elizabeth line purple */
      .p3{background:#0A493E}   /* GWR dark green */
      .row{padding:8px 16px}
      .row .top{display:flex;align-items:baseline;justify-content:space-between;gap:6px}
      .time{font-size:1.2em;font-weight:700;color:var(--primary-text-color);flex-shrink:0}
      .meta{display:flex;align-items:center;gap:8px;flex:1;flex-wrap:wrap;font-size:.8em;color:var(--secondary-text-color)}
      .plat{background:var(--secondary-background-color,#f0f0f0);border-radius:4px;padding:1px 6px}
      .status{font-size:.8em;font-weight:600;flex-shrink:0}
      .sub{font-size:.78em;color:var(--secondary-text-color);margin-top:2px}
      .interchange{display:flex;align-items:center;gap:8px;padding:4px 16px;font-size:.72em;color:var(--secondary-text-color);font-style:italic}
      .interchange .line{flex:1;border-top:1px dashed var(--divider-color,rgba(0,0,0,.2))}
      .l2-wrap{margin-left:14px;border-left:3px solid #9364CC;padding-left:0}
      .l3-wrap{margin-left:14px;border-left:3px solid #0A493E;padding-left:0}
      .l2-row{padding:6px 16px}
      .l3-row{padding:5px 16px;font-size:.95em}
      .none{padding:6px 16px;font-size:.76em;color:var(--secondary-text-color);font-style:italic}
      .footer{padding:5px 16px;font-size:.74em;color:var(--secondary-text-color);border-top:1px solid var(--divider-color,rgba(0,0,0,.08));display:flex;justify-content:space-between}
      .no-trains{padding:18px 16px;text-align:center;color:var(--secondary-text-color)}
      .hist-toggle{display:flex;align-items:center;justify-content:space-between;padding:8px 16px;cursor:pointer;border-top:1px solid rgba(0,0,0,.12);background:#fff;user-select:none}
      .hist-toggle:hover{background:var(--secondary-background-color,rgba(0,0,0,.06))}
      .hist-toggle-lbl{font-size:11px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:#444}
      .hist-toggle-icon{font-size:14px;color:#444;transition:transform .2s}
      .hist-toggle-icon.open{transform:rotate(180deg)}
      .hist-panel-wrap{background:#fff;color:#222}.hist-section{padding:10px 16px 12px;border-top:1px solid #ddd;background:#fff}
      .hist-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px}
      .hist-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:6px}
      .hist-stat{text-align:center;background:#f5f5f5;border-radius:6px;padding:6px 4px;border:1px solid #e0e0e0}
      .hist-stat-val{font-size:1.1em;font-weight:700;color:#fff}
      .hist-stat-lbl{font-size:.7em;color:rgba(255,255,255,.85);margin-top:1px}
      .hist-days{display:flex;gap:3px;margin-bottom:4px}
      .hist-day{flex:1;text-align:center;border-radius:4px;padding:3px 2px;min-width:0}
      .hist-day-lbl{font-size:.62em;font-weight:600;color:#333}
      .hist-day-pct{font-size:.66em;font-weight:700;margin-top:1px}
      .hist-divider{border:none;border-top:1px solid #e0e0e0;margin:9px 0 7px}
    `;
  }

  _row(item, cls, opts) {
    opts = opts || {};
    const color = statusColor(item.status, item.delay_minutes);
    const lbl = statusLabel(item.status, item.delay_minutes);
    const plat = item.platform ? `<span class="plat">Plat ${item.platform}</span>` : '';
    const waitTxt = (item.wait_mins !== null && item.wait_mins !== undefined)
      ? `${item.wait_mins}m wait` : '';
    let carrierBadge = '';
    if (opts.carrier) {
      const cl = carrierLabel(item.operator_code, item.operator);
      const cc = carrierColor(item.operator_code, item.operator);
      if (cl) carrierBadge = `<span class="carrier" style="background:${cc}">${cl}</span>`;
    }
    return `<div class="row ${cls}">
      <div class="top">
        <span class="time" style="color:${color}">${item.time}</span>
        <div class="meta">${carrierBadge}${plat}${waitTxt ? `<span>${waitTxt}</span>` : ''}</div>
        <span class="status" style="color:${color}">${lbl}</span>
      </div>
      <div class="sub">Towards ${item.destination}</div>
    </div>`;
  }

  _histSection(h, pillClass, color) {
    if (!h || h.on_time_pct_7day === null || h.on_time_pct_7day === undefined) {
      return `<div class="hist-section"><div class="hist-title" style="color:${color}">${h?.label || ''}</div><div style="font-size:.76em;color:var(--secondary-text-color);font-style:italic">No data available</div></div>`;
    }
    const fmt = v => (v !== null && v !== undefined) ? `${parseFloat(v).toFixed(1)}%` : 'N/A';
    const days = (h.daily_breakdown || []).filter(d => d.on_time_pct !== null).slice(-7);
    const daysHtml = days.map(d => {
      const bg = pctColor(d.on_time_pct);
      return `<div class="hist-day" style="background:${bg}20;border:1px solid ${bg}60"><div class="hist-day-lbl" style="color:${bg}">${dayAbbr(d.date)}</div><div class="hist-day-pct" style="color:${bg}">${d.on_time_pct.toFixed(0)}%</div></div>`;
    }).join('');
    const proxyNote = h.proxy ? `<div style="font-size:.68em;color:rgba(255,255,255,.75);font-style:italic;margin-top:4px">\u2139\ufe0f Via Thameslink reliability proxy (Elizabeth line not on NR HSP)</div>` : '';
    return `<div class="hist-section">
      <div class="hist-title" style="color:${color}">${h.label || ''}</div>
      <div class="hist-stats">
        <div class="hist-stat" style="background:${pctColor(h.on_time_pct_today)};border-color:${pctColor(h.on_time_pct_today)}"><div class="hist-stat-val">${fmt(h.on_time_pct_today)}</div><div class="hist-stat-lbl">Today</div></div>
        <div class="hist-stat" style="background:${pctColor(h.on_time_pct_7day)};border-color:${pctColor(h.on_time_pct_7day)}"><div class="hist-stat-val">${fmt(h.on_time_pct_7day)}</div><div class="hist-stat-lbl">7-day</div></div>
        <div class="hist-stat" style="background:${pctColor(h.on_time_pct_30day)};border-color:${pctColor(h.on_time_pct_30day)}"><div class="hist-stat-val">${fmt(h.on_time_pct_30day)}</div><div class="hist-stat-lbl">30-day</div></div>
      </div>
      ${daysHtml ? `<div class="hist-days">${daysHtml}</div>` : ''}
      ${proxyNote}
    </div>`;
  }

  _histPanel(history) {
    const l1 = this._histSection(history.leg1, 'p1', '#007D32');
    const l2 = this._histSection(history.leg2, 'p2', '#0A493E');
    const l3 = this._histSection(history.leg3, 'p3', '#0A493E');
    return `<div class="hist-panel-wrap">${l1}<hr class="hist-divider">${l2}</div>`;
  }

  _render() {
    if (!this._hass || !this._config.entity) return;
    const s = this._summary();
    const cfg = this._config;
    const trains = (s && Array.isArray(s.trains)) ? s.trains : [];
    const lastUpdated = s?.last_updated
      ? new Date(s.last_updated).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      : null;
    const pInt = s?.paddington_interchange_mins ?? 8;

    const hdr = cfg.show_header
      ? `<div class="hdr"><span style="font-size:20px">\ud83c\udf06</span><div><div class="hdr-title">${cfg.title}</div><div class="hdr-route">Hammersmith \u2192 Paddington \u2192 Twyford</div></div></div>`
      : '';

    let blocks;
    if (!trains.length) {
      blocks = '<div class="no-trains">No services found</div>';
    } else {
      if (!this._collapsedInit) {
        trains.forEach((_, i) => { this._collapsed[i] = (i !== 0); });
        this._collapsedInit = true;
      }
      // TfL live sensor for leg1: District from HMM (filter Eastbound = toward Paddington via Earl's Court)
      // GWR live sensor for leg2: PAD→TWY
      const hmmDeps = this._tflDeps('sensor.london_tfl_district_940gzzluhsd',
        d => {
          const dest = (d.destination || '').toLowerCase();
          // Eastbound District from HMM goes: Earl's Court → Kensington → Paddington area
          // Keep: Upminster, Wimbledon (via EC), Edgware Road direction - all pass through relevant stations
          // Exclude: Ealing Broadway, Richmond (westbound)
          return !dest.includes('ealing') && !dest.includes('richmond');
        });
      const padDeps = this._tflDeps('sensor.london_tfl_great_western_railway_910gpadton',
        d => {
          const dest = (d.destination || '').toLowerCase();
          // Keep services that call at Twyford: Reading, Oxford, Swindon, Bristol, Cardiff, Didcot, Cheltenham, Worcester, Hereford, Gloucester, Bedwyn, Newbury, Maidenhead westbound
          return dest.includes('reading') || dest.includes('oxford') || dest.includes('swindon') ||
                 dest.includes('bristol') || dest.includes('cardiff') || dest.includes('didcot') ||
                 dest.includes('cheltenham') || dest.includes('worcester') || dest.includes('hereford') ||
                 dest.includes('gloucester') || dest.includes('bedwyn') || dest.includes('newbury') ||
                 dest.includes('twyford') || dest.includes('great malvern') || dest.includes('westbury') ||
                 dest.includes('penzance') || dest.includes('plymouth') || dest.includes('taunton') ||
                 dest.includes('exeter') || dest.includes('weston');
        });
      const HMM_TO_PAD_MINS = 15; // HMM→PAD via District ~15 min

      if (!padDeps.length) {
        blocks = '<div class="no-trains">No GWR services from Paddington toward Twyford</div>';
      } else {
        if (!this._collapsedInit) {
          padDeps.slice(0,3).forEach((_, i) => { this._collapsed[i] = (i !== 0); });
          this._collapsedInit = true;
        }
        blocks = padDeps.slice(0, 3).map((l2dep, idx) => {
          const collapsed = !!this._collapsed[idx];
          const l2dt = new Date(l2dep.expected);
          const l2time = this._tflTime(l2dep);
          const l2dest = l2dep.destination || 'Twyford direction';
          // Work backward to find which HMM train to catch
          const hmmNeedDepart = new Date(l2dt.getTime() - pInt * 60000 - HMM_TO_PAD_MINS * 60000);
          const hmmTrain = hmmDeps.find(d => new Date(d.expected) <= hmmNeedDepart) 
                        || hmmDeps.find(d => new Date(d.expected) <= l2dt);
          const hmmTime = hmmTrain ? this._tflTime(hmmTrain) : '—';
          const hmmDest = hmmTrain ? (hmmTrain.destination || 'Paddington direction') : 'District line';
          const totalMins = hmmTrain
            ? Math.round((l2dt - new Date(hmmTrain.expected)) / 60000) + 25 // +25 for TWY arrival approx
            : null;
          const totalTxt = totalMins ? `<span class="total-time">\u23f1 ${totalMins} min total</span>` : '';
          const caret = `<span class="caret${collapsed ? '' : ' open'}">\u25bc</span>`;

          const leg1row = `<div class="row"><span class="dep">${hmmTime}</span><span class="dest">${hmmDest}</span><span style="font-size:.72em;color:#888;margin-left:6px">~${HMM_TO_PAD_MINS}m to PAD</span></div>`;
          const leg1 = `<div class="leg-bar leg1-toggle" data-idx="${idx}"><span class="leg-pill p1">LEG 1</span>Hammersmith \u2192 Paddington \u00b7 District line ${totalTxt}${caret}</div>${leg1row}`;

          if (collapsed) return `<div class="train-block">${leg1}</div>`;

          const l2row = `<div class="l2-row"><span class="dep">${l2time}</span><span class="dest">${l2dest}</span>${l2dep.line?.designation ? `<span class="plat">Pl ${l2dep.line.designation}</span>` : ''}</div>`;
          const leg2html = `<div class="interchange"><span class="line"></span>\ud83d\udeb6 ${pInt}m interchange at Paddington<span class="line"></span></div>`
            + `<div class="leg-bar"><span class="leg-pill p2">LEG 2</span>Paddington \u2192 Twyford \u00b7 GWR</div>`
            + `<div class="l2-wrap">${l2row}</div>`;

          return `<div class="train-block">${leg1}${leg2html}</div>`;
        }).join('');
      }
      }).join('');
    }

    const history = (s && s.history) ? s.history : null;
    const histHtml = `<div class="hist-toggle" id="hist-toggle"><span class="hist-toggle-lbl">\ud83d\udcca Reliability History</span><span class="hist-toggle-icon${this._histOpen ? ' open' : ''}">\u25bc</span></div>${this._histOpen ? (history ? this._histPanel(history) : '<div class="hist-section"><div style="font-size:.76em;color:var(--secondary-text-color);font-style:italic">Reliability data loading… (updates ~30s after restart)</div></div>') : ''}`;

    const footer = cfg.show_last_updated && lastUpdated
      ? `<div class="footer"><span>Last updated: ${lastUpdated}</span><span>\ud83c\udf19</span></div>`
      : '';

    this.shadowRoot.innerHTML = `<style>${this._styles()}</style><ha-card>${hdr}${blocks}${histHtml}${footer}</ha-card>`;
    this.shadowRoot.querySelectorAll('.leg1-toggle').forEach(el => {
      el.addEventListener('click', () => {
        const i = parseInt(el.getAttribute('data-idx'), 10);
        this._collapsed[i] = !this._collapsed[i];
        this._render();
      });
    });
    const ht = this.shadowRoot.getElementById('hist-toggle');
    if (ht) ht.addEventListener('click', () => { this._histOpen = !this._histOpen; this._render(); });
  }
}

customElements.define('gail-evening-commute-card', GailEveningCommuteCard);
window.customCards = (window.customCards || []).filter(c => c.type !== 'evening-commute-multileg-card');
window.customCards.push({
  type: 'evening-commute-multileg-card',
  name: 'Evening Commute Multileg Card',
  description: 'CTK->Farringdon->Paddington->Twyford return journey, 3-level anchored nesting',
  preview: true,
});
console.info(`%c EVENING-COMMUTE-MULTILEG-CARD %c v${VER} `, 'background:#0A493E;color:#fff;font-weight:700;padding:2px 4px;border-radius:3px 0 0 3px', 'background:#9364CC;color:#fff;font-weight:700;padding:2px 4px;border-radius:0 3px 3px 0');
