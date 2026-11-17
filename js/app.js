/* App shell: data index, home (binders), subject view (folders + notebooks), settings, backup, PDF export. */
'use strict';

const DEFAULT_SUBJECTS = [
  ['Metalltechnik', '⚙️', '#64748b'], ['Elektrotechnik', '⚡', '#e8a10a'], ['Bautechnik', '🏗️', '#b8692e'],
  ['IT', '💻', '#0ea5e9'], ['Chemie', '🧪', '#16a34a'], ['Physik', '⚛️', '#7c5cf0'], ['Ethik', '⚖️', '#db4f97'],
  ['Deutsch', '📕', '#dc4040'], ['Englisch', '🇬🇧', '#2f5fd8'], ['Mathematik', '📐', '#0f9f94']
];
const SUBJECT_ICONS = ['⚙️', '⚡', '🏗️', '💻', '🧪', '⚛️', '⚖️', '📕', '🇬🇧', '📐', '🧮', '📊', '💶', '🌍', '🎨', '🎵', '⚽', '🧬', '📚', '🔧', '🔌', '🖥️', '📝', '🧠'];
const SUBJECT_COLORS = ['#64748b', '#e8a10a', '#b8692e', '#0ea5e9', '#16a34a', '#7c5cf0', '#db4f97', '#dc4040', '#2f5fd8', '#0f9f94', '#8b5a2b', '#475569', '#ea580c', '#0891b2'];
const PAPER_COLORS = [['#ffffff', 'Weiß'], ['#fbf6e9', 'Creme'], ['#f4f1ea', 'Recycling'], ['#eef2f6', 'Hellgrau'], ['#eef7f0', 'Mint']];
const PAPERS = [['white', 'Weiß'], ['lined', 'Liniert'], ['grid', 'Kariert'], ['mm', 'Millimeter'], ['parch', 'Pergament'], ['parchl', 'Pergament liniert'], ['lcd', 'LCD-Raster']];

const App = {
  index: null,
  settings: {},
  view: { name: 'home' },

  init() {
    let idx = Store.read('index.json');
    if (!idx || !Array.isArray(idx.subjects)) idx = App.seed();
    App.index = idx;
    App.settings = Object.assign({ design: 'hyrule', theme: 'dark', paperColor: '#ffffff', finger: 'auto', thumbs: true, penSeen: false, smooth: 1, calc: false, calcColor: '#e46a00' }, idx.settings || {});
    idx.settings = App.settings;
    App.applyTheme();
    window.onBack = App.onBack;
    window.flushSave = () => { if (Editor.doc) Editor.flush(); App.saveIndex.flush(); };
    document.addEventListener('visibilitychange', () => { if (document.hidden) window.flushSave(); });
    window.addEventListener('pagehide', () => window.flushSave());
    App.showHome();
    Poketch.boot();
    DS.boot();
  },

  seed() {
    const idx = { v: 1, subjects: [], items: [], settings: {} };
    for (const [name, emoji, color] of DEFAULT_SUBJECTS) idx.subjects.push({ id: uid(), name, icon: emoji, color });
    const math = idx.subjects[9];
    const now = Date.now();
    ['Lineare Funktionen', 'Quadratische Funktionen', 'Gleichungen', 'Klassenarbeit Vorbereitung'].forEach((n, i) => {
      const id = uid();
      idx.items.push({ id, subjectId: math.id, parentId: null, type: 'doc', name: n, created: now - i, updated: now - i, pages: 1 });
      Store.write('doc_' + id + '.json', { id, images: {}, pages: [App.newPage('grid')] });
    });
    Store.write('index.json', idx);
    return idx;
  },

  newPage(paper) { return { id: uid(), paper: paper || 'grid', h: A4_H, strokes: [], els: [] }; },

  saveIndex: debounce(() => { Store.write('index.json', App.index); }, 300),

  applyTheme() {
    let t = App.settings.theme;
    if (t === 'system') t = window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    // Design (Klassisch / Hyrule Edition) ist reine Darstellung – keine Daten werden verändert
    const d = ['classic', 'poketch', 'wii', 'lcars', 'switch', 'ds'].includes(App.settings.design) ? App.settings.design : 'hyrule';
    document.documentElement.dataset.design = d;
    document.documentElement.dataset.anim = App.settings.anim === false ? 'off' : 'on';
    const m = document.querySelector('meta[name=theme-color]');
    if (m) m.content = d === 'ds' ? '#d9dfe7' : d === 'switch' ? (t === 'light' ? '#F4F5F7' : '#17191F') : d === 'lcars' ? '#050505' : d === 'wii' ? '#eef3f7' : d === 'poketch' ? '#b8302a' : d === 'hyrule' ? (t === 'light' ? '#d9d0b8' : '#172b23') : (t === 'light' ? '#f2f3f8' : '#161a28');
  },

  /* ------------------------------------------------------------ data helpers */
  subject: (id) => App.index.subjects.find((s) => s.id === id),
  item: (id) => App.index.items.find((i) => i.id === id),
  children(subjectId, parentId) {
    return App.index.items.filter((i) => i.subjectId === subjectId && (i.parentId || null) === (parentId || null));
  },
  descendants(id) {
    const out = [];
    const walk = (pid) => App.index.items.filter((i) => i.parentId === pid).forEach((i) => { out.push(i); walk(i.id); });
    walk(id);
    return out;
  },
  docCount(subjectId) { return App.index.items.filter((i) => i.subjectId === subjectId && i.type === 'doc').length; },

  loadDoc(id) {
    const d = Store.read('doc_' + id + '.json');
    if (!d) return { id, images: {}, pages: [App.newPage('grid')] };
    d.images = d.images || {};
    if (!d.pages || !d.pages.length) d.pages = [App.newPage('grid')];
    for (const p of d.pages) { p.strokes = p.strokes || []; p.els = p.els || []; p.h = p.h || A4_H; }
    return d;
  },

  /** plain text of everything typed in a notebook (for search) */
  docText(doc) {
    const out = [];
    for (const p of doc.pages) for (const el of p.els) {
      if (el.type === 'text') { const t = document.createElement('template'); t.innerHTML = el.html || ''; out.push(t.content.textContent); }
      else if (el.type === 'check') (el.items || []).forEach((i) => out.push(i.t));
      else if (el.type === 'table') { const ev = SheetEngine.evaluator(el.sheet); for (const ref of Object.keys(el.sheet.cells)) out.push(SheetEngine.display(ev.get(ref))); }
      else if (el.type === 'graph') el.fns.forEach((f) => out.push(f.expr));
    }
    return out.join(' \n ').slice(0, 30000);
  },
  docTodos(doc) {
    const out = [];
    doc.pages.forEach((p, pi) => p.els.forEach((el) => { if (el.type === 'check') (el.items || []).forEach((i, k) => out.push({ t: i.t, d: !!i.d, p: pi, el: el.id, k })); }));
    return out;
  },
  saveDoc(doc) {
    const ok = Store.write('doc_' + doc.id + '.json', doc);
    const it = App.item(doc.id);
    if (it) {
      it.text = App.docText(doc);
      it.todos = App.docTodos(doc);
      it.pages = doc.pages.length;
      it.updated = Date.now();
      App.saveIndex();
    }
    if (!ok) toast('⚠ Speichern fehlgeschlagen – Speicher voll?');
    return ok;
  },

  /** small preview stored in the index (keeps the folder view fast) */
  async updateThumb(doc) {
    const it = App.item(doc.id);
    if (!it) return;
    const p = doc.pages[0];
    it.thumb = Render.thumbSVG(p, doc, { simplify: true, noImages: true });
    if (it.thumb.length > 60000) it.thumb = Render.thumbSVG(Object.assign({}, p, { strokes: p.strokes.slice(0, 150) }), doc, { simplify: true, noImages: true });
    it.thumbImg = null;
    const hasImg = p.bg || p.els.some((e) => e.type === 'image');
    if (hasImg) {
      try {
        const svg = Render.thumbSVG(p, doc, { simplify: true });
        const img = await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
        const c = document.createElement('canvas');
        c.width = 220; c.height = Math.round(220 * (p.h || A4_H) / PAGE_W);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        it.thumbImg = c.toDataURL('image/jpeg', 0.7);
      } catch (e) { it.thumbImg = null; }
    }
    App.saveIndex();
  },

  createDoc(subjectId, parentId, name, paper) {
    const id = uid(), now = Date.now();
    const item = { id, subjectId, parentId: parentId || null, type: 'doc', name, created: now, updated: now, pages: 1 };
    App.index.items.push(item);
    const doc = { id, images: {}, pages: [App.newPage(paper)] };
    Store.write('doc_' + id + '.json', doc);
    App.saveIndex.flush();
    return item;
  },

  deleteItem(id) {
    const it = App.item(id);
    if (!it) return;
    const all = [it].concat(App.descendants(id));
    for (const x of all) if (x.type === 'doc') Store.remove('doc_' + x.id + '.json');
    const ids = new Set(all.map((x) => x.id));
    App.index.items = App.index.items.filter((x) => !ids.has(x.id));
    App.saveIndex.flush();
  },

  /* ------------------------------------------------------------ navigation */
  onBack() {
    if (closeTopOverlay()) return true;
    if (App.view.name === 'editor') { Editor.close(); return true; }
    if (App.view.name === 'subject') {
      if (App.view.folderId) { const f = App.item(App.view.folderId); App.showSubject(App.view.subjectId, f ? f.parentId : null); }
      else App.showHome();
      return true;
    }
    return false;
  },

  mount(el) {
    const app = $('#app');
    app.innerHTML = '';
    app.appendChild(el);
  },

  /* ------------------------------------------------------------ home */
  showHome() {
    App.view = { name: 'home' };
    const total = App.index.items.filter((i) => i.type === 'doc').length;
    const v = html(`<div class="view" id="home">
      <div class="topbar">
        <div style="font-size:28px;margin:0 6px 0 8px">🎓</div>
        <div class="title">FOS Digital Binder<small>Deine digitale Schultasche</small></div>
        <div class="spacer"></div>
        <button class="ibtn" data-a="search" title="Suchen">${icon('search')}</button>
        <button class="ibtn" data-a="todos" title="Aufgaben">${icon('checklist')}<span class="badge todo-badge hidden" style="background:#ef4444;width:auto;min-width:18px;height:18px;right:0;bottom:auto;top:2px;font-size:11px;color:#fff;display:flex;align-items:center;justify-content:center;padding:0 4px;border:0"></span></button>
        <button class="ibtn" data-a="backup" title="Sichern">${icon('database')}</button>
        <button class="ibtn" data-a="settings" title="Einstellungen">${icon('settings')}</button>
      </div>
      ${Wii.bubbles()}
      <div class="lc-console"></div>
      <div class="sw-home"></div>
      <div class="ds-home"></div>
      <div class="home-scroll">
        <div class="pk-hero"></div>
        <div class="hy-hero">${Hyrule.crest}<div class="hy-hero-t"><div class="hy-kicker">Abenteuer-Tagebuch der FOS</div><h1>FOS DIGITAL BINDER</h1>${Hyrule.band}</div></div>
        <div class="home-head"><div><h1>Meine Fächer</h1><p>${App.index.subjects.length} Fächer · ${total} Hefte · alles offline auf diesem Tablet gespeichert</p></div></div>
        <div class="tb-home">
          <button class="tb-tile" data-tb="formulas" style="--c:#0f9f94">${icon('fn')}<span><b>Formelsammlung</b><small>${FORMULAS.length} Formeln · Suche · Favoriten</small></span></button>
          <button class="tb-tile" data-tb="units" style="--c:#2f5fd8">${icon('swap')}<span><b>Einheitenrechner</b><small>Länge bis Temperatur</small></span></button>
          <button class="tb-tile" data-tb="calc" style="--c:#b8692e">${icon('calc')}<span><b>Schulrechner</b><small>Mörtel · Kreis · Trapez · Träger</small></span></button>
          <button class="tb-tile" data-fc="1" style="--c:#8a4fd8">${icon('fn')}<span><b>Taschenrechner</b><small>Wissenschaftlich · Brüche · Graph</small></span></button>
        </div>
        <div class="binders"></div>
        <div class="recent"></div>
      </div>${Wii.barHTML()}</div>`);
    Poketch.mountHome(v);
    Wii.mountHome(v);
    Lcars.mountHome(v);
    Switch2.mountHome(v);
    DS.mountHome(v);
    const grid = $('.binders', v);
    App.index.subjects.forEach((s, idx) => {
      const n = App.docCount(s.id);
      const b = html(`<div class="binder" style="--c:${s.color};--a:${Hyrule.accent(s.name, s.color)};--i:${idx}" role="button">
        <div class="wi-ch" style="--w:${Wii.accent(s.name, s.color)}"><div class="wi-ico">${Wii.icon(s.name)}</div><b>${esc(s.name)}</b><span>${n} ${n === 1 ? 'Heft' : 'Hefte'}</span></div>
        <div class="hy-ico">${Hyrule.icon(s.name)}</div>
        <div class="pk-app" style="--p:${Poketch.accent(s.name, s.color)}"><div class="pk-ico">${Poketch.icon(s.name)}</div><b class="pk-name">${esc(Poketch.short(s.name))}</b>${n ? `<span class="pk-cnt">${n}</span>` : ''}</div>
        <div class="rings"><i></i><i></i><i></i></div>
        <div class="label"><b>${esc(s.name)}</b><span>${n} ${n === 1 ? 'Heft' : 'Hefte'}</span></div>
        <div class="emblem">${esc(s.icon)}</div>
        <button class="ibtn menu">${icon('more')}</button></div>`);
      b.onclick = (e) => { if (e.target.closest('.menu')) return; App.showSubject(s.id, null); };
      $('.menu', b).onclick = (e) => { e.stopPropagation(); App.subjectMenu(e.currentTarget, s); };
      grid.appendChild(b);
    });
    const add = html(`<button class="binder add">${icon('plus')}<span>Neues Fach</span></button>`);
    add.onclick = () => App.editSubject(null);
    grid.appendChild(add);

    const recent = App.index.items.filter((i) => i.type === 'doc').sort((a, b) => b.updated - a.updated).slice(0, 6);
    if (recent.length) {
      const r = $('.recent', v);
      r.appendChild(html('<div class="home-head" style="margin-top:34px"><div><h1 style="font-size:21px">Zuletzt bearbeitet</h1></div></div>'));
      const items = html('<div class="items"></div>');
      recent.forEach((it) => items.appendChild(App.itemCard(it, true)));
      r.appendChild(items);
    }
    $('[data-a=settings]', v).onclick = () => App.settingsDialog();
    $$('[data-tb]', v).forEach((b) => b.onclick = () => Toolbox.open(b.dataset.tb));
    $('[data-fc]', v).onclick = () => FloatCalc.open();
    $('[data-a=search]', v).onclick = () => App.searchDialog();
    $('[data-a=todos]', v).onclick = () => App.todoDialog();
    const open = App.index.items.reduce((n, i) => n + (i.todos || []).filter((t) => !t.d).length, 0);
    if (open) { const b = $('.todo-badge', v); b.textContent = open; b.classList.remove('hidden'); }
    $('[data-a=backup]', v).onclick = (e) => menu(e.currentTarget, [
      { section: 'Datensicherung' },
      { label: 'Komplettes Backup speichern', icon: 'download', action: () => App.exportBackup() },
      { label: 'Backup wiederherstellen / Import öffnen', icon: 'upload', action: () => App.importBackup() }
    ]);
    App.mount(v);
  },

  subjectMenu(anchor, s) {
    menu(anchor, [
      { label: 'Bearbeiten', icon: 'edit', action: () => App.editSubject(s) },
      { label: 'Fach als PDF exportieren', icon: 'pdf', action: () => App.exportSubjectPDF(s) },
      { label: 'Fach-Backup speichern', icon: 'download', action: () => App.exportBackup(s) },
      '-',
      { label: 'Fach löschen', icon: 'trash', danger: true, action: async () => {
        const n = App.docCount(s.id);
        if (!(await confirm2('Fach löschen?', `„${s.name}“ und ${n} ${n === 1 ? 'Heft' : 'Hefte'} werden endgültig gelöscht.`))) return;
        App.index.items.filter((i) => i.subjectId === s.id && !i.parentId).forEach((i) => App.deleteItem(i.id));
        App.index.subjects = App.index.subjects.filter((x) => x !== s);
        App.saveIndex.flush();
        App.showHome();
      } }
    ]);
  },

  async editSubject(s) {
    let ic = s ? s.icon : '📚', col = s ? s.color : SUBJECT_COLORS[App.index.subjects.length % SUBJECT_COLORS.length];
    const res = await dialog({
      title: s ? 'Fach bearbeiten' : 'Neues Fach',
      body: `<div class="field"><label>Name</label><input type="text" id="sn" value="${esc(s ? s.name : '')}" placeholder="z. B. Wirtschaft" autofocus></div>
        <div class="field"><label>Symbol</label><div class="icon-choice">${SUBJECT_ICONS.map((i) => `<button data-i="${i}" class="${i === ic ? 'on' : ''}">${i}</button>`).join('')}</div></div>
        <div class="field"><label>Farbe</label><div class="color-choice">${SUBJECT_COLORS.map((c) => `<button data-c="${c}" style="background:${c}" class="${c === col ? 'on' : ''}"></button>`).join('')}</div></div>`,
      onOpen: (d) => {
        $$('.icon-choice button', d).forEach((b) => b.onclick = () => { ic = b.dataset.i; $$('.icon-choice button', d).forEach((x) => x.classList.toggle('on', x === b)); });
        $$('.color-choice button', d).forEach((b) => b.onclick = () => { col = b.dataset.c; $$('.color-choice button', d).forEach((x) => x.classList.toggle('on', x === b)); });
      },
      buttons: [{ label: 'Abbrechen', value: null }, { label: s ? 'Speichern' : 'Erstellen', cls: 'primary', value: (d) => $('#sn', d).value.trim() }]
    });
    if (!res) return;
    if (s) Object.assign(s, { name: res, icon: ic, color: col });
    else App.index.subjects.push({ id: uid(), name: res, icon: ic, color: col });
    App.saveIndex.flush();
    App.showHome();
  },

  /* ------------------------------------------------------------ subject view */
  showSubject(subjectId, folderId) {
    const s = App.subject(subjectId);
    if (!s) return App.showHome();
    App.view = { name: 'subject', subjectId, folderId: folderId || null };
    const path = [];
    let f = folderId ? App.item(folderId) : null;
    while (f) { path.unshift(f); f = f.parentId ? App.item(f.parentId) : null; }
    const v = html(`<div class="view" id="subject" style="--c:${s.color}">
      <div class="topbar subj-bar">
        <button class="ibtn" data-a="back">${icon('back')}</button>
        <span class="dot">${esc(s.icon)}</span>
        <div class="title">${esc(path.length ? path[path.length - 1].name : s.name)}<small>${esc(path.length ? s.name : App.docCount(s.id) + ' Hefte')}</small></div>
        <div class="spacer"></div>
        <button class="ibtn" data-a="pdf" title="PDF importieren">${icon('pdf')}</button>
        <button class="ibtn" data-a="more">${icon('more')}</button>
      </div>
      ${path.length ? '<div class="crumbs"></div>' : ''}
      <div class="actions-row">
        <button class="btn primary" data-a="newdoc">${icon('plus')}Neues Heft</button>
        <button class="btn tonal" data-a="newfolder">${icon('folder')}Neuer Ordner</button>
      </div>
      <div class="list-scroll"><div class="items"></div></div></div>`);
    if (path.length) {
      const cr = $('.crumbs', v);
      const add = (label, fid, cur) => {
        const b = html(`<button class="${cur ? 'cur' : ''}">${esc(label)}</button>`);
        b.onclick = () => App.showSubject(subjectId, fid);
        cr.appendChild(b);
      };
      add(s.name, null, false);
      path.forEach((p, i) => { cr.insertAdjacentHTML('beforeend', icon('chevronRight')); add(p.name, p.id, i === path.length - 1); });
    }
    const list = $('.items', v);
    const kids = App.children(subjectId, folderId);
    const folders = kids.filter((k) => k.type === 'folder').sort((a, b) => a.name.localeCompare(b.name, 'de'));
    const docs = kids.filter((k) => k.type === 'doc').sort((a, b) => b.updated - a.updated);
    folders.concat(docs).forEach((it) => list.appendChild(App.itemCard(it)));
    if (!kids.length) {
      $('.list-scroll', v).innerHTML = `<div class="empty">${icon('notebook')}<div><b>Noch leer</b></div><div>Lege ein neues Heft oder einen Ordner an.</div></div>`;
    }
    $('[data-a=back]', v).onclick = () => App.onBack();
    $('[data-a=newdoc]', v).onclick = () => App.newDocDialog(subjectId, folderId);
    $('[data-a=newfolder]', v).onclick = async () => {
      const n = await prompt2('Neuer Ordner', '', 'Ordnername');
      if (!n) return;
      App.index.items.push({ id: uid(), subjectId, parentId: folderId || null, type: 'folder', name: n, created: Date.now(), updated: Date.now() });
      App.saveIndex.flush();
      App.showSubject(subjectId, folderId);
    };
    $('[data-a=pdf]', v).onclick = () => App.importPdfAsDoc(subjectId, folderId);
    $('[data-a=more]', v).onclick = (e) => App.subjectMenu(e.currentTarget, s);
    App.mount(v);
  },

  itemCard(it, showSubject) {
    const s = App.subject(it.subjectId) || { color: '#888', name: '' };
    let thumb;
    if (it.type === 'folder') {
      const n = App.descendants(it.id).filter((x) => x.type === 'doc').length;
      thumb = `<div class="thumb">${icon('folder')}</div><div class="meta"><b>${esc(it.name)}</b><span>Ordner · ${n} ${n === 1 ? 'Heft' : 'Hefte'}</span></div>`;
    } else {
      const t = it.thumbImg ? `<img class="pg" src="${it.thumbImg}" alt="">` : (it.thumb || '<svg class="pg" viewBox="0 0 1000 1414"><rect width="1000" height="1414" fill="#fff"/></svg>');
      thumb = `<div class="thumb">${t}</div><div class="meta"><b>${esc(it.name)}</b><span>${showSubject ? esc(s.icon + ' ' + s.name) + ' · ' : ''}${it.pages || 1} S. · ${fmtDate(it.updated)}</span></div>`;
    }
    const c = html(`<div class="item ${it.type}" style="--c:${s.color}" role="button">${thumb}<button class="ibtn menu">${icon('more')}</button></div>`);
    c.onclick = (e) => {
      if (e.target.closest('.menu')) return;
      if (it.type === 'folder') App.showSubject(it.subjectId, it.id); else App.openDoc(it.id);
    };
    $('.menu', c).onclick = (e) => { e.stopPropagation(); App.itemMenu(e.currentTarget, it); };
    return c;
  },

  refresh() {
    if (App.view.name === 'home') App.showHome();
    else if (App.view.name === 'subject') App.showSubject(App.view.subjectId, App.view.folderId);
  },

  itemMenu(anchor, it) {
    menu(anchor, [
      { label: 'Umbenennen', icon: 'edit', action: async () => {
        const n = await prompt2('Umbenennen', it.name);
        if (n) { it.name = n; App.saveIndex.flush(); App.refresh(); }
      } },
      { label: 'Verschieben', icon: 'move', action: () => App.moveDialog(it) },
      it.type === 'doc' ? { label: 'Duplizieren', icon: 'copy', action: () => {
        const d = App.loadDoc(it.id), id = uid();
        d.id = id;
        Store.write('doc_' + id + '.json', d);
        App.index.items.push(Object.assign({}, it, { id, name: it.name + ' (Kopie)', created: Date.now(), updated: Date.now() }));
        App.saveIndex.flush();
        App.refresh();
      } } : null,
      it.type === 'doc' ? { label: 'Als PDF exportieren', icon: 'pdf', action: () => App.exportDocPDF(it) } : null,
      '-',
      { label: 'Löschen', icon: 'trash', danger: true, action: async () => {
        const extra = it.type === 'folder' ? ` mit ${App.descendants(it.id).length} Einträgen` : '';
        if (!(await confirm2('Löschen?', `„${it.name}“${extra} wird endgültig gelöscht.`))) return;
        App.deleteItem(it.id);
        App.refresh();
      } }
    ]);
  },

  async moveDialog(it) {
    const blocked = new Set([it.id].concat(App.descendants(it.id).map((x) => x.id)));
    const opts = [];
    for (const s of App.index.subjects) {
      opts.push([s.id + '|', s.icon + ' ' + s.name]);
      const walk = (pid, depth) => App.children(s.id, pid).filter((x) => x.type === 'folder' && !blocked.has(x.id))
        .sort((a, b) => a.name.localeCompare(b.name, 'de')).forEach((f) => { opts.push([s.id + '|' + f.id, '   '.repeat(depth) + '📁 ' + f.name]); walk(f.id, depth + 1); });
      walk(null, 1);
    }
    const cur = it.subjectId + '|' + (it.parentId || '');
    const v = await dialog({
      title: `„${it.name}“ verschieben`,
      body: `<div class="field"><label>Ziel</label><select id="mt">${opts.map(([v, l]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`,
      buttons: [{ label: 'Abbrechen', value: null }, { label: 'Verschieben', cls: 'primary', value: (d) => $('#mt', d).value }]
    });
    if (!v) return;
    const [sid, fid] = v.split('|');
    it.subjectId = sid; it.parentId = fid || null;
    App.descendants(it.id).forEach((x) => { x.subjectId = sid; });
    App.saveIndex.flush();
    App.refresh();
    toast('Verschoben');
  },

  paperPreview(p) {
    return Render.thumbSVG(App.newPage(p), { images: {} }).replace('class="pg"', '');
  },

  async newDocDialog(subjectId, folderId) {
    let paper = App.settings.lastPaper || 'grid';
    const res = await dialog({
      title: 'Neues Heft',
      body: `<div class="field"><label>Titel</label><input type="text" id="dn" placeholder="z. B. Lineare Funktionen" autofocus></div>
        <div class="field"><label>Papiervorlage</label><div class="paper-choice">${PAPERS.map(([k, l]) => `<button data-p="${k}" class="${k === paper ? 'on' : ''}">${App.paperPreview(k)}<span>${l}</span></button>`).join('')}</div></div>`,
      onOpen: (d) => $$('.paper-choice button', d).forEach((b) => b.onclick = () => { paper = b.dataset.p; $$('.paper-choice button', d).forEach((x) => x.classList.toggle('on', x === b)); }),
      buttons: [{ label: 'Abbrechen', value: null }, { label: 'Erstellen', cls: 'primary', value: (d) => $('#dn', d).value.trim() || 'Neues Heft' }]
    });
    if (!res) return;
    App.settings.lastPaper = paper;
    const it = App.createDoc(subjectId, folderId, res, paper);
    App.openDoc(it.id);
  },

  openDoc(id) {
    const it = App.item(id);
    if (!it) return;
    const doc = App.loadDoc(id);
    App.view = { name: 'editor', docId: id, subjectId: it.subjectId, folderId: it.parentId };
    Editor.open(it, doc);
  },

  /* ------------------------------------------------------------ search across notebooks */
  ensureText() {
    let changed = false;
    for (const it of App.index.items) if (it.type === 'doc' && it.text == null) {
      const d = App.loadDoc(it.id); it.text = App.docText(d); it.todos = App.docTodos(d); changed = true;
    }
    if (changed) App.saveIndex();
  },
  async searchDialog() {
    App.ensureText();
    await dialog({
      title: 'In allen Heften suchen', wide: true,
      body: `<div class="field"><input type="text" id="gq" placeholder="Wort eingeben …" autofocus></div><div id="gres" style="max-height:55vh;overflow:auto"></div>
        <p style="font-size:12px;margin-top:10px">Durchsucht Heft-Namen, Textfelder, Tabellen, Aufgaben und Funktionen. Handschrift kann nicht durchsucht werden.</p>`,
      onOpen: (d) => {
        const inp = $('#gq', d), res = $('#gres', d);
        const run = () => {
          const q = inp.value.trim().toLowerCase();
          res.innerHTML = '';
          if (q.length < 2) return;
          const hits = App.index.items.filter((it) => it.type === 'doc' && ((it.name || '').toLowerCase().includes(q) || (it.text || '').toLowerCase().includes(q)));
          if (!hits.length) { res.innerHTML = '<p>Keine Treffer.</p>'; return; }
          for (const it of hits.slice(0, 60)) {
            const s = App.subject(it.subjectId) || { icon: '', name: '' };
            const txt = it.text || '', i = txt.toLowerCase().indexOf(q);
            const snip = i >= 0 ? '…' + esc(txt.slice(Math.max(0, i - 40), i)) + '<mark class="sh-mark">' + esc(txt.slice(i, i + q.length)) + '</mark>' + esc(txt.slice(i + q.length, i + q.length + 60)) + '…' : '<i>Treffer im Namen</i>';
            const b = html(`<button style="display:block;width:100%;text-align:left;padding:10px;border-radius:10px;background:var(--surface2);margin-bottom:8px"><b>${esc(it.name)}</b> <span class="muted" style="font-size:12px">${esc(s.icon + ' ' + s.name)}</span><div style="font-size:13px;margin-top:4px">${snip}</div></button>`);
            b.onclick = () => { closeTopOverlay(); App.openDoc(it.id); setTimeout(() => Editor.openSearch(inp.value.trim()), 150); };
            res.appendChild(b);
          }
        };
        inp.addEventListener('input', debounce(run, 150));
      },
      buttons: [{ label: 'Schließen', value: null }]
    });
  },

  /* ------------------------------------------------------------ tasks overview */
  async todoDialog() {
    App.ensureText();
    let showDone = false;
    await dialog({
      title: 'Aufgaben', wide: true,
      body: `<label style="display:flex;gap:8px;align-items:center;margin-bottom:10px"><input type="checkbox" id="td-done"> erledigte anzeigen</label><div id="tdl" style="max-height:58vh;overflow:auto"></div>`,
      onOpen: (d) => {
        const list = $('#tdl', d);
        const render = () => {
          list.innerHTML = '';
          const docs = App.index.items.filter((it) => it.type === 'doc' && (it.todos || []).some((t) => showDone || !t.d));
          if (!docs.length) { list.innerHTML = `<p>${showDone ? 'Noch keine Aufgabenlisten.' : 'Alles erledigt 🎉'}</p><p style="font-size:13px">Aufgabenlisten fügst du in einem Heft über ＋ → „Aufgabenliste“ ein.</p>`; return; }
          for (const it of docs) {
            const s = App.subject(it.subjectId) || { icon: '', name: '' };
            const box = html(`<div style="background:var(--surface2);border-radius:12px;padding:10px 12px;margin-bottom:10px"><div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><b style="flex:1">${esc(s.icon)} ${esc(it.name)}</b><button class="btn small tonal">Öffnen</button></div></div>`);
            $('button', box).onclick = () => { closeTopOverlay(); const t = it.todos.find((x) => showDone || !x.d); App.openDoc(it.id); if (t) setTimeout(() => Editor.focusElement(t.p, t.el), 150); };
            it.todos.forEach((t) => {
              if (!showDone && t.d) return;
              const row = html(`<label style="display:flex;gap:10px;align-items:center;padding:6px 2px;cursor:pointer"><input type="checkbox" ${t.d ? 'checked' : ''} style="width:22px;height:22px"><span style="${t.d ? 'text-decoration:line-through;opacity:.6' : ''}">${esc(t.t)}</span></label>`);
              $('input', row).onchange = () => { App.setTodo(it, t, !t.d); render(); };
              box.appendChild(row);
            });
            list.appendChild(box);
          }
        };
        $('#td-done', d).onchange = (e) => { showDone = e.target.checked; render(); };
        render();
      },
      buttons: [{ label: 'Fertig', cls: 'primary', value: true }]
    });
    if (App.view.name === 'home') App.showHome();
  },
  setTodo(it, t, done) {
    const doc = (Editor.doc && Editor.doc.id === it.id) ? Editor.doc : App.loadDoc(it.id);
    const el = doc.pages[t.p] && doc.pages[t.p].els.find((x) => x.id === t.el);
    if (!el || !el.items[t.k]) return;
    el.items[t.k].d = done;
    App.saveDoc(doc);
  },

  /* ------------------------------------------------------------ PDF import */
  async importPdfAsDoc(subjectId, folderId) {
    if (!Native && !window.FOS_WEB) { toast('PDF-Import funktioniert in der Android-App.'); return; }
    const name = await prompt2('PDF importieren', 'PDF-Dokument', 'Name des Heftes');
    if (!name) return;
    App.pickPdfPages((pages, images) => {
      if (!pages.length) return;
      const it = App.createDoc(subjectId, folderId, name, 'white');
      const doc = { id: it.id, images, pages };
      App.saveDoc(doc);
      App.updateThumb(doc).then(() => App.openDoc(it.id));
    });
  },

  /** Lets the user pick a PDF; calls done(pages, images) when all pages are rendered. */
  pickPdfPages(done) {
    const pages = [], images = {};
    let started = false;
    if (!Native) return App.pickPdfPagesWeb(done);
    Native.pickPdf(nativeCb((r) => {
      if (!r.ok) {
        busy(false);
        if (!r.cancelled) toast(r.error || 'PDF konnte nicht geladen werden');
        return false;
      }
      if (r.type === 'page') {
        if (!started) started = true;
        busy(`PDF wird importiert … Seite ${r.index + 1} von ${r.count}`);
        const id = uid();
        images[id] = r.data;
        pages.push({ id: uid(), paper: 'white', bg: id, h: Math.round(PAGE_W * r.h / r.w), strokes: [], els: [] });
        return true;
      }
      if (r.type === 'done') { busy(false); done(pages, images); }
      return false;
    }));
  },

  /** Web-Version (iPad): PDF mit pdf.js rendern – gleiche Auflösung und Qualität wie die Android-App */
  async pickPdfPagesWeb(done) {
    const f = await pickFile('.pdf,application/pdf');
    if (!f) return;
    busy('PDF wird geladen …');
    try {
      if (!window.pdfjsLib) await new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'lib/pdf.min.js'; sc.onload = res; sc.onerror = rej; document.head.appendChild(sc); });
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
      const pages = [], images = {}, count = pdf.numPages;
      for (let i = 1; i <= count; i++) {
        busy(`PDF wird importiert … Seite ${i} von ${count}`);
        const pg = await pdf.getPage(i), vp1 = pg.getViewport({ scale: 1 });
        let w = 1400, sc = w / vp1.width, h = Math.max(1, Math.round(vp1.height * sc));
        if (h > 4000) { const s2 = 4000 / h; w = Math.round(w * s2); h = 4000; sc *= s2; }
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
        await pg.render({ canvasContext: g, viewport: pg.getViewport({ scale: sc }) }).promise;
        const id = uid();
        images[id] = c.toDataURL('image/jpeg', 0.85);
        c.width = c.height = 0; pg.cleanup();
        pages.push({ id: uid(), paper: 'white', bg: id, h: Math.round(PAGE_W * h / w), strokes: [], els: [] });
      }
      pdf.destroy();
      busy(false);
      done(pages, images);
    } catch (e) {
      console.error(e);
      busy(false);
      toast('PDF konnte nicht geladen werden');
    }
  },

  /* ------------------------------------------------------------ settings */
  async settingsDialog() {
    const s = App.settings;
    let pc = s.paperColor;
    await dialog({
      title: 'Einstellungen',
      body: `<div class="field"><label>Design</label><div class="design-choice"><button data-d="hyrule" class="${!['classic', 'poketch', 'wii', 'lcars', 'switch', 'ds'].includes(s.design) ? 'on' : ''}"><i class="dc-h"></i><span>Hyrule Edition</span></button><button data-d="poketch" class="${s.design === 'poketch' ? 'on' : ''}"><i class="dc-p"></i><span>Pokétch Edition</span></button><button data-d="wii" class="${s.design === 'wii' ? 'on' : ''}"><i class="dc-w"></i><span>Wii Edition</span></button><button data-d="lcars" class="${s.design === 'lcars' ? 'on' : ''}"><i class="dc-l"></i><span>LCARS Edition</span></button><button data-d="switch" class="${s.design === 'switch' ? 'on' : ''}"><i class="dc-s"></i><span>Switch 2 Edition</span></button><button data-d="ds" class="${s.design === 'ds' ? 'on' : ''}"><i class="dc-x"></i><span>Nintendo DS Edition</span></button><button data-d="classic" class="${s.design === 'classic' ? 'on' : ''}"><i class="dc-c"></i><span>Klassisch</span></button></div></div>
      <div class="field"><label>Animationen (Übergänge, schwebende Blasen)</label><select id="sanim"><option value="1">An</option><option value="0">Aus – ruhiger und akkuschonender</option></select></div>
      <div class="field ds-only"><label>Nintendo DS Edition: Startbildschirm</label><select id="sdsboot"><option value="1">Beim App-Start zeigen</option><option value="0">Aus</option></select></div>
      <div class="field ds-only"><label>Nintendo DS Edition: Töne</label><select id="sdssound"><option value="boot">Nur Startton</option><option value="all">Startton + Tippgeräusche</option><option value="off">Aus</option></select></div>
      <div class="field"><label>Darstellung der App</label><select id="st"><option value="dark">Dunkel</option><option value="light">Hell</option><option value="system">Wie System</option></select></div>
      <div class="field"><label>Papierfarbe (unabhängig vom Dark Mode)</label><div class="color-choice">${PAPER_COLORS.map(([c, l]) => `<button title="${l}" data-c="${c}" style="background:${c};box-shadow:inset 0 0 0 1px #999" class="${c === pc ? 'on' : ''}"></button>`).join('')}</div></div>
      <div class="field"><label>Eingabe mit dem Finger</label><select id="sf"><option value="auto">Automatisch – zeichnen, bis ein Stift erkannt wird</option><option value="draw">Finger zeichnet immer</option><option value="pan">Finger scrollt nur (Handballen-Schutz)</option></select></div>
      <div class="field"><label>Rechenhilfe (z. B. 7+7= → Lösung erscheint)</label><select id="sc"><option value="0">Aus</option><option value="1">An</option></select>
        <button class="btn small tonal" id="mtrain" style="justify-self:start">Meine Ziffern trainieren${Object.keys(App.settings.mathT || {}).length ? ' (trainiert ✓)' : ''}</button></div>
      <div class="field"><label>Handschrift glätten</label><select id="ss"><option value="0">Aus – Striche genau wie gezeichnet</option><option value="1">Leicht – Zittern wird ausgeglichen</option><option value="2">Stark – sehr ruhige, runde Schrift</option></select></div>
      <p style="font-size:13px">Alle Daten liegen nur auf diesem Tablet. Sichere regelmäßig über „Backup speichern“ auf der Startseite.</p>`,
      onOpen: (d) => {
        $('#st', d).value = s.theme; $('#sf', d).value = s.finger;
        $('#sanim', d).value = s.anim === false ? '0' : '1';
        $('#sanim', d).onchange = (e) => { s.anim = e.target.value === '1'; App.applyTheme(); };
        $('#sdsboot', d).value = s.dsBoot === false ? '0' : '1';
        $('#sdsboot', d).onchange = (e) => { s.dsBoot = e.target.value === '1'; };
        $('#sdssound', d).value = s.dsSound || 'boot';
        $('#sdssound', d).onchange = (e) => { s.dsSound = e.target.value; if (s.dsSound !== 'off') DS._tone([[1047, 0.08, 'square'], [1568, 0.2, 'triangle']], 0.05); };
        const dsVis = () => $$('.ds-only', d).forEach((x) => x.classList.toggle('hidden', s.design !== 'ds'));
        dsVis(); $$('.design-choice button', d).forEach((b) => b.addEventListener('click', () => setTimeout(() => { dsVis(); if (b.dataset.d === 'ds') DS.boot(true); }, 0)));
        $$('.design-choice button', d).forEach((b) => b.onclick = () => { s.design = b.dataset.d; App.applyTheme(); $$('.design-choice button', d).forEach((x) => x.classList.toggle('on', x === b)); });
        $('#st', d).onchange = (e) => { s.theme = e.target.value; App.applyTheme(); };
        $('#sf', d).onchange = (e) => { s.finger = e.target.value; };
        $('#sc', d).value = s.calc ? '1' : '0';
        $('#sc', d).onchange = (e) => { s.calc = e.target.value === '1'; };
        $('#mtrain', d).onclick = () => { closeTopOverlay(); MathTrainer.open(); };
        $('#ss', d).value = String(s.smooth | 0);
        $('#ss', d).onchange = (e) => { s.smooth = +e.target.value; };
        $$('.color-choice button', d).forEach((b) => b.onclick = () => { pc = b.dataset.c; s.paperColor = pc; $$('.color-choice button', d).forEach((x) => x.classList.toggle('on', x === b)); });
      },
      buttons: [{ label: 'Fertig', cls: 'primary', value: true }]
    });
    App.saveIndex.flush();
    App.refresh();
  },

  /* ------------------------------------------------------------ backup */
  async exportBackup(subject) {
    busy('Backup wird erstellt …');
    await new Promise((r) => setTimeout(r, 30));
    try {
      if (Editor.doc) Editor.flush();
      const items = subject ? App.index.items.filter((i) => i.subjectId === subject.id) : App.index.items;
      const docs = {};
      for (const it of items) if (it.type === 'doc') docs[it.id] = App.loadDoc(it.id);
      const data = subject
        ? { app: 'fos-digital-binder', kind: 'subject', v: 1, created: new Date().toISOString(), subjects: [subject], items, docs }
        : { app: 'fos-digital-binder', kind: 'full', v: 1, created: new Date().toISOString(), index: App.index, docs };
      // PictoNotizen (DS Edition) – optional, ältere Backups ohne diesen Teil bleiben gültig
      if (!subject) { const pc = Store.read('pictochat.json'); if (pc && Array.isArray(pc.notes) && pc.notes.length) data.pictochat = pc; }
      const name = subject ? `FOS-Binder-${safeName(subject.name)}-${today()}.json` : `FOS-Binder-Backup-${today()}.json`;
      busy(false);
      const r = await saveTextFile(name, 'application/json', JSON.stringify(data));
      if (r.ok) toast('Backup gespeichert ✓');
      else if (!r.cancelled) toast('Backup fehlgeschlagen: ' + (r.error || ''));
    } catch (e) { busy(false); toast('Backup fehlgeschlagen: ' + e.message); }
  },

  async importBackup() {
    const r = await openTextFile('application/json');
    if (!r.ok) { if (!r.cancelled) toast('Datei konnte nicht gelesen werden'); return; }
    let data;
    try { data = JSON.parse(r.text); } catch (e) { toast('Keine gültige Backup-Datei'); return; }
    if (!data || data.app !== 'fos-digital-binder') { toast('Keine FOS-Binder-Backup-Datei'); return; }
    if (data.kind === 'full') {
      const n = Object.keys(data.docs || {}).length;
      if (!(await confirm2('Backup wiederherstellen?', `Das Backup vom ${fmtDate(data.created)} mit ${n} Heften ersetzt alle aktuellen Daten. Der aktuelle Stand wird vorher intern gesichert.`, 'Wiederherstellen', false))) return;
      busy('Wird wiederhergestellt …');
      const safety = { app: 'fos-digital-binder', kind: 'full', v: 1, created: new Date().toISOString(), index: App.index, docs: {} };
      for (const it of App.index.items) if (it.type === 'doc') safety.docs[it.id] = App.loadDoc(it.id);
      Store.write('safety_before_restore.json', safety);
      for (const [id, d] of Object.entries(data.docs || {})) Store.write('doc_' + id + '.json', d);
      if (data.pictochat && Array.isArray(data.pictochat.notes)) Store.write('pictochat.json', data.pictochat);
      App.index = data.index;
      App.settings = Object.assign(App.settings, data.index.settings || {});
      App.index.settings = App.settings;
      Store.write('index.json', App.index);
      busy(false);
      App.applyTheme();
      App.showHome();
      toast('Backup wiederhergestellt ✓');
    } else if (data.kind === 'import') {
      // notebooks prepared outside the app (e.g. converted Google Docs): added into an existing subject by name
      let subj = App.index.subjects.find((x) => x.name.toLowerCase() === String(data.subject).toLowerCase());
      if (!subj) { subj = { id: uid(), name: data.subject, icon: '📚', color: SUBJECT_COLORS[App.index.subjects.length % SUBJECT_COLORS.length] }; App.index.subjects.push(subj); }
      if (!(await confirm2('Hefte importieren?', `${data.docs.length} Hefte werden in „${subj.name}“${data.folder ? ' → „' + data.folder + '“' : ''} eingefügt. Vorhandene Hefte bleiben unverändert.`, 'Importieren', false))) return;
      let parentId = null;
      if (data.folder) {
        const f = App.index.items.find((x) => x.subjectId === subj.id && !x.parentId && x.type === 'folder' && x.name === data.folder);
        if (f) parentId = f.id;
        else { parentId = uid(); App.index.items.push({ id: parentId, subjectId: subj.id, parentId: null, type: 'folder', name: data.folder, created: Date.now(), updated: Date.now() }); }
      }
      const now = Date.now();
      data.docs.forEach((d, i) => {
        const id = uid();
        const doc = { id, images: d.images || {}, pages: d.pages };
        Store.write('doc_' + id + '.json', doc);
        App.index.items.push({ id, subjectId: subj.id, parentId, type: 'doc', name: d.name, created: now + i, updated: now - i, pages: d.pages.length });
        App.updateThumb(App.loadDoc(id));
      });
      App.saveIndex.flush();
      App.showSubject(subj.id, parentId);
      toast(data.docs.length + ' Hefte importiert ✓');
    } else if (data.kind === 'subject') {
      busy('Fach wird importiert …');
      const map = {};
      const newId = (old) => map[old] || (map[old] = uid());
      for (const s of data.subjects) {
        const exists = App.subject(s.id);
        App.index.subjects.push(Object.assign({}, s, { id: newId(s.id), name: exists ? s.name + ' (Import)' : s.name }));
      }
      for (const it of data.items) {
        const n = Object.assign({}, it, { id: newId(it.id), subjectId: newId(it.subjectId), parentId: it.parentId ? newId(it.parentId) : null });
        App.index.items.push(n);
        if (it.type === 'doc' && data.docs[it.id]) Store.write('doc_' + n.id + '.json', Object.assign({}, data.docs[it.id], { id: n.id }));
      }
      App.saveIndex.flush();
      busy(false);
      App.showHome();
      toast('Fach importiert ✓');
    }
  },

  /* ------------------------------------------------------------ PDF export (print) */
  exportDocPDF(it) {
    if (Editor.doc && Editor.doc.id === it.id) Editor.flush();
    App.printDocs(it.name, [{ item: it, doc: App.loadDoc(it.id) }]);
  },

  exportSubjectPDF(s) {
    const order = [];
    const walk = (pid) => {
      const kids = App.children(s.id, pid);
      kids.filter((k) => k.type === 'doc').sort((a, b) => a.created - b.created).forEach((d) => order.push(d));
      kids.filter((k) => k.type === 'folder').sort((a, b) => a.name.localeCompare(b.name, 'de')).forEach((f) => walk(f.id));
    };
    walk(null);
    if (!order.length) { toast('Dieses Fach enthält noch keine Hefte'); return; }
    App.printDocs(s.name, order.map((it) => ({ item: it, doc: App.loadDoc(it.id) })), s);
  },

  async printDocs(title, list, subject) {
    busy('PDF wird vorbereitet …');
    await new Promise((r) => setTimeout(r, 30));
    const pr = $('#print');
    pr.innerHTML = '';
    const PX_W = 793.7, PX_H = 1121.5;
    if (subject) {
      pr.appendChild(html(`<div class="pp"><div class="cover"><h1>${esc(subject.icon + ' ' + subject.name)}</h1><p>Exportiert am ${fmtDate(Date.now())}</p><ol>${list.map((l) => `<li>${esc(l.item.name)} (${l.doc.pages.length} S.)</li>`).join('')}</ol></div></div>`));
    }
    for (const { doc } of list) {
      for (const p of doc.pages) {
        const k = Math.min(PX_W / PAGE_W, PX_H / (p.h || A4_H));
        const left = (PX_W - PAGE_W * k) / 2;
        const pp = html(`<div class="pp">${Render.pageHTML(p, doc)}</div>`);
        const pg = $('.page', pp);
        pg.style.transform = `translate(${left}px,0) scale(${k})`;
        pr.appendChild(pp);
      }
    }
    await Promise.all($$('img', pr).map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
    busy(false);
    const cleanup = () => { pr.innerHTML = ''; };
    if (Native) Native.print(safeName(title), nativeCb(() => { cleanup(); return false; }));
    else { window.addEventListener('afterprint', cleanup, { once: true }); window.print(); }
  }
};

window.addEventListener('DOMContentLoaded', () => {
  const start = () => {
    try { App.init(); } catch (e) {
      console.error(e);
      document.body.innerHTML = `<div style="padding:30px;color:#fff;font:16px system-ui"><h2>Fehler beim Start</h2><pre style="white-space:pre-wrap">${esc(e.stack || e)}</pre></div>`;
    }
  };
  // Web-Version: erst die gespeicherten Hefte aus IndexedDB laden; Android startet wie bisher sofort
  if (WebDB.on) WebDB.init().then(start); else start();
});
