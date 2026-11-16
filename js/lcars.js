/* LCARS Edition: Konsolen-Startseite (eigene Gestaltung aus CSS-Farbflächen, keine Original-Grafiken/Logos).
 * Liest nur App.index – verändert keine Daten. */
const Lcars = (() => {
  // gezielte Farbverteilung aus der vorgegebenen Palette
  const PAL = ['#376AC8', '#8CC7F2', '#A49CCF', '#F0B92E', '#D77A19', '#A47783', '#858585'];
  const SUBJ = { metall: '#858585', elektro: '#F0B92E', bau: '#D77A19', it: '#376AC8', chemie: '#8CC7F2', physik: '#A49CCF', ethik: '#A47783', deutsch: '#D77A19', englisch: '#376AC8', mathe: '#F0B92E', sozial: '#A49CCF' };
  const key = (n) => (typeof Hyrule !== 'undefined' ? Hyrule.key(n) : null);
  const color = (name, i) => SUBJ[key(name)] || PAL[i % PAL.length];
  const WD = ['SO', 'MO', 'DI', 'MI', 'DO', 'FR', 'SA'];
  const two = (n) => String(n).padStart(2, '0');
  const code = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return two(h % 100) + '-' + String(h % 100000).padStart(5, '0'); };
  const webview = () => { const m = /Chrome\/(\d+)/.exec(navigator.userAgent); return m ? m[1] : '–'; };
  const fmtMB = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');

  let timer = null;
  function mountHome(v) {
    const host = v.querySelector('.lc-console');
    if (!host || document.documentElement.dataset.design !== 'lcars') { if (host) host.innerHTML = ''; return; }
    const subjects = App.index.subjects, docs = App.index.items.filter((i) => i.type === 'doc');
    const pages = docs.reduce((s, d) => s + (d.pages || 1), 0);
    const recent = docs.slice().sort((a, b) => b.updated - a.updated).slice(0, 6);
    const sname = (id) => { const s = subjects.find((x) => x.id === id); return s ? s.name : ''; };
    host.innerHTML = `
      <div class="lc-top">
        <div class="lc-elbow lc-c1"><span>${code('FOS')}</span></div>
        <div class="lc-head">
          <div class="lc-clockrow"><div class="lc-time"></div><div class="lc-day"></div></div>
          <div class="lc-title">FOS SYSTEM 01</div>
          <div class="lc-date"></div>
          <div class="lc-status"><i class="lc-lamp"></i><span>SYSTEM BEREIT</span><span class="lc-sep"></span><span>OFFLINE-MODUS</span><span class="lc-sep"></span><span>DATEN GESICHERT LOKAL</span></div>
        </div>
      </div>
      <div class="lc-bars"><i style="--w:18%;background:#F0B92E"></i><i style="--w:9%;background:#D77A19"></i><i style="--w:30%;background:#376AC8"></i><i style="--w:6%;background:#858585"></i><i style="--w:22%;background:#8CC7F2"></i><i style="--w:5%;background:#A49CCF"></i></div>
      <div class="lc-main">
        <nav class="lc-nav" aria-label="Fächer">
          ${subjects.map((s, i) => `<button class="lc-subj" data-s="${esc(s.id)}" style="--c:${color(s.name, i)};--i:${i}"><span class="lc-num">${two(App.docCount(s.id))}</span><b>${esc(s.name)}</b></button>`).join('')}
          <button class="lc-subj lc-add" data-a="lc-add" style="--c:#858585;--i:${subjects.length}"><span class="lc-num">+</span><b>NEUES FACH</b></button>
          <div class="lc-navfill"></div>
        </nav>
        <section class="lc-center">
          <div class="lc-sect"><h3 style="--c:#F0B92E">ZULETZT BEARBEITET</h3>
            <div class="lc-recent">${recent.length ? recent.map((d, i) => `<button class="lc-doc" data-d="${esc(d.id)}" style="--c:${PAL[(i + 1) % PAL.length]}"><span class="lc-docbar"></span><span class="lc-doct"><b>${esc(d.name)}</b><small>${esc(sname(d.subjectId))} · ${d.pages || 1} S. · ${new Date(d.updated).toLocaleDateString('de-DE')}</small></span><span class="lc-code">${code(d.id)}</span></button>`).join('') : '<p class="lc-empty">KEINE DATENSÄTZE – ÖFFNE EIN FACH UND LEGE EIN HEFT AN.</p>'}</div>
          </div>
          <div class="lc-sect"><h3 style="--c:#A49CCF">SCHNELLZUGRIFF</h3>
            <div class="lc-quick">
              <button data-q="formulas" style="--c:#8CC7F2"><b>FORMELN</b><small>${typeof FORMULAS !== 'undefined' ? FORMULAS.length : ''} EINTRÄGE</small></button>
              <button data-q="units" style="--c:#F0B92E"><b>EINHEITEN</b><small>UMRECHNER</small></button>
              <button data-q="calc" style="--c:#D77A19"><b>SCHULRECHNER</b><small>MÖRTEL · KREIS · TRÄGER</small></button>
              <button data-q="fc" style="--c:#376AC8"><b>TASCHENRECHNER</b><small>WISSENSCHAFTLICH</small></button>
            </div>
          </div>
          <div class="lc-sect lc-space"><h3 style="--c:#376AC8">FÄCHER-ÜBERSICHT</h3>
            <div class="lc-chart">${subjects.map((s, i) => { const n = App.docCount(s.id), max = Math.max(1, ...subjects.map((x) => App.docCount(x.id))); return `<div class="lc-row"><span>${esc(s.name)}</span><i style="--w:${Math.max(3, Math.round(n / max * 100))}%;--c:${color(s.name, i)}"></i><em>${n}</em></div>`; }).join('')}</div>
          </div>
        </section>
        <aside class="lc-side">
          <div class="lc-pill" style="--c:#A49CCF"><span>FÄCHER</span><b>${subjects.length}</b></div>
          <div class="lc-pill" style="--c:#8CC7F2"><span>HEFTE</span><b>${docs.length}</b></div>
          <div class="lc-pill" style="--c:#F0B92E"><span>SEITEN</span><b>${pages}</b></div>
          <div class="lc-pill" style="--c:#D77A19"><span>DATEN</span><b class="lc-size">…</b></div>
          <div class="lc-pill" style="--c:#858585"><span>WEBVIEW</span><b>${webview()}</b></div>
          <div class="lc-meter" aria-hidden="true">${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<i style="--d:${i}"></i>`).join('')}</div>
          <div class="lc-sidefill"></div>
        </aside>
      </div>
      <div class="lc-bottom">
        <div class="lc-elbow lc-c2"></div>
        <button data-b="search" style="--c:#8CC7F2">SUCHE</button>
        <button data-b="todos" style="--c:#F0B92E">AUFGABEN</button>
        <button data-b="tools" style="--c:#A49CCF">WERKZEUGE</button>
        <button data-b="backup" style="--c:#D77A19">BACKUP</button>
        <button data-b="settings" style="--c:#376AC8">SYSTEM</button>
        <div class="lc-endcap"></div>
      </div>`;
    // Interaktion (nur vorhandene Funktionen aufrufen)
    const top = (a) => { const b = v.querySelector(`.topbar [data-a=${a}]`); if (b) b.click(); };
    host.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => App.showSubject(b.dataset.s, null));
    host.querySelectorAll('[data-d]').forEach((b) => b.onclick = () => App.openDoc(b.dataset.d));
    host.querySelector('[data-a=lc-add]').onclick = () => { const a = v.querySelector('.binder.add'); if (a) a.click(); };
    host.querySelectorAll('[data-q]').forEach((b) => b.onclick = () => (b.dataset.q === 'fc' ? FloatCalc.open() : Toolbox.open(b.dataset.q)));
    host.querySelectorAll('[data-b]').forEach((b) => b.onclick = () => (b.dataset.b === 'tools' ? Toolbox.open(null) : top(b.dataset.b)));
    // Uhr
    const draw = (tick) => {
      if (tick && !host.isConnected) { clearInterval(timer); timer = null; return; }
      const d = new Date(), t = host.querySelector('.lc-time');
      if (!t) return;
      t.textContent = `${two(d.getHours())}:${two(d.getMinutes())}`;
      host.querySelector('.lc-day').innerHTML = `${WD[d.getDay()]}<br>${two(d.getDate())}`;
      host.querySelector('.lc-date').textContent = `${two(d.getDate())}.${two(d.getMonth() + 1)}.${d.getFullYear()}`;
    };
    draw();
    clearInterval(timer);
    timer = setInterval(() => draw(true), 15000);
    // Speicherbedarf (Größe der gespeicherten Hefte) – im Leerlauf ermitteln
    setTimeout(() => {
      let bytes = 0;
      try { bytes += JSON.stringify(App.index).length; for (const d of docs) { const x = App.loadDoc(d.id); if (x) bytes += JSON.stringify(x).length; } } catch (e) { bytes = 0; }
      const el = host.querySelector('.lc-size');
      if (el) el.textContent = bytes ? fmtMB(bytes) : '–';
    }, 400);
  }
  return { mountHome, color };
})();
