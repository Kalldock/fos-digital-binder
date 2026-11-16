/* Full-screen tools: spreadsheet editor, function plotter, image cropper. */
'use strict';

function openPanel(markup) {
  const p = html(`<div class="panel">${markup}</div>`);
  document.body.appendChild(p);
  return p;
}

/* =================================================================== SPREADSHEET */
const SheetUI = {
  open(sheet) {
    return new Promise((resolve) => {
      const isNew = !sheet;
      const S = sheet || SheetEngine.newSheet(5, 4);
      S.merges = S.merges || [];
      let cur = { r: 0, c: 0 }, anchor = { r: 0, c: 0 }, rangeMode = false;
      const BG = ['', '#fff3b0', '#d6f5d6', '#d7e8ff', '#ffd9d9', '#eadcff', '#e9ecf3'];
      const p = openPanel(`
        <div class="topbar"><button class="ibtn" data-a="close">${icon('close')}</button><div class="title">Tabelle</div>
          <button class="btn primary" data-a="done">${icon('check')}${isNew ? 'Einfügen' : 'Übernehmen'}</button></div>
        <div class="sheet-tools">
          <button class="chip" data-a="addr" title="Zeile darunter einfügen">${icon('rowAdd')}Zeile</button>
          <button class="chip" data-a="delr" title="Zeile löschen">${icon('rowDel')}Zeile</button>
          <button class="chip" data-a="addc" title="Spalte rechts einfügen">${icon('colAdd')}Spalte</button>
          <button class="chip" data-a="delc" title="Spalte löschen">${icon('colDel')}Spalte</button>
          <div class="sep"></div>
          <button class="chip" data-a="range">${icon('grid')}Bereich wählen</button>
          <button class="chip" data-a="merge">${icon('merge')}Verbinden</button>
          <button class="chip" data-a="split">${icon('split')}Trennen</button>
          <div class="sep"></div>
          <button class="chip" data-a="bold">${icon('bold')}</button>
          ${BG.map((c) => `<button class="swatch" data-bg="${c}" style="width:26px;height:26px;background:${c || 'linear-gradient(135deg,#fff 45%,#d33 48% 52%,#fff 55%)'}"></button>`).join('')}
          <div class="sep"></div>
          <button class="chip" data-a="border"></button>
          <button class="chip" data-a="header">Kopfzeile</button>
          <button class="chip" data-a="sum">Σ Summe</button>
        </div>
        <div class="fbar"><div class="cellname">A1</div><input type="text" id="fx" placeholder="Wert oder Formel, z. B. =SUMME(A1:A4)" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
        <div class="hint">Formeln beginnen mit „=“: SUMME, MITTELWERT, MIN, MAX, ANZAHL, RUNDEN, + − * / ^ · Bezüge wie A1 oder Bereiche wie A1:B4 (Trenner „;“). Tippe beim Schreiben einer Formel auf Zellen, um ihren Bezug einzufügen.</div>
        <div class="grid-wrap"><table class="sheet-grid"></table></div>`);
      const grid = $('table', p), fx = $('#fx', p), cname = $('.cellname', p);
      const ov = { close: () => finish(null) };
      pushOverlay(ov);
      function finish(v) { p.remove(); popOverlay(ov); resolve(v); }

      const selRect = () => ({ r0: Math.min(cur.r, anchor.r), r1: Math.max(cur.r, anchor.r), c0: Math.min(cur.c, anchor.c), c1: Math.max(cur.c, anchor.c) });
      const mergeAt = (r, c) => S.merges.find((m) => r >= m.r && r < m.r + m.rs && c >= m.c && c < m.c + m.cs);

      function render() {
        const ev = SheetEngine.evaluator(S);
        const sr = selRect();
        const covered = new Set();
        S.merges.forEach((m) => { for (let r = m.r; r < m.r + m.rs; r++) for (let c = m.c; c < m.c + m.cs; c++) if (r !== m.r || c !== m.c) covered.add(r + ',' + c); });
        let h = '<tr><th class="rh"></th>';
        for (let c = 0; c < S.cols; c++) h += `<th class="${c >= sr.c0 && c <= sr.c1 ? 'sel' : ''}">${SheetEngine.colName(c)}</th>`;
        h += '</tr>';
        for (let r = 0; r < S.rows; r++) {
          h += `<tr><th class="rh ${r >= sr.r0 && r <= sr.r1 ? 'sel' : ''}">${r + 1}</th>`;
          for (let c = 0; c < S.cols; c++) {
            if (covered.has(r + ',' + c)) continue;
            const ref = SheetEngine.refName(r, c), cell = S.cells[ref] || {}, res = ev.get(ref);
            const m = S.merges.find((x) => x.r === r && x.c === c);
            const cls = [];
            if (res.e) cls.push('err'); else if (typeof res.v === 'number') cls.push('num');
            if (cell.b) cls.push('b');
            if (r >= sr.r0 && r <= sr.r1 && c >= sr.c0 && c <= sr.c1 && (sr.r0 !== sr.r1 || sr.c0 !== sr.c1)) cls.push('in-sel');
            if (r === cur.r && c === cur.c) cls.push('cur');
            const st = cell.bg ? ` style="background-color:${cell.bg}"` : '';
            h += `<td data-r="${r}" data-c="${c}"${m ? ` rowspan="${m.rs}" colspan="${m.cs}"` : ''} class="${cls.join(' ')}"${st}>${esc(SheetEngine.display(res))}</td>`;
          }
          h += '</tr>';
        }
        grid.innerHTML = h;
        const sr2 = selRect();
        cname.textContent = SheetEngine.refName(cur.r, cur.c) + (sr2.r0 !== sr2.r1 || sr2.c0 !== sr2.c1 ? ':' + SheetEngine.refName(sr2.r1, sr2.c1).replace(/^/, '') : '');
        if (sr2.r0 !== sr2.r1 || sr2.c0 !== sr2.c1) cname.textContent = SheetEngine.refName(sr2.r0, sr2.c0) + ':' + SheetEngine.refName(sr2.r1, sr2.c1);
        $('[data-a=border]', p).textContent = { all: 'Rahmen: alle Linien', outer: 'Rahmen: nur außen', inner: 'Rahmen: nur innen', none: 'Rahmen: ohne' }[S.border || 'all'];
        $('[data-a=header]', p).classList.toggle('on', !!S.header);
        $('[data-a=range]', p).classList.toggle('on', rangeMode);
      }
      function select(r, c, extend) {
        cur = { r: clamp(r, 0, S.rows - 1), c: clamp(c, 0, S.cols - 1) };
        const m = mergeAt(cur.r, cur.c);
        if (m) cur = { r: m.r, c: m.c };
        if (!extend) anchor = Object.assign({}, cur);
        const cell = S.cells[SheetEngine.refName(cur.r, cur.c)];
        fx.value = cell ? cell.v : '';
        render();
      }
      function setRaw(v) {
        const ref = SheetEngine.refName(cur.r, cur.c);
        const cell = S.cells[ref] || (S.cells[ref] = {});
        cell.v = v;
        if (!v && !cell.bg && !cell.b) delete S.cells[ref];
        render();
      }
      fx.addEventListener('input', () => setRaw(fx.value));
      fx.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); select(cur.r + 1 >= S.rows ? cur.r : cur.r + 1, cur.c); }
        else if (e.key === 'Tab') { e.preventDefault(); select(cur.r, cur.c + 1 >= S.cols ? cur.c : cur.c + 1); }
      });

      let drag = null;
      grid.addEventListener('pointerdown', (e) => {
        const td = e.target.closest('td');
        if (!td) return;
        const r = +td.dataset.r, c = +td.dataset.c;
        // insert reference while typing a formula
        if (document.activeElement === fx && fx.value.startsWith('=') && /[=(;,+\-*/^:]\s*$/.test(fx.value.slice(0, fx.selectionStart))) {
          e.preventDefault();
          const ref = SheetEngine.refName(r, c), pos = fx.selectionStart;
          fx.value = fx.value.slice(0, pos) + ref + fx.value.slice(fx.selectionEnd);
          fx.setSelectionRange(pos + ref.length, pos + ref.length);
          setRaw(fx.value);
          return;
        }
        if (rangeMode) { select(r, c, true); rangeMode = false; render(); return; }
        select(r, c, e.shiftKey);
        if (e.pointerType !== 'touch') { drag = true; try { grid.setPointerCapture(e.pointerId); } catch (x) { /* */ } }
      });
      grid.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const td = document.elementFromPoint(e.clientX, e.clientY);
        const cell = td && td.closest && td.closest('td');
        if (cell && grid.contains(cell)) { const r = +cell.dataset.r, c = +cell.dataset.c; if (r !== cur.r || c !== cur.c) { cur = { r, c }; render(); } }
      });
      grid.addEventListener('pointerup', () => {
        if (drag) { drag = null; const sr = selRect(); if (sr.r0 === sr.r1 && sr.c0 === sr.c1) fx.focus(); }
      });
      grid.addEventListener('click', (e) => { if (e.target.closest('td') && !rangeMode) { const sr = selRect(); if (sr.r0 === sr.r1 && sr.c0 === sr.c1) fx.focus(); } });

      const forSel = (fn) => { const sr = selRect(); for (let r = sr.r0; r <= sr.r1; r++) for (let c = sr.c0; c <= sr.c1; c++) fn(r, c, SheetEngine.refName(r, c)); };
      const act = {
        close: async () => { finish(null); },
        done: () => finish(S),
        addr: () => { SheetEngine.insertLine(S, 'r', cur.r + 1, 1); select(cur.r + 1, cur.c); },
        delr: () => { if (S.rows > 1) { SheetEngine.insertLine(S, 'r', cur.r, -1); select(Math.min(cur.r, S.rows - 1), cur.c); } },
        addc: () => { SheetEngine.insertLine(S, 'c', cur.c + 1, 1); select(cur.r, cur.c + 1); },
        delc: () => { if (S.cols > 1) { SheetEngine.insertLine(S, 'c', cur.c, -1); select(cur.r, Math.min(cur.c, S.cols - 1)); } },
        range: () => { rangeMode = !rangeMode; render(); if (rangeMode) toast('Tippe auf die letzte Zelle des Bereichs'); },
        merge: () => {
          const sr = selRect();
          if (sr.r0 === sr.r1 && sr.c0 === sr.c1) { toast('Erst einen Bereich wählen (Bereich wählen oder mit dem Stift ziehen)'); return; }
          S.merges = S.merges.filter((m) => m.r + m.rs <= sr.r0 || m.r > sr.r1 || m.c + m.cs <= sr.c0 || m.c > sr.c1);
          forSel((r, c, ref) => { if (r !== sr.r0 || c !== sr.c0) delete S.cells[ref]; });
          S.merges.push({ r: sr.r0, c: sr.c0, rs: sr.r1 - sr.r0 + 1, cs: sr.c1 - sr.c0 + 1 });
          select(sr.r0, sr.c0);
        },
        split: () => { const sr = selRect(); S.merges = S.merges.filter((m) => m.r + m.rs <= sr.r0 || m.r > sr.r1 || m.c + m.cs <= sr.c0 || m.c > sr.c1); render(); },
        bold: () => { let all = true; forSel((r, c, ref) => { if (!(S.cells[ref] && S.cells[ref].b)) all = false; }); forSel((r, c, ref) => { const cell = S.cells[ref] || (S.cells[ref] = { v: '' }); cell.b = !all; }); render(); },
        border: () => { const order = ['all', 'outer', 'inner', 'none']; S.border = order[(order.indexOf(S.border || 'all') + 1) % order.length]; render(); },
        header: () => { S.header = !S.header; render(); },
        sum: () => {
          // sum of the numbers above the current cell
          let r0 = cur.r - 1;
          while (r0 >= 0) { const v = SheetEngine.evaluator(S).get(SheetEngine.refName(r0, cur.c)); if (typeof v.v !== 'number') break; r0--; }
          if (r0 + 1 > cur.r - 1) { toast('Über der Zelle stehen keine Zahlen'); return; }
          const col = SheetEngine.colName(cur.c);
          fx.value = `=SUMME(${col}${r0 + 2}:${col}${cur.r})`;
          setRaw(fx.value);
        }
      };
      $$('[data-a]', p).forEach((b) => { if (act[b.dataset.a]) { b.onpointerdown = (e) => e.preventDefault(); b.onclick = act[b.dataset.a]; } });
      $$('[data-bg]', p).forEach((b) => { b.onpointerdown = (e) => e.preventDefault(); b.onclick = () => { forSel((r, c, ref) => { const cell = S.cells[ref] || (S.cells[ref] = { v: '' }); cell.bg = b.dataset.bg || undefined; }); render(); }; });
      select(0, 0);
    });
  }
};

/* =================================================================== FUNCTION PLOTTER */
const FN_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c', '#0891b2'];
const PlotUI = {
  open(cfg) {
    return new Promise((resolve) => {
      const fns = cfg && cfg.fns && cfg.fns.length ? cfg.fns : [{ expr: 'y = 2x + 3', color: FN_COLORS[0] }];
      let marks = cfg ? cfg.marks !== false : true;
      let curFn = 0, view = null;
      const elW = cfg && cfg.w ? cfg.w : 640, elH = cfg && cfg.h ? cfg.h : 480;
      const vt = { from: -3, to: 3, step: 1, withTable: false };
      const p = openPanel(`
        <div class="topbar"><button class="ibtn" data-a="close">${icon('close')}</button><div class="title">Funktionen & Graphen</div>
          <button class="btn tonal" data-a="table">${icon('table')}Wertetabelle einfügen</button>
          <button class="btn primary" data-a="insert">${icon('check')}${cfg ? 'Übernehmen' : 'Graph einfügen'}</button></div>
        <div class="panel-body plot"><div class="plot-side"></div><div class="plot-main"><div class="svgbox" style="position:absolute;inset:0"></div>
          <div class="plot-zoom"><button class="ibtn" data-z="out">${icon('zoomOut')}</button><button class="ibtn" data-z="in">${icon('zoomIn')}</button><button class="ibtn" data-z="reset" title="Standardansicht">${icon('target')}</button></div></div></div>`);
      const side = $('.plot-side', p), main = $('.plot-main', p), box = $('.svgbox', main);
      const ov = { close: () => finish(null) };
      pushOverlay(ov);
      function finish(v) { p.remove(); popOverlay(ov); window.removeEventListener('resize', draw); resolve(v); }

      function size() { return { w: main.clientWidth || 600, h: main.clientHeight || 400 }; }
      function defaultView() {
        const { w, h } = size(), ux = 20 / w;
        return { xmin: -10, xmax: 10, ymin: -ux * h / 2, ymax: ux * h / 2 };
      }
      function initView() {
        const { w, h } = size();
        if (cfg && cfg.view) {
          const v = cfg.view, cx = (v.xmin + v.xmax) / 2, cy = (v.ymin + v.ymax) / 2;
          const ux = (v.xmax - v.xmin) / elW, uy = (v.ymax - v.ymin) / elH;
          const k = Math.max((v.xmax - v.xmin) / (ux * w), (v.ymax - v.ymin) / (uy * h));
          view = { xmin: cx - ux * w * k / 2, xmax: cx + ux * w * k / 2, ymin: cy - uy * h * k / 2, ymax: cy + uy * h * k / 2 };
        } else view = defaultView();
      }
      function draw() {
        const { w, h } = size();
        if (!view) initView();
        // keep units when the panel is resized
        const ux = (view.xmax - view.xmin) / (draw.lw || w), uy = (view.ymax - view.ymin) / (draw.lh || h);
        const cx = (view.xmin + view.xmax) / 2, cy = (view.ymin + view.ymax) / 2;
        view = { xmin: cx - ux * w / 2, xmax: cx + ux * w / 2, ymin: cy - uy * h / 2, ymax: cy + uy * h / 2 };
        draw.lw = w; draw.lh = h;
        box.innerHTML = Render.graphSVG(fns, view, w, h, { marks, legend: false, fontSize: 13 });
      }
      function renderSide() {
        let s = '<div class="sec">Funktionen</div>';
        fns.forEach((f, i) => {
          let err = '';
          try { Expr.parse(f.expr); } catch (e) { err = e.message; }
          s += `<div class="fn-row ${i === curFn ? 'cur' : ''} ${err && f.expr.trim() ? 'err' : ''}" data-i="${i}">
            <label class="cdot" style="background:${f.color}"><input type="color" value="${f.color}"></label>
            <input type="text" value="${esc(f.expr)}" placeholder="z. B. y = x² − 4" autocomplete="off" autocapitalize="off" spellcheck="false">
            <button class="ibtn" data-act="vis">${icon(f.hidden ? 'eyeOff' : 'eye')}</button>
            <button class="ibtn" data-act="del">${icon('trash')}</button></div>${err && f.expr.trim() ? `<div class="fn-err">${esc(err)}</div>` : ''}`;
        });
        s += `<button class="btn small tonal" data-act="add">${icon('plus')}Funktion</button>
          <div class="sec">Beispiele</div><div class="ex-row">${['y = 2x + 3', 'y = -0,5x + 4', 'y = x²', 'y = (x - 2)² - 1', 'y = -x² + 4', 'y = 0,5x² + x - 4'].map((e) => `<button class="chip" data-ex="${esc(e)}">${esc(e.replace('y = ', ''))}</button>`).join('')}</div>
          <label style="display:flex;gap:8px;align-items:center;margin:14px 0 0"><input type="checkbox" id="mk" ${marks ? 'checked' : ''}> Nullstellen & Scheitelpunkt markieren</label>`;
        const f = fns[curFn];
        let a = null;
        try { if (f) a = Expr.analyze(Expr.parse(f.expr)); } catch (e) { a = null; }
        if (a) s += `<div class="sec">Analyse ${fns.length > 1 ? 'f' + (curFn ? curFn + 1 : '') + '(x)' : ''}</div><div class="ana">${a.rows.map(([k, v]) => `<div class="r"><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join('')}</div>`;
        s += `<div class="sec">Wertetabelle</div>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">von <input type="number" id="vf" value="${vt.from}" style="width:70px"> bis <input type="number" id="vtt" value="${vt.to}" style="width:70px"> Schritt <input type="number" id="vs" value="${vt.step}" step="0.5" style="width:70px"></div>
          <div id="vtab"></div>
          <label style="display:flex;gap:8px;align-items:center;margin:10px 0"><input type="checkbox" id="wt" ${vt.withTable ? 'checked' : ''}> Wertetabelle zusammen mit dem Graph einfügen</label>`;
        side.innerHTML = s;
        renderVT();
        $$('.fn-row', side).forEach((row) => {
          const i = +row.dataset.i, inp = $('input[type=text]', row);
          inp.addEventListener('focus', () => { if (curFn !== i) { curFn = i; $$('.fn-row', side).forEach((r) => r.classList.toggle('cur', r === row)); } });
          inp.addEventListener('input', () => { fns[i].expr = inp.value; draw(); updateLater(i); });
          inp.addEventListener('change', () => { curFn = i; renderSide(); });
          $('input[type=color]', row).addEventListener('input', (e) => { fns[i].color = e.target.value; $('.cdot', row).style.background = e.target.value; draw(); });
          $('[data-act=vis]', row).onclick = () => { fns[i].hidden = !fns[i].hidden; renderSide(); draw(); };
          $('[data-act=del]', row).onclick = () => { fns.splice(i, 1); if (!fns.length) fns.push({ expr: '', color: FN_COLORS[0] }); curFn = Math.min(curFn, fns.length - 1); renderSide(); draw(); };
        });
        $('[data-act=add]', side).onclick = () => { fns.push({ expr: '', color: FN_COLORS[fns.length % FN_COLORS.length] }); curFn = fns.length - 1; renderSide(); draw(); $$('.fn-row input[type=text]', side)[curFn].focus(); };
        $$('[data-ex]', side).forEach((b) => b.onclick = () => {
          const f2 = fns[curFn];
          if (f2 && !f2.expr.trim()) f2.expr = b.dataset.ex; else { fns.push({ expr: b.dataset.ex, color: FN_COLORS[fns.length % FN_COLORS.length] }); curFn = fns.length - 1; }
          renderSide(); draw();
        });
        $('#mk', side).onchange = (e) => { marks = e.target.checked; draw(); };
        $('#wt', side).onchange = (e) => { vt.withTable = e.target.checked; };
        ['vf', 'vtt', 'vs'].forEach((id) => $('#' + id, side).addEventListener('input', () => {
          vt.from = parseFloat($('#vf', side).value.replace(',', '.')); vt.to = parseFloat($('#vtt', side).value.replace(',', '.')); vt.step = parseFloat($('#vs', side).value.replace(',', '.'));
          renderVT();
        }));
      }
      const updateLater = debounce((i) => {
        const row = side.querySelector(`.fn-row[data-i="${i}"]`);
        if (!row || !document.activeElement || !row.contains(document.activeElement)) return;
        // refresh analysis + table without destroying the focused input
        const caret = document.activeElement.selectionStart;
        renderSide();
        const inp = $$('.fn-row input[type=text]', side)[i];
        if (inp) { inp.focus(); try { inp.setSelectionRange(caret, caret); } catch (e) { /* */ } }
      }, 700);

      function tableRows() {
        const valid = fns.map((f, i) => { try { return { f: Expr.parse(f.expr), i }; } catch (e) { return null; } }).filter((x) => x && !fns[x.i].hidden);
        if (!valid.length || !(vt.step > 0) || !(vt.to >= vt.from)) return null;
        const xs = Expr.valueTable(() => 0, vt.from, vt.to, vt.step).map((r) => r[0]);
        return { valid, xs };
      }
      const lbl = (i) => 'f' + (i ? i + 1 : '') + '(x)';
      function renderVT() {
        const el = $('#vtab', side);
        const t = tableRows();
        if (!t) { el.innerHTML = '<p class="muted" style="font-size:13px">Gültige Funktion und Bereich eingeben.</p>'; return; }
        if (t.xs.length > 60) { el.innerHTML = '<p class="muted" style="font-size:13px">Höchstens 60 Werte – Schritt vergrößern.</p>'; return; }
        el.innerHTML = `<table class="vt"><tr><th>x</th>${t.valid.map((v) => `<th style="color:${fns[v.i].color}">${lbl(v.i)}</th>`).join('')}</tr>${t.xs.map((x) => `<tr><td>${Expr.fmt(x)}</td>${t.valid.map((v) => `<td>${Expr.fmt(v.f(x))}</td>`).join('')}</tr>`).join('')}</table>`;
      }
      function buildSheet() {
        const t = tableRows();
        if (!t || t.xs.length > 60) return null;
        const S = SheetEngine.newSheet(t.valid.length + 1, t.xs.length + 1);
        const put = (r, c, v) => { S.cells[SheetEngine.refName(r, c)] = { v: String(v) }; };
        put(0, 0, 'x');
        t.xs.forEach((x, j) => put(0, j + 1, Expr.fmt(x).replace(/\./g, '')));
        t.valid.forEach((v, k) => {
          put(k + 1, 0, lbl(v.i));
          t.xs.forEach((x, j) => { const y = v.f(x); put(k + 1, j + 1, Number.isFinite(y) ? Expr.fmt(y).replace(/\./g, '') : '–'); });
        });
        S.header = false;
        for (let r = 0; r <= t.valid.length; r++) S.cells[SheetEngine.refName(r, 0)].b = true;
        S.cells[SheetEngine.refName(0, 0)].bg = '#e9ecf3';
        for (let r = 1; r <= t.valid.length; r++) S.cells[SheetEngine.refName(r, 0)].bg = '#e9ecf3';
        for (let j = 1; j <= t.xs.length; j++) S.cells[SheetEngine.refName(0, j)].bg = '#e9ecf3';
        return S;
      }
      function graphResult() {
        const used = fns.filter((f) => { try { Expr.parse(f.expr); return true; } catch (e) { return false; } });
        if (!used.length) { toast('Bitte zuerst eine gültige Funktion eingeben'); return null; }
        const { w, h } = size();
        const ux = (view.xmax - view.xmin) / w, uy = (view.ymax - view.ymin) / h;
        const cx = (view.xmin + view.xmax) / 2, cy = (view.ymin + view.ymax) / 2;
        const k = Math.min(w / elW, h / elH);
        return { fns: used, marks, w: elW, h: elH, view: { xmin: cx - ux * elW * k / 2, xmax: cx + ux * elW * k / 2, ymin: cy - uy * elH * k / 2, ymax: cy + uy * elH * k / 2 } };
      }
      $('[data-a=close]', p).onclick = () => finish(null);
      $('[data-a=insert]', p).onclick = () => {
        const g = graphResult();
        if (!g) return;
        let table = null;
        if (vt.withTable) { table = buildSheet(); if (!table) { toast('Wertetabelle ungültig (max. 60 Werte)'); return; } }
        finish({ graph: g, table });
      };
      $('[data-a=table]', p).onclick = () => {
        const t = buildSheet();
        if (!t) { toast('Wertetabelle ungültig (max. 60 Werte)'); return; }
        finish({ table: t });
      };

      // pan / zoom on the plot
      const ptrs = new Map();
      let g0 = null;
      const zoom = (f, cx, cy) => {
        const r = main.getBoundingClientRect(), { w, h } = size();
        const px = view.xmin + ((cx - r.left) / w) * (view.xmax - view.xmin), py = view.ymax - ((cy - r.top) / h) * (view.ymax - view.ymin);
        view = { xmin: px + (view.xmin - px) / f, xmax: px + (view.xmax - px) / f, ymin: py + (view.ymin - py) / f, ymax: py + (view.ymax - py) / f };
        draw();
      };
      main.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.plot-zoom')) return;
        main.setPointerCapture(e.pointerId);
        ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
        g0 = { view: Object.assign({}, view), pts: [...ptrs.values()].map((q) => Object.assign({}, q)) };
      });
      main.addEventListener('pointermove', (e) => {
        if (!ptrs.has(e.pointerId) || !g0) return;
        ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const pts = [...ptrs.values()], { w, h } = size(), v = g0.view;
        const ux = (v.xmax - v.xmin) / w, uy = (v.ymax - v.ymin) / h;
        if (pts.length === 1 && g0.pts.length === 1) {
          const dx = (pts[0].x - g0.pts[0].x) * ux, dy = (pts[0].y - g0.pts[0].y) * uy;
          view = { xmin: v.xmin - dx, xmax: v.xmax - dx, ymin: v.ymin + dy, ymax: v.ymax + dy };
        } else if (pts.length >= 2 && g0.pts.length >= 2) {
          const d0 = Math.hypot(g0.pts[0].x - g0.pts[1].x, g0.pts[0].y - g0.pts[1].y) || 1;
          const d1 = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          const f = d1 / d0, r = main.getBoundingClientRect();
          const m0 = { x: (g0.pts[0].x + g0.pts[1].x) / 2 - r.left, y: (g0.pts[0].y + g0.pts[1].y) / 2 - r.top };
          const m1 = { x: (pts[0].x + pts[1].x) / 2 - r.left, y: (pts[0].y + pts[1].y) / 2 - r.top };
          const px = v.xmin + m0.x * ux, py = v.ymax - m0.y * uy;
          const nux = ux / f, nuy = uy / f;
          view = { xmin: px - m1.x * nux, xmax: px - m1.x * nux + w * nux, ymax: py + m1.y * nuy, ymin: py + m1.y * nuy - h * nuy };
        }
        draw();
      });
      const up = (e) => { ptrs.delete(e.pointerId); g0 = ptrs.size ? { view: Object.assign({}, view), pts: [...ptrs.values()].map((q) => Object.assign({}, q)) } : null; };
      main.addEventListener('pointerup', up);
      main.addEventListener('pointercancel', up);
      main.addEventListener('wheel', (e) => { e.preventDefault(); zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY); }, { passive: false });
      $$('[data-z]', p).forEach((b) => b.onclick = () => {
        const r = main.getBoundingClientRect();
        if (b.dataset.z === 'reset') { view = defaultView(); draw(); }
        else zoom(b.dataset.z === 'in' ? 1.4 : 1 / 1.4, r.left + r.width / 2, r.top + r.height / 2);
      });
      window.addEventListener('resize', draw);
      renderSide();
      requestAnimationFrame(() => { initView(); draw(); });
    });
  }
};

/* =================================================================== IMAGE CROP */
const CropUI = {
  open(src) {
    return new Promise((resolve) => {
      const p = openPanel(`<div class="topbar"><button class="ibtn" data-a="close">${icon('close')}</button><div class="title">Bild zuschneiden</div>
        <button class="btn tonal" data-a="reset">Zurücksetzen</button><button class="btn primary" data-a="ok">${icon('check')}Zuschneiden</button></div>
        <div class="crop-area"><img src="${src}" alt=""><div class="crop-rect"><i class="tl"></i><i class="tr"></i><i class="bl"></i><i class="br"></i></div></div>`);
      const area = $('.crop-area', p), img = $('img', p), rect = $('.crop-rect', p);
      const ov = { close: () => finish(null) };
      pushOverlay(ov);
      function finish(v) { p.remove(); popOverlay(ov); resolve(v); }
      let c = { x0: 0, y0: 0, x1: 1, y1: 1 };
      const place = () => {
        const ir = img.getBoundingClientRect(), ar = area.getBoundingClientRect();
        Object.assign(rect.style, { left: ir.left - ar.left + c.x0 * ir.width + 'px', top: ir.top - ar.top + c.y0 * ir.height + 'px', width: (c.x1 - c.x0) * ir.width + 'px', height: (c.y1 - c.y0) * ir.height + 'px' });
      };
      img.onload = place;
      if (img.complete) requestAnimationFrame(place);
      let drag = null;
      area.addEventListener('pointerdown', (e) => {
        const ir = img.getBoundingClientRect();
        const fx = (e.clientX - ir.left) / ir.width, fy = (e.clientY - ir.top) / ir.height;
        const h = e.target.tagName === 'I' ? e.target.className : (e.target === rect ? 'move' : null);
        if (!h) return;
        area.setPointerCapture(e.pointerId);
        drag = { h, fx, fy, c0: Object.assign({}, c) };
      });
      area.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const ir = img.getBoundingClientRect();
        const dx = (e.clientX - ir.left) / ir.width - drag.fx, dy = (e.clientY - ir.top) / ir.height - drag.fy, o = drag.c0, m = 0.04;
        if (drag.h === 'move') {
          const w = o.x1 - o.x0, hh = o.y1 - o.y0;
          const x0 = clamp(o.x0 + dx, 0, 1 - w), y0 = clamp(o.y0 + dy, 0, 1 - hh);
          c = { x0, y0, x1: x0 + w, y1: y0 + hh };
        } else {
          c = Object.assign({}, o);
          if (drag.h.includes('l')) c.x0 = clamp(o.x0 + dx, 0, o.x1 - m);
          if (drag.h.includes('r')) c.x1 = clamp(o.x1 + dx, o.x0 + m, 1);
          if (drag.h.includes('t')) c.y0 = clamp(o.y0 + dy, 0, o.y1 - m);
          if (drag.h.includes('b')) c.y1 = clamp(o.y1 + dy, o.y0 + m, 1);
        }
        place();
      });
      area.addEventListener('pointerup', () => { drag = null; });
      window.addEventListener('resize', place);
      $('[data-a=close]', p).onclick = () => finish(null);
      $('[data-a=reset]', p).onclick = () => { c = { x0: 0, y0: 0, x1: 1, y1: 1 }; place(); };
      $('[data-a=ok]', p).onclick = () => {
        const W = img.naturalWidth, H = img.naturalHeight;
        const sx = Math.round(c.x0 * W), sy = Math.round(c.y0 * H), sw = Math.max(1, Math.round((c.x1 - c.x0) * W)), sh = Math.max(1, Math.round((c.y1 - c.y0) * H));
        const cv = document.createElement('canvas');
        cv.width = sw; cv.height = sh;
        const g = cv.getContext('2d');
        const png = src.startsWith('data:image/png');
        if (!png) { g.fillStyle = '#fff'; g.fillRect(0, 0, sw, sh); }
        g.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        finish({ src: png ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.88), w: sw, h: sh });
      };
    });
  }
};


/* =================================================================== MATH TRAINER (learns the user's own digits) */
const MathTrainer = {
  SYMS: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '+', '-', '×', '(', ')', '/'],
  open() {
    const SY = MathTrainer.SYMS, REP = 2;
    const data = JSON.parse(JSON.stringify(App.settings.mathT || {}));
    const fresh = {};
    let idx = 0, rep = 0, strokes = [], cur = null, timer = null;
    const label = (s) => ({ '-': '−', '×': '× (mal)', '/': '/ (geteilt)' }[s] || s);
    const p = openPanel(`
      <div class="topbar"><button class="ibtn" data-a="close">${icon('close')}</button><div class="title">Rechenhilfe trainieren<small>Schreib jedes Zeichen so, wie du es im Heft schreibst</small></div>
        <button class="btn" data-a="reset">Training löschen</button><button class="btn primary" data-a="done">${icon('check')}Fertig</button></div>
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:16px">
        <div style="font-size:15px" class="muted" id="mt-prog"></div>
        <div style="display:flex;align-items:center;gap:28px;flex-wrap:wrap;justify-content:center">
          <div style="text-align:center"><div class="muted" style="font-size:13px">Schreibe:</div><div id="mt-sym" style="font-size:110px;font-weight:300;line-height:1;min-width:120px"></div></div>
          <svg id="mt-pad" width="320" height="320" style="background:#fff;border-radius:18px;touch-action:none;box-shadow:var(--shadow)"><line x1="0" y1="250" x2="320" y2="250" stroke="#c4d3ea" stroke-width="2"/><g id="mt-ink" fill="none" stroke="#1b1d24" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"></g></svg>
        </div>
        <div style="display:flex;gap:10px"><button class="btn" data-a="undo">${icon('undo')}Nochmal</button><button class="btn" data-a="skip">Überspringen</button><button class="btn tonal" data-a="next">Weiter${icon('chevronRight')}</button></div>
        <p class="muted" style="font-size:13px;max-width:520px;text-align:center">Nach dem Schreiben geht es automatisch weiter. Groß und mittig schreiben, auf der Linie. Die App vergleicht später deine Aufgaben mit diesen Beispielen.</p>
      </div>`);
    const pad = $('#mt-pad', p), ink = $('#mt-ink', p);
    const ov = { close: () => finish(false) };
    pushOverlay(ov);
    function show() {
      if (idx >= SY.length) return finish(true);
      $('#mt-sym', p).textContent = label(SY[idx]);
      $('#mt-prog', p).textContent = `Zeichen ${idx + 1} von ${SY.length} · ${rep + 1}. Mal von ${REP}`;
      ink.innerHTML = ''; strokes = [];
    }
    function commit() {
      clearTimeout(timer);
      if (!strokes.length) return;
      (fresh[SY[idx]] = fresh[SY[idx]] || []).push(strokes.map((s) => s.map((v) => Math.round(v * 10) / 10)));
      rep++;
      if (rep >= REP) { rep = 0; idx++; }
      show();
    }
    function finish(save) {
      clearTimeout(timer);
      if (save || Object.keys(fresh).length) {
        for (const [k, v] of Object.entries(fresh)) data[k] = v.concat(data[k] || []).slice(0, 4);
        App.settings.mathT = data; App.saveIndex.flush(); MathInk.reset();
        if (Object.keys(fresh).length) toast('Gespeichert – die Rechenhilfe kennt jetzt deine Schrift ✓');
      }
      p.remove(); popOverlay(ov);
    }
    pad.addEventListener('pointerdown', (e) => {
      clearTimeout(timer);
      pad.setPointerCapture(e.pointerId);
      const r = pad.getBoundingClientRect();
      cur = [e.clientX - r.left, e.clientY - r.top];
      strokes.push(cur);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      ink.appendChild(path); cur.el = path;
    });
    pad.addEventListener('pointermove', (e) => {
      if (!cur) return;
      const r = pad.getBoundingClientRect();
      cur.push(e.clientX - r.left, e.clientY - r.top);
      const pts = []; for (let i = 0; i < cur.length; i += 2) pts.push(cur[i] + ',' + cur[i + 1]);
      cur.el.setAttribute('points', pts.join(' '));
    });
    const up = () => { if (!cur) return; cur = null; timer = setTimeout(commit, 900); };
    pad.addEventListener('pointerup', up); pad.addEventListener('pointercancel', up);
    $('[data-a=close]', p).onclick = () => finish(false);
    $('[data-a=done]', p).onclick = () => finish(true);
    $('[data-a=next]', p).onclick = () => commit();
    $('[data-a=undo]', p).onclick = () => { clearTimeout(timer); ink.innerHTML = ''; strokes = []; };
    $('[data-a=skip]', p).onclick = () => { clearTimeout(timer); rep = 0; idx++; show(); };
    $('[data-a=reset]', p).onclick = async () => {
      if (!(await confirm2('Training löschen?', 'Deine gelernten Ziffern werden entfernt. Die Rechenhilfe nutzt dann nur die eingebauten Vorlagen.', 'Löschen'))) return;
      for (const k of Object.keys(data)) delete data[k];
      for (const k of Object.keys(fresh)) delete fresh[k];
      App.settings.mathT = null; App.saveIndex.flush(); MathInk.reset(); idx = 0; rep = 0; show();
    };
    show();
  }
};
