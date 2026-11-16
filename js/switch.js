/* Switch 2 Edition: Konsolen-Startseite mit großen Fach-Kacheln und runder Schnellzugriffsleiste.
 * Eigene Gestaltung (keine Logos, keine Original-Grafiken). Liest nur App.index – verändert keine Daten
 * (Ausnahme: der Hell/Dunkel-Schalter setzt die vorhandene Einstellung App.settings.theme). */
const Switch2 = (() => {
  // dezente Akzentfarbe je Fach (Fachsymbole: eigene Linien-Icons aus hyrule.js)
  const ACC = { metall: '#8a94a6', elektro: '#f0a500', bau: '#ef7a2e', it: '#36A9E1', chemie: '#27b26a', physik: '#7a62f0', ethik: '#e0609a', deutsch: '#E84155', englisch: '#3d7bf0', mathe: '#13a89e', sozial: '#c08a3e' };
  const PAL = ['#36A9E1', '#E84155', '#27b26a', '#f0a500', '#7a62f0', '#13a89e'];
  const key = (n) => (typeof Hyrule !== 'undefined' ? Hyrule.key(n) : null);
  const accent = (name, i) => ACC[key(name)] || PAL[i % PAL.length];
  const sicon = (name) => (typeof Hyrule !== 'undefined' ? Hyrule.icon(name) : '');
  const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const two = (n) => String(n).padStart(2, '0');

  let timer = null;
  function mountHome(v) {
    const host = v.querySelector('.sw-home');
    if (!host || document.documentElement.dataset.design !== 'switch') { if (host) host.innerHTML = ''; return; }
    const subjects = App.index.subjects, docs = App.index.items.filter((i) => i.type === 'doc');
    const last = docs.slice().sort((a, b) => b.updated - a.updated)[0];
    const lastSubj = last ? subjects.find((s) => s.id === last.subjectId) : null;
    const dark = document.documentElement.dataset.theme !== 'light';
    const info = (s) => { const n = App.docCount(s.id); return `${n} ${n === 1 ? 'Heft' : 'Hefte'}`; };
    host.innerHTML = `
      <div class="sw-top">
        <button class="sw-user" data-b="settings" title="Einstellungen"><span class="sw-ava"><span>FOS</span></span><span class="sw-uname"><b>FOS Digital Binder</b><small>${subjects.length} Fächer · ${docs.length} Hefte</small></span></button>
        <div class="sw-stat">
          <div class="sw-clock"><span class="sw-time"></span><span class="sw-date"></span></div>
          <span class="sw-chip" title="Alle Daten liegen lokal auf dem Tablet"><i class="sw-dot"></i>Offline</span>
          <span class="sw-bat hidden" title="Akku"><i></i><em></em></span>
          <button class="sw-mode" data-b="mode" title="${dark ? 'Hell' : 'Dunkel'}">${icon(dark ? 'sun' : 'moon')}</button>
        </div>
      </div>
      <div class="sw-sel"><b>${lastSubj ? esc(lastSubj.name) : 'Meine Fächer'}</b><span>${lastSubj ? 'Zuletzt: ' + esc(last.name) : 'Tippe auf ein Fach'}</span></div>
      <div class="sw-row" role="list">
        ${subjects.map((s, i) => { const c = accent(s.name, i); return `<div class="sw-tile${lastSubj && lastSubj.id === s.id ? ' sw-last' : ''}" role="listitem" data-s="${esc(s.id)}" style="--c:${c};--t:${rgba(c, dark ? 0.22 : 0.12)};--i:${i}" tabindex="0">
          <div class="sw-art"><div class="sw-ico">${sicon(s.name)}</div>${lastSubj && lastSubj.id === s.id ? '<span class="sw-badge">Zuletzt</span>' : ''}</div>
          <div class="sw-cap"><b>${esc(s.name)}</b><small>${info(s)}</small></div>
          <button class="sw-more" data-m="${esc(s.id)}" title="Fach bearbeiten">${icon('more')}</button></div>`; }).join('')}
        <div class="sw-tile sw-add" role="listitem" data-a="sw-add" style="--c:#A8ADB7;--i:${subjects.length}" tabindex="0"><div class="sw-art">${icon('plus')}</div><div class="sw-cap"><b>Neues Fach</b><small>anlegen</small></div></div>
      </div>
      <nav class="sw-dock" aria-label="Schnellzugriff">
        <button data-q="last" class="sw-main" title="Weiterarbeiten"${last ? '' : ' disabled'}><span>${icon('notebook')}</span><em>Weiter</em></button>
        <button data-b="search" style="--c:#36A9E1"><span>${icon('search')}</span><em>Suche</em></button>
        <button data-b="todos" style="--c:#27b26a"><span>${icon('checklist')}</span><em>Aufgaben</em></button>
        <button data-q="formulas" style="--c:#ef7a2e"><span>${icon('fn')}</span><em>Formeln</em></button>
        <button data-q="units" style="--c:#13a89e"><span>${icon('swap')}</span><em>Einheiten</em></button>
        <button data-q="calc" style="--c:#E84155"><span>${icon('toolbox')}</span><em>Schulrechner</em></button>
        <button data-q="fc" style="--c:#7a62f0"><span>${icon('calc')}</span><em>Rechner</em></button>
        <button data-b="backup" style="--c:#f0a500"><span>${icon('database')}</span><em>Backup</em></button>
        <button data-b="settings" style="--c:#A8ADB7"><span>${icon('settings')}</span><em>System</em></button>
      </nav>`;

    // Interaktion – ruft nur vorhandene Funktionen auf
    const top = (a) => { const b = v.querySelector(`.topbar [data-a=${a}]`); if (b) b.click(); };
    const sel = host.querySelector('.sw-sel');
    const focus = (t) => {
      host.querySelectorAll('.sw-tile.on').forEach((x) => x !== t && x.classList.remove('on'));
      t.classList.add('on');
      const s = subjects.find((x) => x.id === t.dataset.s);
      sel.innerHTML = s ? `<b>${esc(s.name)}</b><span>${info(s)}</span>` : '<b>Neues Fach</b><span>anlegen</span>';
    };
    host.querySelectorAll('.sw-tile').forEach((t) => {
      t.addEventListener('pointerdown', () => focus(t));
      t.onclick = (e) => {
        if (e.target.closest('.sw-more')) return;
        if (t.dataset.s) App.showSubject(t.dataset.s, null); else { const a = v.querySelector('.binder.add'); if (a) a.click(); }
      };
      t.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); t.click(); } };
    });
    host.querySelectorAll('[data-m]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); const s = subjects.find((x) => x.id === b.dataset.m); if (s) App.subjectMenu(b, s); });
    host.querySelectorAll('[data-q]').forEach((b) => b.onclick = () => {
      const q = b.dataset.q;
      if (q === 'last') { if (last) App.openDoc(last.id); } else if (q === 'fc') FloatCalc.open(); else Toolbox.open(q);
    });
    host.querySelectorAll('[data-b]').forEach((b) => b.onclick = () => {
      if (b.dataset.b === 'mode') {
        App.settings.theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
        App.index.settings = App.settings; App.saveIndex(); App.applyTheme(); App.showHome();
      } else top(b.dataset.b);
    });
    // zuletzt genutztes Fach in den sichtbaren Bereich holen (ohne Animation)
    const lt = host.querySelector('.sw-last');
    if (lt) {
      lt.classList.add('on');
      requestAnimationFrame(() => { const row = host.querySelector('.sw-row'); if (row && row.scrollWidth > row.clientWidth) row.scrollLeft = Math.max(0, lt.offsetLeft - 40); });
    }

    // Uhr
    const draw = (tick) => {
      if (tick && !host.isConnected) { clearInterval(timer); timer = null; return; }
      const d = new Date(), t = host.querySelector('.sw-time');
      if (!t) return;
      t.textContent = `${d.getHours()}:${two(d.getMinutes())}`;
      host.querySelector('.sw-date').textContent = `${WD[d.getDay()]}, ${two(d.getDate())}.${two(d.getMonth() + 1)}.`;
    };
    draw();
    clearInterval(timer);
    timer = setInterval(() => draw(true), 15000);
    // Akku (nur wenn die WebView es anbietet)
    try {
      if (navigator.getBattery) navigator.getBattery().then((bat) => {
        const el = host.querySelector('.sw-bat'); if (!el) return;
        el.classList.remove('hidden');
        el.querySelector('i').style.width = Math.round(bat.level * 100) + '%';
        el.querySelector('em').textContent = Math.round(bat.level * 100) + ' %';
        el.classList.toggle('low', bat.level < 0.2 && !bat.charging);
      }).catch(() => {});
    } catch (e) { /* keine Akku-Anzeige */ }
  }
  return { mountHome, accent };
})();
