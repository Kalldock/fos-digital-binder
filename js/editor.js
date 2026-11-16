/* Notebook editor: pages, vector ink, eraser, lasso, elements, zoom/pan, undo/redo. */
'use strict';

const PEN_COLORS = ['#1b1d24', '#1f4fd1', '#d92626', '#138a3e', '#7b2fd0', '#e46a00', '#6b7280'];
const HL_COLORS = ['#ffe14d', '#7dff8a', '#ff8ad8', '#7dd3fc', '#ffb35c'];
const PEN_WIDTHS = [1.6, 2.6, 4, 7];
const HL_WIDTHS = [14, 22, 32];
const ERASER_SIZES = [8, 16, 32];

const Editor = {
  item: null, doc: null, root: null, scroller: null, pagesEl: null,
  z: 1, fitZ: 1, tool: 'pen',
  pen: { c: PEN_COLORS[0], w: PEN_WIDTHS[1] },
  hl: { c: HL_COLORS[0], w: HL_WIDTHS[1] },
  eraser: { mode: 'stroke', r: ERASER_SIZES[1] },
  undoStack: [], redoStack: [],
  sel: null,         // {pageId, strokes:Set, els:Set}
  editing: null,     // text edit state
  action: null, touches: new Map(), lastPen: 0, curPage: 0,
  dirty: false,

  /* ============================================================ open / close */
  open(item, doc) {
    const E = Editor;
    Object.assign(E, { item, doc, undoStack: [], redoStack: [], sel: null, editing: null, action: null, dirty: false, ruler: null, search: null });
    E.touches = new Map();
    const v = html(`<div class="view" id="editor">
      <div class="topbar">
        <button class="ibtn" data-a="back" title="Zurück">${icon('back')}</button>
        <div class="title" data-a="rename"></div>
        <div class="sep"></div>
        <button class="ibtn tool" data-t="pen" title="Stift">${icon('pen')}<span class="badge"></span></button>
        <button class="ibtn tool" data-t="hl" title="Textmarker">${icon('highlighter')}<span class="badge"></span></button>
        <button class="ibtn tool" data-t="line" title="Linie">${icon('line')}<span class="badge"></span></button>
        <button class="ibtn tool" data-t="eraser" title="Radierer">${icon('eraser')}</button>
        <button class="ibtn tool" data-t="lasso" title="Lasso">${icon('lasso')}</button>
        <button class="ibtn tool" data-t="select" title="Auswählen & Verschieben">${icon('pointer')}</button>
        <button class="ibtn tool" data-t="loupe" title="Lupe">${icon('loupe')}</button>
        <button class="ibtn" data-a="ruler" title="Lineal">${icon('ruler')}</button>
        <button class="ibtn" data-a="fcalc" title="Taschenrechner">${icon('calc')}</button>
        <div class="sep"></div>
        <button class="ibtn" data-a="insert" title="Einfügen">${icon('plus')}</button>
        <button class="ibtn" data-a="undo" title="Rückgängig">${icon('undo')}</button>
        <button class="ibtn" data-a="redo" title="Wiederholen">${icon('redo')}</button>
        <div class="spacer"></div>
        <button class="ibtn" data-a="finger" title="Fingermodus"></button>
        <button class="ibtn" data-a="search" title="Im Heft suchen">${icon('search')}</button>
        <button class="ibtn" data-a="thumbs" title="Seitenübersicht">${icon('pages')}</button>
        <button class="ibtn" data-a="more" title="Mehr">${icon('more')}</button>
      </div>
      <div class="subbar"></div>
      <div class="ed-body">
        <aside class="thumbs"></aside>
        <div class="scroller"><div class="pages"></div></div>
        <div class="zoom-pill">
          <button class="ibtn" data-a="zout">${icon('zoomOut')}</button><span data-a="zlabel">100 %</span>
          <button class="ibtn" data-a="zin">${icon('zoomIn')}</button><button class="ibtn" data-a="zfit" title="Seitenbreite">${icon('fit')}</button>
        </div>
      </div></div>`);
    E.root = v;
    E.scroller = $('.scroller', v);
    E.pagesEl = $('.pages', v);
    $('.title', v).textContent = item.name;
    $('.thumbs', v).classList.toggle('hidden', !App.settings.thumbs || window.innerWidth < 640);
    App.mount(v);

    // toolbar
    $$('.tool', v).forEach((b) => b.onclick = () => E.setTool(b.dataset.t));
    $('[data-a=back]', v).onclick = () => E.close();
    $('[data-a=rename]', v).onclick = async () => {
      const n = await prompt2('Heft umbenennen', item.name);
      if (n) { item.name = n; $('.title', v).textContent = n; App.saveIndex(); }
    };
    $('[data-a=undo]', v).onclick = () => E.undo();
    $('[data-a=ruler]', v).onclick = () => E.toggleRuler();
    $('[data-a=fcalc]', v).onclick = () => FloatCalc.toggle();
    $('[data-a=fcalc]', v).classList.toggle('on', FloatCalc.isOpen());
    $('[data-a=search]', v).onclick = () => (E.search ? E.closeSearch() : E.openSearch(''));
    $('[data-a=redo]', v).onclick = () => E.redo();
    $('[data-a=insert]', v).onclick = (e) => E.insertMenu(e.currentTarget);
    $('[data-a=more]', v).onclick = (e) => E.moreMenu(e.currentTarget);
    $('[data-a=thumbs]', v).onclick = () => {
      App.settings.thumbs = $('.thumbs', v).classList.toggle('hidden') ? false : true;
      App.saveIndex();
      E.renderThumbs();
    };
    $('[data-a=finger]', v).onclick = () => {
      const now = E.fingerDraws();
      App.settings.finger = now ? 'pan' : 'draw';
      App.saveIndex();
      E.updateFingerBtn();
      toast(now ? 'Finger: scrollen & zoomen (Handballen werden ignoriert)' : 'Finger: zeichnen');
    };
    $('[data-a=zin]', v).onclick = () => E.zoomBy(1.25);
    $('[data-a=zout]', v).onclick = () => E.zoomBy(0.8);
    $('[data-a=zfit]', v).onclick = () => { E.fit(); };

    // input
    const sc = E.scroller;
    sc.addEventListener('pointerdown', E.onDown);
    sc.addEventListener('pointermove', E.onMove);
    sc.addEventListener('pointerup', E.onUp);
    sc.addEventListener('pointercancel', E.onUp);
    sc.addEventListener('lostpointercapture', (e) => { if (E.action && E.action.pointerId === e.pointerId && E.action.type !== 'pinch') E.onUp(e); });
    sc.addEventListener('wheel', (e) => {
      if (e.ctrlKey) { e.preventDefault(); E.zoomAt(E.z * (e.deltaY < 0 ? 1.1 : 0.9), e.clientX, e.clientY); }
    }, { passive: false });
    sc.addEventListener('scroll', () => E.onScroll(), { passive: true });
    sc.addEventListener('contextmenu', (e) => e.preventDefault());
    E._resize = () => { const was = Math.abs(E.z - E.fitZ) < 0.01; E.computeFit(); if (was) E.setZoom(E.fitZ); };
    window.addEventListener('resize', E._resize);

    E.renderAllPages();
    E.computeFit();
    E.setZoom(E.fitZ);
    E.setTool(E.tool === 'select' || E.tool === 'lasso' ? 'pen' : E.tool);
    E.updateFingerBtn();
    E.updateUndo();
    E.renderThumbs();
    if (item.lastPage && item.lastPage < doc.pages.length) setTimeout(() => E.scrollToPage(item.lastPage), 30);
  },

  close() {
    const E = Editor;
    if (!E.doc) return;
    E.finishTextEdit();
    E.cleanupImages();
    E.item.lastPage = E.curPage;
    E.flush();
    App.updateThumb(E.doc);
    window.removeEventListener('resize', E._resize);
    const it = E.item;
    E.doc = null; E.item = null;
    App.showSubject(it.subjectId, it.parentId);
  },

  saveSoon: debounce(() => Editor.flush(), 700),
  flush() {
    const E = Editor;
    if (!E.doc) return;
    E.saveSoon.cancel();
    if (E.editing) E.syncTextEdit();
    if (E.dirty) { App.saveDoc(E.doc); E.dirty = false; }
    App.saveIndex.flush();
  },
  markDirty() { Editor.dirty = true; Editor.saveSoon(); },

  cleanupImages() {
    const used = new Set();
    for (const p of Editor.doc.pages) { if (p.bg) used.add(p.bg); p.els.forEach((e) => e.img && used.add(e.img)); }
    for (const k of Object.keys(Editor.doc.images)) if (!used.has(k)) { delete Editor.doc.images[k]; Editor.dirty = true; }
  },

  /* ============================================================ rendering */
  page: (id) => Editor.doc.pages.find((p) => p.id === id),
  pageIndex: (id) => Editor.doc.pages.findIndex((p) => p.id === id),
  pageEl: (id) => Editor.pagesEl.querySelector(`.page[data-id="${id}"]`),

  renderAllPages() {
    const E = Editor;
    E.pagesEl.innerHTML = '';
    E.doc.pages.forEach((p) => E.pagesEl.appendChild(E.makeWrap(p)));
    const add = html(`<div class="add-page"><button class="btn tonal">${icon('plus')}Neue Seite</button></div>`);
    $('button', add).onclick = () => E.addPage(E.doc.pages.length - 1);
    E.pagesEl.appendChild(add);
    E.renderSelection();
    E.renderRuler();
    if (E.search) E.markHits();
  },

  makeWrap(p) {
    const w = html(`<div class="page-wrap" data-id="${p.id}" style="--h:${p.h || A4_H}px">${Render.pageHTML(p, Editor.doc)}</div>`);
    const ui = document.createElement('div');
    ui.className = 'elui';
    $('.page', w).appendChild(ui);
    return w;
  },

  rerenderPage(p) {
    const E = Editor;
    const old = E.pagesEl.querySelector(`.page-wrap[data-id="${p.id}"]`);
    if (!old) return;
    old.replaceWith(E.makeWrap(p));
    E.renderSelection();
    E.renderRuler();
    if (E.search) E.markHits();
    E.thumbSoon(p.id);
  },

  refreshInk(p) {
    const pe = Editor.pageEl(p.id);
    if (!pe) return;
    const tmp = html(Render.inkSVG(p));
    $('svg.ink', pe).replaceWith(tmp);
  },

  /* ============================================================ thumbnails */
  renderThumbs() {
    const E = Editor, box = $('.thumbs', E.root);
    if (!box || box.classList.contains('hidden')) return;
    box.innerHTML = '';
    E.doc.pages.forEach((p, i) => {
      const t = html(`<div class="th ${i === E.curPage ? 'cur' : ''}" data-id="${p.id}">${Render.thumbSVG(p, E.doc, { simplify: true })}<div class="no">${i + 1}</div>
        <div class="thact"><button data-a="up">${icon('up')}</button><button data-a="down">${icon('down')}</button><button data-a="del">${icon('trash')}</button></div></div>`);
      t.onclick = (e) => {
        const b = e.target.closest('button');
        const idx = E.pageIndex(p.id);
        if (b) {
          e.stopPropagation();
          if (b.dataset.a === 'up') E.movePage(idx, idx - 1);
          else if (b.dataset.a === 'down') E.movePage(idx, idx + 1);
          else E.deletePage(idx);
          return;
        }
        E.scrollToPage(idx);
      };
      box.appendChild(t);
    });
    const add = html(`<button class="th-add">${icon('plus')}</button>`);
    add.onclick = () => E.addPage(E.doc.pages.length - 1);
    box.appendChild(add);
  },
  _thumbTimers: {},
  thumbSoon(pageId) {
    clearTimeout(Editor._thumbTimers[pageId]);
    Editor._thumbTimers[pageId] = setTimeout(() => {
      const E = Editor;
      if (!E.doc) return;
      const box = $('.thumbs', E.root);
      const th = box && box.querySelector(`.th[data-id="${pageId}"]`);
      const p = E.page(pageId);
      if (th && p) th.querySelector('svg').outerHTML = Render.thumbSVG(p, E.doc, { simplify: true });
    }, 900);
  },

  /* ============================================================ zoom / scroll */
  computeFit() {
    const E = Editor;
    E.fitZ = clamp((E.scroller.clientWidth - 36) / PAGE_W, 0.2, 3);
  },
  /** Chrome/WebView keeps SVG text laid out for the old scale after a CSS zoom change → re-create graph SVGs */
  refreshSvgText: debounce(() => {
    if (!Editor.pagesEl) return;
    $$('.el-graph', Editor.pagesEl).forEach((d) => { const h = d.innerHTML; d.innerHTML = h; });
  }, 120),
  setZoom(z) {
    const E = Editor;
    E.z = clamp(z, 0.2, 5);
    E.pagesEl.style.setProperty('--z', E.z);
    E.refreshSvgText();
    $('[data-a=zlabel]', E.root).textContent = Math.round((E.z / E.fitZ) * 100) + ' %';
  },
  zoomAt(z, cx, cy) {
    const E = Editor;
    const anchor = E.anchorAt(cx, cy);
    E.setZoom(z);
    E.restoreAnchor(anchor, cx, cy);
  },
  zoomBy(f) {
    const r = Editor.scroller.getBoundingClientRect();
    Editor.zoomAt(Editor.z * f, r.left + r.width / 2, r.top + r.height / 2);
  },
  fit() {
    const E = Editor, idx = E.curPage;
    E.computeFit();
    E.setZoom(E.fitZ);
    E.scrollToPage(idx);
  },
  anchorAt(cx, cy) {
    const E = Editor;
    let best = null, bd = Infinity;
    for (const pe of $$('.page', E.pagesEl)) {
      const r = pe.getBoundingClientRect();
      const d = cy < r.top ? r.top - cy : cy > r.bottom ? cy - r.bottom : 0;
      if (d < bd) { bd = d; best = { pe, r }; }
    }
    if (!best) return null;
    return { pe: best.pe, px: (cx - best.r.left) / E.z, py: (cy - best.r.top) / E.z };
  },
  restoreAnchor(a, cx, cy) {
    if (!a) return;
    const E = Editor, r = a.pe.getBoundingClientRect();
    E.scroller.scrollLeft += r.left + a.px * E.z - cx;
    E.scroller.scrollTop += r.top + a.py * E.z - cy;
  },
  scrollToPage(i) {
    const E = Editor;
    const p = E.doc.pages[clamp(i, 0, E.doc.pages.length - 1)];
    const w = E.pagesEl.querySelector(`.page-wrap[data-id="${p.id}"]`);
    if (w) E.scroller.scrollTop = w.offsetTop - 12;
    E.curPage = clamp(i, 0, E.doc.pages.length - 1);
    E.markCurThumb();
  },
  onScroll() {
    const E = Editor;
    if (E._scrollRaf) return;
    E._scrollRaf = requestAnimationFrame(() => {
      E._scrollRaf = 0;
      if (!E.doc) return;
      const sr = E.scroller.getBoundingClientRect(), mid = sr.top + sr.height / 3;
      const wraps = $$('.page-wrap', E.pagesEl);
      for (let i = 0; i < wraps.length; i++) {
        const r = wraps[i].getBoundingClientRect();
        if (r.bottom + 11 >= mid) { if (E.curPage !== i) { E.curPage = i; E.markCurThumb(); } break; }
      }
    });
  },
  markCurThumb() {
    const box = $('.thumbs', Editor.root);
    if (!box) return;
    $$('.th', box).forEach((t, i) => t.classList.toggle('cur', i === Editor.curPage));
    const cur = $('.th.cur', box);
    if (cur) { const r = cur.getBoundingClientRect(), br = box.getBoundingClientRect(); if (r.top < br.top || r.bottom > br.bottom) box.scrollTop += r.top - br.top - 40; }
  },
  /** visible centre of the current page in page coords */
  visibleCenter(page) {
    const E = Editor, pe = E.pageEl(page.id), r = pe.getBoundingClientRect(), sr = E.scroller.getBoundingClientRect();
    const cx = (Math.max(r.left, sr.left) + Math.min(r.right, sr.right)) / 2;
    const cy = (Math.max(r.top, sr.top) + Math.min(r.bottom, sr.bottom)) / 2;
    return { x: clamp((cx - r.left) / E.z, 60, PAGE_W - 60), y: clamp((cy - r.top) / E.z, 60, (page.h || A4_H) - 60) };
  },

  /* ============================================================ tools & sub bar */
  fingerDraws() {
    const f = App.settings.finger;
    if (f === 'draw') return true;
    if (f === 'pan') return false;
    return !App.settings.penSeen;
  },
  updateFingerBtn() {
    const b = $('[data-a=finger]', Editor.root);
    const d = Editor.fingerDraws();
    b.innerHTML = icon(d ? 'finger' : 'hand');
    b.title = d ? 'Finger zeichnet' : 'Finger scrollt';
  },
  notePen() {
    Editor.lastPen = Date.now();
    if (!App.settings.penSeen) {
      App.settings.penSeen = true;
      App.saveIndex();
      if (App.settings.finger === 'auto') { Editor.updateFingerBtn(); toast('Stift erkannt ✓ Finger scrollt jetzt, Handballen werden ignoriert.', 3500); }
    }
  },

  setTool(t) {
    const E = Editor;
    E.finishTextEdit();
    if (t !== 'lasso' && t !== 'select') E.clearSel();
    E.tool = t;
    $$('.tool', E.root).forEach((b) => b.classList.toggle('on', b.dataset.t === t));
    $('[data-t=pen] .badge', E.root).style.background = E.pen.c;
    $('[data-t=hl] .badge', E.root).style.background = E.hl.c;
    $('[data-t=line] .badge', E.root).style.background = E.pen.c;
    E.pagesEl.classList.toggle('mode-draw', t !== 'select');
    E.renderSubbar();
  },

  renderSubbar() {
    const E = Editor, bar = $('.subbar', E.root);
    bar.innerHTML = '';
    bar.classList.toggle('searchbar', !!E.search && !E.editing);
    const add = (el) => { bar.appendChild(el); return el; };
    if (E.search && !E.editing) return E.renderSearchBar(bar, add);
    const swatches = (colors, conf) => {
      colors.forEach((c) => {
        const s = add(html(`<button class="swatch ${conf.c === c ? 'on' : ''}" style="background:${c}"></button>`));
        s.onclick = () => { conf.c = c; E.setTool(E.tool); };
      });
      const cu = add(html(`<label class="swatch custom ${colors.includes(conf.c) ? '' : 'on'}"><input type="color" value="${conf.c}"></label>`));
      $('input', cu).onchange = (e) => { conf.c = e.target.value; E.setTool(E.tool); };
    };
    const widths = (ws, conf, maxPx) => {
      ws.forEach((w, i) => {
        const b = add(html(`<button class="wbtn ${conf.w === w ? 'on' : ''}"><i style="height:${Math.round(2 + (i / (ws.length - 1)) * (maxPx - 2))}px;${E.tool === 'hl' ? `background:${conf.c}` : ''}"></i></button>`));
        b.onclick = () => { conf.w = w; E.renderSubbar(); };
      });
    };
    if (E.editing) {
      const fmt = (ic, cmd, val) => {
        const b = add(html(`<button class="ibtn">${icon(ic)}</button>`));
        b.onpointerdown = (e) => e.preventDefault();
        b.onclick = () => { document.execCommand('styleWithCSS', false, true); document.execCommand(cmd, false, val); E.syncTextEdit(); };
      };
      add(html('<span class="lbl">Text</span>'));
      fmt('bold', 'bold'); fmt('italic', 'italic'); fmt('underline', 'underline');
      fmt('list', 'insertUnorderedList'); fmt('olist', 'insertOrderedList');
      add(html('<div class="sep"></div>'));
      const size = (ic, d) => {
        const b = add(html(`<button class="ibtn">${icon(ic)}</button>`));
        b.onpointerdown = (e) => e.preventDefault();
        b.onclick = () => { const el = E.editing.el; el.fs = clamp((el.fs || 22) + d, 10, 90); E.editing.div.style.fontSize = el.fs + 'px'; lbl.textContent = Math.round(el.fs) + ' pt'; };
      };
      size('fontDown', -2);
      const lbl = add(html(`<span class="lbl">${Math.round(E.editing.el.fs || 22)} pt</span>`));
      size('fontUp', 2);
      add(html('<div class="sep"></div>'));
      PEN_COLORS.slice(0, 6).forEach((c) => {
        const s = add(html(`<button class="swatch" style="background:${c}"></button>`));
        s.onpointerdown = (e) => e.preventDefault();
        s.onclick = () => { document.execCommand('styleWithCSS', false, true); document.execCommand('foreColor', false, c); E.syncTextEdit(); };
      });
      add(html('<div class="spacer"></div>'));
      const done = add(html(`<button class="chip on">${icon('check')}Fertig</button>`));
      done.onclick = () => E.finishTextEdit();
      return;
    }
    if (E.tool === 'pen' || E.tool === 'line') {
      swatches(PEN_COLORS, E.pen); add(html('<div class="sep"></div>')); widths(PEN_WIDTHS, E.pen, 9);
      if (E.tool === 'pen') {
        add(html('<div class="sep"></div>'));
        const names = ['Glätten: aus', 'Glätten: leicht', 'Glätten: stark'];
        const b = add(html(`<button class="chip ${App.settings.smooth ? 'on' : ''}" title="Handschrift glätten">${names[App.settings.smooth | 0]}</button>`));
        b.onclick = () => { App.settings.smooth = ((App.settings.smooth | 0) + 1) % 3; App.saveIndex(); E.renderSubbar(); };
        const cb = add(html(`<button class="chip ${App.settings.calc ? 'on' : ''}" title="Rechenhilfe: schreibe z. B. 7+7=">${icon('calc')}Rechnen: ${App.settings.calc ? 'an' : 'aus'}</button>`));
        cb.onclick = () => {
          App.settings.calc = !App.settings.calc; App.saveIndex(); E.renderSubbar();
          if (App.settings.calc) toast('Rechenhilfe an: Schreib eine Aufgabe mit „=“ am Ende, z. B. 12 + 7 =' + (App.settings.mathT ? '' : ' · Tipp: ⋮ → Ziffern trainieren macht sie zuverlässiger'), 4500);
        };
      }
      add(html(`<span class="lbl">${E.tool === 'line' ? 'Ziehen für eine gerade Linie' : 'Tipp: Linie oder Form zeichnen und am Ende kurz halten → wird perfekt'}</span>`));
    }
    else if (E.tool === 'hl') { swatches(HL_COLORS, E.hl); add(html('<div class="sep"></div>')); widths(HL_WIDTHS, E.hl, 16); }
    else if (E.tool === 'eraser') {
      [['stroke', 'Ganze Striche'], ['partial', 'Teilweise']].forEach(([m, l]) => {
        const b = add(html(`<button class="chip ${E.eraser.mode === m ? 'on' : ''}">${l}</button>`));
        b.onclick = () => { E.eraser.mode = m; E.renderSubbar(); };
      });
      add(html('<div class="sep"></div>'));
      ERASER_SIZES.forEach((r, i) => {
        const b = add(html(`<button class="wbtn ${E.eraser.r === r ? 'on' : ''}"><i style="width:${8 + i * 7}px;height:${8 + i * 7}px;border-radius:50%;border:2px solid var(--text);background:none"></i></button>`));
        b.onclick = () => { E.eraser.r = r; E.renderSubbar(); };
      });
      add(html('<div class="sep"></div>'));
      const clr = add(html(`<button class="chip">${icon('trash')}Seite leeren</button>`));
      clr.onclick = () => E.clearPage();
    } else if (E.tool === 'lasso') {
      add(html('<span class="lbl">Zeichnungen und Elemente einkreisen – danach verschieben, kopieren oder löschen.</span>'));
    } else if (E.tool === 'select') {
      add(html('<span class="lbl">Element antippen zum Auswählen · ziehen zum Verschieben · doppelt tippen zum Bearbeiten</span>'));
    } else if (E.tool === 'loupe') {
      add(html('<span class="lbl">Mit Stift oder Finger über die Seite fahren – die Lupe zeigt die Stelle 2,5-fach vergrößert.</span>'));
    }
    if (E.ruler && !E.editing) {
      add(html('<div class="spacer"></div>'));
      add(html(`<span class="lbl">Lineal: ${E.rulerDeg()}° · mit einem Finger verschieben, mit zwei drehen</span>`));
    }
  },

  /* ============================================================ undo / redo */
  snap(p) { return JSON.stringify({ strokes: p.strokes, els: p.els, paper: p.paper, bg: p.bg, h: p.h }); },
  beginOp(page) { return page ? { pageId: page.id, before: Editor.snap(page) } : { pageId: null, before: JSON.stringify(Editor.doc.pages) }; },
  commitOp(tok) {
    const E = Editor;
    if (!tok) return;
    if (tok.pageId) { const p = E.page(tok.pageId); if (!p) return; tok.after = E.snap(p); }
    else tok.after = JSON.stringify(E.doc.pages);
    if (tok.after === tok.before) return;
    E.undoStack.push(tok);
    if (E.undoStack.length > 80) E.undoStack.shift();
    E.redoStack = [];
    E.updateUndo();
    E.markDirty();
    if (tok.pageId) E.thumbSoon(tok.pageId);
  },
  applyState(tok, which) {
    const E = Editor, data = tok[which];
    if (tok.pageId) {
      const p = E.page(tok.pageId);
      if (!p) return;
      Object.assign(p, JSON.parse(data));
      E.rerenderPage(p);
      E.scrollIntoViewIfNeeded(p);
    } else {
      E.doc.pages = JSON.parse(data);
      E.renderAllPages();
      E.renderThumbs();
    }
  },
  scrollIntoViewIfNeeded(p) {
    const E = Editor, w = E.pagesEl.querySelector(`.page-wrap[data-id="${p.id}"]`);
    if (!w) return;
    const r = w.getBoundingClientRect(), sr = E.scroller.getBoundingClientRect();
    if (r.bottom < sr.top || r.top > sr.bottom) E.scroller.scrollTop = w.offsetTop - 12;
  },
  undo() {
    const E = Editor;
    E.finishTextEdit();
    const t = E.undoStack.pop();
    if (!t) return;
    E.clearSel();
    E.applyState(t, 'before');
    E.redoStack.push(t);
    E.updateUndo(); E.markDirty();
  },
  redo() {
    const E = Editor;
    E.finishTextEdit();
    const t = E.redoStack.pop();
    if (!t) return;
    E.clearSel();
    E.applyState(t, 'after');
    E.undoStack.push(t);
    E.updateUndo(); E.markDirty();
  },
  updateUndo() {
    $('[data-a=undo]', Editor.root).disabled = !Editor.undoStack.length;
    $('[data-a=redo]', Editor.root).disabled = !Editor.redoStack.length;
  },

  /* ============================================================ hit testing */
  hitPage(cx, cy) {
    const E = Editor;
    for (const pe of $$('.page', E.pagesEl)) {
      const r = pe.getBoundingClientRect();
      if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) {
        const page = E.page(pe.dataset.id);
        return { page, pe, rect: r, x: (cx - r.left) / E.z, y: (cy - r.top) / E.z };
      }
    }
    return null;
  },
  toPage(a, cx, cy) { return { x: (cx - a.rect.left) / Editor.z, y: (cy - a.rect.top) / Editor.z }; },
  elRect(page, el) {
    const div = Editor.pageEl(page.id).querySelector(`.el[data-id="${el.id}"]`);
    const s = el.type === 'table' ? (el.s || 1) : 1;
    const w = div ? div.offsetWidth * s : (el.w || 100), h = div ? div.offsetHeight * s : (el.h || 40);
    el._h = Math.round(div ? div.offsetHeight : 40); el._w = Math.round(div ? div.offsetWidth : 100);
    return { x0: el.x, y0: el.y, x1: el.x + w, y1: el.y + h };
  },
  elAt(page, x, y) {
    for (let i = page.els.length - 1; i >= 0; i--) {
      const r = Editor.elRect(page, page.els[i]);
      if (x >= r.x0 - 6 && x <= r.x1 + 6 && y >= r.y0 - 6 && y <= r.y1 + 6) return page.els[i];
    }
    return null;
  },

  /* ============================================================ pointer input */
  onDown(e) {
    const E = Editor;
    if (!E.doc) return;
    const t = e.target;
    if (t.closest('.elbar') || t.closest('.add-page')) return;
    if (E.editing && t.closest('.el.editing')) return;
    const ckb = t.closest('.ck-box');
    if (ckb && !E.action && !(e.pointerType === 'touch' && Date.now() - E.lastPen < 600)) {
      const pe = ckb.closest('.page'), page = E.page(pe.dataset.id), el = page && page.els.find((x) => x.id === ckb.closest('.el').dataset.id);
      if (el) { e.preventDefault(); E.toggleCheck(page, el, +ckb.dataset.i); return; }
    }
    if (e.pointerType === 'touch') {
      if (Date.now() - E.lastPen < 600 || (E.action && E.action.pointerType === 'pen')) return; // palm rejection
      E.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (E.touches.size >= 2 && E.action && E.action.type === 'ruler') { E.startRulerRotate(); return; }
      if (E.touches.size >= 2) {
        if (E.action && E.action.pointerType === 'touch') E.cancelAction();
        if (!E.action) E.startPinch();
        return;
      }
    } else if (e.pointerType === 'pen') {
      E.notePen();
      if (E.action && E.action.pointerType === 'touch') E.cancelAction();
    }
    if (E.action) return;
    if (E.fling) { cancelAnimationFrame(E.fling); E.fling = 0; }
    if (e.button > 0 && e.pointerType === 'mouse') return;
    if (E.editing) E.finishTextEdit();
    try { E.scroller.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }

    const hit = E.hitPage(e.clientX, e.clientY);
    const drawInput = e.pointerType !== 'touch' || E.fingerDraws();
    const base = { pointerId: e.pointerId, pointerType: e.pointerType };

    if (E.tool === 'loupe' && hit) return E.startLoupe(e, hit, base);
    if (t.closest('.ruler') && hit) {
      const edge = E.rulerEdgeAt(hit.page, hit.x, hit.y);
      if (e.pointerType === 'touch' || !(E.tool === 'pen' || E.tool === 'hl') || !edge) {
        if (e.pointerType === 'touch' || E.tool === 'pen' || E.tool === 'hl' || E.tool === 'line') return E.startRulerDrag(e, hit, base);
      }
    }
    if (t.closest('.colh') && E.sel && hit) return E.startColResize(e, hit, base, +t.closest('.colh').dataset.c);
    if (t.closest('.rh') && E.sel && hit) return E.startResize(e, hit, base);
    if (E.sel && hit && hit.page.id === E.sel.pageId && (E.tool === 'lasso' || E.tool === 'select')) {
      const b = E.selBBox();
      if (b && hit.x >= b.x0 - 14 && hit.x <= b.x1 + 14 && hit.y >= b.y0 - 14 && hit.y <= b.y1 + 14) return E.startMove(e, hit, base);
    }
    if (E.tool === 'select') {
      const el = hit && E.elAt(hit.page, hit.x, hit.y);
      if (el) {
        const now = Date.now();
        const dbl = E._lastTap && E._lastTap.id === el.id && now - E._lastTap.t < 400;
        E._lastTap = { id: el.id, t: now };
        E.setSel({ pageId: hit.page.id, strokes: new Set(), els: new Set([el.id]) });
        if (dbl) { E.editElement(hit.page, el); return; }
        return E.startMove(e, hit, base);
      }
      E.clearSel();
      if (e.pointerType === 'touch' || !hit) return E.startPan(e, base);
      return E.startLasso(e, hit, base);
    }
    if (!drawInput || !hit) return E.startPan(e, base);
    if (E.tool === 'pen' || E.tool === 'hl') return E.startDraw(e, hit, base);
    if (E.tool === 'line') return E.startLine(e, hit, base);
    if (E.tool === 'eraser') return E.startErase(e, hit, base);
    if (E.tool === 'lasso') { E.clearSel(); return E.startLasso(e, hit, base); }
  },

  onMove(e) {
    const E = Editor;
    if (e.pointerType === 'touch' && E.touches.has(e.pointerId)) E.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const a = E.action;
    if (!a) {
      if (e.pointerType === 'pen' && E.tool === 'eraser') E.hoverEraser(e);
      return;
    }
    if (a.type === 'pinch') { if (e.pointerType === 'touch') E.updatePinch(); return; }
    if (a.type === 'rulerRot') { if (e.pointerType === 'touch') E.rulerRotateMove(); return; }
    if (e.pointerId !== a.pointerId) return;
    if (e.pointerType === 'pen') E.lastPen = Date.now();
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    const list = evs.length ? evs : [e];
    switch (a.type) {
      case 'draw': list.forEach((ev) => E.addPoint(ev)); E.checkHold(e); E.scheduleDraw(); break;
      case 'line': E.lineMove(e); break;
      case 'erase': list.forEach((ev) => E.eraseMove(ev)); break;
      case 'lasso': E.lassoMove(e); break;
      case 'move': E.moveMove(e); break;
      case 'resize': E.resizeMove(e); break;
      case 'colw': E.colResizeMove(e); break;
      case 'pan': E.panMove(e); break;
      case 'ruler': E.rulerDragMove(e); break;
      case 'loupe': E.loupeMove(e); break;
    }
  },

  onUp(e) {
    const E = Editor;
    if (e.pointerType === 'touch') E.touches.delete(e.pointerId);
    const a = E.action;
    if (!a) return;
    if (a.type === 'pinch') {
      if (E.touches.size < 2) { E.action = null; E.computeFit(); }
      return;
    }
    if (a.type === 'rulerRot') { if (E.touches.size < 2) { E.action = null; E.renderSubbar(); } return; }
    if (e.pointerId !== a.pointerId) return;
    E.action = null;
    switch (a.type) {
      case 'draw': E.endDraw(a); break;
      case 'line': E.endLine(a); break;
      case 'erase': E.endErase(a); break;
      case 'lasso': E.endLasso(a); break;
      case 'move': E.endMove(a); break;
      case 'resize': E.endResize(a); break;
      case 'colw': E.endColResize(a); break;
      case 'pan': E.endPan(a); break;
      case 'ruler': E.renderSubbar(); break;
      case 'loupe': E.endLoupe(a); break;
    }
  },

  cancelAction() {
    const E = Editor, a = E.action;
    if (!a) return;
    E.action = null;
    if (a.type === 'draw' || a.type === 'line') { clearTimeout(a.holdTimer); a.path.remove(); }
    else if (a.type === 'lasso') { a.poly.remove(); }
    else if (a.type === 'erase') { E.endErase(a); }
    else if (a.type === 'move') { E.endMove(a); }
    else if (a.type === 'loupe') { E.endLoupe(a); }
  },

  /* ---------------- pan & pinch */
  startPan(e, base) {
    Editor.action = Object.assign(base, { type: 'pan', lx: e.clientX, ly: e.clientY, vx: 0, vy: 0, t: performance.now() });
  },
  panMove(e) {
    const a = Editor.action, now = performance.now();
    const dx = e.clientX - a.lx, dy = e.clientY - a.ly, dt = Math.max(1, now - a.t);
    Editor.scroller.scrollLeft -= dx;
    Editor.scroller.scrollTop -= dy;
    a.vx = 0.7 * a.vx + 0.3 * (dx / dt); a.vy = 0.7 * a.vy + 0.3 * (dy / dt);
    a.lx = e.clientX; a.ly = e.clientY; a.t = now;
  },
  endPan(a) {
    const E = Editor;
    if (performance.now() - a.t > 80) return;
    let vx = a.vx * 16, vy = a.vy * 16;
    const step = () => {
      vx *= 0.94; vy *= 0.94;
      if (Math.abs(vx) < 0.4 && Math.abs(vy) < 0.4) { E.fling = 0; return; }
      E.scroller.scrollLeft -= vx; E.scroller.scrollTop -= vy;
      E.fling = requestAnimationFrame(step);
    };
    E.fling = requestAnimationFrame(step);
  },
  startPinch() {
    const E = Editor, pts = [...E.touches.values()];
    const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    E.action = { type: 'pinch', pointerType: 'touch', d0: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1, z0: E.z, anchor: E.anchorAt(mid.x, mid.y) };
  },
  updatePinch() {
    const E = Editor, a = E.action, pts = [...E.touches.values()];
    if (pts.length < 2) return;
    const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    let z = a.z0 * d / a.d0;
    if (Math.abs(z - E.fitZ) < E.fitZ * 0.04) z = E.fitZ; // snap to page width
    E.setZoom(z);
    E.restoreAnchor(a.anchor, mid.x, mid.y);
  },

  /* ---------------- drawing */
  startDraw(e, hit, base) {
    const E = Editor, isHl = E.tool === 'hl', conf = isHl ? E.hl : E.pen;
    const mp = E._mathPending;
    if (mp && mp.pageId === hit.page.id && hit.x > mp.eq.x1 - 4 && Math.abs(hit.y - mp.eq.cy) < 1.5 * Math.max(14, mp.eq.w * 1.7)) { clearTimeout(E._mathTimer); E._mathPending = null; }
    const s = { id: uid(), t: isHl ? 'hl' : 'pen', c: conf.c, w: conf.w, p: [] };
    const g = $(isHl ? 'svg.ink g.hl' : 'svg.ink g.pen', hit.pe);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    if (isHl) { path.setAttribute('fill', 'none'); path.setAttribute('stroke', s.c); path.setAttribute('stroke-opacity', '.42'); path.setAttribute('stroke-width', s.w); path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round'); }
    else path.setAttribute('fill', s.c);
    path.dataset.id = s.id;
    g.appendChild(path);
    E.action = Object.assign(base, { type: 'draw', page: hit.page, pe: hit.pe, rect: hit.rect, stroke: s, path });
    const edge = E.rulerEdgeAt(hit.page, hit.x, hit.y);
    if (edge) E.action.ruled = { v: edge.side * (E.ruler.w / 2 + s.w / 2 + 1) };
    E.addPoint(e);
    E.checkHold(e);
    E.scheduleDraw();
  },
  /* Hold-to-straighten: if the pen rests (moves < HOLD_PX on screen) for HOLD_MS at the end of a
     straight-ish stroke, the stroke snaps to a straight line. Keep holding/moving to adjust the end point. */
  HOLD_MS: 550, HOLD_PX: 6,
  checkHold(e) {
    const E = Editor, a = E.action;
    if (!a || a.type !== 'draw' || a.snapped || a.ruled) return;
    if (a.hold && Math.hypot(e.clientX - a.hold.x, e.clientY - a.hold.y) <= E.HOLD_PX) return; // still resting
    a.hold = { x: e.clientX, y: e.clientY };
    clearTimeout(a.holdTimer);
    a.holdTimer = setTimeout(() => E.trySnap(a), E.HOLD_MS);
  },
  trySnap(a) {
    const E = Editor;
    if (E.action !== a || a.snapped) return;
    const s = a.stroke, fit = Ink.lineFit(s.p);
    if (!fit) {
      const shape = Ink.shapeFit(s.p);
      if (!shape) return;
      a.snapped = a.shape = true;
      if (s.t !== 'hl') { const prs = []; for (let i = 2; i < s.p.length; i += 3) prs.push(s.p[i]); prs.sort((x, y) => x - y); const m = prs[prs.length >> 1]; shape.p.forEach((v, i) => { if (i % 3 === 2) shape.p[i] = m; }); }
      s.p = shape.p;
      a.path.setAttribute('d', s.t === 'hl' ? Ink.center(s.p) : Ink.outline(s.p, s.w));
      a.path.animate && a.path.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 180 });
      return;
    }
    a.snapped = true;
    a.line = { x0: fit.x0, y0: fit.y0, pr: s.t === 'hl' ? 0.5 : fit.pr };
    s.p = Ink.makeLine(fit.x0, fit.y0, fit.x1, fit.y1, a.line.pr);
    a.path.setAttribute('d', s.t === 'hl' ? Ink.center(s.p) : Ink.outline(s.p, s.w));
    // small confirmation pulse (purely visual)
    a.path.animate && a.path.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 180 });
  },
  /* ---------------- straight line tool */
  startLine(e, hit, base) {
    const E = Editor, s = { id: uid(), t: 'pen', c: E.pen.c, w: E.pen.w, p: [] };
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('fill', s.c);
    path.dataset.id = s.id;
    $('svg.ink g.pen', hit.pe).appendChild(path);
    E.action = Object.assign(base, { type: 'line', page: hit.page, pe: hit.pe, rect: hit.rect, stroke: s, path, x0: hit.x, y0: hit.y });
    E.lineMove(e);
  },
  lineMove(e) {
    const E = Editor, a = E.action, { x, y } = E.toPage(a, e.clientX, e.clientY);
    a.stroke.p = Ink.makeLine(a.x0, a.y0, x, y, 0.5);
    if (!E._lineRaf) E._lineRaf = requestAnimationFrame(() => {
      E._lineRaf = 0;
      if (E.action === a) a.path.setAttribute('d', Ink.outline(a.stroke.p, a.stroke.w));
    });
  },
  endLine(a) {
    const E = Editor, s = a.stroke;
    const b = s.p.length >= 6 ? Math.hypot(s.p[s.p.length - 3] - s.p[0], s.p[s.p.length - 2] - s.p[1]) : 0;
    if (b < 2) { a.path.remove(); return; }           // a tap is not a line
    const tok = E.beginOp(a.page);
    a.page.strokes.push(s);
    a.path.setAttribute('d', Ink.outline(s.p, s.w));
    E.commitOp(tok);
  },
  addPoint(ev) {
    const a = Editor.action, s = a.stroke, p = s.p;
    let x = (ev.clientX - a.rect.left) / Editor.z, y = (ev.clientY - a.rect.top) / Editor.z;
    if (a.shape) return;                                                                   // perfect shape: keep it
    if (a.ruled) {                                                                         // along the ruler edge
      const R = Editor.ruler, c = Math.cos(R.a), sn = Math.sin(R.a);
      const u = clamp((x - R.cx) * c + (y - R.cy) * sn, -R.len / 2, R.len / 2), v = a.ruled.v;
      x = R.cx + u * c - v * sn; y = R.cy + u * sn + v * c;
    }
    if (a.snapped) { s.p = Ink.makeLine(a.line.x0, a.line.y0, x, y, a.line.pr); return; } // adjust end point
    let pr = ev.pointerType === 'pen' ? (ev.pressure || 0.5) : 0.5;
    if (s.t === 'hl') pr = 0.5;
    const n = p.length;
    if (n) {
      const lx = p[n - 3], ly = p[n - 2];
      if (Math.hypot(x - lx, y - ly) < 0.7 / Math.max(Editor.z, 0.5)) return;
      pr = p[n - 1] * 0.55 + pr * 0.45; // smooth pressure
    }
    p.push(Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(pr * 100) / 100);
  },
  scheduleDraw() {
    const E = Editor;
    if (E._drawRaf) return;
    E._drawRaf = requestAnimationFrame(() => {
      E._drawRaf = 0;
      const a = E.action;
      if (!a || a.type !== 'draw') return;
      const s = a.stroke;
      const lvl = s.t === 'pen' && !a.snapped && !a.ruled ? (App.settings.smooth | 0) : 0;
      const pts = lvl ? Ink.stabilize(s.p, lvl) : s.p;
      a.path.setAttribute('d', s.t === 'hl' ? Ink.center(pts) : Ink.outline(pts, s.w));
    });
  },
  endDraw(a) {
    const E = Editor, s = a.stroke;
    clearTimeout(a.holdTimer);
    if (!s.p.length) { a.path.remove(); return; }
    // straighten highlighter strokes that are nearly straight (makes nicer text marking)
    if (s.t === 'hl' && !a.snapped && s.p.length > 6) {
      const b = Ink.bbox(s.p);
      const n = s.p.length;
      if (b.y1 - b.y0 < s.w * 0.9 && b.x1 - b.x0 > s.w * 2) {
        const y = (s.p[1] + s.p[n - 2]) / 2;
        s.p = [s.p[0], y, 0.5, s.p[n - 3], y, 0.5];
      }
    }
    if (s.t === 'pen' && s.p.length > 3 && !a.snapped && !a.ruled) {
      const lvl = App.settings.smooth | 0;
      s.p = Ink.resample(lvl ? Ink.stabilize(s.p, lvl) : s.p, 3);
    }
    const tok = E.beginOp(a.page);
    a.page.strokes.push(s);
    a.path.setAttribute('d', s.t === 'hl' ? Ink.center(s.p) : Ink.outline(s.p, s.w));
    E.commitOp(tok);
    if (App.settings.calc && s.t === 'pen' && !a.snapped && !a.ruled) E.mathCheck(a.page, s);
  },
  /* ---------------- Rechenhilfe: "=" written → solve the task on its left */
  mathCheck(page, s) {
    const E = Editor, eq = MathInk.findEquals(page, s);
    if (!eq) return;
    clearTimeout(E._mathTimer);
    E._mathPending = { pageId: page.id, eq };
    E._mathTimer = setTimeout(() => { E._mathPending = null; E.mathSolve(page.id, eq); }, 450);
  },
  mathSolve(pageId, eq) {
    const E = Editor, page = E.page(pageId);
    if (!page || !eq.ids.every((id) => page.strokes.some((x) => x.id === id))) return;
    const H0 = Math.max(14, eq.w * 1.7);
    // something already written right of "=" (own answer or earlier result) → leave it alone
    if (page.strokes.some((x) => { const b = MathInk.bb(x.p); return b.x0 > eq.x1 - 2 && b.x0 < eq.x1 + 2.5 * H0 && Math.abs(b.cy - eq.cy) < H0; })) return;
    const t0 = performance.now();
    const r = MathInk.readExpression(page, eq);
    if (r.error || !r.tokens.length) return;
    const shown = MathInk.pretty(r.tokens);
    if (r.worst > MathInk.REJECT) { toast(`Nicht sicher erkannt („${shown}“) – deutlicher schreiben oder Ziffern trainieren (⋮ → Einstellungen)`, 4500); return; }
    const v = MathInk.evaluate(MathInk.toFormula(r.tokens));
    const text = v == null ? null : MathInk.formatNumber(v);
    if (text == null) { if (/[+−×·:/^]/.test(shown)) toast(`Erkannt: ${shown} = ? – das kann ich nicht ausrechnen`, 3500); return; }
    const exprStrokes = r.run.flatMap((g) => g.strokes);
    const w = exprStrokes.reduce((t, x) => t + x.w, 0) / exprStrokes.length;
    const H = Math.min(r.H, 160), base = r.base;
    const strokes = MathInk.writeText(text, eq.x1 + 0.32 * H, base, H).map((p) => ({ id: uid(), t: 'pen', c: App.settings.calcColor || '#e46a00', w, p: Ink.resample(p, 3), calc: 1 }));
    const tok = E.beginOp(page);
    page.strokes.push(...strokes);
    E.refreshInk(page);
    E.commitOp(tok);
    E.renderSelection();
    $$('svg.ink path', E.pageEl(page.id)).forEach((n) => { if (strokes.some((x) => x.id === n.dataset.id) && n.animate) n.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 350 }); });
    toast(`${shown} = ${text}`, 2500);
    E._lastMathMs = Math.round(performance.now() - t0);
  },

  /* ---------------- eraser */
  startErase(e, hit, base) {
    const E = Editor;
    E.action = Object.assign(base, { type: 'erase', page: hit.page, pe: hit.pe, rect: hit.rect, tok: E.beginOp(hit.page), changed: false, last: null });
    E.eraseMove(e);
  },
  eraserCursor(pe, x, y, r) {
    const ovl = $('svg.ovl', pe);
    let c = $('.ecur', ovl);
    if (!c) { c = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); c.setAttribute('class', 'ecur'); c.setAttribute('fill', 'rgba(120,130,160,.15)'); c.setAttribute('stroke', '#7a83a0'); c.setAttribute('stroke-width', '1.5'); ovl.appendChild(c); }
    c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', r);
  },
  hoverEraser(e) {
    const hit = Editor.hitPage(e.clientX, e.clientY);
    $$('.ecur', Editor.pagesEl).forEach((c) => { if (!hit || !hit.pe.contains(c)) c.remove(); });
    if (hit) Editor.eraserCursor(hit.pe, hit.x, hit.y, Editor.eraser.r);
  },
  eraseMove(ev) {
    const E = Editor, a = E.action, r = E.eraser.r;
    const { x, y } = E.toPage(a, ev.clientX, ev.clientY);
    E.eraserCursor(a.pe, x, y, r);
    const pts = [];
    if (a.last) {
      const d = Math.hypot(x - a.last.x, y - a.last.y), k = Math.ceil(d / (r / 2));
      for (let i = 1; i <= k; i++) pts.push([a.last.x + (x - a.last.x) * i / k, a.last.y + (y - a.last.y) * i / k]);
    } else pts.push([x, y]);
    a.last = { x, y };
    const page = a.page;
    for (const [px, py] of pts) {
      for (let i = page.strokes.length - 1; i >= 0; i--) {
        const s = page.strokes[i];
        if (E.eraser.mode === 'stroke') {
          if (Ink.hit(s, px, py, r)) {
            page.strokes.splice(i, 1);
            const node = a.pe.querySelector(`svg.ink path[data-id="${s.id}"]`);
            if (node) node.remove();
            a.changed = true;
          }
        } else {
          const pieces = Ink.erasePartial(s, px, py, r);
          if (pieces) {
            const node = a.pe.querySelector(`svg.ink path[data-id="${s.id}"]`);
            const repl = pieces.map((pp) => ({ id: uid(), t: s.t, c: s.c, w: s.w, p: pp }));
            page.strokes.splice(i, 1, ...repl);
            if (node) {
              for (const ns of repl) node.insertAdjacentHTML('beforebegin', Render.strokePath(ns).replace('<path', '<path xmlns="http://www.w3.org/2000/svg"'));
              node.remove();
            }
            a.changed = true;
          }
        }
      }
    }
    if (E.eraser.mode === 'partial' && a.changed && !a._fixed) { a._fixed = true; }
  },
  endErase(a) {
    const E = Editor;
    $$('.ecur', a.pe).forEach((c) => c.remove());
    if (a.changed) {
      if (E.eraser.mode === 'partial') E.refreshInk(a.page); // ensure SVG namespace-correct nodes
      E.commitOp(a.tok);
    }
  },

  /* ---------------- lasso & selection */
  startLasso(e, hit, base) {
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('fill', 'rgba(91,108,255,.08)');
    poly.setAttribute('stroke', '#5b6cff');
    poly.setAttribute('stroke-width', 2 / Editor.z);
    poly.setAttribute('stroke-dasharray', `${6 / Editor.z} ${5 / Editor.z}`);
    $('svg.ovl', hit.pe).appendChild(poly);
    Editor.action = Object.assign(base, { type: 'lasso', page: hit.page, pe: hit.pe, rect: hit.rect, pts: [[hit.x, hit.y]], poly });
  },
  lassoMove(e) {
    const a = Editor.action, { x, y } = Editor.toPage(a, e.clientX, e.clientY);
    a.pts.push([x, y]);
    a.poly.setAttribute('points', a.pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' '));
  },
  endLasso(a) {
    const E = Editor;
    a.poly.remove();
    if (a.pts.length < 4) { E.clearSel(); return; }
    const strokes = new Set(), els = new Set();
    for (const s of a.page.strokes) {
      let inside = 0, n = 0;
      for (let i = 0; i < s.p.length; i += 3) { n++; if (Ink.pointInPoly(s.p[i], s.p[i + 1], a.pts)) inside++; }
      if (n && inside / n >= 0.5) strokes.add(s.id);
    }
    for (const el of a.page.els) {
      const r = E.elRect(a.page, el);
      if (Ink.pointInPoly((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, a.pts)) els.add(el.id);
    }
    if (!strokes.size && !els.size) { E.clearSel(); return; }
    E.setSel({ pageId: a.page.id, strokes, els });
  },
  setSel(sel) { Editor.sel = sel; Editor.renderSelection(); },
  clearSel() { if (Editor.sel) { Editor.sel = null; Editor.renderSelection(); } },
  selBBox() {
    const E = Editor, sel = E.sel;
    if (!sel) return null;
    const page = E.page(sel.pageId);
    if (!page) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of page.strokes) if (sel.strokes.has(s.id)) { const b = Ink.bbox(s.p); x0 = Math.min(x0, b.x0 - s.w / 2); y0 = Math.min(y0, b.y0 - s.w / 2); x1 = Math.max(x1, b.x1 + s.w / 2); y1 = Math.max(y1, b.y1 + s.w / 2); }
    for (const el of page.els) if (sel.els.has(el.id)) { const r = E.elRect(page, el); x0 = Math.min(x0, r.x0); y0 = Math.min(y0, r.y0); x1 = Math.max(x1, r.x1); y1 = Math.max(y1, r.y1); }
    return x0 === Infinity ? null : { x0, y0, x1, y1 };
  },
  renderSelection() {
    const E = Editor;
    $$('.elui', E.pagesEl).forEach((u) => (u.innerHTML = ''));
    $$('svg.ink path.sel', E.pagesEl).forEach((p) => p.classList.remove('sel'));
    const sel = E.sel;
    if (!sel) return;
    const page = E.page(sel.pageId), pe = page && E.pageEl(page.id);
    if (!pe) { E.sel = null; return; }
    sel.strokes.forEach((id) => { const n = pe.querySelector(`svg.ink path[data-id="${id}"]`); if (n) n.classList.add('sel'); });
    const b = E.selBBox();
    if (!b) { E.sel = null; return; }
    const ui = $('.elui', pe);
    const single = sel.strokes.size === 0 && sel.els.size === 1 ? page.els.find((x) => sel.els.has(x.id)) : null;
    const box = html(`<div class="selbox ${single ? '' : 'lasso'}" style="left:${b.x0 - 6}px;top:${b.y0 - 6}px;width:${b.x1 - b.x0 + 12}px;height:${b.y1 - b.y0 + 12}px;border-width:calc(2px / var(--z))">${single ? '<div class="rh" style="width:calc(30px / var(--z));height:calc(30px / var(--z));right:calc(-15px / var(--z));bottom:calc(-15px / var(--z));border-width:calc(3px / var(--z))"></div>' : ''}</div>`);
    ui.appendChild(box);
    const bar = html('<div class="elbar"></div>');
    const btn = (ic, label, fn) => { const x = html(`<button>${icon(ic)}${label ? `<span>${label}</span>` : ''}</button>`); x.onclick = (ev) => { ev.stopPropagation(); fn(); }; bar.appendChild(x); };
    if (single) {
      if (single.type === 'text') btn('edit', 'Bearbeiten', () => E.editElement(page, single));
      if (single.type === 'check') btn('edit', 'Bearbeiten', () => E.editElement(page, single));
      if (single.type === 'table') {
        btn('table', 'Bearbeiten', () => E.editElement(page, single));
        { const r = E.elRect(page, single); if (r.x1 > PAGE_W + 2) btn('fit', 'An Seite anpassen', () => E.fitTableToPage(page, single)); }
        if (single.sheet.cw) btn('swap', 'Breite auto', () => { const tok = E.beginOp(page); delete single.sheet.cw; E.rerenderPage(page); E.commitOp(tok); E.renderSelection(); });
        E.colHandles(pe, ui, single);
      }
      if (single.type === 'graph') btn('fn', 'Bearbeiten', () => E.editElement(page, single));
      if (single.type === 'image') btn('crop', 'Zuschneiden', () => E.cropImage(page, single));
      btn('layers', '', () => { const tok = E.beginOp(page); page.els = page.els.filter((x) => x !== single).concat([single]); E.rerenderPage(page); E.commitOp(tok); });
    } else if (sel.strokes.size) {
      btn('palette', 'Farbe', () => E.recolorSel(bar));
    }
    btn('copy', '', () => E.duplicateSel());
    btn('trash', '', () => E.deleteSel());
    bar.style.left = Math.max(0, b.x0) + 'px';
    bar.style.top = Math.max(0, b.y0 - 12) + 'px';
    bar.style.transform = 'translateY(-100%) scale(calc(1 / var(--z)))';
    ui.appendChild(bar);
    bar.addEventListener('pointerdown', (ev) => ev.stopPropagation());
  },
  recolorSel(anchor) {
    const E = Editor, page = E.page(E.sel.pageId);
    menu(anchor, PEN_COLORS.concat(HL_COLORS).map((c) => ({ label: c, icon: null, action: () => {
      const tok = E.beginOp(page);
      page.strokes.forEach((s) => { if (E.sel.strokes.has(s.id)) s.c = c; });
      E.rerenderPage(page); E.commitOp(tok);
    } })));
    $$('.menu-pop button').forEach((b, i) => { const c = PEN_COLORS.concat(HL_COLORS)[i]; b.innerHTML = `<span class="swatch" style="background:${c}"></span><span>${i < PEN_COLORS.length ? 'Stiftfarbe' : 'Markerfarbe'}</span>`; });
  },
  deleteSel() {
    const E = Editor, sel = E.sel, page = E.page(sel.pageId);
    const tok = E.beginOp(page);
    page.strokes = page.strokes.filter((s) => !sel.strokes.has(s.id));
    page.els = page.els.filter((x) => !sel.els.has(x.id));
    E.sel = null;
    E.rerenderPage(page); E.commitOp(tok);
  },
  duplicateSel() {
    const E = Editor, sel = E.sel, page = E.page(sel.pageId);
    const tok = E.beginOp(page);
    const ns = new Set(), ne = new Set();
    page.strokes.filter((s) => sel.strokes.has(s.id)).forEach((s) => {
      const c = deepCopy(s); delete c._bb; c.id = uid();
      for (let i = 0; i < c.p.length; i += 3) { c.p[i] += 24; c.p[i + 1] += 24; }
      page.strokes.push(c); ns.add(c.id);
    });
    page.els.filter((x) => sel.els.has(x.id)).forEach((x) => { const c = deepCopy(x); c.id = uid(); c.x += 24; c.y += 24; page.els.push(c); ne.add(c.id); });
    E.sel = { pageId: page.id, strokes: ns, els: ne };
    E.rerenderPage(page); E.commitOp(tok);
  },

  /* ---------------- moving & resizing selection */
  startMove(e, hit, base) {
    const E = Editor, sel = E.sel, pe = hit.pe;
    const nodes = [];
    sel.strokes.forEach((id) => { const n = pe.querySelector(`svg.ink path[data-id="${id}"]`); if (n) nodes.push(n); });
    const divs = [];
    sel.els.forEach((id) => { const n = pe.querySelector(`.el[data-id="${id}"]`); if (n) divs.push(n); });
    E.action = Object.assign(base, { type: 'move', page: hit.page, pe, rect: hit.rect, sx: hit.x, sy: hit.y, dx: 0, dy: 0, nodes, divs, ui: $('.elui', pe) });
  },
  moveMove(e) {
    const a = Editor.action, { x, y } = Editor.toPage(a, e.clientX, e.clientY);
    a.dx = x - a.sx; a.dy = y - a.sy;
    if (!a.moved && Math.hypot(a.dx, a.dy) < 4) return;
    a.moved = true;
    a.nodes.forEach((n) => n.setAttribute('transform', `translate(${a.dx} ${a.dy})`));
    a.divs.forEach((n) => (n.style.translate = `${a.dx}px ${a.dy}px`));
    a.ui.style.translate = `${a.dx}px ${a.dy}px`;
  },
  endMove(a) {
    const E = Editor;
    a.ui.style.translate = '';
    if (!a.moved) return;
    const page = a.page, sel = E.sel, tok = E.beginOp(page);
    const h = page.h || A4_H;
    const dx = Math.round(a.dx * 10) / 10, dy = Math.round(a.dy * 10) / 10;
    page.strokes.forEach((s) => {
      if (!sel.strokes.has(s.id)) return;
      for (let i = 0; i < s.p.length; i += 3) { s.p[i] = Math.round((s.p[i] + dx) * 10) / 10; s.p[i + 1] = Math.round((s.p[i + 1] + dy) * 10) / 10; }
      delete s._bb;
    });
    page.els.forEach((el) => { if (sel.els.has(el.id)) { el.x = clamp(Math.round(el.x + dx), -200, PAGE_W - 40); el.y = clamp(Math.round(el.y + dy), -100, h - 30); } });
    E.rerenderPage(page);
    E.commitOp(tok);
  },
  /* ---- Tabellen-Spaltenbreiten: Griffe an jeder Spaltengrenze ---- */
  /** gemessene Spaltenbreiten (ungeskalierte px) – aus sheet.cw oder aus der Darstellung */
  colWidths(div, sheet) {
    if (Array.isArray(sheet.cw) && sheet.cw.length === sheet.cols) return sheet.cw.slice();
    const w = new Array(sheet.cols).fill(0);
    $$('td', div).forEach((td) => { const c = +td.dataset.c; if (td.colSpan === 1 && !w[c]) w[c] = td.offsetWidth; });
    // Spalten, die nur in verbundenen Zellen vorkommen: Rest gleichmäßig verteilen
    const tw = div.firstElementChild ? div.firstElementChild.offsetWidth : 0, known = w.reduce((a, x) => a + x, 0), miss = w.filter((x) => !x).length;
    return w.map((x) => x || Math.max(40, Math.round((tw - known) / Math.max(1, miss))));
  },
  colHandles(pe, ui, el) {
    const E = Editor, div = pe.querySelector(`.el[data-id="${el.id}"]`);
    if (!div || !div.firstElementChild) return;
    const s = el.s || 1, w = E.colWidths(div, el.sheet), h = div.firstElementChild.offsetHeight * s;
    let x = 0;
    w.forEach((cw, c) => {
      x += cw;
      const hd = html(`<div class="colh" data-c="${c}" title="Spaltenbreite ziehen" style="left:${E.colhLeft(el.x + x * s)};top:${el.y}px;height:${h}px"></div>`);
      ui.appendChild(hd);
    });
  },
  /** Griff-Position; liegt eine Spaltengrenze hinter dem Seitenrand, bleibt der Griff am Rand greifbar */
  colhLeft(px) { return px > PAGE_W - 4 ? `calc(${PAGE_W}px - 36px / var(--z, 1))` : `calc(${px}px - 18px / var(--z, 1))`; },
  /** ganze Tabelle auf die Seitenbreite bringen (Spalten anteilig schmaler, Text bricht um) */
  fitTableToPage(page, el) {
    const E = Editor, div = E.pageEl(page.id).querySelector(`.el[data-id="${el.id}"]`);
    if (!div) return;
    const s = el.s || 1, w = E.colWidths(div, el.sheet), sum = w.reduce((a, x) => a + x, 0);
    const target = Math.max(120, (PAGE_W - el.x - 40) / s), f = Math.min(1, target / sum);
    const tok = E.beginOp(page);
    el.sheet.cw = w.map((x) => Math.max(60, Math.floor(x * f)));
    E.rerenderPage(page);
    E.commitOp(tok);
  },
  startColResize(e, hit, base, c) {
    const E = Editor, page = hit.page;
    const el = page.els.find((x) => E.sel.els.has(x.id));
    if (!el || el.type !== 'table') return;
    const div = hit.pe.querySelector(`.el[data-id="${el.id}"]`), tok = E.beginOp(page);
    el.sheet.cw = E.colWidths(div, el.sheet).map((x) => Math.round(x));
    E.action = Object.assign(base, { type: 'colw', page, pe: hit.pe, rect: hit.rect, el, c, div, sx: hit.x, w0: el.sheet.cw[c], tok });
    const hd = hit.pe.querySelector(`.colh[data-c="${c}"]`); if (hd) hd.classList.add('on');
  },
  colResizeMove(e) {
    const E = Editor, a = E.action, el = a.el, { x } = E.toPage(a, e.clientX, e.clientY), s = el.s || 1;
    el.sheet.cw[a.c] = Math.max(40, Math.round(a.w0 + (x - a.sx) / s));
    if (E._cwRaf) return;
    E._cwRaf = requestAnimationFrame(() => {
      E._cwRaf = 0;
      if (E.action !== a) return;
      a.div.innerHTML = Render.elInner(el, E.doc);
      // Griffe und Rahmen mitführen
      const ui = $('.elui', a.pe), h = a.div.firstElementChild.offsetHeight * s;
      let xx = 0;
      el.sheet.cw.forEach((w, c) => { xx += w; const hd = ui.querySelector(`.colh[data-c="${c}"]`); if (hd) { hd.style.left = E.colhLeft(el.x + xx * s); hd.style.height = h + 'px'; } });
      const b = E.selBBox(), box = $('.selbox', a.pe);
      if (b && box) Object.assign(box.style, { left: b.x0 - 6 + 'px', top: b.y0 - 6 + 'px', width: b.x1 - b.x0 + 12 + 'px', height: b.y1 - b.y0 + 12 + 'px' });
    });
  },
  endColResize(a) {
    const E = Editor;
    cancelAnimationFrame(E._cwRaf); E._cwRaf = 0;
    E.rerenderPage(a.page);
    E.commitOp(a.tok);
  },
  startResize(e, hit, base) {
    const E = Editor, page = hit.page;
    const el = page.els.find((x) => E.sel.els.has(x.id));
    if (!el) return;
    const r = E.elRect(page, el);
    E.action = Object.assign(base, { type: 'resize', page, pe: hit.pe, rect: hit.rect, el, sx: hit.x, sy: hit.y, w0: r.x1 - r.x0, h0: r.y1 - r.y0, orig: deepCopy(el), tok: E.beginOp(page), div: hit.pe.querySelector(`.el[data-id="${el.id}"]`) });
  },
  resizeMove(e) {
    const E = Editor, a = E.action, el = a.el, { x, y } = E.toPage(a, e.clientX, e.clientY);
    const dw = x - a.sx, dh = y - a.sy;
    if (el.type === 'image') { el.w = Math.max(40, Math.round(a.orig.w + dw)); el.h = Math.round(el.w * a.orig.h / a.orig.w); }
    else if (el.type === 'graph') { el.w = Math.max(160, Math.round(a.orig.w + dw)); el.h = Math.max(120, Math.round(a.orig.h + dh)); }
    else if (el.type === 'text' || el.type === 'check') { el.w = Math.max(80, Math.round(a.orig.w + dw)); }
    else if (el.type === 'table') { el.s = clamp((a.orig.s || 1) * (a.w0 + dw) / a.w0, 0.3, 4); }
    a.div.setAttribute('style', Render.elStyle(el));
    if (el.type === 'graph' && !E._gRaf) E._gRaf = requestAnimationFrame(() => { E._gRaf = 0; a.div.innerHTML = Render.elInner(el, E.doc); });
    const b = E.selBBox(), box = $('.selbox', a.pe);
    if (b && box) Object.assign(box.style, { left: b.x0 - 6 + 'px', top: b.y0 - 6 + 'px', width: b.x1 - b.x0 + 12 + 'px', height: b.y1 - b.y0 + 12 + 'px' });
  },
  endResize(a) {
    const E = Editor;
    if (a.el.type === 'graph') E.fitGraphView(a.el, a.orig);
    E.rerenderPage(a.page);
    E.commitOp(a.tok);
  },
  /** keep the unit ratio of a graph when its box changes */
  fitGraphView(el, orig) {
    const v = el.view, cx = (v.xmin + v.xmax) / 2, cy = (v.ymin + v.ymax) / 2;
    const ux = (orig.view.xmax - orig.view.xmin) / orig.w, uy = (orig.view.ymax - orig.view.ymin) / orig.h;
    el.view = { xmin: cx - ux * el.w / 2, xmax: cx + ux * el.w / 2, ymin: cy - uy * el.h / 2, ymax: cy + uy * el.h / 2 };
  },

  /* ============================================================ elements */
  addElement(page, el) {
    const E = Editor, tok = E.beginOp(page);
    page.els.push(el);
    E.rerenderPage(page);
    E.commitOp(tok);
    return el;
  },
  currentPage() { return Editor.doc.pages[clamp(Editor.curPage, 0, Editor.doc.pages.length - 1)]; },
  /** first y >= desired where a box (x..x+w, h tall) does not overlap existing elements */
  freeY(page, x, w, desired, h) {
    const E = Editor, rects = page.els.map((el) => E.elRect(page, el));
    let y = Math.max(20, desired);
    for (let guard = 0; guard < 50; guard++) {
      const hit = rects.find((r) => x < r.x1 && x + w > r.x0 && y < r.y1 + 16 && y + h > r.y0 - 16);
      if (!hit) break;
      y = hit.y1 + 24;
    }
    const ph = page.h || A4_H;
    return Math.round(y + h > ph - 10 ? Math.max(20, Math.min(desired, ph - h - 10)) : y);
  },

  editElement(page, el) {
    const E = Editor;
    if (el.type === 'text') return E.beginTextEdit(page, el);
    if (el.type === 'check') {
      E.checkDialog(el.items).then((items) => {
        if (!items) return;
        const tok = E.beginOp(page);
        if (items.length) el.items = items; else page.els = page.els.filter((x) => x !== el);
        E.rerenderPage(page); E.commitOp(tok);
      });
      return;
    }
    if (el.type === 'table') {
      SheetUI.open(deepCopy(el.sheet)).then((sheet) => {
        if (!sheet) return;
        const tok = E.beginOp(page);
        el.sheet = sheet;
        E.rerenderPage(page); E.commitOp(tok);
      });
    }
    if (el.type === 'graph') {
      PlotUI.open({ fns: deepCopy(el.fns), view: deepCopy(el.view), marks: el.marks !== false, w: el.w, h: el.h }).then((res) => {
        if (!res) return;
        const tok = E.beginOp(page);
        if (res.graph) Object.assign(el, { fns: res.graph.fns, view: res.graph.view, marks: res.graph.marks });
        E.rerenderPage(page);
        if (res.table) E.placeTable(page, res.table, el.y + el.h + 20);
        E.commitOp(tok);
      });
    }
  },

  beginTextEdit(page, el) {
    const E = Editor;
    E.clearSel();
    if (E.tool !== 'select') { E.tool = 'select'; $$('.tool', E.root).forEach((b) => b.classList.toggle('on', b.dataset.t === 'select')); E.pagesEl.classList.remove('mode-draw'); }
    const div = E.pageEl(page.id).querySelector(`.el[data-id="${el.id}"]`);
    if (!div) return;
    const tx = $('.tx', div);
    E.editing = { page, el, div, tx, tok: E.beginOp(page) };
    div.classList.add('editing');
    tx.contentEditable = 'true';
    tx.focus();
    const r = document.createRange(); r.selectNodeContents(tx); r.collapse(false);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    tx.addEventListener('input', E._txInput = () => E.syncTextEdit());
    setTimeout(() => { if (E.editing && E.editing.div === div) div.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 350);
    E.renderSubbar();
  },
  sanitize(h) {
    const t = document.createElement('template');
    t.innerHTML = h;
    t.content.querySelectorAll('script,style,iframe,object,embed,link,meta,img').forEach((n) => n.remove());
    t.content.querySelectorAll('mark.sh-mark').forEach((m) => m.replaceWith(document.createTextNode(m.textContent)));
    t.content.querySelectorAll('*').forEach((n) => { for (const a of [...n.attributes]) if (/^on/i.test(a.name) || (a.name === 'href')) n.removeAttribute(a.name); });
    return t.innerHTML;
  },
  syncTextEdit() {
    const E = Editor, ed = E.editing;
    if (!ed) return;
    ed.el.html = E.sanitize(ed.tx.innerHTML);
    E.markDirty();
  },
  finishTextEdit() {
    const E = Editor, ed = E.editing;
    if (!ed) return;
    E.editing = null;
    ed.tx.removeEventListener('input', E._txInput);
    ed.tx.contentEditable = 'false';
    ed.div.classList.remove('editing');
    ed.el.html = E.sanitize(ed.tx.innerHTML);
    if (!ed.tx.textContent.trim()) ed.page.els = ed.page.els.filter((x) => x !== ed.el);
    window.getSelection().removeAllRanges();
    E.rerenderPage(ed.page);
    E.commitOp(ed.tok);
    E.renderSubbar();
  },

  insertText() {
    const E = Editor, page = E.currentPage(), c = E.visibleCenter(page);
    const tx0 = Math.round(clamp(c.x - 260, 20, PAGE_W - 540));
    const el = { id: uid(), type: 'text', x: tx0, y: E.freeY(page, tx0, 520, Math.round(c.y - 140), 60), w: 520, fs: 24, html: '' };
    page.els.push(el);
    E.rerenderPage(page);
    // the insert itself is not an undo step of its own; the edit op covers it (empty → removed)
    const tok = { pageId: page.id, before: E.snap(Object.assign({}, page, { els: page.els.filter((x) => x !== el) })) };
    E.beginTextEdit(page, el);
    E.editing.tok = tok;
  },

  /** inserts prepared rich text (from the toolbox) as a text box */
  insertHTML(h) {
    const E = Editor, page = E.currentPage(), c = E.visibleCenter(page);
    const x = Math.round(clamp(c.x - 360, 30, PAGE_W - 760));
    const el = { id: uid(), type: 'text', x, y: E.freeY(page, x, 720, Math.round(c.y - 150), 160), w: 720, fs: 20, html: E.sanitize(h) };
    E.addElement(page, el);
    E.setTool('select');
    E.setSel({ pageId: page.id, strokes: new Set(), els: new Set([el.id]) });
    E.focusElement(E.doc.pages.indexOf(page), el.id);
  },
  async insertImage() {
    const E = Editor;
    const f = await pickFile('image/*');
    if (!f) return;
    busy('Bild wird eingefügt …');
    try {
      const { src, w, h } = await prepareImage(await readAsDataURL(f));
      const id = uid();
      E.doc.images[id] = src;
      const page = E.currentPage(), c = E.visibleCenter(page);
      const ew = Math.min(700, w), eh = Math.round(ew * h / w);
      const ix = Math.round(clamp(c.x - ew / 2, 0, PAGE_W - ew));
      const el = { id: uid(), type: 'image', x: ix, y: E.freeY(page, ix, ew, Math.round(c.y - eh / 2), eh), w: ew, h: eh, img: id };
      E.addElement(page, el);
      E.setTool('select');
      E.setSel({ pageId: page.id, strokes: new Set(), els: new Set([el.id]) });
    } catch (err) { toast('Bild konnte nicht geladen werden'); }
    busy(false);
  },

  async cropImage(page, el) {
    const E = Editor;
    const res = await CropUI.open(E.doc.images[el.img]);
    if (!res) return;
    const tok = E.beginOp(page);
    const id = uid();
    E.doc.images[id] = res.src;
    el.img = id;
    el.h = Math.round(el.w * res.h / res.w);
    E.rerenderPage(page);
    E.commitOp(tok);
  },

  async insertTable() {
    const sheet = await SheetUI.open(null);
    if (!sheet) return;
    const page = Editor.currentPage(), c = Editor.visibleCenter(page);
    Editor.placeTable(page, sheet, c.y - 100, true);
  },
  placeTable(page, sheet, y, ownOp) {
    const E = Editor;
    const el = { id: uid(), type: 'table', x: 60, y: E.freeY(page, 60, 600, Math.round(clamp(y, 30, (page.h || A4_H) - 100)), 120), s: 1, sheet };
    if (ownOp) E.addElement(page, el); else { page.els.push(el); E.rerenderPage(page); }
    return el;
  },

  async insertGraph() {
    const E = Editor;
    const res = await PlotUI.open(null);
    if (!res) return;
    const page = E.currentPage(), c = E.visibleCenter(page);
    const tok = E.beginOp(page);
    let y = Math.round(clamp(c.y - 250, 30, (page.h || A4_H) - 300));
    if (res.graph) {
      y = E.freeY(page, 120, res.graph.w, y, res.graph.h);
      const el = { id: uid(), type: 'graph', x: 120, y, w: res.graph.w, h: res.graph.h, fns: res.graph.fns, view: res.graph.view, marks: res.graph.marks };
      page.els.push(el);
      y += el.h + 24;
    }
    E.rerenderPage(page);
    if (res.table) E.placeTable(page, res.table, y);
    E.commitOp(tok);
  },

  insertPdf() {
    const E = Editor;
    if (!Native && !window.FOS_WEB) { toast('PDF-Import funktioniert in der Android-App.'); return; }
    App.pickPdfPages((pages, images) => {
      if (!pages.length || !E.doc) return;
      const tok = E.beginOp(null);
      Object.assign(E.doc.images, images);
      const at = E.curPage + 1;
      E.doc.pages.splice(at, 0, ...pages);
      E.renderAllPages(); E.renderThumbs();
      E.commitOp(tok);
      E.flush();
      E.scrollToPage(at);
      toast(pages.length + ' PDF-Seiten eingefügt – du kannst direkt darauf schreiben.');
    });
  },

  insertMenu(anchor) {
    const E = Editor;
    menu(anchor, [
      { section: 'Einfügen' },
      { label: 'Textfeld', icon: 'text', action: () => E.insertText() },
      { label: 'Aufgabenliste', icon: 'checklist', action: () => E.insertChecklist() },
      { label: 'Formel aus Formelsammlung', icon: 'fn', action: () => Toolbox.open('formulas', { insert: (h) => E.insertHTML(h) }) },
      { label: 'Bild / Foto', icon: 'image', action: () => E.insertImage() },
      { label: 'Tabelle', icon: 'table', action: () => E.insertTable() },
      { label: 'Funktion / Graph', icon: 'fn', action: () => E.insertGraph() },
      { label: 'PDF-Seiten', icon: 'pdf', action: () => E.insertPdf() },
      '-',
      { label: 'Neue Seite danach', icon: 'plus', action: () => E.addPage(E.curPage) }
    ]);
  },

  /* ============================================================ pages */
  addPage(afterIdx, paper) {
    const E = Editor, tok = E.beginOp(null);
    const ref = E.doc.pages[clamp(afterIdx, 0, E.doc.pages.length - 1)];
    const p = App.newPage(paper || (ref && !ref.bg ? ref.paper : (App.settings.lastPaper || 'grid')));
    E.doc.pages.splice(afterIdx + 1, 0, p);
    const wrapBefore = E.pagesEl.querySelector(`.page-wrap[data-id="${ref.id}"]`);
    wrapBefore.after(E.makeWrap(p));
    E.renderThumbs();
    E.commitOp(tok);
    E.scrollToPage(afterIdx + 1);
  },
  async deletePage(idx) {
    const E = Editor;
    if (E.doc.pages.length === 1) { E.clearPage(); return; }
    if (!(await confirm2('Seite löschen?', `Seite ${idx + 1} wird gelöscht. (Rückgängig ist möglich.)`))) return;
    const tok = E.beginOp(null);
    E.doc.pages.splice(idx, 1);
    E.clearSel();
    E.renderAllPages(); E.renderThumbs();
    E.commitOp(tok);
    E.scrollToPage(Math.min(idx, E.doc.pages.length - 1));
  },
  movePage(from, to) {
    const E = Editor;
    if (to < 0 || to >= E.doc.pages.length) return;
    const tok = E.beginOp(null);
    const [p] = E.doc.pages.splice(from, 1);
    E.doc.pages.splice(to, 0, p);
    E.renderAllPages(); E.renderThumbs();
    E.commitOp(tok);
    E.scrollToPage(to);
  },
  async clearPage() {
    const E = Editor, page = E.currentPage();
    if (!(await confirm2('Seite leeren?', 'Alle Zeichnungen und Elemente dieser Seite werden entfernt. (Rückgängig ist möglich.)', 'Leeren'))) return;
    const tok = E.beginOp(page);
    page.strokes = []; page.els = [];
    E.clearSel();
    E.rerenderPage(page);
    E.commitOp(tok);
  },
  setPaper(paper, all) {
    const E = Editor;
    if (all) {
      const tok = E.beginOp(null);
      E.doc.pages.forEach((p) => { p.paper = paper; });
      E.renderAllPages(); E.renderThumbs();
      E.commitOp(tok);
    } else {
      const page = E.currentPage(), tok = E.beginOp(page);
      page.paper = paper;
      E.rerenderPage(page);
      E.commitOp(tok);
    }
  },

  moreMenu(anchor) {
    const E = Editor, cur = E.currentPage().paper;
    menu(anchor, [
      { section: 'Papier dieser Seite' },
      ...PAPERS.map(([k, l]) => ({ label: l, icon: 'paper', check: cur === k, action: () => E.setPaper(k, false) })),
      { label: 'Vorlage für alle Seiten …', icon: 'pages', action: () => menu(anchor, PAPERS.map(([k, l]) => ({ label: l + ' (alle Seiten)', icon: 'paper', action: () => E.setPaper(k, true) }))) },
      '-',
      { label: 'Neue Seite danach', icon: 'plus', action: () => E.addPage(E.curPage) },
      { label: 'Seite leeren', icon: 'eraser', action: () => E.clearPage() },
      { label: 'Seite löschen', icon: 'trash', danger: true, action: () => E.deletePage(E.curPage) },
      '-',
      { label: 'Als PDF exportieren', icon: 'pdf', action: () => { E.flush(); App.printDocs(E.item.name, [{ item: E.item, doc: E.doc }]); } },
      { label: 'Werkzeugkasten', icon: 'toolbox', action: () => Toolbox.open(null, { insert: (h) => E.insertHTML(h) }) },
      { label: 'Rechenhilfe: Ziffern trainieren', icon: 'calc', action: () => MathTrainer.open() },
      { label: 'Einstellungen', icon: 'settings', action: () => App.settingsDialog().then(() => { if (E.doc) { E.renderAllPages(); E.updateFingerBtn(); } }) }
    ]);
  },
  /* ============================================================ checklists */
  async checkDialog(items) {
    const res = await dialog({
      title: items ? 'Aufgabenliste bearbeiten' : 'Neue Aufgabenliste',
      body: `<div class="field"><label>Eine Aufgabe pro Zeile</label><textarea id="ckt" rows="8" style="width:100%;resize:vertical" placeholder="z. B.&#10;Mathe S. 42 Nr. 3&#10;Referat vorbereiten&#10;Physik-Protokoll abgeben">${esc((items || []).map((i) => i.t).join('\n'))}</textarea></div>`,
      onOpen: (d) => setTimeout(() => $('#ckt', d).focus(), 60),
      buttons: [{ label: 'Abbrechen', value: null }, { label: items ? 'Speichern' : 'Einfügen', cls: 'primary', value: (d) => $('#ckt', d).value }]
    });
    if (res == null) return null;
    const old = new Map((items || []).map((i) => [i.t, i.d]));
    return res.split('\n').map((t) => t.trim()).filter(Boolean).slice(0, 60).map((t) => ({ t, d: !!old.get(t) }));
  },
  async insertChecklist() {
    const E = Editor, items = await E.checkDialog(null);
    if (!items || !items.length) return;
    const page = E.currentPage(), c = E.visibleCenter(page);
    const x = Math.round(clamp(c.x - 300, 40, PAGE_W - 640));
    const el = { id: uid(), type: 'check', x, y: E.freeY(page, x, 600, Math.round(c.y - 120), items.length * 36), w: 600, fs: 22, items };
    E.addElement(page, el);
  },
  toggleCheck(page, el, i) {
    const E = Editor;
    if (!el.items || !el.items[i]) return;
    const tok = E.beginOp(page);
    el.items[i].d = !el.items[i].d;
    E.rerenderPage(page);
    E.commitOp(tok);
  },
  /** scroll so that an element is centred and briefly highlighted */
  focusElement(pageIdx, elId) {
    const E = Editor, page = E.doc.pages[pageIdx];
    if (!page) return;
    const el = page.els.find((x) => x.id === elId), wrap = E.pagesEl.querySelector(`.page-wrap[data-id="${page.id}"]`);
    if (!el || !wrap) return E.scrollToPage(pageIdx);
    E.curPage = pageIdx; E.markCurThumb();
    E.scroller.scrollTop = wrap.offsetTop + el.y * E.z - E.scroller.clientHeight / 3;
    const d = wrap.querySelector(`.el[data-id="${el.id}"]`);
    if (d) { d.classList.add('hit-cur'); setTimeout(() => d.classList.remove('hit-cur'), 1600); }
  },

  /* ============================================================ search in notebook */
  openSearch(q) {
    const E = Editor;
    E.finishTextEdit();
    E.search = { q: q || '', hits: [], i: 0 };
    E.renderSubbar();
    if (q) E.runSearch(q);
    setTimeout(() => { const i = $('.searchbar input', E.root); if (i) { i.focus(); i.select(); } }, 50);
  },
  closeSearch() {
    const E = Editor;
    E.search = null;
    E.renderAllPages();
    E.renderSubbar();
  },
  renderSearchBar(bar, add) {
    const E = Editor, S = E.search;
    add(html(`<span style="display:flex;color:var(--muted)">${icon('search')}</span>`));
    const inp = add(html(`<input type="text" placeholder="Im Heft suchen …" value="${esc(S.q)}" autocomplete="off">`));
    const cnt = add(html(`<span class="lbl"></span>`));
    const prev = add(html(`<button class="ibtn">${icon('up')}</button>`)), next = add(html(`<button class="ibtn">${icon('down')}</button>`));
    const close = add(html(`<button class="ibtn">${icon('close')}</button>`));
    E._searchCount = cnt;
    inp.addEventListener('input', debounce(() => E.runSearch(inp.value), 180));
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); E.stepSearch(e.shiftKey ? -1 : 1); } });
    prev.onclick = () => E.stepSearch(-1); next.onclick = () => E.stepSearch(1);
    close.onclick = () => E.closeSearch();
    E.updateSearchCount();
  },
  updateSearchCount() {
    const E = Editor, S = E.search;
    if (!S || !E._searchCount) return;
    E._searchCount.textContent = S.q.trim().length < 2 ? 'Handschrift nicht durchsuchbar' : S.hits.length ? `${S.i + 1} von ${S.hits.length}` : 'keine Treffer';
  },
  runSearch(q) {
    const E = Editor, S = E.search;
    if (!S) return;
    S.q = q; S.hits = []; S.i = 0;
    const needle = q.trim().toLowerCase();
    if (needle.length >= 2) {
      E.doc.pages.forEach((p, pi) => p.els.forEach((el) => {
        let text = '';
        if (el.type === 'text') { const t = document.createElement('template'); t.innerHTML = el.html || ''; text = t.content.textContent; }
        else if (el.type === 'check') text = (el.items || []).map((i) => i.t).join(' ');
        else if (el.type === 'table') { const ev = SheetEngine.evaluator(el.sheet); text = Object.keys(el.sheet.cells).map((r) => SheetEngine.display(ev.get(r))).join(' '); }
        else if (el.type === 'graph') text = el.fns.map((f) => f.expr).join(' ');
        if (text.toLowerCase().includes(needle)) S.hits.push({ p: pi, el: el.id, y: el.y });
      }));
      S.hits.sort((a, b) => a.p - b.p || a.y - b.y);
    }
    E.markHits();
    E.updateSearchCount();
    if (S.hits.length) E.showHit();
  },
  stepSearch(d) {
    const S = Editor.search;
    if (!S || !S.hits.length) return;
    S.i = (S.i + d + S.hits.length) % S.hits.length;
    Editor.markHits(); Editor.updateSearchCount(); Editor.showHit();
  },
  showHit() {
    const E = Editor, h = E.search.hits[E.search.i], page = E.doc.pages[h.p];
    const wrap = E.pagesEl.querySelector(`.page-wrap[data-id="${page.id}"]`), el = page.els.find((x) => x.id === h.el);
    if (!wrap || !el) return;
    E.curPage = h.p; E.markCurThumb();
    E.scroller.scrollTop = wrap.offsetTop + el.y * E.z - E.scroller.clientHeight / 3;
    E.scroller.scrollLeft = Math.max(0, wrap.offsetLeft + el.x * E.z - 60);
  },
  /** highlight hits in the DOM only (never saved) */
  markHits() {
    const E = Editor, S = E.search;
    $$('mark.sh-mark', E.pagesEl).forEach((m) => m.replaceWith(document.createTextNode(m.textContent)));
    $$('.el.hit, .el.hit-cur', E.pagesEl).forEach((d) => d.classList.remove('hit', 'hit-cur'));
    $$('td.sh-td', E.pagesEl).forEach((d) => d.classList.remove('sh-td'));
    if (!S) return;
    const needle = S.q.trim().toLowerCase();
    if (needle.length < 2) return;
    S.hits.forEach((h, k) => {
      const page = E.doc.pages[h.p], d = page && E.pagesEl.querySelector(`.page[data-id="${page.id}"] .el[data-id="${h.el}"]`);
      if (!d) return;
      d.classList.add(k === S.i ? 'hit-cur' : 'hit');
      $$('td', d).forEach((td) => { if (td.textContent.toLowerCase().includes(needle)) td.classList.add('sh-td'); });
      const walker = document.createTreeWalker(d, NodeFilter.SHOW_TEXT), nodes = [];
      while (walker.nextNode()) if (walker.currentNode.nodeValue.toLowerCase().includes(needle) && !walker.currentNode.parentNode.closest('svg,td')) nodes.push(walker.currentNode);
      for (const n of nodes) {
        const frag = document.createDocumentFragment(), txt = n.nodeValue, low = txt.toLowerCase();
        let pos = 0, i;
        while ((i = low.indexOf(needle, pos)) >= 0) {
          frag.appendChild(document.createTextNode(txt.slice(pos, i)));
          const m = document.createElement('mark'); m.className = 'sh-mark'; m.textContent = txt.slice(i, i + needle.length); frag.appendChild(m);
          pos = i + needle.length;
        }
        frag.appendChild(document.createTextNode(txt.slice(pos)));
        n.replaceWith(frag);
      }
    });
  },

  /* ============================================================ ruler */
  MM: PAGE_W / 210,
  toggleRuler() {
    const E = Editor;
    if (E.ruler) E.ruler = null;
    else {
      const page = E.currentPage(), c = E.visibleCenter(page);
      E.ruler = { pageId: page.id, cx: PAGE_W / 2, cy: c.y, a: 0, len: 18 * 10 * E.MM + 24, w: 78 };
    }
    $('[data-a=ruler]', E.root).classList.toggle('on', !!E.ruler);
    E.renderRuler();
    E.renderSubbar();
  },
  rulerDeg() {
    let d = Math.round(Editor.ruler.a * 180 / Math.PI) % 180;   // visible rotation (clockwise), 0–179°
    if (d < 0) d += 180;
    return d + 0;
  },
  renderRuler() {
    const E = Editor;
    $$('.ruler', E.pagesEl).forEach((r) => r.remove());
    const R = E.ruler;
    if (!R) return;
    let pe = E.pageEl(R.pageId);
    if (!pe) { R.pageId = E.currentPage().id; pe = E.pageEl(R.pageId); if (!pe) return; }
    const L = R.len, W = R.w, m = 12, MM = E.MM;
    let ticks = '', nums = '';
    for (let i = 0; i <= 180; i++) {
      const x = (m + i * MM).toFixed(2), len = i % 10 === 0 ? 24 : i % 5 === 0 ? 16 : 9;
      ticks += `M${x} 0V${len}`;
      if (i % 10 === 0) nums += `<text x="${x}" y="40" text-anchor="middle">${i / 10}</text>`;
    }
    const div = html(`<div class="ruler" style="transform:translate(${R.cx}px,${R.cy}px) rotate(${R.a}rad) translate(${-L / 2}px,${-W / 2}px)">
      <svg width="${L}" height="${W}" viewBox="0 0 ${L} ${W}" font-family="system-ui,sans-serif" font-size="14" fill="#2b3245">
        <rect x="0" y="0" width="${L}" height="${W}" rx="6" fill="rgba(236,241,255,.78)" stroke="#5b6cff" stroke-width="1.5"/>
        <path d="${ticks}" stroke="#2b3245" stroke-width="1.1"/>${nums}
        <text x="${L - 8}" y="${W - 10}" text-anchor="end" font-size="12" fill="#5b6cff">cm</text>
        <text x="${L / 2}" y="${W - 10}" text-anchor="middle" font-size="15" font-weight="700" fill="#5b6cff">${E.rulerDeg()}°</text>
      </svg></div>`);
    pe.appendChild(div);
  },
  /** is (x,y) within reach of one of the ruler's long edges? → {side: -1 top / +1 bottom} */
  rulerEdgeAt(page, x, y) {
    const R = Editor.ruler;
    if (!R || !page || R.pageId !== page.id) return null;
    const c = Math.cos(R.a), s = Math.sin(R.a), dx = x - R.cx, dy = y - R.cy;
    const u = dx * c + dy * s, v = -dx * s + dy * c;
    if (Math.abs(u) > R.len / 2 + 8) return null;
    const dist = Math.abs(Math.abs(v) - R.w / 2);
    if (dist > 26) return null;
    return { side: v < 0 ? -1 : 1 };
  },
  startRulerDrag(e, hit, base) {
    const E = Editor;
    if (E.ruler.pageId !== hit.page.id) { E.ruler.pageId = hit.page.id; E.renderRuler(); }
    E.action = Object.assign(base, { type: 'ruler', lx: e.clientX, ly: e.clientY });
  },
  rulerDragMove(e) {
    const E = Editor, a = E.action, R = E.ruler;
    const page = E.page(R.pageId);
    R.cx = clamp(R.cx + (e.clientX - a.lx) / E.z, 0, PAGE_W);
    R.cy = clamp(R.cy + (e.clientY - a.ly) / E.z, 0, (page && page.h) || A4_H);
    a.lx = e.clientX; a.ly = e.clientY;
    E.placeRuler();
  },
  startRulerRotate() {
    const E = Editor, pts = [...E.touches.values()].slice(0, 2);
    E.action = { type: 'rulerRot', pointerType: 'touch', ang0: Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x), a0: E.ruler.a,
      mid0: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }, c0: { x: E.ruler.cx, y: E.ruler.cy } };
  },
  rulerRotateMove() {
    const E = Editor, a = E.action, R = E.ruler, pts = [...E.touches.values()].slice(0, 2);
    if (pts.length < 2) return;
    let ang = a.a0 + Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x) - a.ang0;
    const step = Math.PI / 4, snapped = Math.round(ang / step) * step;
    if (Math.abs(ang - snapped) < 2 * Math.PI / 180) ang = snapped;        // snap to 0°, 45°, 90° …
    R.a = ang;
    R.cx = a.c0.x + ((pts[0].x + pts[1].x) / 2 - a.mid0.x) / E.z;
    R.cy = a.c0.y + ((pts[0].y + pts[1].y) / 2 - a.mid0.y) / E.z;
    E.placeRuler();
  },
  placeRuler() {
    const E = Editor, R = E.ruler, d = $('.ruler', E.pagesEl);
    if (!d) return E.renderRuler();
    d.style.transform = `translate(${R.cx}px,${R.cy}px) rotate(${R.a}rad) translate(${-R.len / 2}px,${-R.w / 2}px)`;
    const deg = d.querySelectorAll('text'); deg[deg.length - 1].textContent = E.rulerDeg() + '°';
  },

  /* ============================================================ loupe */
  startLoupe(e, hit, base) {
    const E = Editor;
    const loupe = html('<div class="loupe"></div>');
    const clone = hit.pe.cloneNode(true);
    clone.querySelectorAll('.elui, .ruler, svg.ovl').forEach((n) => n.remove());
    clone.style.position = 'absolute'; clone.style.left = '0'; clone.style.top = '0'; clone.style.transformOrigin = '0 0';
    loupe.appendChild(clone);
    document.body.appendChild(loupe);
    E.action = Object.assign(base, { type: 'loupe', loupe, clone, page: hit.page, pe: hit.pe, rect: hit.rect, S: E.z * 2.5 });
    E.loupeMove(e);
  },
  loupeMove(e) {
    const E = Editor, a = E.action, R = 130;
    const px = (e.clientX - a.rect.left) / E.z, py = (e.clientY - a.rect.top) / E.z;
    a.clone.style.transform = `translate(${R - px * a.S}px,${R - py * a.S}px) scale(${a.S})`;
    let top = e.clientY - 2 * R - 40;
    if (top < 70) top = e.clientY + 40;
    a.loupe.style.left = clamp(e.clientX - R, 4, window.innerWidth - 2 * R - 4) + 'px';
    a.loupe.style.top = top + 'px';
  },
  endLoupe(a) { a.loupe.remove(); },
};
