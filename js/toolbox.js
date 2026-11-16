/* Werkzeugkasten: Formelsammlung, Einheitenrechner, Schulrechner.
 * Opens as a full-screen panel (from the home screen or from inside a notebook).
 * Persistent data lives in App.settings (→ index.json, included in backups):
 *   favF: [formula ids]   ownF: [own formula cards] */
'use strict';

/* ================================================================== numbers */
const Num = {
  /** Parses "0,393", "0.393", "1.234,5", "1.000.000", "-3,5", "1e5" → {ok, v (Number), dec: {neg, digits, exp}} */
  parse(raw) {
    let s = String(raw == null ? '' : raw).trim().replace(/[\s  ']/g, '').replace(/−/g, '-');
    if (!s) return { empty: true };
    if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');      // 1.234,5
    else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');                       // 1.000.000
    else if ((s.match(/,/g) || []).length > 1) s = s.replace(/,/g, '');                         // 1,000,000
    else s = s.replace(',', '.');
    const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(s);
    if (!m || (!m[2] && !m[3])) return { error: true };
    const intp = m[2] || '', frac = m[3] || '';
    let digits = (intp + frac).replace(/^0+(?=\d)/, '');
    let exp = -frac.length + (m[4] ? parseInt(m[4], 10) : 0);
    // normalise trailing zeros into the exponent
    while (digits.length > 1 && digits.endsWith('0')) { digits = digits.slice(0, -1); exp++; }
    const v = Number(m[1] + (intp || '0') + '.' + (frac || '0') + (m[4] ? 'e' + m[4] : ''));
    if (!Number.isFinite(v)) return { error: true };
    return { ok: true, v, dec: { neg: m[1] === '-' && /[1-9]/.test(digits), digits, exp } };
  },
  /** exact decimal → German string ("393.000", "0,000393") or null if it should be shown in scientific form */
  decString(d) {
    if (/^0+$/.test(d.digits)) return '0';
    const n = d.digits.length, pointPos = n + d.exp;   // digits before the decimal point
    const mag = pointPos - 1;
    if (mag >= 15 || mag < -7) return null;
    let ip, fp;
    if (pointPos <= 0) { ip = '0'; fp = '0'.repeat(-pointPos) + d.digits; }
    else if (pointPos >= n) { ip = d.digits + '0'.repeat(pointPos - n); fp = ''; }
    else { ip = d.digits.slice(0, pointPos); fp = d.digits.slice(pointPos); }
    ip = ip.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (d.neg ? '−' : '') + ip + (fp ? ',' + fp : '');
  },
  /** exact decimal in scientific form, all digits kept: 1,23456789123 · 10¹⁷ */
  decSci(d) {
    const e = d.digits.length - 1 + d.exp, m = d.digits[0] + (d.digits.length > 1 ? ',' + d.digits.slice(1) : '');
    return (d.neg ? '−' : '') + m + ' · 10' + Num.sup(e);
  },
  /** Number → German string with up to `sig` significant digits; scientific for very large/small values */
  fmt(v, sig = 12) {
    if (!Number.isFinite(v)) return '–';
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (a >= 1e15 || a < 1e-7) {
      const e = Math.floor(Math.log10(a)), m = v / Math.pow(10, e);
      return Num.trim(m.toPrecision(Math.min(sig, 10))).replace('.', ',').replace('-', '−') + ' · 10' + Num.sup(e);
    }
    const p = Number(v.toPrecision(sig));
    const s = Num.trim(p.toFixed(Math.max(0, Math.min(14, sig - 1 - Math.floor(Math.log10(a))))));
    const [ip, fp] = s.replace('-', '').split('.');
    return (v < 0 ? '−' : '') + ip.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (fp ? ',' + fp : '');
  },
  trim(s) { return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s; },
  sup(n) { return String(n).replace(/-/g, '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]); },
  /** value for calculators: rounded to `dec` decimals, German */
  r(v, dec = 3) {
    if (!Number.isFinite(v)) return '–';
    const a = Math.abs(v);
    if (a !== 0 && (a < 1e-4 || a >= 1e12)) return Num.fmt(v, 6);
    const f = Math.pow(10, dec), x = Math.round(v * f) / f;
    return Num.fmt(Object.is(x, -0) ? 0 : x, 15);
  }
};

/* ================================================================== units */
const UNIT_CATS = [
  { name: 'Länge', units: [['mm', 'Millimeter', 1e-3], ['cm', 'Zentimeter', 1e-2], ['dm', 'Dezimeter', 1e-1], ['m', 'Meter', 1], ['km', 'Kilometer', 1e3]] },
  { name: 'Fläche', units: [['mm²', 'Quadratmillimeter', 1e-6], ['cm²', 'Quadratzentimeter', 1e-4], ['dm²', 'Quadratdezimeter', 1e-2], ['m²', 'Quadratmeter', 1], ['a', 'Ar', 1e2], ['ha', 'Hektar', 1e4], ['km²', 'Quadratkilometer', 1e6]] },
  { name: 'Volumen', units: [['mm³', 'Kubikmillimeter', 1e-9], ['ml', 'Milliliter', 1e-6], ['cm³', 'Kubikzentimeter', 1e-6], ['l', 'Liter', 1e-3], ['dm³', 'Kubikdezimeter', 1e-3], ['m³', 'Kubikmeter', 1]] },
  { name: 'Masse', units: [['mg', 'Milligramm', 1e-6], ['g', 'Gramm', 1e-3], ['kg', 'Kilogramm', 1], ['t', 'Tonne', 1e3]] },
  { name: 'Zeit', units: [['s', 'Sekunden', 1], ['min', 'Minuten', 60], ['h', 'Stunden', 3600]] },
  { name: 'Geschwindigkeit', units: [['m/s', 'Meter pro Sekunde', 1], ['m/min', 'Meter pro Minute', 1 / 60], ['km/h', 'Kilometer pro Stunde', 1 / 3.6]] },
  { name: 'Kraft', units: [['N', 'Newton', 1], ['kN', 'Kilonewton', 1e3]] },
  { name: 'Druck', units: [['Pa', 'Pascal', 1], ['hPa', 'Hektopascal', 1e2], ['kPa', 'Kilopascal', 1e3], ['N/cm²', 'Newton pro cm²', 1e4], ['bar', 'Bar', 1e5], ['MPa', 'Megapascal', 1e6], ['N/mm²', 'Newton pro mm²', 1e6]] },
  { name: 'Leistung', units: [['W', 'Watt', 1], ['kW', 'Kilowatt', 1e3], ['MW', 'Megawatt', 1e6]] },
  { name: 'Energie & Arbeit', units: [['J', 'Joule', 1], ['kJ', 'Kilojoule', 1e3], ['MJ', 'Megajoule', 1e6], ['Wh', 'Wattstunden', 3600], ['kWh', 'Kilowattstunden', 3.6e6]] },
  { name: 'Temperatur', temp: true, units: [['°C', 'Celsius'], ['°F', 'Fahrenheit'], ['K', 'Kelvin']] }
];
const Units = {
  /** converts; returns {v, text, exact} */
  convert(cat, inp, from, to) {
    if (cat.temp) {
      const toK = { '°C': (x) => x + 273.15, '°F': (x) => (x - 32) * 5 / 9 + 273.15, 'K': (x) => x };
      const fromK = { '°C': (k) => k - 273.15, '°F': (k) => (k - 273.15) * 9 / 5 + 32, 'K': (k) => k };
      const k = toK[from](inp.v), v = fromK[to](k);
      return { v, text: Num.fmt(v, 12), kelvin: k };
    }
    const f1 = cat.units.find((u) => u[0] === from)[2], f2 = cat.units.find((u) => u[0] === to)[2];
    const k = Math.log10(f1 / f2);
    if (Math.abs(k - Math.round(k)) < 1e-9) {           // pure power of ten → shift the decimal point exactly
      const d = Object.assign({}, inp.dec, { exp: inp.dec.exp + Math.round(k) });
      const s = Num.decString(d);
      return { v: inp.v * f1 / f2, text: s != null ? s : Num.decSci(d), exact: true };
    }
    const v = inp.v * f1 / f2;
    return { v, text: Num.fmt(v, 12) };
  },
  factorText(cat, from, to) {
    if (cat.temp) {
      const F = { '°C>K': 'K = °C + 273,15', 'K>°C': '°C = K − 273,15', '°C>°F': '°F = °C · 9/5 + 32', '°F>°C': '°C = (°F − 32) · 5/9', '°F>K': 'K = (°F − 32) · 5/9 + 273,15', 'K>°F': '°F = (K − 273,15) · 9/5 + 32' };
      return F[from + '>' + to] || 'gleiche Einheit';
    }
    if (from === to) return 'gleiche Einheit';
    const f1 = cat.units.find((u) => u[0] === from)[2], f2 = cat.units.find((u) => u[0] === to)[2];
    const r = Units.convert(cat, Num.parse('1'), from, to);
    return `1 ${from} = ${r.text} ${to}  →  ` + (f1 < f2 ? `durch ${Num.fmt(f2 / f1, 12)} teilen` : `mit ${Num.fmt(f1 / f2, 12)} multiplizieren`);
  }
};

/* ================================================================== toolbox panel */
const Toolbox = {
  state: { tab: 'formulas', q: '', cat: 'Alle', sort: 'cat', sel: null, uc: 'Volumen', uf: 'm³', ut: 'l', uv: '', calc: 'material', mode: 'wand' },
  catColor: { Mathematik: '#0f9f94', Metalltechnik: '#64748b', Elektrotechnik: '#e8a10a', Bautechnik: '#b8692e', Physik: '#7c5cf0', Eigene: '#db4f97' },

  open(tab, ctx) {
    const T = Toolbox;
    if (tab) T.state.tab = tab;
    T.ctx = ctx || null;
    const p = openPanel(`
      <div class="topbar"><button class="ibtn" data-a="close">${icon('close')}</button>
        <div class="title">Werkzeugkasten</div>
        <div class="tb-tabs">
          <button data-tab="formulas">${icon('fn')}<span>Formelsammlung</span></button>
          <button data-tab="units">${icon('swap')}<span>Einheitenrechner</span></button>
          <button data-tab="calc">${icon('calc')}<span>Schulrechner</span></button>
        </div><div class="spacer"></div></div>
      <div class="tb-body"></div>`);
    p.classList.add('toolbox');
    T.panel = p; T.body = $('.tb-body', p);
    const ov = { close: () => T.close() };
    T.ov = ov; pushOverlay(ov);
    $('[data-a=close]', p).onclick = () => T.close();
    $$('[data-tab]', p).forEach((b) => b.onclick = () => { T.state.tab = b.dataset.tab; T.render(); });
    T._resize = () => { if (T.state.tab === 'formulas') T.renderFormulas(); };
    window.addEventListener('resize', T._resize);
    T.render();
  },
  close() {
    const T = Toolbox;
    if (!T.panel) return;
    window.removeEventListener('resize', T._resize);
    T.panel.remove(); popOverlay(T.ov); T.panel = null;
  },
  render() {
    const T = Toolbox;
    $$('[data-tab]', T.panel).forEach((b) => b.classList.toggle('on', b.dataset.tab === T.state.tab));
    if (T.state.tab === 'formulas') T.renderFormulas();
    else if (T.state.tab === 'units') T.renderUnits();
    else T.renderCalc();
  },
  save() { App.saveIndex(); },
  narrow() { return window.innerWidth < 900; },
  /** insert into the open notebook (only when opened from a notebook) */
  insert(htmlStr) {
    if (!Toolbox.ctx || !Toolbox.ctx.insert) return;
    Toolbox.close();
    Toolbox.ctx.insert(htmlStr);
    toast('Ins Heft übernommen ✓');
  },

  /* ---------------------------------------------------------------- formulas */
  all() {
    const own = (App.settings.ownF || []).map((f) => Object.assign({ own: true }, f));
    return FORMULAS.concat(own);
  },
  isFav(id) { return (App.settings.favF || []).includes(id); },
  toggleFav(id) {
    const s = App.settings, l = s.favF || (s.favF = []);
    const i = l.indexOf(id);
    if (i >= 0) l.splice(i, 1); else l.push(id);
    Toolbox.save();
  },
  filtered() {
    const T = Toolbox, st = T.state, q = st.q.trim().toLowerCase();
    let l = T.all();
    if (st.cat === '★') l = l.filter((f) => T.isFav(f.id));
    else if (st.cat === 'Eigene') l = l.filter((f) => f.own);
    else if (st.cat !== 'Alle') l = l.filter((f) => f.cat === st.cat);
    if (q) {
      const plain = (x) => String(x || '').replace(/<[^>]+>/g, '').toLowerCase();
      l = l.filter((f) => [f.name, f.cat, f.f, f.use, (f.alt || []).join(' '), (f.v || []).map((v) => v.join(' ')).join(' '), f.exText].some((x) => plain(x).includes(q)));
    }
    const catIdx = (c) => { const i = FORMULA_CATS.indexOf(c); return i < 0 ? 99 : i; };
    l.sort(st.sort === 'name' ? (a, b) => a.name.localeCompare(b.name, 'de') : (a, b) => catIdx(a.cat) - catIdx(b.cat) || (a.own ? 1 : 0) - (b.own ? 1 : 0));
    return l;
  },
  renderFormulas() {
    const T = Toolbox, st = T.state;
    const focus = document.activeElement && document.activeElement.id === 'tb-q';
    const caret = focus ? document.activeElement.selectionStart : null;
    const list = T.filtered();
    if (st.sel && !T.all().some((f) => f.id === st.sel)) st.sel = null;
    if (!st.sel && !T.narrow() && list.length) st.sel = list[0].id;
    const showDetail = st.sel && (!T.narrow() || st.detail);
    T.body.innerHTML = `<div class="tb-split ${T.narrow() ? 'narrow' : ''} ${showDetail && T.narrow() ? 'show-detail' : ''}">
      <div class="tb-list">
        <div class="tb-search"><span>${icon('search')}</span><input id="tb-q" type="text" placeholder="Formel suchen, z. B. Druck, Ohm, U = R · I" value="${esc(st.q)}" autocomplete="off"></div>
        <div class="tb-chips">${['Alle', '★', ...FORMULA_CATS, 'Eigene'].map((c) => `<button class="chip ${st.cat === c ? 'on' : ''}" data-cat="${esc(c)}">${c === '★' ? '★ Favoriten' : esc(c)}</button>`).join('')}</div>
        <div class="tb-row"><select id="tb-sort"><option value="cat">Nach Fachbereich</option><option value="name">Nach Name (A–Z)</option></select>
          <span class="muted" style="font-size:13px">${list.length} Formeln</span><div class="spacer"></div>
          <button class="btn small tonal" data-a="new">${icon('plus')}Eigene Formel</button></div>
        <div class="tb-items"></div>
      </div>
      <div class="tb-detail"></div></div>`;
    const items = $('.tb-items', T.body);
    let lastCat = null;
    if (!list.length) items.innerHTML = `<div class="empty" style="padding:30px 10px">${st.cat === '★' ? 'Noch keine Favoriten – tippe in einer Formelkarte auf ☆.' : st.cat === 'Eigene' ? 'Noch keine eigenen Formeln. Lege mit „Eigene Formel“ eine an.' : 'Keine Formel gefunden.'}</div>`;
    for (const f of list) {
      if (st.sort === 'cat' && f.cat !== lastCat) { items.appendChild(html(`<div class="tb-group" style="--c:${T.catColor[f.cat] || '#888'}">${esc(f.cat)}</div>`)); lastCat = f.cat; }
      const b = html(`<button class="tb-item ${f.id === st.sel ? 'on' : ''}" style="--c:${T.catColor[f.cat] || '#888'}">
        <span class="tb-dot"></span><span class="tb-it"><b>${esc(f.name)}${f.own ? ' <small class="tb-own">eigene</small>' : ''}</b><span class="tb-f">${f.own ? esc(f.f) : f.f}</span></span>
        <span class="tb-star ${T.isFav(f.id) ? 'on' : ''}">${T.isFav(f.id) ? '★' : '☆'}</span></button>`);
      b.onclick = (e) => {
        if (e.target.closest('.tb-star')) { T.toggleFav(f.id); T.renderFormulas(); return; }
        st.sel = f.id; st.detail = true; T.renderFormulas();
        if (!T.narrow()) { const d = $('.tb-detail', T.body); if (d) d.scrollTop = 0; }
      };
      items.appendChild(b);
    }
    $('#tb-sort', T.body).value = st.sort;
    $('#tb-sort', T.body).onchange = (e) => { st.sort = e.target.value; T.renderFormulas(); };
    const q = $('#tb-q', T.body);
    q.addEventListener('input', debounce(() => { st.q = q.value; T.renderFormulas(); }, 180));
    if (focus) { q.focus(); try { q.setSelectionRange(caret, caret); } catch (e) { /* */ } }
    $$('[data-cat]', T.body).forEach((b) => b.onclick = () => { st.cat = b.dataset.cat; T.renderFormulas(); });
    $('[data-a=new]', T.body).onclick = () => T.editOwn(null);
    const sel = T.all().find((f) => f.id === st.sel);
    if (sel && showDetail) T.renderCard($('.tb-detail', T.body), sel);
    else if (!T.narrow()) $('.tb-detail', T.body).innerHTML = '<div class="empty">Formel links auswählen</div>';
    const cur = $('.tb-item.on', T.body);
    if (cur && !focus) cur.scrollIntoView({ block: 'nearest' });
  },
  renderCard(box, f) {
    const T = Toolbox, st = T.state;
    const E = (x) => (f.own ? esc(x) : x);   // built-in cards contain trusted markup (sub/sup)
    const ex = f.ex;
    box.innerHTML = `<article class="tb-card" style="--c:${T.catColor[f.cat] || '#888'}">
      <div class="tb-card-head">
        ${T.narrow() ? `<button class="ibtn" data-a="back">${icon('back')}</button>` : ''}
        <div style="flex:1;min-width:0"><span class="tb-cat">${esc(f.cat)}</span><h2>${esc(f.name)}</h2></div>
        <button class="ibtn tb-favbtn ${T.isFav(f.id) ? 'on' : ''}" data-a="fav" title="Favorit">${T.isFav(f.id) ? '★' : '☆'}</button>
        ${f.own ? `<button class="ibtn" data-a="edit" title="Bearbeiten">${icon('edit')}</button><button class="ibtn" data-a="del" title="Löschen">${icon('trash')}</button>` : ''}
      </div>
      <div class="tb-formula">${E(f.f)}</div>
      ${(f.alt && f.alt.length) ? `<div class="tb-sec">Umstellungen & Hinweise</div><ul class="tb-alt">${f.alt.map((a) => `<li>${E(a)}</li>`).join('')}</ul>` : ''}
      ${(f.v && f.v.length) ? `<div class="tb-sec">Bedeutung</div><table class="tb-vars"><tr><th>Größe</th><th>Bedeutung</th><th>Einheit</th></tr>${f.v.map(([s, m, u]) => `<tr><td><b>${E(s)}</b></td><td>${E(m)}</td><td>${E(u || '')}</td></tr>`).join('')}</table>` : ''}
      ${f.use ? `<div class="tb-sec">Wofür?</div><p>${E(f.use)}</p>` : ''}
      ${ex ? `<div class="tb-sec">Beispielrechnung</div><div class="tb-ex">
        <div><span class="muted">Gegeben:</span> ${ex.g.join(' · ')}</div>
        <div><span class="muted">Gesucht:</span> ${ex.s}</div>
        <div class="tb-steps">${ex.r.map((x) => `<div>${x}</div>`).join('')}</div>
        <div class="tb-result">Ergebnis: ${ex.e}</div></div>` : ''}
      ${f.exText ? `<div class="tb-sec">Beispiel</div><div class="tb-ex" style="white-space:pre-wrap">${esc(f.exText)}</div>` : ''}
      ${T.ctx && T.ctx.insert ? `<div style="margin-top:16px"><button class="btn primary" data-a="ins">${icon('plus')}Ins Heft übernehmen</button></div>` : ''}
    </article>`;
    const on = (a, fn) => { const b = $(`[data-a=${a}]`, box); if (b) b.onclick = fn; };
    on('back', () => { st.detail = false; T.renderFormulas(); });
    on('fav', () => { T.toggleFav(f.id); T.renderFormulas(); });
    on('edit', () => T.editOwn(f));
    on('del', async () => {
      if (!(await confirm2('Formel löschen?', `„${f.name}“ wird gelöscht.`))) return;
      App.settings.ownF = (App.settings.ownF || []).filter((x) => x.id !== f.id);
      App.settings.favF = (App.settings.favF || []).filter((x) => x !== f.id);
      st.sel = null; st.detail = false; T.save(); T.renderFormulas();
    });
    on('ins', () => {
      const plainEx = ex ? `<div><i>Beispiel:</i> ${ex.g.join(', ')} → ${ex.r[ex.r.length - 1]}</div>` : f.exText ? `<div><i>Beispiel:</i> ${esc(f.exText).replace(/\n/g, '<br>')}</div>` : '';
      T.insert(`<div><b><span style="color:#1f4fd1">${esc(f.name)}</span></b></div><div><b>${E(f.f)}</b></div>` +
        ((f.v || []).length ? '<ul>' + f.v.map(([s, m, u]) => `<li>${E(s)} = ${E(m)}${u ? ' [' + E(u) + ']' : ''}</li>`).join('') + '</ul>' : '') + plainEx);
    });
  },
  async editOwn(f) {
    const T = Toolbox;
    const cats = FORMULA_CATS.concat(['Eigene']);
    const varsTxt = f ? (f.v || []).map(([s, m, u]) => `${s} = ${m}${u ? ' (' + u + ')' : ''}`).join('\n') : '';
    const res = await dialog({
      title: f ? 'Eigene Formel bearbeiten' : 'Eigene Formel anlegen', wide: true,
      body: `<div class="field"><label>Name</label><input type="text" id="of-n" value="${esc(f ? f.name : '')}" placeholder="z. B. Hebelgesetz" autofocus></div>
        <div class="field"><label>Fachbereich</label><select id="of-c">${cats.map((c) => `<option ${f && f.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
        <div class="field"><label>Formel</label><input type="text" id="of-f" value="${esc(f ? f.f : '')}" placeholder="z. B. F₁ · l₁ = F₂ · l₂"></div>
        <div class="field"><label>Umstellungen (optional, eine pro Zeile)</label><textarea id="of-a" rows="2">${esc(f ? (f.alt || []).join('\n') : '')}</textarea></div>
        <div class="field"><label>Größen – eine pro Zeile: Zeichen = Bedeutung (Einheit)</label><textarea id="of-v" rows="4" placeholder="F = Kraft (N)&#10;l = Hebelarm (m)">${esc(varsTxt)}</textarea></div>
        <div class="field"><label>Wofür? (optional)</label><input type="text" id="of-u" value="${esc(f ? f.use || '' : '')}"></div>
        <div class="field"><label>Beispiel (optional)</label><textarea id="of-e" rows="3">${esc(f ? f.exText || '' : '')}</textarea></div>`,
      buttons: [{ label: 'Abbrechen', value: null }, { label: 'Speichern', cls: 'primary', validate: (d) => { if (!$('#of-n', d).value.trim() || !$('#of-f', d).value.trim()) { toast('Name und Formel sind Pflicht'); return false; } return true; },
        value: (d) => ({ name: $('#of-n', d).value.trim(), cat: $('#of-c', d).value, f: $('#of-f', d).value.trim(),
          alt: $('#of-a', d).value.split('\n').map((x) => x.trim()).filter(Boolean),
          v: $('#of-v', d).value.split('\n').map((x) => x.trim()).filter(Boolean).map((line) => { const m = /^(.+?)\s*[=:]\s*(.+?)(?:\s*[([]([^)\]]+)[)\]])?\s*$/.exec(line); return m ? [m[1], m[2], m[3] || ''] : [line, '', '']; }),
          use: $('#of-u', d).value.trim(), exText: $('#of-e', d).value.trim() }) }]
    });
    if (!res) return;
    const s = App.settings, l = s.ownF || (s.ownF = []);
    if (f) Object.assign(l.find((x) => x.id === f.id), res);
    else { res.id = 'own-' + uid(); l.push(res); T.state.sel = res.id; T.state.detail = true; }
    T.save(); T.renderFormulas();
    toast('Formel gespeichert ✓');
  },

  /* ---------------------------------------------------------------- unit converter */
  renderUnits() {
    const T = Toolbox, st = T.state;
    const cat = UNIT_CATS.find((c) => c.name === st.uc) || UNIT_CATS[0];
    if (!cat.units.some((u) => u[0] === st.uf)) st.uf = cat.units[0][0];
    if (!cat.units.some((u) => u[0] === st.ut)) st.ut = cat.units[Math.min(1, cat.units.length - 1)][0];
    const opts = (sel) => cat.units.map(([u, n]) => `<option value="${esc(u)}" ${u === sel ? 'selected' : ''}>${esc(n)} (${esc(u)})</option>`).join('');
    T.body.innerHTML = `<div class="tb-page">
      <div class="tb-chips wrap">${UNIT_CATS.map((c) => `<button class="chip ${c.name === cat.name ? 'on' : ''}" data-uc="${esc(c.name)}">${esc(c.name)}</button>`).join('')}</div>
      <div class="tb-conv">
        <div class="tb-field"><label>Wert</label><input id="u-v" type="text" inputmode="decimal" value="${esc(st.uv)}" placeholder="z. B. 0,393" autocomplete="off"></div>
        <div class="tb-field"><label>von</label><select id="u-f">${opts(st.uf)}</select></div>
        <button class="ibtn tb-swap" data-a="swap" title="Einheiten tauschen">${icon('swap')}</button>
        <div class="tb-field"><label>nach</label><select id="u-t">${opts(st.ut)}</select></div>
        <button class="btn" data-a="clr">${icon('close')}Löschen</button>
      </div>
      <div class="tb-bigres" id="u-res"></div>
      <div class="tb-sec">Alle Einheiten auf einen Blick</div>
      <div class="tb-all" id="u-all"></div>
    </div>`;
    const v = $('#u-v', T.body), f = $('#u-f', T.body), t = $('#u-t', T.body);
    const upd = () => {
      st.uv = v.value; st.uf = f.value; st.ut = t.value;
      const res = $('#u-res', T.body), all = $('#u-all', T.body);
      const inp = Num.parse(v.value);
      if (inp.empty) { res.innerHTML = '<div class="muted">Gib oben einen Wert ein – das Ergebnis erscheint sofort.</div>'; all.innerHTML = ''; return; }
      if (inp.error) { res.innerHTML = '<div class="tb-err">Ungültige Eingabe – bitte eine Zahl eingeben, z. B. 0,393 oder 1.500,5</div>'; all.innerHTML = ''; return; }
      const r = Units.convert(cat, inp, st.uf, st.ut);
      const shownIn = cat.temp ? Num.fmt(inp.v, 12) : (Num.decString(inp.dec) || Num.fmt(inp.v, 15));
      let warn = '';
      if (cat.temp && r.kelvin < -1e-9) warn = '<div class="tb-err">Achtung: Das liegt unter dem absoluten Nullpunkt (0 K = −273,15 °C) – physikalisch nicht möglich.</div>';
      res.innerHTML = `<div class="tb-from">${shownIn} ${esc(st.uf)} =</div><div class="tb-to">${r.text} <span>${esc(st.ut)}</span></div>
        <div class="muted tb-factor">${esc(Units.factorText(cat, st.uf, st.ut))}</div>${warn}`;
      all.innerHTML = cat.units.map(([u, n]) => { const x = Units.convert(cat, inp, st.uf, u); return `<button class="tb-allrow ${u === st.ut ? 'on' : ''}" data-u="${esc(u)}"><span>${esc(n)}</span><b>${x.text}&nbsp;<i>${esc(u)}</i></b></button>`; }).join('');
      $$('[data-u]', all).forEach((b) => b.onclick = () => { t.value = b.dataset.u; upd(); });
    };
    v.addEventListener('input', upd); f.addEventListener('change', upd); t.addEventListener('change', upd);
    $('[data-a=swap]', T.body).onclick = () => { const a = f.value; f.value = t.value; t.value = a; upd(); };
    $('[data-a=clr]', T.body).onclick = () => { v.value = ''; upd(); v.focus(); };
    $$('[data-uc]', T.body).forEach((b) => b.onclick = () => { st.uc = b.dataset.uc; st.uf = ''; st.ut = ''; T.renderUnits(); });
    upd();
  },

  /* ---------------------------------------------------------------- school calculators */
  CALCS: { material: 'Mörtel & Material', kreis: 'Kreis & Zylinder', flaeche: 'Rechteck & Trapez', auflager: 'Auflagerkräfte (Träger)' },
  renderCalc() {
    const T = Toolbox, st = T.state;
    T.body.innerHTML = `<div class="tb-page">
      <div class="tb-chips wrap">${Object.entries(T.CALCS).map(([k, n]) => `<button class="chip ${st.calc === k ? 'on' : ''}" data-c="${k}">${esc(n)}</button>`).join('')}</div>
      <div class="tb-calc"><div class="tb-form"></div><div class="tb-out"></div></div></div>`;
    $$('[data-c]', T.body).forEach((b) => b.onclick = () => { st.calc = b.dataset.c; T.renderCalc(); });
    T['calc_' + st.calc]($('.tb-form', T.body), $('.tb-out', T.body));
  },
  /** builds input fields; returns getter object */
  fields(form, defs, onChange) {
    const st = Toolbox.state, store = st.vals || (st.vals = {});
    form.innerHTML = defs.map((d) => d.sep ? `<div class="tb-sec" style="margin-top:6px">${d.sep}</div>` : d.sel
      ? `<div class="tb-field"><label>${d.label}</label><select data-k="${d.k}">${d.sel.map((o) => `<option ${(store[d.k] || d.def) === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>`
      : `<div class="tb-field"><label>${d.label}</label><div class="tb-unitin"><input data-k="${d.k}" type="text" inputmode="decimal" autocomplete="off" placeholder="${esc(d.ph || '')}" value="${esc(store[d.k] != null ? store[d.k] : (d.def != null ? d.def : ''))}"><span>${d.unit || ''}</span></div></div>`).join('')
      + `<button class="btn" data-a="reset" style="margin-top:6px">${icon('close')}Alle Felder leeren</button>`;
    const get = () => {
      const o = { bad: [] };
      $$('[data-k]', form).forEach((el) => {
        store[el.dataset.k] = el.value;
        if (el.tagName === 'SELECT') { o[el.dataset.k] = el.value; return; }
        const p = Num.parse(el.value);
        el.classList.toggle('bad', !!p.error);
        if (p.error) o.bad.push(el.closest('.tb-field').querySelector('label').textContent);
        o[el.dataset.k] = p.ok ? p.v : null;
      });
      return o;
    };
    $$('[data-k]', form).forEach((el) => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => onChange(get())));
    $('[data-a=reset]', form).onclick = () => { $$('input[data-k]', form).forEach((el) => { el.value = ''; delete store[el.dataset.k]; }); onChange(get()); };
    onChange(get());
  },
  /** result card with formula, calculation path and result lines; steps: [{t: title, f: formula, c: calculation, r: result}] */
  out(box, title, steps, msg) {
    const T = Toolbox;
    if (msg) { box.innerHTML = `<div class="tb-card"><h2>${title}</h2><div class="${msg.err ? 'tb-err' : 'muted'}">${msg.text}</div></div>`; return; }
    box.innerHTML = `<div class="tb-card"><h2>${title}</h2>${steps.map((s) => `<div class="tb-step"><div class="tb-step-t">${s.t}</div>
      ${s.f ? `<div class="tb-step-f">${s.f}</div>` : ''}${s.c ? `<div class="tb-step-c">${s.c}</div>` : ''}<div class="tb-step-r">${s.r}</div></div>`).join('')}
      ${T.ctx && T.ctx.insert ? `<button class="btn primary" data-a="ins" style="margin-top:14px">${icon('plus')}Rechenweg ins Heft</button>` : ''}</div>`;
    const b = $('[data-a=ins]', box);
    if (b) b.onclick = () => T.insert(`<div><b><span style="color:#1f4fd1">${title}</span></b></div>` + steps.map((s) => `<div>${s.t}: ${s.f ? s.f + ' → ' : ''}${s.c ? s.c + ' ' : ''}<b>${s.r}</b></div>`).join(''));
  },
  calc_material(form, out) {
    const T = Toolbox, st = T.state, R = Num.r;
    const mode = st.mode;
    const defs = [{ k: 'mode', label: 'Berechnung', sel: ['Mauermörtel für eine Wand', 'Material nach Volumen (z. B. Beton, Estrich)'], def: mode === 'vol' ? 'Material nach Volumen (z. B. Beton, Estrich)' : 'Mauermörtel für eine Wand' }];
    if (mode === 'vol') defs.push({ sep: 'Maße' }, { k: 'vl', label: 'Länge', unit: 'm' }, { k: 'vb', label: 'Breite', unit: 'm' }, { k: 'vh', label: 'Höhe / Dicke', unit: 'm' }, { k: 'vv', label: '… oder Volumen direkt', unit: 'm³' },
      { sep: 'Material' }, { k: 'vc', label: 'Materialbedarf je m³', unit: 'kg/m³', ph: 'z. B. 2000 (Trockenbeton)' }, { k: 'vz', label: 'Zuschlag / Verschnitt', unit: '%', def: '5' }, { k: 'vs', label: 'Sackgewicht', unit: 'kg', def: '40' });
    else defs.push({ sep: 'Wandfläche' }, { k: 'wl', label: 'Wandlänge', unit: 'm' }, { k: 'wh', label: 'Wandhöhe', unit: 'm' }, { k: 'wa', label: '… oder Fläche direkt', unit: 'm²' }, { k: 'wo', label: 'Öffnungen abziehen (nur > 2,5 m²)', unit: 'm²', def: '0' },
      { sep: 'Mörtel' }, { k: 'wm', label: 'Mörtelbedarf je m² (Tabelle)', unit: 'l/m²', ph: 'z. B. 50' }, { k: 'wk', label: 'Trockenmörtel je Liter Frischmörtel', unit: 'kg/l', def: '1,5' }, { k: 'wz', label: 'Zuschlag / Verlust', unit: '%', def: '5' }, { k: 'ws', label: 'Sackgewicht', unit: 'kg', def: '40' });
    T.fields(form, defs, (v) => {
      const newMode = /Volumen/.test(v.mode) ? 'vol' : 'wand';
      if (newMode !== st.mode) { st.mode = newMode; return T.renderCalc(); }
      if (v.bad.length) return T.out(out, 'Ergebnis', null, { err: true, text: 'Ungültige Eingabe bei: ' + v.bad.join(', ') });
      if (st.mode === 'vol') {
        let V, s1;
        if (v.vv != null) { V = v.vv; s1 = { t: 'Volumen', r: `V = ${R(V)} m³` }; }
        else if (v.vl != null && v.vb != null && v.vh != null) { V = v.vl * v.vb * v.vh; s1 = { t: 'Volumen', f: 'V = l · b · h', c: `V = ${R(v.vl)} m · ${R(v.vb)} m · ${R(v.vh)} m`, r: `V = ${R(V)} m³` }; }
        else return T.out(out, 'Material nach Volumen', null, { text: 'Gib Länge, Breite und Höhe ein – oder das Volumen direkt.' });
        if (V < 0) return T.out(out, 'Material nach Volumen', null, { err: true, text: 'Das Volumen ist negativ – bitte die Maße prüfen.' });
        const steps = [s1, { t: 'in Liter', f: '1 m³ = 1000 l', c: `${R(V)} m³ · 1000`, r: `${Num.fmt(V * 1000, 10)} l` }];
        if (v.vc != null) {
          const z = v.vz || 0, m = V * v.vc * (1 + z / 100);
          steps.push({ t: 'Materialbedarf', f: 'm = V · Bedarf je m³ · (1 + Zuschlag / 100)', c: `m = ${R(V)} m³ · ${R(v.vc)} kg/m³ · ${R(1 + z / 100, 4)}`, r: `m = ${R(m, 1)} kg` });
          if (v.vs) steps.push({ t: 'Säcke', f: 'Säcke = m / Sackgewicht (aufrunden)', c: `${R(m, 1)} kg / ${R(v.vs)} kg = ${R(m / v.vs, 2)}`, r: `<b>${Math.ceil(m / v.vs - 1e-9)} Säcke</b>` });
        }
        return T.out(out, 'Material nach Volumen', steps);
      }
      let A, s1;
      if (v.wa != null) { A = v.wa; s1 = { t: 'Wandfläche', r: `A = ${R(A)} m²` }; }
      else if (v.wl != null && v.wh != null) { A = v.wl * v.wh; s1 = { t: 'Wandfläche', f: 'A = l · h', c: `A = ${R(v.wl)} m · ${R(v.wh)} m`, r: `A = ${R(A)} m²` }; }
      else return T.out(out, 'Mauermörtel', null, { text: 'Gib Wandlänge und Wandhöhe ein – oder die Fläche direkt.' });
      const steps = [s1];
      if (v.wo) { A -= v.wo; steps.push({ t: 'Öffnungen abziehen', f: 'Öffnungen ≤ 2,5 m² werden übermessen', c: `${R(A + v.wo)} m² − ${R(v.wo)} m²`, r: `A = ${R(A)} m²` }); }
      if (A <= 0) return T.out(out, 'Mauermörtel', null, { err: true, text: 'Die Fläche ist nicht positiv – bitte Maße und Öffnungen prüfen.' });
      if (v.wm == null) { steps.push({ t: 'Mörtel', r: 'Mörtelbedarf je m² eingeben (Tabellenbuch, z. B. KS 3DF 24 cm: 50 l/m²)' }); return T.out(out, 'Mauermörtel', steps); }
      const z = v.wz || 0, Vf = A * v.wm, Vz = Vf * (1 + z / 100);
      steps.push({ t: 'Frischmörtel', f: 'V = A · Mörtelbedarf', c: `V = ${R(A)} m² · ${R(v.wm)} l/m²`, r: `V = ${R(Vf, 1)} l = ${R(Vf / 1000)} m³` });
      if (z) steps.push({ t: 'mit Zuschlag', f: 'V · (1 + Zuschlag / 100)', c: `${R(Vf, 1)} l · ${R(1 + z / 100, 4)}`, r: `${R(Vz, 1)} l` });
      if (v.wk != null) {
        const m = Vz * v.wk;
        steps.push({ t: 'Trockenmörtel', f: 'm = V · kg je Liter', c: `m = ${R(Vz, 1)} l · ${R(v.wk)} kg/l`, r: `m = ${R(m, 1)} kg` });
        if (v.ws) steps.push({ t: 'Säcke', f: 'Säcke = m / Sackgewicht (aufrunden)', c: `${R(m, 1)} kg / ${R(v.ws)} kg = ${R(m / v.ws, 2)}`, r: `<b>${Math.ceil(m / v.ws - 1e-9)} Säcke</b>` });
      }
      T.out(out, 'Mauermörtel', steps);
    });
  },
  calc_kreis(form, out) {
    const T = Toolbox, R = Num.r;
    T.fields(form, [{ k: 'ku', label: 'Einheit der Maße', sel: ['mm', 'cm', 'dm', 'm'], def: 'cm' }, { k: 'kd', label: 'Durchmesser d' }, { k: 'kr', label: '… oder Radius r' }, { k: 'kh', label: 'Höhe h (für Zylinder, optional)' }], (v) => {
      const u = v.ku || 'cm';
      if (v.bad.length) return T.out(out, 'Kreis & Zylinder', null, { err: true, text: 'Ungültige Eingabe bei: ' + v.bad.join(', ') });
      let d, steps = [];
      if (v.kd != null) { d = v.kd; steps.push({ t: 'Radius', f: 'r = d / 2', c: `r = ${R(d)} ${u} / 2`, r: `r = ${R(d / 2)} ${u}` }); }
      else if (v.kr != null) { d = 2 * v.kr; steps.push({ t: 'Durchmesser', f: 'd = 2 · r', c: `d = 2 · ${R(v.kr)} ${u}`, r: `d = ${R(d)} ${u}` }); }
      else return T.out(out, 'Kreis & Zylinder', null, { text: 'Gib den Durchmesser oder den Radius ein.' });
      if (d <= 0) return T.out(out, 'Kreis & Zylinder', null, { err: true, text: 'Der Durchmesser muss größer als 0 sein.' });
      const r = d / 2, A = Math.PI * r * r, U = Math.PI * d;
      steps.push({ t: 'Kreisfläche', f: 'A = π · r²', c: `A = π · (${R(r)} ${u})²`, r: `A = ${R(A)} ${u}²` });
      steps.push({ t: 'Umfang', f: 'U = π · d', c: `U = π · ${R(d)} ${u}`, r: `U = ${R(U)} ${u}` });
      if (v.kh != null) {
        if (v.kh < 0) return T.out(out, 'Kreis & Zylinder', null, { err: true, text: 'Die Höhe darf nicht negativ sein.' });
        const V = A * v.kh, lit = V * { mm: 1e-6, cm: 1e-3, dm: 1, m: 1000 }[u];
        steps.push({ t: 'Zylindervolumen', f: 'V = A · h = π · r² · h', c: `V = ${R(A)} ${u}² · ${R(v.kh)} ${u}`, r: `V = ${R(V)} ${u}³ = ${R(lit)} l` });
        steps.push({ t: 'Mantelfläche', f: 'M = U · h', c: `M = ${R(U)} ${u} · ${R(v.kh)} ${u}`, r: `M = ${R(U * v.kh)} ${u}²` });
      }
      T.out(out, 'Kreis & Zylinder', steps);
    });
  },
  /* ---------- Auflagerkräfte eines Trägers auf zwei Lagern */
  BEAM_EXAMPLES: {
    halle: { name: 'Hallentor (Arbeitsblatt)', L: '7', a: '0,5', b: '6,5', m: '42', g: '9,81', ref: 'A', meth: 'MA', ru: 'kN', sup: 'los',
      loads: [{ t: 'q', q: '3,2', u: 'kN/m', x1: '0,5', x2: '5,5', n: 'Dachlast' }, { t: 'F', F: '8', u: 'kN', x: '2', n: 'Leitungstrasse' }] },
    krag: { name: 'Kragarm IPB 260', L: '5', a: '0', b: '3,2', m: '93', g: '9,81', ref: 'Ende', meth: 'MB', ru: 'N', sup: 'fest',
      loads: [{ t: 'F', F: '6', u: 'kN', x: '1,4' }, { t: 'q', q: '500', u: 'N/m', x1: '3,2', x2: '5' }] }
  },
  BEAM_EX(k = 'halle') { return JSON.parse(JSON.stringify(Toolbox.BEAM_EXAMPLES[k])); },
  calc_auflager(form, out) {
    const T = Toolbox, st = T.state;
    if (!st.beam || !st.beam.ref) st.beam = T.BEAM_EX();
    const B = st.beam;
    const inp = (k, v, ph, mode) => `<input data-b="${k}" type="text" inputmode="${mode || 'decimal'}" autocomplete="off" value="${esc(v == null ? '' : v)}" placeholder="${esc(ph || '')}">`;
    const field = (label, k, v, unit, ph) => `<div class="tb-field"><label>${label}</label><div class="tb-unitin">${inp(k, v, ph)}<span>${unit}</span></div></div>`;
    const sel = (k, v, opts, label) => `<div class="tb-field"><label>${label}</label><select data-s="${k}">${opts.map(([o, n]) => `<option value="${o}" ${v === o ? 'selected' : ''}>${n}</option>`).join('')}</select></div>`;
    const usel = (i, v, opts) => `<select data-unit="${i}">${opts.map((o) => `<option ${v === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
    const fromA = B.ref === 'A';
    const posL = fromA ? 'Abstand rechts von A' : 'bei x =';
    form.innerHTML = `
      <div class="ab-add">${Object.entries(T.BEAM_EXAMPLES).map(([k, e]) => `<button class="btn" data-ex="${k}">Beispiel: ${esc(e.name)}</button>`).join('')}<button class="btn" data-a="clr">${icon('close')}Leeren</button></div>
      <div class="tb-sec">Träger</div>
      <div class="ab-row">${field('Trägerlänge l', 'L', B.L, 'm')}${sel('sup', B.sup, [['fest', 'Fest- + Loslager'], ['los', '2 Loslager']], 'Lagerart')}</div>
      <div class="ab-row">${field('Lager A bei x =', 'a', B.a, 'm')}${field('Lager B bei x =', 'b', B.b, 'm')}</div>
      <div class="muted ab-hint">x = Abstand vom <b>linken Trägerende</b>. Beispiel: 7 m Träger über 6 m Öffnung → A bei 0,5 m, B bei 6,5 m.</div>
      ${field('Eigengewicht: m′ (leer = ohne)', 'm', B.m, 'kg/m', 'z. B. 42')}
      ${field('Fallbeschleunigung g', 'g', B.g, 'm/s²')}
      <div class="tb-sec">Lasten</div>
      ${sel('ref', B.ref, [['A', 'ab Lager A (nach rechts +)'], ['Ende', 'ab linkem Trägerende']], 'Lage der Lasten messen')}
      <div class="ab-loads">${B.loads.map((l, i) => {
        const n = B.loads.slice(0, i + 1).filter((o) => o.t === l.t).length;
        const head = `<div class="ab-lh"><b>${l.t === 'F' ? 'Einzellast F' : 'Streckenlast q'}<sub>${n}</sub></b><input class="ab-name" data-b="${i}.n" value="${esc(l.n || '')}" placeholder="Name (optional)" autocomplete="off"><button class="ibtn sm" data-del="${i}" title="Entfernen">${icon('trash')}</button></div>`;
        return l.t === 'F'
          ? `<div class="ab-load">${head}<div class="ab-row"><div class="tb-field"><label>Kraft F</label><div class="tb-unitin">${inp(i + '.F', l.F)}${usel(i, l.u || 'N', ['N', 'kN'])}</div></div>${field(posL, i + '.x', l.x, 'm')}</div></div>`
          : `<div class="ab-load">${head}<div class="tb-field"><label>Streckenlast q</label><div class="tb-unitin">${inp(i + '.q', l.q)}${usel(i, l.u || 'N/m', ['N/m', 'kN/m'])}</div></div>
              <div class="ab-row">${field(fromA ? 'beginnt (ab A)' : 'von x =', i + '.x1', l.x1, 'm', fromA ? 'z. B. 0,5' : '')}${field(fromA ? 'endet (ab A)' : 'bis x =', i + '.x2', l.x2, 'm')}</div>
              <button class="btn ab-full" data-full="${i}">über die ganze Trägerlänge</button></div>`;
      }).join('')}</div>
      <div class="ab-add"><button class="btn" data-add="F">${icon('plus')}Einzellast</button><button class="btn" data-add="q">${icon('plus')}Streckenlast</button></div>
      <div class="tb-sec">Lösungsweg</div>
      ${sel('meth', B.meth, [['MA', 'ΣM um A → F_B, dann ΣF_y → F_A'], ['MB', 'ΣM um B → F_A, ΣM um A → F_B']], 'Rechenweg')}
      ${sel('ru', B.ru, [['auto', 'automatisch'], ['N', 'N'], ['kN', 'kN']], 'Kräfte angeben in')}`;
    const redraw = () => T.calc_auflager(form, out);
    $$('[data-b]', form).forEach((el) => el.addEventListener('input', () => {
      const k = el.dataset.b, m = /^(\d+)\.(\w+)$/.exec(k);
      if (m) B.loads[+m[1]][m[2]] = el.value; else B[k] = el.value;
      run();
    }));
    $$('[data-s]', form).forEach((el) => el.addEventListener('change', () => {
      const k = el.dataset.s, old = B[k];
      B[k] = el.value;
      if (k === 'ref' && old !== el.value) convertRef(old, el.value);
      if (k === 'ref') redraw(); else run();
    }));
    $$('[data-unit]', form).forEach((el) => el.addEventListener('change', () => { B.loads[+el.dataset.unit].u = el.value; run(); }));
    $$('[data-del]', form).forEach((b) => b.onclick = () => { B.loads.splice(+b.dataset.del, 1); redraw(); });
    $$('[data-full]', form).forEach((b) => b.onclick = () => {
      const l = B.loads[+b.dataset.full], L = Num.parse(B.L), a = Num.parse(B.a);
      if (!L.ok) { toast('Erst die Trägerlänge eingeben'); return; }
      const off = fromA ? (a.ok ? a.v : 0) : 0;
      l.x1 = Num.r(0 - off, 4); l.x2 = Num.r(L.v - off, 4);
      redraw();
    });
    $$('[data-add]', form).forEach((b) => b.onclick = () => { const kn = B.loads.some((l) => /k/.test(l.u || '')); B.loads.push(b.dataset.add === 'F' ? { t: 'F', F: '', u: kn ? 'kN' : 'N', x: '' } : { t: 'q', q: '', u: kn ? 'kN/m' : 'N/m', x1: '', x2: '' }); redraw(); });
    $$('[data-ex]', form).forEach((b) => b.onclick = () => { st.beam = T.BEAM_EX(b.dataset.ex); redraw(); });
    $('[data-a=clr]', form).onclick = () => { st.beam = { L: '', a: '', b: '', m: '', g: '9,81', ref: B.ref, meth: B.meth, ru: 'auto', sup: B.sup, loads: [{ t: 'F', F: '', u: 'kN', x: '' }] }; redraw(); };
    // keep the load positions when switching the reference point
    function convertRef(from, to) {
      const a = Num.parse(B.a);
      if (!a.ok) return;
      const d = from === 'A' && to === 'Ende' ? a.v : from === 'Ende' && to === 'A' ? -a.v : 0;
      const sh = (s) => { const p = Num.parse(s); return p.ok ? Num.r(p.v + d, 4) : s; };
      for (const l of B.loads) { if (l.t === 'F') l.x = sh(l.x); else { l.x1 = sh(l.x1); l.x2 = sh(l.x2); } }
    }

    const title = 'Auflagerkräfte';
    function run() {
      const bad = [];
      const num = (s, name, el) => {
        const p = Num.parse(s == null ? '' : String(s));
        const inpEl = el && $(`[data-b="${el}"]`, form);
        if (inpEl) inpEl.classList.toggle('bad', !!p.error);
        if (p.error) { bad.push(name); return NaN; }
        return p.ok ? p.v : null;
      };
      const L = num(B.L, 'Trägerlänge', 'L'), xa = num(B.a, 'Lager A', 'a'), xb = num(B.b, 'Lager B', 'b'), mq = num(B.m, 'm′', 'm'), g = num(B.g, 'g', 'g');
      const loads = B.loads.map((l, i) => l.t === 'F'
        ? { t: 'F', F: num(l.F, 'Kraft F', i + '.F'), x: num(l.x, 'Lage von F', i + '.x'), u: l.u || 'N', name: l.n }
        : { t: 'q', q: num(l.q, 'Streckenlast q', i + '.q'), x1: num(l.x1, 'Anfang q', i + '.x1'), x2: num(l.x2, 'Ende q', i + '.x2'), u: l.u || 'N/m', name: l.n });
      const msg = (text, err) => T.out(out, title, null, { text, err });
      if (bad.length) return msg('Ungültige Eingabe bei: ' + bad.join(', '), true);
      if (L == null || xa == null || xb == null) return msg('Gib Trägerlänge und die Lage der Lager A und B ein.');
      if (!(L > 0)) return msg('Die Trägerlänge muss größer als 0 sein.', true);
      if (xa < 0 || xb < 0 || xa > L || xb > L) return msg('Die Lager müssen auf dem Träger liegen (0 … ' + Num.r(L, 3) + ' m).', true);
      if (xa === xb) return msg('A und B dürfen nicht an derselben Stelle liegen.', true);
      if (mq != null && mq < 0) return msg('m′ darf nicht negativ sein.', true);
      if (mq && !(g > 0)) return msg('Bitte g eingeben (9,81 m/s²).', true);
      const off = B.ref === 'A' ? xa : 0, posTxt = (v) => (B.ref === 'A' ? `${Num.r(v - xa, 3)} m rechts von A` : `x = ${Num.r(v, 3)} m`);
      // display unit
      const useKN = B.ru === 'kN' || (B.ru === 'auto' && loads.some((l) => /^k/.test(l.u) && (l.t === 'F' ? l.F != null : l.q != null)));
      const FU = useKN ? 'kN' : 'N', MU = useKN ? 'kNm' : 'Nm', QU = useKN ? 'kN/m' : 'N/m';
      const R = (v) => Num.r(v, useKN ? 3 : 2), Fd = (v) => R(useKN ? v / 1000 : v) + ' ' + FU, Md = (v) => R(useKN ? v / 1000 : v) + ' ' + MU;
      const L3 = (v) => Num.r(v, 3);
      const steps = [], forces = [], dist = [];
      if (mq) {
        const qG = mq * g, FG = qG * L;
        steps.push({ t: 'Eigengewicht (Streckenlast über die ganze Länge)', f: 'q<sub>G</sub> = m′ · g  →  F<sub>G</sub> = q<sub>G</sub> · l', c: `q<sub>G</sub> = ${Num.r(mq, 3)} kg/m · ${Num.r(g, 3)} m/s² = ${Num.r(qG, 2)} N/m${useKN ? ' = ' + Num.r(qG / 1000, 5) + ' kN/m' : ''};   F<sub>G</sub> = ${useKN ? Num.r(qG / 1000, 5) + ' kN/m' : Num.r(qG, 2) + ' N/m'} · ${L3(L)} m`, r: `F<sub>G</sub> = ${Fd(FG)}  –  Angriffspunkt in der Trägermitte (${posTxt(L / 2)})` });
        const f = { n: 'F<sub>G</sub>', lab: 'G', F: FG, x: L / 2, k: 'G', a: 0, b: L, q: qG };
        forces.push(f); dist.push(f);
      }
      let nF = 0, nq = 0;
      for (const l of loads) {
        if (l.t === 'F') {
          nF++;
          if (l.F == null && l.x == null) continue;
          if (l.F == null || l.x == null) return msg(`Bei F${nF} fehlt ${l.F == null ? 'die Kraft' : 'die Lage'}.`);
          const x = l.x + off;
          if (x < -1e-9 || x > L + 1e-9) return msg(`F${nF} liegt nicht auf dem Träger – bitte die Lage prüfen.`, true);
          const F = l.u === 'kN' ? l.F * 1000 : l.F;
          forces.push({ n: `F<sub>${nF}</sub>`, lab: String(nF), F, x, k: 'F', name: l.name });
        } else {
          nq++;
          if (l.q == null && l.x1 == null && l.x2 == null) continue;
          if (l.q == null || l.x1 == null || l.x2 == null) return msg(`Bei q${nq} fehlt ${l.q == null ? 'der Wert q' : 'der Anfang oder das Ende'}.`);
          const a = Math.min(l.x1, l.x2) + off, b = Math.max(l.x1, l.x2) + off;
          if (a < -1e-9 || b > L + 1e-9) return msg(`q${nq} reicht über den Träger hinaus – bitte Anfang/Ende prüfen.`, true);
          if (a === b) return msg(`q${nq}: Anfang und Ende sind gleich – die Strecke hat die Länge 0.`, true);
          const q = /^k/.test(l.u) ? l.q * 1000 : l.q, Fq = q * (b - a);
          steps.push({ t: `Streckenlast q${nq}${l.name ? ' (' + esc(l.name) + ')' : ''} → Ersatzkraft`, f: `F<sub>q${nq}</sub> = q · l<sub>q</sub>`, c: `F<sub>q${nq}</sub> = ${Num.r(l.q, 4)} ${l.u} · ${L3(b - a)} m   (Strecke von ${posTxt(a)} bis ${posTxt(b)})`, r: `F<sub>q${nq}</sub> = ${Fd(Fq)}  –  Angriffspunkt in der Mitte der Strecke (${posTxt((a + b) / 2)})` });
          const f = { n: `F<sub>q${nq}</sub>`, lab: 'q' + nq, F: Fq, x: (a + b) / 2, k: 'q', a, b, q, uq: l.u, name: l.name };
          forces.push(f); dist.push(f);
        }
      }
      if (!forces.length) return msg('Gib mindestens eine Last ein (Einzellast, Streckenlast oder Eigengewicht m′).');
      if (dist.length > 1) {
        const FR = dist.reduce((s, f) => s + f.F, 0), xR = dist.reduce((s, f) => s + f.F * f.x, 0) / FR;
        const dx = (f) => (B.ref === 'A' ? f.x - xa : f.x);
        steps.push({ t: 'Streckenlasten zur Resultierenden zusammenfassen', f: 'F<sub>R</sub> = Σ F<sub>q</sub>;   x<sub>R</sub> = Σ (F<sub>q</sub> · x) / F<sub>R</sub>', c: `F<sub>R</sub> = ${dist.map((f) => Fd(f.F)).join(' + ')} = ${Fd(FR)};   x<sub>R</sub> = (${dist.map((f) => Fd(f.F) + ' · ' + L3(dx(f)) + ' m').join(' + ')}) / ${Fd(FR)}`, r: `F<sub>R</sub> = ${Fd(FR)}  –  Angriffspunkt ${posTxt(xR)}` });
      }
      forces.sort((p, q) => p.x - q.x);
      const lAB = Math.abs(xb - xa), dir = xa < xb ? 1 : -1;
      const terms = (ref, sgn) => {
        let sum = 0, txt = '';
        for (const f of forces) {
          const lev = (f.x - ref) * sgn;
          sum += f.F * lev;
          if (Math.abs(lev) < 1e-12) continue;
          const t = `${Fd(f.F)} · ${L3(Math.abs(lev))} m`;
          txt += !txt ? (lev < 0 ? '− ' : '') + t : (lev < 0 ? ' − ' : ' + ') + t;
        }
        return { sum, txt: txt || '0' };
      };
      const mA = terms(xa, dir), FB = mA.sum / lAB;     // ΣM_A = 0
      const mB = terms(xb, -dir), FAm = mB.sum / lAB;   // ΣM_B = 0
      const sumF = forces.reduce((s, f) => s + f.F, 0), FA = sumF - FB;
      const stepMA = { t: 'Momentengleichgewicht um A (ΣM<sub>A</sub> = 0)', f: 'F<sub>B</sub> · l<sub>AB</sub> = Σ (F · Abstand zu A)', c: `F<sub>B</sub> · ${L3(lAB)} m = ${mA.txt} = ${Md(mA.sum)}`, r: `F<sub>B</sub> = ${Md(mA.sum)} / ${L3(lAB)} m = ${Fd(FB)}` };
      const stepMB = { t: 'Momentengleichgewicht um B (ΣM<sub>B</sub> = 0)', f: 'F<sub>A</sub> · l<sub>AB</sub> = Σ (F · Abstand zu B)', c: `F<sub>A</sub> · ${L3(lAB)} m = ${mB.txt} = ${Md(mB.sum)}`, r: `F<sub>A</sub> = ${Md(mB.sum)} / ${L3(lAB)} m = ${Fd(FAm)}` };
      const names = forces.map((f) => f.n).join(' + ');
      if (B.meth === 'MB') {
        steps.push(stepMB, stepMA);
        const ok = Math.abs(FAm + FB - sumF) < 1e-6 * Math.max(1, sumF);
        steps.push({ t: 'Kontrolle (ΣF<sub>y</sub> = 0)', f: 'F<sub>A</sub> + F<sub>B</sub> = Summe aller Lasten', c: `${Fd(FAm)} + ${Fd(FB)} = ${Fd(FAm + FB)};   ${names} = ${forces.map((f) => Fd(f.F)).join(' + ')} = ${Fd(sumF)}`, r: ok ? 'stimmt ✓' : 'stimmt nicht' });
      } else {
        steps.push(stepMA);
        steps.push({ t: 'Kräftegleichgewicht (ΣF<sub>y</sub> = 0)', f: 'F<sub>A</sub> + F<sub>B</sub> − Σ Lasten = 0  →  F<sub>A</sub> = Σ Lasten − F<sub>B</sub>', c: `F<sub>A</sub> = (${forces.map((f) => Fd(f.F)).join(' + ')}) − ${Fd(FB)} = ${Fd(sumF)} − ${Fd(FB)}`, r: `F<sub>A</sub> = ${Fd(FA)}` });
        const ok = Math.abs(FAm - FA) < 1e-6 * Math.max(1, sumF);
        steps.push({ t: 'Kontrolle mit ΣM<sub>B</sub> = 0', f: 'F<sub>A</sub> · l<sub>AB</sub> = Σ (F · Abstand zu B)', c: `F<sub>A</sub> · ${L3(lAB)} m = ${mB.txt} = ${Md(mB.sum)}  →  F<sub>A</sub> = ${Fd(FAm)}`, r: ok ? `stimmt mit F<sub>A</sub> = ${Fd(FA)} überein ✓` : 'stimmt nicht' });
      }
      const fa = B.meth === 'MB' ? FAm : FA;
      const other = (v) => (useKN ? `  (= ${Num.r(v, 1)} N)` : Math.abs(v) >= 1000 ? `  (≈ ${Num.r(v / 1000, 2)} kN)` : '');
      const dirNote = (v, n) => (v < -1e-9 ? `<br><span class="tb-err">${n} ist negativ → das Lager wird nach oben gezogen (abhebende Kraft).</span>` : '');
      steps.push({ t: 'Ergebnis', r: `F<sub>A</sub> = ${Fd(fa)}${other(fa)}<br>F<sub>B</sub> = ${Fd(FB)}${other(FB)}${dirNote(fa, 'F<sub>A</sub>')}${dirNote(FB, 'F<sub>B</sub>')}` });
      T.out(out, title, steps);
      sketch({ L, xa, xb, forces, FA: fa, FB, Fd, useKN });
    }
    function sketch(d) {
      const card = $('.tb-card', out);
      if (!card || !d) return;
      const W = 640, H = 270, x0 = 40, s = (W - 2 * x0) / d.L, X = (x) => x0 + x * s, yb = 128;
      const short = (v) => (d.useKN ? Num.r(v / 1000, 2) + ' kN' : Num.r(v, 0) + ' N');
      const arrow = (x, y1, y2, col, w = 2.5, dash = '') => `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2 - (y2 > y1 ? 9 : -9)}" stroke="${col}" stroke-width="${w}" ${dash}/><path d="M${x - 6} ${y2 - (y2 > y1 ? 10 : -10)} L${x} ${y2} L${x + 6} ${y2 - (y2 > y1 ? 10 : -10)}Z" fill="${col}"/>`;
      let g = '';
      const dq = d.forces.filter((o) => o.k === 'q');
      dq.forEach((f, j) => {
        const a = X(f.a), b = X(f.b), top = yb - 44 - j * 22;
        g += `<rect x="${a}" y="${top}" width="${b - a}" height="9" fill="#3d6fe0" opacity=".35"/>`;
        const n = Math.max(2, Math.round((b - a) / 26));
        for (let i = 0; i <= n; i++) g += arrow(a + (b - a) * i / n, top + 9, yb - 6, '#3d6fe0', 1.4);
        g += `<text x="${a}" y="${top - 5}" text-anchor="start" fill="#3d6fe0" font-size="13">${f.name ? esc(f.name) + ': ' : ''}q = ${esc(Num.r(/^k/.test(f.uq) ? f.q / 1000 : f.q, 3))} ${esc(f.uq)}</text>`;
      });
      g += `<rect x="${X(0)}" y="${yb - 5}" width="${d.L * s}" height="10" rx="2" fill="currentColor" opacity=".85"/>`;
      const tri = (x) => `<path d="M${x} ${yb + 5} L${x - 13} ${yb + 27} L${x + 13} ${yb + 27}Z" fill="none" stroke="currentColor" stroke-width="2"/>`;
      const los = (x) => tri(x) + [-8, 0, 8].map((o) => `<circle cx="${x + o}" cy="${yb + 31}" r="3.4" fill="none" stroke="currentColor" stroke-width="1.5"/>`).join('') + `<line x1="${x - 18}" y1="${yb + 36}" x2="${x + 18}" y2="${yb + 36}" stroke="currentColor" stroke-width="2"/>`;
      const fest = (x) => tri(x) + `<line x1="${x - 18}" y1="${yb + 28}" x2="${x + 18}" y2="${yb + 28}" stroke="currentColor" stroke-width="2"/>` + [0, 1, 2, 3].map((i) => `<line x1="${x - 16 + i * 10}" y1="${yb + 28}" x2="${x - 22 + i * 10}" y2="${yb + 35}" stroke="currentColor" stroke-width="1.4"/>`).join('');
      g += (B.sup === 'los' ? los(X(d.xa)) : fest(X(d.xa))) + los(X(d.xb));
      g += `<text x="${X(d.xa)}" y="${yb + 54}" text-anchor="middle" font-size="15" font-weight="700" fill="currentColor">A</text><text x="${X(d.xb)}" y="${yb + 54}" text-anchor="middle" font-size="15" font-weight="700" fill="currentColor">B</text>`;
      const top = yb - 44 - Math.max(0, dq.length - 1) * 22;
      d.forces.filter((o) => o.k !== 'q').forEach((f, j) => {
        const col = f.k === 'G' ? '#8a4fd8' : '#e0503d', y0 = f.k === 'G' ? top - 30 : top - 52 - (j % 2) * 18;
        g += arrow(X(f.x), y0, yb - 6, col, 2.6, f.k === 'G' ? 'stroke-dasharray="6 4"' : '');
        g += `<text x="${clamp(X(f.x) + 6, 0, W - 110)}" y="${y0 - 4}" font-size="13" fill="${col}">F<tspan font-size="10" dy="3">${esc(f.lab)}</tspan><tspan dy="-3"> = ${esc(short(f.F))}</tspan></text>`;
      });
      for (const [x, F, n] of [[d.xa, d.FA, 'A'], [d.xb, d.FB, 'B']]) {
        const up = F >= 0;
        g += arrow(X(x) + (n === 'A' ? -26 : 26), up ? yb + 62 : yb + 14, up ? yb + 14 : yb + 62, '#1f9d63', 2.6);
        g += `<text x="${clamp(X(x), 75, W - 75)}" y="${yb + 82}" text-anchor="middle" font-size="13" font-weight="700" fill="#1f9d63">F<tspan font-size="10" dy="3">${n}</tspan><tspan dy="-3"> = ${esc(short(F))}</tspan></text>`;
      }
      const marks = [...new Set([0, d.L, d.xa, d.xb].concat(d.forces.filter((f) => f.k === 'F').map((f) => f.x)).concat(dq.flatMap((f) => [f.a, f.b])).map((v) => +v.toFixed(6)))].sort((p, q) => p - q);
      g += `<line x1="${X(0)}" y1="${H - 14}" x2="${X(d.L)}" y2="${H - 14}" stroke="currentColor" stroke-width="1" opacity=".5"/>`;
      marks.forEach((m, i) => {
        g += `<line x1="${X(m)}" y1="${H - 20}" x2="${X(m)}" y2="${H - 8}" stroke="currentColor" stroke-width="1" opacity=".6"/>`;
        if (i) { const a = marks[i - 1]; if ((m - a) * s > 26) g += `<text x="${(X(a) + X(m)) / 2}" y="${H - 19}" text-anchor="middle" font-size="12" fill="currentColor" opacity=".8">${esc(Num.r(m - a, 2))} m</text>`; }
      });
      const minY = Math.min(0, top - 92);
      card.querySelector('h2').insertAdjacentHTML('afterend', `<div class="ab-sketch"><svg viewBox="0 ${minY} ${W} ${H - minY}" role="img" aria-label="Belastungsskizze">${g}</svg></div>`);
    }
    run();
  },
  calc_flaeche(form, out) {
    const T = Toolbox, R = Num.r;
    T.fields(form, [{ k: 'fs', label: 'Figur', sel: ['Rechteck', 'Trapez'], def: 'Rechteck' }, { k: 'fu', label: 'Einheit', sel: ['mm', 'cm', 'dm', 'm'], def: 'm' },
      { sep: 'Bekannte Werte eintragen – fehlende werden berechnet' },
      { k: 'fa', label: 'Seite a (Rechteck) / Grundseite a (Trapez)' }, { k: 'fb', label: 'Seite b (Rechteck) / obere Seite c (Trapez)' },
      { k: 'fh', label: 'Höhe h (nur Trapez)' }, { k: 'fA', label: 'Fläche A' }, { k: 'fH', label: 'Körperhöhe / Länge für Volumen (optional)' }], (v) => {
      const u = v.fu || 'm', trap = v.fs === 'Trapez', title = trap ? 'Trapez' : 'Rechteck';
      if (v.bad.length) return T.out(out, title, null, { err: true, text: 'Ungültige Eingabe bei: ' + v.bad.join(', ') });
      const neg = ['fa', 'fb', 'fh', 'fA', 'fH'].some((k) => v[k] != null && v[k] < 0);
      if (neg) return T.out(out, title, null, { err: true, text: 'Längen und Flächen dürfen nicht negativ sein.' });
      const steps = [];
      let A;
      if (!trap) {
        let { fa: a, fb: b } = v; A = v.fA;
        const known = [a, b, A].filter((x) => x != null).length;
        if (known < 2) return T.out(out, title, null, { text: 'Gib zwei der drei Werte a, b, A ein – der dritte wird berechnet.' });
        if (a != null && b != null) {
          const Ac = a * b;
          if (A != null && Math.abs(Ac - A) > 1e-9 * Math.max(1, A)) steps.push({ t: 'Hinweis', r: `Die eingegebene Fläche passt nicht zu a · b = ${R(Ac)} ${u}² – berechnet wird mit a und b.` });
          A = Ac; steps.push({ t: 'Fläche', f: 'A = a · b', c: `A = ${R(a)} ${u} · ${R(b)} ${u}`, r: `A = ${R(A)} ${u}²` });
        } else if (a != null) { if (!a) return T.out(out, title, null, { err: true, text: 'a darf nicht 0 sein.' }); b = A / a; steps.push({ t: 'Seite b', f: 'b = A / a', c: `b = ${R(A)} ${u}² / ${R(a)} ${u}`, r: `b = ${R(b)} ${u}` }); }
        else { if (!b) return T.out(out, title, null, { err: true, text: 'b darf nicht 0 sein.' }); a = A / b; steps.push({ t: 'Seite a', f: 'a = A / b', c: `a = ${R(A)} ${u}² / ${R(b)} ${u}`, r: `a = ${R(a)} ${u}` }); }
        steps.push({ t: 'Umfang', f: 'U = 2 · a + 2 · b', c: `U = 2 · ${R(a)} ${u} + 2 · ${R(b)} ${u}`, r: `U = ${R(2 * a + 2 * b)} ${u}` });
        steps.push({ t: 'Diagonale', f: 'e = √(a² + b²)', c: `e = √(${R(a)}² + ${R(b)}²)`, r: `e = ${R(Math.hypot(a, b))} ${u}` });
      } else {
        let { fa: a, fb: c, fh: h } = v; A = v.fA;
        const known = [a, c, h, A].filter((x) => x != null).length;
        if (known < 3) return T.out(out, title, null, { text: 'Gib drei der vier Werte a, c, h, A ein – der vierte wird berechnet.' });
        if (a != null && c != null && h != null) {
          const Ac = (a + c) / 2 * h;
          if (A != null && Math.abs(Ac - A) > 1e-9 * Math.max(1, A)) steps.push({ t: 'Hinweis', r: `Die eingegebene Fläche passt nicht zu (a + c) / 2 · h = ${R(Ac)} ${u}² – berechnet wird mit a, c und h.` });
          A = Ac; steps.push({ t: 'Fläche', f: 'A = (a + c) / 2 · h', c: `A = (${R(a)} + ${R(c)}) / 2 · ${R(h)}`, r: `A = ${R(A)} ${u}²` });
        } else if (h == null) {
          if (!(a + c)) return T.out(out, title, null, { err: true, text: 'a + c darf nicht 0 sein.' });
          h = 2 * A / (a + c); steps.push({ t: 'Höhe h', f: 'h = 2 · A / (a + c)', c: `h = 2 · ${R(A)} / (${R(a)} + ${R(c)})`, r: `h = ${R(h)} ${u}` });
        } else {
          if (!h) return T.out(out, title, null, { err: true, text: 'h darf nicht 0 sein.' });
          const missing = a == null ? 'a' : 'c', other = a == null ? c : a, x = 2 * A / h - other;
          if (x < 0) return T.out(out, title, null, { err: true, text: `Mit diesen Werten wäre ${missing} negativ (${R(x)} ${u}) – so ein Trapez gibt es nicht.` });
          if (missing === 'a') a = x; else c = x;
          steps.push({ t: `Seite ${missing}`, f: `${missing} = 2 · A / h − ${missing === 'a' ? 'c' : 'a'}`, c: `${missing} = 2 · ${R(A)} / ${R(h)} − ${R(other)}`, r: `${missing} = ${R(x)} ${u}` });
        }
        steps.push({ t: 'Mittellinie', f: 'm = (a + c) / 2', c: `m = (${R(a)} + ${R(c)}) / 2`, r: `m = ${R((a + c) / 2)} ${u}` });
      }
      if (v.fH != null) steps.push({ t: 'Volumen (Prisma)', f: 'V = A · Körperhöhe', c: `V = ${R(A)} ${u}² · ${R(v.fH)} ${u}`, r: `V = ${R(A * v.fH)} ${u}³` });
      T.out(out, title, steps);
    });
  }
};
