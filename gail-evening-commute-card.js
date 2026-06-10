// Gail Evening Commute Card v2.2.0
// 2-leg: Hammersmith->Paddington (District) -> Paddington->Twyford (GWR)

const VER = '2.2.0';

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
      .p1{background:#007D32}   /* Thameslink red (deepened for contrast) */
      .p2{background:#0A493E}   /* Elizabeth line purple */
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
    const callHtml = (item.calling_points && item.calling_points.length)
      ? `<div class="calling">Calling at: ${item.calling_points.slice(0,4).join(', ')}${item.calling_points.length > 4 ? ` +${item.calling_points.length - 4} more` : ''}</div>` : '';
    const delayHtml = item.delay_reason ? `<div class="delay-reason">\u26a0 ${item.delay_reason}</div>` : '';
    const cancelHtml = item.cancel_reason ? `<div class="delay-reason">\u2715 ${item.cancel_reason}</div>` : '';
    const opHtml = item.operator ? `<div class="operator">${item.operator}</div>` : '';
    return `<div class="row ${cls}">
      <div class="top">
        <span class="time" style="color:${color}">${item.time}</span>
        <div class="meta">${carrierBadge}${plat}${waitTxt ? `<span>${waitTxt}</span>` : ''}</div>
        <span class="status" style="color:${color}">${lbl}</span>
      </div>
      <div class="sub">Towards ${item.destination}</div>
      ${opHtml}${callHtml}${delayHtml}${cancelHtml}
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
    const fInt = s?.paddington_interchange_mins ?? 8;
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
      blocks = trains.map((t, idx) => {
        const collapsed = !!this._collapsed[idx];
        const totalTxt = (t.total_transit_mins !== null && t.total_transit_mins !== undefined)
          ? `<span class="total-time">\u23f1 ${t.total_transit_mins} min total</span>` : '';
        const caret = `<span class="caret${collapsed ? '' : ' open'}">\u25bc</span>`;
        const leg1bar = `<div class="leg-bar leg1-toggle" data-idx="${idx}"><span class="leg-pill p1">LEG 1</span>Hammersmith \u2192 Paddington \u00b7 District line ${totalTxt}${caret}</div>`;
        const leg1 = leg1bar + this._row(t, 'row');

        if (collapsed) {
          return `<div class="train-block">${leg1}</div>`;
        }

        const leg2list = Array.isArray(t.leg2) ? t.leg2 : [];
        let leg2html;
        if (!leg2list.length) {
          leg2html = `<div class="interchange"><span class="line"></span>\ud83d\udeb6 ${fInt}m interchange<span class="line"></span></div><div class="l2-wrap"><div class="none">No onward Twyford service yet</div></div>`;
        } else {
          leg2html = `<div class="interchange"><span class="line"></span>\ud83d\udeb6 ${fInt}m interchange at Paddington<span class="line"></span></div>`
            + `<div class="leg-bar"><span class="leg-pill p2">LEG 2</span>Paddington \u2192 Twyford \u00b7 GWR</div>`
            + `<div class="l2-wrap">` + leg2list.map(l2 => this._row(l2, 'l2-row', {carrier: true})).join('') + `</div>`;
        }
        return `<div class="train-block">${leg1}${leg2html}</div>`;
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
window.customCards = (window.customCards || []).filter(c => c.type !== 'gail-evening-commute-card');
window.customCards.push({
  type: 'gail-evening-commute-card',
  name: 'Gail Evening Commute Card',
  description: 'Hammersmith->Paddington->Twyford, 2-leg anchored nesting',
  preview: true,
});
console.info(`%c GAIL-EVENING-COMMUTE-CARD %c v${VER} `, 'background:#0A493E;color:#fff;font-weight:700;padding:2px 4px;border-radius:3px 0 0 3px', 'background:#9364CC;color:#fff;font-weight:700;padding:2px 4px;border-radius:0 3px 3px 0');
