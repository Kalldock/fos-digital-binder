/* Nintendo DS Edition: Dual-Screen-Startseite, eigenes Startlogo, PictoChat-artige Notizen, Kalender, Dokumente.
 * Eigene Gestaltung – keine Nintendo-Logos, keine Original-Grafiken, keine Original-Sounds (Töne werden live erzeugt).
 * Liest App.index nur; neue Daten nur in der neuen Datei pictochat.json (bestehende Speicherstrukturen unverändert). */
const DS = (() => {
  const ACC = { metall: '#6d7f99', elektro: '#e3a000', bau: '#e0702a', it: '#1f78e0', chemie: '#1fa65a', physik: '#7a52e0', ethik: '#d64f8f', deutsch: '#e03c3c', englisch: '#2e5fe0', mathe: '#0c9a8e', sozial: '#b07d2e' };
  const PAL = ['#1f78e0', '#e03c3c', '#1fa65a', '#e3a000', '#7a52e0', '#0c9a8e'];
  const key = (n) => (typeof Hyrule !== 'undefined' ? Hyrule.key(n) : null);
  const accent = (name, i) => ACC[key(name)] || PAL[i % PAL.length];
  const pix = (name) => (typeof Poketch !== 'undefined' ? Poketch.icon(name) : '');
  const WD = ['SO', 'MO', 'DI', 'MI', 'DO', 'FR', 'SA'];
  const MON = ['JANUAR', 'FEBRUAR', 'MÄRZ', 'APRIL', 'MAI', 'JUNI', 'JULI', 'AUGUST', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DEZEMBER'];
  const two = (n) => String(n).padStart(2, '0');
  const on = () => document.documentElement.dataset.design === 'ds';
  const animOff = () => document.documentElement.dataset.anim === 'off';

  // eigene Pixel-Symbole (12×12) für die kleinen Systemtasten
  const SYS = {
    chat: ['############', '#..........#', '#.###.###..#', '#..........#', '#.#####.##.#', '#..........#', '#.###......#', '#..........#', '#####.######', '....#.#.....', '....##......', '....#.......'],
    docs: ['.######.....', '.#....##....', '.#....#.#...', '.#....####..', '.#.####..#..', '.#......#...', '.#.######...', '.#......#...', '.#.######...', '.#......#...', '.########...', '............'],
    cal: ['.#..#..#..#.', '############', '#..........#', '############', '#.##.##.##.#', '#.##.##.##.#', '#..........#', '#.##.##.##.#', '#.##.##.###.', '#........##.', '###########.', '............'],
    search: ['....####....', '..##....##..', '.#........#.', '.#........#.', '#..........#', '#..........#', '.#........#.', '.#........#.', '..##....###.', '....####..##', '...........#', '............'],
    todo: ['############', '#..........#', '#.#..#####.#', '#.##.......#', '#..........#', '#.#..#####.#', '#.##.......#', '#..........#', '#.#..#####.#', '#.##.......#', '############', '............'],
    fn: ['....###.....', '...#........', '...#........', '.#####......', '...#...#..#.', '...#....##..', '...#....##..', '...#...#..#.', '..#.........', '.#..........', '............', '............'],
    calc: ['.##########.', '.#........#.', '.#.######.#.', '.#........#.', '.#.##.##.##.', '.#.##.##.##.', '.#........#.', '.#.##.##.##.', '.#.##.##.##.', '.#........#.', '.##########.', '............'],
    tools: ['..##........', '.#..#.......', '.#..#.......', '..##.#......', '.....#......', '......#.....', '.......#....', '........#.##', '.........#.#', '.........##.', '...........#', '............'],
    save: ['###########.', '#.#.....#.##', '#.#.....#..#', '#.#######..#', '#..........#', '#.########.#', '#.#......#.#', '#.#......#.#', '#.#......#.#', '#.#......#.#', '############', '............'],
    gear: ['....#..#....', '.#..####..#.', '..########..', '..##....##..', '###......###', '.##......##.', '.##......##.', '###......###', '..##....##..', '..########..', '.#..####..#.', '....#..#....'],
    plus: ['............', '.....##.....', '.....##.....', '.....##.....', '.....##.....', '.##########.', '.##########.', '.....##.....', '.....##.....', '.....##.....', '.....##.....', '............']
  };
  const psvg = (rows) => {
    let d = '';
    rows.forEach((r, y) => { for (let x = 0; x < 12; x++) if (r[x] === '#') d += `M${x} ${y}h1v1h-1z`; });
    return `<svg class="ds-px" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true"><path d="${d}" fill="currentColor"/></svg>`;
  };

  /* ---------------------------------------------------------------- Töne (live erzeugt, eigene Melodie) */
  let actx = null;
  const soundMode = () => (App.settings.dsSound || 'boot');
  function tone(seq, vol = 0.06) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      let t = actx.currentTime + 0.02;
      seq.forEach(([f, dur, type]) => {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = type || 'square'; o.frequency.value = f;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
        o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + dur + 0.02);
        t += dur * 0.62;
      });
    } catch (e) { /* ohne Ton weiter */ }
  }
  const bootSound = () => { if (soundMode() !== 'off') tone([[784, 0.12, 'square'], [1047, 0.12, 'square'], [1319, 0.12, 'square'], [1568, 0.5, 'triangle']], 0.05); };
  const tap = () => { if (soundMode() === 'all') tone([[1480, 0.035, 'triangle']], 0.05); };

  /* ---------------------------------------------------------------- Startlogo */
  let booted = false;
  function boot(force) {
    if (!on() || (booted && !force)) return;
    booted = true;
    if (App.settings.dsBoot === false || animOff()) return;
    const b = document.createElement('div');
    b.className = 'ds-boot';
    b.innerHTML = `<div class="ds-boot-flash"></div><div class="ds-boot-logo"><div class="ds-boot-mark"><span>FOS</span><i></i><i></i></div><b>FOS DIGITAL BINDER</b><em>DUAL SCREEN SYSTEM</em></div><small class="ds-boot-tip">Zum Überspringen tippen</small>`;
    document.body.appendChild(b);
    const end = () => { if (!b.isConnected || b.classList.contains('out')) return; b.classList.add('out'); setTimeout(() => b.remove(), 380); };
    b.addEventListener('pointerdown', end);
    setTimeout(bootSound, 420);
    setTimeout(end, 2500);
  }

  /* ---------------------------------------------------------------- Startseite */
  let timer = null;
  function calHTML(d, marks, small) {
    const y = d.getFullYear(), m = d.getMonth(), first = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
    const now = new Date(), isNow = now.getFullYear() === y && now.getMonth() === m;
    let s = `<div class="ds-calgrid${small ? ' sm' : ''}">` + ['MO', 'DI', 'MI', 'DO', 'FR', 'SA', 'SO'].map((w, i) => `<b class="${i > 4 ? 'we' : ''}">${w}</b>`).join('');
    for (let i = 0; i < first; i++) s += '<span></span>';
    for (let dd = 1; dd <= days; dd++) {
      const wd = (first + dd - 1) % 7, cls = [isNow && dd === now.getDate() ? 'today' : '', wd > 4 ? 'we' : '', marks && marks[dd] ? 'mk' : ''].filter(Boolean).join(' ');
      s += small ? `<span class="${cls}">${dd}</span>` : `<button class="${cls}" data-day="${dd}">${dd}</button>`;
    }
    return s + '</div>';
  }
  const docMarks = (y, m) => {
    const mk = {};
    App.index.items.forEach((i) => { if (i.type !== 'doc') return; const d = new Date(i.updated); if (d.getFullYear() === y && d.getMonth() === m) (mk[d.getDate()] = mk[d.getDate()] || []).push(i); });
    return mk;
  };

  function mountHome(v) {
    const host = v.querySelector('.ds-home');
    if (!host || !on()) { if (host) host.innerHTML = ''; return; }
    const subjects = App.index.subjects, docs = App.index.items.filter((i) => i.type === 'doc');
    const pages = docs.reduce((s, d) => s + (d.pages || 1), 0);
    const recent = docs.slice().sort((a, b) => b.updated - a.updated).slice(0, 6);
    const sname = (id) => { const s = subjects.find((x) => x.id === id); return s ? s.name : ''; };
    const now = new Date();
    host.innerHTML = `
      <div class="ds-console">
        <section class="ds-screen ds-top" aria-label="Systemanzeige">
          <header class="ds-bar"><span class="ds-sys">FOS SYSTEM</span><span class="ds-bar-r"><span class="ds-chip">OFFLINE</span><span class="ds-batt"><i></i></span></span></header>
          <div class="ds-topbody">
            <div class="ds-clockcol">
              <div class="ds-analog"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" class="f"/>${Array.from({ length: 12 }, (_, i) => { const a = i * Math.PI / 6; return `<rect x="${49 + 40 * Math.sin(a) - (i % 3 ? 1 : 2)}" y="${49 - 40 * Math.cos(a) - (i % 3 ? 1 : 2)}" width="${i % 3 ? 2 : 4}" height="${i % 3 ? 2 : 4}" class="t"/>`; }).join('')}<line class="h" x1="50" y1="50" x2="50" y2="26"/><line class="m" x1="50" y1="50" x2="50" y2="14"/><circle cx="50" cy="50" r="3.5" class="c"/></svg></div>
              <div class="ds-digital"><b class="ds-time"></b><span class="ds-date"></span></div>
            </div>
            <div class="ds-calbox"><div class="ds-calhead">${MON[now.getMonth()]} ${now.getFullYear()}</div>${calHTML(now, docMarks(now.getFullYear(), now.getMonth()), true)}</div>
            <div class="ds-recent"><h4>ZULETZT GEÖFFNET</h4>${recent.length ? recent.map((d) => `<button class="ds-rec" data-d="${esc(d.id)}"><b>${esc(d.name)}</b><small>${esc(sname(d.subjectId))} · ${new Date(d.updated).toLocaleDateString('de-DE')}</small></button>`).join('') : '<p class="ds-empty">Noch keine Hefte.</p>'}</div>
            <div class="ds-info"><span>FÄCHER ${subjects.length}</span><span>HEFTE ${docs.length}</span><span>SEITEN ${pages}</span></div>
          </div>
        </section>
        <div class="ds-hinge" aria-hidden="true"><i></i><i></i></div>
        <section class="ds-screen ds-bottom" aria-label="Touch-Menü">
          <div class="ds-big">
            <button data-x="chat" class="ds-wide"><span class="ds-ic">${psvg(SYS.chat)}</span><b>PICTONOTIZ</b><small>Zeichnen &amp; kurze Notizen</small></button>
            <button data-x="docs" class="ds-wide"><span class="ds-ic">${psvg(SYS.docs)}</span><b>DOKUMENTE</b><small>${docs.length} Hefte</small></button>
            <button data-x="cal" class="ds-wide"><span class="ds-ic">${psvg(SYS.cal)}</span><b>KALENDER</b><small>${two(now.getDate())}.${two(now.getMonth() + 1)}.</small></button>
          </div>
          <div class="ds-gridlabel">FÄCHER</div>
          <div class="ds-grid">
            ${subjects.map((s, i) => `<button class="ds-sq" data-s="${esc(s.id)}" style="--c:${accent(s.name, i)};--i:${i}"><span class="ds-sqi">${pix(s.name)}</span><b>${esc(s.name)}</b><span class="ds-more" data-m="${esc(s.id)}" title="Fach bearbeiten">⋮</span></button>`).join('')}
            <button class="ds-sq ds-add" data-a="ds-add" style="--c:#8a96a8;--i:${subjects.length}"><span class="ds-sqi">${psvg(SYS.plus)}</span><b>NEUES FACH</b></button>
          </div>
          <div class="ds-small">
            <button data-b="search" title="Suche">${psvg(SYS.search)}<span>Suche</span></button>
            <button data-b="todos" title="Aufgaben">${psvg(SYS.todo)}<span>Aufgaben</span></button>
            <button data-q="formulas" title="Formeln">${psvg(SYS.fn)}<span>Formeln</span></button>
            <button data-q="fc" title="Taschenrechner">${psvg(SYS.calc)}<span>Rechner</span></button>
            <button data-q="tools" title="Werkzeuge">${psvg(SYS.tools)}<span>Werkzeuge</span></button>
            <button data-b="backup" title="Backup">${psvg(SYS.save)}<span>Backup</span></button>
            <button data-b="settings" title="Einstellungen">${psvg(SYS.gear)}<span>System</span></button>
          </div>
        </section>
      </div>`;
    const top = (a) => { const b = v.querySelector(`.topbar [data-a=${a}]`); if (b) b.click(); };
    host.querySelectorAll('button').forEach((b) => b.addEventListener('pointerdown', tap));
    host.querySelectorAll('.ds-sq[data-s]').forEach((b) => b.onclick = (e) => {
      if (e.target.closest('.ds-more')) { e.stopPropagation(); const s = subjects.find((x) => x.id === b.dataset.s); if (s) App.subjectMenu(e.target.closest('.ds-more'), s); return; }
      App.showSubject(b.dataset.s, null);
    });
    host.querySelector('[data-a=ds-add]').onclick = () => { const a = v.querySelector('.binder.add'); if (a) a.click(); };
    host.querySelectorAll('[data-d]').forEach((b) => b.onclick = () => App.openDoc(b.dataset.d));
    host.querySelectorAll('[data-b]').forEach((b) => b.onclick = () => top(b.dataset.b));
    host.querySelectorAll('[data-q]').forEach((b) => b.onclick = () => { const q = b.dataset.q; if (q === 'fc') FloatCalc.open(); else Toolbox.open(q === 'tools' ? null : q); });
    host.querySelector('[data-x=chat]').onclick = () => pictochat();
    host.querySelector('[data-x=docs]').onclick = () => docsDialog();
    host.querySelector('[data-x=cal]').onclick = () => calendarDialog();

    const draw = (tick) => {
      if (tick && !host.isConnected) { clearInterval(timer); timer = null; return; }
      const d = new Date(), t = host.querySelector('.ds-time');
      if (!t) return;
      t.textContent = `${two(d.getHours())}:${two(d.getMinutes())}`;
      host.querySelector('.ds-date').textContent = `${WD[d.getDay()]} ${two(d.getDate())}.${two(d.getMonth() + 1)}.${d.getFullYear()}`;
      const h = (d.getHours() % 12 + d.getMinutes() / 60) * 30, m = d.getMinutes() * 6;
      host.querySelector('.ds-analog .h').setAttribute('transform', `rotate(${h} 50 50)`);
      host.querySelector('.ds-analog .m').setAttribute('transform', `rotate(${m} 50 50)`);
    };
    draw();
    clearInterval(timer);
    timer = setInterval(() => draw(true), 15000);
    try {
      if (navigator.getBattery) navigator.getBattery().then((bat) => { const el = host.querySelector('.ds-batt'); if (el) { el.style.setProperty('--b', Math.round(bat.level * 100) + '%'); el.title = 'Akku ' + Math.round(bat.level * 100) + ' %'; el.classList.add('known'); } }).catch(() => {});
    } catch (e) { /* ohne Akku */ }
  }

  /* ---------------------------------------------------------------- Dokumente */
  function docsDialog() {
    const subjects = App.index.subjects;
    let filter = '';
    dialog({
      title: 'Dokumente', wide: true, buttons: [{ label: 'Schließen', value: false }],
      body: `<div class="ds-filter"><button data-f="" class="on">Alle</button>${subjects.map((s) => `<button data-f="${esc(s.id)}">${esc(s.name)}</button>`).join('')}</div><div class="ds-doclist"></div>`,
      onOpen: (d) => {
        const list = $('.ds-doclist', d);
        const render = () => {
          const docs = App.index.items.filter((i) => i.type === 'doc' && (!filter || i.subjectId === filter)).sort((a, b) => b.updated - a.updated);
          list.innerHTML = docs.length ? docs.map((it) => { const s = subjects.find((x) => x.id === it.subjectId); return `<button class="ds-docrow" data-d="${esc(it.id)}"><span class="ds-dot" style="background:${s ? accent(s.name, subjects.indexOf(s)) : '#888'}"></span><b>${esc(it.name)}</b><small>${esc(s ? s.name : '')} · ${it.pages || 1} S. · ${new Date(it.updated).toLocaleDateString('de-DE')}</small></button>`; }).join('') : '<p class="ds-empty">Keine Hefte in diesem Fach.</p>';
          $$('[data-d]', list).forEach((b) => b.onclick = () => { closeTopOverlay(); App.openDoc(b.dataset.d); });
        };
        $$('[data-f]', d).forEach((b) => b.onclick = () => { filter = b.dataset.f; $$('[data-f]', d).forEach((x) => x.classList.toggle('on', x === b)); render(); });
        render();
      }
    });
  }

  /* ---------------------------------------------------------------- Kalender */
  function calendarDialog() {
    let cur = new Date(); cur.setDate(1);
    dialog({
      title: 'Kalender', buttons: [{ label: 'Schließen', value: false }],
      body: '<div class="ds-calnav"><button data-n="-1" class="btn">◀</button><b></b><button data-n="1" class="btn">▶</button></div><div class="ds-calbig"></div><div class="ds-calday"></div>',
      onOpen: (d) => {
        const render = () => {
          const mk = docMarks(cur.getFullYear(), cur.getMonth());
          $('.ds-calnav b', d).textContent = `${MON[cur.getMonth()]} ${cur.getFullYear()}`;
          $('.ds-calbig', d).innerHTML = calHTML(cur, mk, false);
          $('.ds-calday', d).innerHTML = '<p class="ds-hint">Punkte = an diesem Tag bearbeitete Hefte. Tag antippen für die Liste.</p>';
          $$('[data-day]', d).forEach((b) => b.onclick = () => {
            $$('[data-day]', d).forEach((x) => x.classList.toggle('sel', x === b));
            const list = mk[+b.dataset.day] || [];
            $('.ds-calday', d).innerHTML = `<h4>${two(+b.dataset.day)}.${two(cur.getMonth() + 1)}.${cur.getFullYear()}</h4>` + (list.length ? list.map((it) => `<button class="ds-docrow" data-d="${esc(it.id)}"><b>${esc(it.name)}</b><small>${new Date(it.updated).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr</small></button>`).join('') : '<p class="ds-empty">An diesem Tag wurde kein Heft bearbeitet.</p>');
            $$('.ds-calday [data-d]', d).forEach((x) => x.onclick = () => { closeTopOverlay(); App.openDoc(x.dataset.d); });
          });
        };
        $$('[data-n]', d).forEach((b) => b.onclick = () => { cur.setMonth(cur.getMonth() + +b.dataset.n); render(); });
        render();
      }
    });
  }

  /* ---------------------------------------------------------------- PictoNotiz (eigene, kleine Zeichenfläche) */
  const PC_W = 256, PC_H = 192, PC_FILE = 'pictochat.json';
  const loadNotes = () => { const d = Store.read(PC_FILE); return d && Array.isArray(d.notes) ? d : { v: 1, notes: [] }; };
  function pictochat() {
    const data = loadNotes();
    let color = '#111111', size = 1, erase = false, drawing = false, last = null, editId = null;
    const COLORS = ['#111111', '#e03c3c', '#1f78e0', '#1fa65a', '#e3a000', '#7a52e0'];
    dialog({
      title: 'PictoNotiz', wide: true, buttons: [{ label: 'Schließen', value: false }],
      body: `<div class="pc-wrap">
          <div class="pc-tools">
            <button data-t="pen" class="on" title="Stift">✎</button><button data-t="erase" title="Radierer">⌫</button>
            <button data-sz="1" class="on" title="Dünn">•</button><button data-sz="3" title="Dick">●</button>
            ${COLORS.map((c, i) => `<button class="pc-col${i ? '' : ' on'}" data-c="${c}" style="--c:${c}" title="Farbe"></button>`).join('')}
          </div>
          <div class="pc-main">
            <div class="pc-paper"><div class="pc-head"><span>FOS</span><input class="pc-text" maxlength="60" placeholder="Kurze Notiz …"></div><canvas width="${PC_W}" height="${PC_H}"></canvas></div>
            <div class="pc-acts"><button class="btn" data-act="clear">Leeren</button><button class="btn primary" data-act="save">Speichern</button></div>
          </div>
        </div>
        <div class="pc-listhead">GESPEICHERT</div><div class="pc-list"></div>`,
      onOpen: (d) => {
        const cv = $('canvas', d), g = cv.getContext('2d'), txt = $('.pc-text', d);
        const clear = () => { g.fillStyle = '#fff'; g.fillRect(0, 0, PC_W, PC_H); };
        clear();
        const pos = (e) => { const r = cv.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / r.width * PC_W), Math.floor((e.clientY - r.top) / r.height * PC_H)]; };
        const dot = (x, y) => { g.fillStyle = erase ? '#fff' : color; const s = erase ? 6 : size; g.fillRect(x - (s >> 1), y - (s >> 1), s, s); };
        const line = (a, b) => { // Bresenham: pixelgenaue Linien wie auf einem kleinen LCD
          let [x0, y0] = a; const [x1, y1] = b, dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
          let err = dx + dy;
          for (;;) { dot(x0, y0); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
        };
        cv.addEventListener('pointerdown', (e) => { e.preventDefault(); cv.setPointerCapture(e.pointerId); drawing = true; last = pos(e); dot(...last); });
        cv.addEventListener('pointermove', (e) => { if (!drawing) return; const p = pos(e); line(last, p); last = p; });
        const stop = () => { drawing = false; last = null; };
        cv.addEventListener('pointerup', stop); cv.addEventListener('pointercancel', stop);
        $$('[data-t]', d).forEach((b) => b.onclick = () => { erase = b.dataset.t === 'erase'; $$('[data-t]', d).forEach((x) => x.classList.toggle('on', x === b)); });
        $$('[data-sz]', d).forEach((b) => b.onclick = () => { size = +b.dataset.sz; $$('[data-sz]', d).forEach((x) => x.classList.toggle('on', x === b)); });
        $$('[data-c]', d).forEach((b) => b.onclick = () => { color = b.dataset.c; erase = false; $$('[data-c]', d).forEach((x) => x.classList.toggle('on', x === b)); $$('[data-t]', d).forEach((x) => x.classList.toggle('on', x.dataset.t === 'pen')); });
        const list = $('.pc-list', d);
        const renderList = () => {
          list.innerHTML = data.notes.length ? data.notes.slice().reverse().map((n) => `<div class="pc-note${n.id === editId ? ' sel' : ''}" data-id="${n.id}"><img src="${n.img}" alt=""><span>${esc(n.text || '')}</span><small>${new Date(n.t).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</small><button class="pc-del" title="Löschen">✕</button></div>`).join('') : '<p class="ds-empty">Noch keine Notizen gespeichert.</p>';
          $$('.pc-note', list).forEach((el) => {
            el.onclick = (e) => {
              const n = data.notes.find((x) => x.id === el.dataset.id); if (!n) return;
              if (e.target.closest('.pc-del')) {
                confirm2('Notiz löschen?', 'Diese PictoNotiz wird gelöscht.', 'Löschen', true).then((y) => { if (!y) return; data.notes = data.notes.filter((x) => x !== n); if (editId === n.id) editId = null; Store.write(PC_FILE, data); renderList(); });
                return;
              }
              const im = new Image(); im.onload = () => { clear(); g.drawImage(im, 0, 0); }; im.src = n.img;
              txt.value = n.text || ''; editId = n.id; renderList();
            };
          });
        };
        renderList();
        $('[data-act=clear]', d).onclick = () => { clear(); txt.value = ''; editId = null; renderList(); };
        $('[data-act=save]', d).onclick = () => {
          const img = cv.toDataURL('image/png'), t = Date.now();
          const ex = editId && data.notes.find((x) => x.id === editId);
          if (ex) Object.assign(ex, { img, text: txt.value.trim(), t });
          else { const n = { id: uid(), t, text: txt.value.trim(), img }; data.notes.push(n); editId = n.id; if (data.notes.length > 60) data.notes.shift(); }
          if (Store.write(PC_FILE, data) === false) toast('Speichern fehlgeschlagen'); else toast('PictoNotiz gespeichert ✓');
          renderList();
        };
      }
    });
  }

  return { mountHome, boot, accent, pictochat, calendarDialog, docsDialog, loadNotes, PC_FILE, _tone: tone };
})();
