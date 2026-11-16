/* Schwebender wissenschaftlicher Taschenrechner (Pop-up über der Notizseite).
 * Tabs: Rechner · Brüche · Tabelle · Gleichung · Graph · Verlauf. Zustand + Verlauf in calc.json. */
const FloatCalc = (() => {
  const C = CalcEngine;
  const FILE = 'calc.json';
  const MAXH = 200;
  const TABS = [['calc', 'Rechner'], ['frac', 'Brüche'], ['table', 'Tabelle'], ['eq', 'Gleichung'], ['graph', 'Graph'], ['hist', 'Verlauf'], ['beam', 'Träger ↗']];
  const GCOL = ['#3d6fe0', '#e0503d', '#1f9d63', '#c0702a', '#8a4fd8', '#0f9f94'];

  let S = null;          // persisted state
  let root = null, body = null;
  let active = false;    // physical keyboard goes to the calculator
  const ed = { calc: { tok: [], cur: 0 }, frac: { tok: [], cur: 0 } };
  const res = { calc: null, frac: null }; // last evaluation per tab {value, err, done, view}

  /* ------------------------------------------------------------ state */
  function defaults() {
    return {
      v: 1, win: null, min: false, ext: true, tab: 'calc', deg: true, hist: [],
      tbl: { f: '2x + 3', a: '-2', b: '2', h: '1', dec: 4, sort: null, edits: {} },
      eq: { mode: 'solve', src: 'x² - 5x + 6 = 0', fx: 'x² - 4', x0: '2', lo: '-100', hi: '100' },
      graph: { fns: [{ expr: 'x² - 4', color: GCOL[0] }], marks: true, view: null },
      ans: null, edCalc: null, edFrac: null
    };
  }
  function load() {
    if (S) return;
    const d = defaults();
    let s = null;
    try { s = Store.read(FILE); } catch (e) { s = null; }
    S = Object.assign(d, s || {});
    for (const k of ['tbl', 'eq', 'graph']) S[k] = Object.assign(d[k], (s && s[k]) || {});
    if (!Array.isArray(S.hist)) S.hist = [];
    if (S.edCalc) ed.calc = { tok: S.edCalc, cur: S.edCalc.length };
    if (S.edFrac) ed.frac = { tok: S.edFrac, cur: S.edFrac.length };
  }
  const save = debounce(() => {
    if (!S) return;
    S.edCalc = ed.calc.tok; S.edFrac = ed.frac.tok;
    Store.write(FILE, S);
  }, 400);
  const env = () => ({ deg: S.deg, ans: S.ans ? C.deserialize(S.ans) : null });

  /* ------------------------------------------------------------ window */
  function vp() { return { w: window.innerWidth, h: window.innerHeight }; }
  function defWin() {
    const { w, h } = vp();
    const ww = Math.min(440, w - 24), hh = Math.min(660, h - 90);
    return { x: w - ww - 14, y: Math.min(70, h - hh - 8), w: ww, h: hh };
  }
  function clampWin() {
    const { w, h } = vp(), W = S.win;
    const minW = Math.min(300, w - 8), minH = Math.min(340, h - 8);
    W.w = clamp(W.w, minW, w - 8); W.h = clamp(W.h, minH, h - 8);
    const ww = S.min ? (root ? root.offsetWidth : 260) : W.w, hh = S.min ? 52 : W.h;
    W.x = clamp(W.x, 4, Math.max(4, w - ww - 4)); W.y = clamp(W.y, 4, Math.max(4, h - hh - 4));
  }
  function place() {
    if (!root) return;
    clampWin();
    const W = S.win;
    root.style.left = W.x + 'px'; root.style.top = W.y + 'px';
    if (S.min) { root.style.width = ''; root.style.height = ''; }
    else { root.style.width = W.w + 'px'; root.style.height = W.h + 'px'; }
  }
  function isOpen() { return !!root; }
  function open(tab) {
    load();
    if (!S.win) S.win = defWin();
    if (tab) S.tab = tab;
    if (!root) build();
    S.min = false;
    root.classList.remove('min');
    place(); render(); syncButtons();
    active = true;
    save();
  }
  function close() {
    if (!root) return;
    root.remove(); root = null; body = null;
    syncButtons(); save();
  }
  function toggle() { if (root) close(); else open(); }
  function syncButtons() { $$('[data-a=fcalc]').forEach((b) => b.classList.toggle('on', !!root)); }
  function setMin(m) {
    S.min = m;
    root.classList.toggle('min', m);
    if (m) {
      const r = res.calc && res.calc.value != null ? C.describe(res.calc.value).dec : '';
      $('.fc-minres', root).textContent = r ? '= ' + r : '';
      // keep the minimized pill near the old window's top right corner
      S.win.x = S.win.x + S.win.w - 280;
    } else S.win.x = S.win.x - S.win.w + 280;
    place(); if (!m) render(); save();
  }

  function build() {
    root = html(`<div class="fc" id="fcalc" role="dialog" aria-label="Taschenrechner">
      <div class="fc-head">
        <span class="fc-grip">${icon('calc')}</span><b class="fc-title">Rechner</b>
        <button class="fc-deg" data-a="deg" title="Winkelmodus umschalten"></button>
        <span class="fc-minres"></span>
        <span class="fc-sp"></span>
        <button class="ibtn sm" data-a="ext" title="Kompakt / Erweitert"></button>
        <button class="ibtn sm" data-a="min" title="Minimieren">${icon('minus')}</button>
        <button class="ibtn sm" data-a="close" title="Schließen">${icon('close')}</button>
      </div>
      <div class="fc-tabs">${TABS.map(([k, n]) => `<button data-tab="${k}">${n}</button>`).join('')}</div>
      <div class="fc-body"></div>
      <div class="fc-rs" title="Größe ändern"></div>
    </div>`);
    document.body.appendChild(root);
    body = $('.fc-body', root);
    $('[data-a=close]', root).onclick = close;
    $('[data-a=min]', root).onclick = () => setMin(!S.min);
    $('[data-a=ext]', root).onclick = () => { S.ext = !S.ext; render(); save(); };
    $('[data-a=deg]', root).onclick = () => { S.deg = !S.deg; render(); save(); toast(S.deg ? 'Winkelmodus: Grad (DEG)' : 'Winkelmodus: Bogenmaß (RAD)', 1600); };
    $$('[data-tab]', root).forEach((b) => b.onclick = () => {
      if (b.dataset.tab === 'beam') { openBeam(); return; }
      S.tab = b.dataset.tab; render(); save();
    });
    $('.fc-minres', root).onclick = () => { if (S.min) setMin(false); };
    dragHandle($('.fc-head', root), (dx, dy, st) => { S.win.x = st.x + dx; S.win.y = st.y + dy; place(); }, () => ({ x: S.win.x, y: S.win.y }));
    dragHandle($('.fc-rs', root), (dx, dy, st) => { S.win.w = st.w + dx; S.win.h = st.h + dy; place(); }, () => ({ w: S.win.w, h: S.win.h }), () => render());
  }
  function dragHandle(el, move, start, end) {
    let st = null, id = null, x0 = 0, y0 = 0, moved = false;
    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button') && el.classList.contains('fc-head')) return;
      id = e.pointerId; x0 = e.clientX; y0 = e.clientY; st = start(); moved = false;
      el.setPointerCapture(id);
      e.preventDefault();
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id || !st) return;
      const dx = e.clientX - x0, dy = e.clientY - y0;
      if (!moved && Math.hypot(dx, dy) < 3) return;
      moved = true;
      move(dx, dy, st);
    });
    const up = (e) => {
      if (e.pointerId !== id) return;
      st = null; id = null;
      if (moved) { save(); if (end) end(); }
      else if (S.min && el.classList.contains('fc-head') && !e.target.closest('button')) setMin(false);
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  /* ------------------------------------------------------------ render */
  function render() {
    if (!root) return;
    $('[data-a=deg]', root).textContent = S.deg ? 'DEG' : 'RAD';
    $('[data-a=deg]', root).classList.toggle('rad', !S.deg);
    $('[data-a=ext]', root).innerHTML = icon(S.ext ? 'collapse' : 'expand');
    $('[data-a=ext]', root).style.visibility = S.tab === 'calc' || S.tab === 'frac' ? '' : 'hidden';
    $$('[data-tab]', root).forEach((b) => b.classList.toggle('on', b.dataset.tab === S.tab));
    root.dataset.tab = S.tab;
    ({ calc: renderCalc, frac: renderCalc, table: renderTable, eq: renderEq, graph: renderGraph, hist: renderHist }[S.tab])();
  }

  /* ============================================================ token editor (Rechner + Brüche) */
  const T = (d, s) => [d, s === undefined ? d : s];
  const KEY = {
    '÷': T('÷', '/'), '×': T('×', '*'), '−': T('−', '-'), '+': T('+'), '(': T('('), ')': T(')'), '%': T('%'),
    'x²': T('²'), 'x³': T('³'), 'xʸ': T('^'), 'x⁻¹': T('⁻¹'), '√': T('√('), '∛': T('∛('), 'ⁿ√': T('ⁿ√(', 'root('),
    'sin': T('sin('), 'cos': T('cos('), 'tan': T('tan('), 'sin⁻¹': T('sin⁻¹(', 'asin('), 'cos⁻¹': T('cos⁻¹(', 'acos('), 'tan⁻¹': T('tan⁻¹(', 'atan('),
    'sinh': T('sinh('), 'cosh': T('cosh('), 'tanh': T('tanh('), 'ln': T('ln('), 'log': T('log('), 'logₐ': T('logₐ(', 'log('),
    'eˣ': T('e^('), '10ˣ': T('10^('), 'n!': T('!'), '|x|': T('|x|(', 'abs('), 'rnd': T('rnd(', 'round('), '⌊x⌋': T('⌊(', 'floor('), '⌈x⌉': T('⌈(', 'ceil('),
    'mod': T(' mod ', 'mod'), '°': T('°'), 'π': T('π'), 'e': T('e'), 'Ans': T('Ans'), 'ᴇ': T('ᴇ', 'E'), ';': T(';'),
    'Bruch': T('/', '/'), 'a b/c': T('‿', '_')
  };
  const HINT = { 'ⁿ√': 'ⁿ√(n;x) – z. B. ⁿ√(4;81) = 3', 'logₐ': 'logₐ(Basis;Zahl) – z. B. logₐ(2;8) = 3', 'rnd': 'rnd(x;Stellen) – z. B. rnd(2,345;2) = 2,35', 'mod': 'a mod b = Rest der Division', ';': 'Trennt Werte: ⁿ√(3;8), logₐ(2;8), rnd(x;2)', 'ᴇ': 'Zehnerpotenz: 1,5ᴇ3 = 1500', 'a b/c': 'Gemischte Zahl: 1 ‿ 1/4 = 1¼' };
  const COMPACT = [
    ['AC', '⌫', '(', ')', '÷'],
    ['x²', '7', '8', '9', '×'],
    ['√', '4', '5', '6', '−'],
    ['xʸ', '1', '2', '3', '+'],
    ['x⁻¹', '0', ',', '±', '=']
  ];
  const SCI = [
    ['sin', 'cos', 'tan', 'ln', 'log', 'logₐ'],
    ['sin⁻¹', 'cos⁻¹', 'tan⁻¹', 'eˣ', '10ˣ', 'ⁿ√'],
    ['sinh', 'cosh', 'tanh', '∛', 'n!', '|x|'],
    ['π', 'e', '%', 'mod', 'rnd', '⌊x⌋'],
    ['x³', 'ᴇ', ';', '°', 'Ans', '⌈x⌉']
  ];
  const FRAC_SCI = [
    ['Bruch', 'a b/c', 'xʸ', '%', 'π', 'Ans']
  ];
  const isNum = (s) => /^[0-9,.]$/.test(s);
  const OPS = new Set(['+', '-', '*', '/', '^', '²', '³', '⁻¹', '%', '!', '°', 'mod', ';', '_', ')']);

  function edOf() { return ed[S.tab === 'frac' ? 'frac' : 'calc']; }
  function resOf() { return S.tab === 'frac' ? 'frac' : 'calc'; }
  const src = (e) => e.tok.map((t) => t[1]).join('');
  const disp = (t) => t[0];

  function press(k) {
    const E = edOf(), R = res[resOf()];
    if (k === '=') return evaluate(true);
    if (k === 'AC') { E.tok = []; E.cur = 0; res[resOf()] = null; return update(); }
    if (k === '⌫') {
      if (R) { R.done = false; R.failed = false; }
      if (E.cur > 0) { E.tok.splice(E.cur - 1, 1); E.cur--; }
      return update();
    }
    if (k === '◀') { E.cur = Math.max(0, E.cur - 1); return update(true); }
    if (k === '▶') { E.cur = Math.min(E.tok.length, E.cur + 1); return update(true); }
    if (k === '±') return toggleSign();
    if (k === 'S⇔D') return cycleView();
    let t = KEY[k] || (k.length === 1 ? T(k === '.' ? ',' : k, k === '.' ? ',' : k) : null);
    if (!t) return;
    // after "=": operator continues with Ans, anything else starts fresh
    if (R && R.done) {
      R.done = false;
      if (OPS.has(t[1]) && t[1] !== ')' && t[1] !== '_') { E.tok = [KEY.Ans.slice()]; E.cur = 1; }
      else { E.tok = []; E.cur = 0; }
    } else if (R && R.failed) {
      // after an error: a new number/function starts over, an operator keeps editing
      R.failed = false;
      if (!OPS.has(t[1])) { E.tok = []; E.cur = 0; }
    }
    E.tok.splice(E.cur, 0, t.slice());
    E.cur++;
    if (HINT[k] && !press.hinted[k]) { press.hinted[k] = 1; toast(HINT[k], 2600); }
    update();
  }
  press.hinted = {};
  function toggleSign() {
    const E = edOf();
    let i = E.cur;
    while (i > 0 && isNum(E.tok[i - 1][1])) i--;
    if (i === E.cur) { E.tok.splice(E.cur, 0, ['−', '-']); E.cur++; return update(); }
    const prev = E.tok[i - 1], before = E.tok[i - 2];
    const unary = prev && prev[1] === '-' && (!before || OPS.has(before[1]) && before[1] !== ')' || before[1].endsWith('('));
    if (unary) { E.tok.splice(i - 1, 1); E.cur--; }
    else { E.tok.splice(i, 0, ['−', '-']); E.cur++; }
    update();
  }
  function cycleView() {
    const key = resOf(), R = res[key];
    if (!R || R.value == null) return;
    const d = C.describe(R.value);
    const opts = ['dec'];
    if (d.frac || d.fracApprox) opts.unshift('frac');
    if (d.mixed) opts.splice(1, 0, 'mixed');
    if (!d.isInt || d.text.length > 8) opts.push('sci');
    const cur = R.view || autoView(key, d);
    R.view = opts[(opts.indexOf(cur) + 1) % opts.length];
    showResult();
  }
  function autoView(key, d) {
    if (key === 'frac') return d.frac ? (d.mixed ? 'frac' : 'frac') : d.fracApprox ? 'frac' : 'dec';
    const s = src(ed.calc);
    if (d.frac && /\/|⁻¹|\^\(?-/.test(s) && !/[,.]/.test(s)) return 'frac';
    return 'dec';
  }
  function evaluate(commit) {
    const key = resOf(), E = edOf();
    const s = src(E);
    if (!s.trim()) { res[key] = null; if (commit) renderDisplay(); return; }
    let value = null, error = null, ast = null;
    try { const r = C.calc(s, env()); value = r.value; ast = r.ast; } catch (e) { error = e instanceof C.CalcError ? e.message : 'Ungültiger Ausdruck'; }
    if (!commit) { res[key] = { value, err: error, ast, live: true, view: res[key] && res[key].view }; return; }
    res[key] = { value, err: error, ast, done: !error, failed: !!error, view: null };
    if (!error) {
      S.ans = C.serialize(value);
      const dd = C.describe(value);
      addHist({ k: key, tok: E.tok.slice(), r: dd.frac && (key === 'frac' || autoView(key, dd) === 'frac') ? C.plain(value) + ' = ' + dd.dec : dd.dec, rf: C.plain(value), v: S.ans });
    }
    update(false, true);
  }
  function update(cursorOnly, committed) {
    if (!committed) { const key = resOf(); if (!(res[key] && res[key].done)) evaluate(false); }
    renderDisplay();
    save();
  }

  /* ---------- pretty printing (stacked fractions, roots, powers) */
  const FN_D = { asin: 'sin⁻¹', acos: 'cos⁻¹', atan: 'tan⁻¹', asinh: 'sinh⁻¹', acosh: 'cosh⁻¹', atanh: 'tanh⁻¹', round: 'rnd', floor: 'floor', ceil: 'ceil' };
  const fr = (a, b) => `<span class="mf"><span class="mn">${a}</span><span class="md">${b}</span></span>`;
  const np = (n) => (n.k === 'par' && !n.auto ? n.a : n);
  function pretty(n) {
    switch (n.k) {
      case 'num': return esc(n.raw.replace('.', ','));
      case 'mixed': return esc(n.w.raw) + fr(esc(n.n.raw), esc(n.d.raw));
      case 'const': return n.v === 'pi' ? 'π' : 'e';
      case 'ans': return '<span class="mans">Ans</span>';
      case 'x': return '<i>x</i>';
      case 'var': return n.v;
      case 'par': return '(' + pretty(n.a) + (n.auto ? '<span class="mauto">)</span>' : ')');
      case 'neg': return '−' + pretty(n.a);
      case 'pow': return pretty(n.a) + '<sup>' + pretty(np(n.b)) + '</sup>';
      case 'post': return pretty(n.a) + (n.op === '%' ? '&#8239;%' : n.op);
      case 'bin':
        if (n.op === '/') return fr(pretty(np(n.a)), pretty(np(n.b)));
        if (n.op === '*') return n.imp ? pretty(n.a) + pretty(n.b) : pretty(n.a) + ' · ' + pretty(n.b);
        return pretty(n.a) + (n.op === '+' ? ' + ' : n.op === '-' ? ' − ' : ' mod ') + pretty(n.b);
      case 'fn': {
        const A = n.args.map((a) => pretty(np(a)));
        const rad = (x, idx) => `<span class="mr">${idx ? `<sup class="mri">${idx}</sup>` : ''}<span class="mrs">√</span><span class="mro">${x}</span></span>`;
        if (n.f === 'sqrt') return rad(A[0]);
        if (n.f === 'cbrt') return rad(A[0], '3');
        if (n.f === 'root') return rad(A[1], A[0]);
        if (n.f === 'abs') return '|' + A[0] + '|';
        if (n.f === 'log' && A.length === 2) return 'log<sub>' + A[0] + '</sub>(' + A[1] + ')';
        return (FN_D[n.f] || n.f) + '(' + A.join('; ') + (n.auto ? '<span class="mauto">)</span>' : ')');
      }
    }
    return '';
  }
  function valueHTML(v, view) {
    const d = C.describe(v);
    const sign = (s) => (s < 0 ? '−' : '');
    if (view === 'frac' && d.frac) return sign(d.frac.s) + fr(d.frac.n, d.frac.d);
    if (view === 'frac' && d.fracApprox) return '≈ ' + sign(d.fracApprox.s) + fr(d.fracApprox.n, d.fracApprox.d);
    if (view === 'mixed' && d.mixed) return sign(d.mixed.s) + d.mixed.w + '&#8202;' + fr(d.mixed.n, d.mixed.d);
    if (view === 'sci') return esc(d.sci);
    return esc(d.dec);
  }

  /* ---------- calc / fraction tab */
  function renderCalc() {
    const frac = S.tab === 'frac';
    const rows = frac ? FRAC_SCI.concat(COMPACT) : (S.ext ? SCI : []).concat(COMPACT);
    body.innerHTML = `
      <div class="fc-disp">
        ${frac ? '<div class="fc-pretty"></div>' : ''}
        <div class="fc-in ${frac ? 'small' : ''}"></div>
        <div class="fc-res"></div>
        <div class="fc-steps"></div>
      </div>
      <div class="fc-acts">
        <button data-k="◀" title="Cursor links">◀</button><button data-k="▶" title="Cursor rechts">▶</button>
        <button data-k="S⇔D" title="Bruch ⇄ Dezimal ⇄ Exponent">S⇔D</button>
        ${frac ? '' : '<button data-k="Ans" title="letztes Ergebnis">Ans</button><button data-act="formula" title="Formel aus der Formelsammlung">Formel</button>'}
        <span class="fc-sp"></span>
        <button data-act="copy" title="Ergebnis kopieren">${icon('copy')}</button>
        <button data-act="note" title="Rechnung ins Heft einfügen">Ins Heft</button>
      </div>
      <div class="fc-keys ${frac ? 'frac' : S.ext ? 'ext' : 'cmp'}">${rows.map((r, i) => `<div class="fc-row ${(frac ? i >= FRAC_SCI.length : i >= (S.ext ? SCI.length : 0)) ? 'main' : 'sci'}">${r.map((k) => `<button data-k="${esc(k)}" class="${keyClass(k)}">${keyLabel(k)}</button>`).join('')}</div>`).join('')}</div>`;
    $$('[data-k]', body).forEach((b) => b.addEventListener('click', () => { active = true; press(b.dataset.k); }));
    $('[data-act=copy]', body).onclick = () => { const t = resultText(); if (t) copyText(t); else toast('Noch kein Ergebnis'); };
    $('[data-act=note]', body).onclick = () => { const t = resultText(true); if (t) toNote(t); else toast('Noch kein Ergebnis'); };
    const fb = $('[data-act=formula]', body);
    if (fb) fb.onclick = () => formulaPicker();
    $('.fc-in', body).addEventListener('click', (e) => {
      const s = e.target.closest('[data-i]');
      const E = edOf();
      E.cur = s ? +s.dataset.i + 1 : E.tok.length;
      if (res[resOf()]) res[resOf()].done = false;
      renderDisplay();
    });
    if (!edOf().tok.length && !res[resOf()]) res[resOf()] = null;
    else if (!(res[resOf()] && res[resOf()].done)) evaluate(false);
    renderDisplay();
  }
  function keyClass(k) {
    if (/^[0-9,]$/.test(k)) return 'num';
    if (k === '=') return 'eq';
    if (k === 'AC' || k === '⌫') return 'del';
    if (['÷', '×', '−', '+'].includes(k)) return 'op';
    return 'fn';
  }
  function keyLabel(k) {
    const L = { 'xʸ': 'x<sup>y</sup>', 'x²': 'x²', 'x³': 'x³', 'x⁻¹': '¹⁄ₓ', 'eˣ': 'e<sup>x</sup>', '10ˣ': '10<sup>x</sup>', '⌫': icon('backspace') || '⌫', 'Bruch': '<span class="kfr"><i></i><i></i></span>', 'a b/c': 'a<span class="kfr sm"><i></i><i></i></span>', 'ⁿ√': '<sup>n</sup>√', 'logₐ': 'log<sub>a</sub>', 'n!': 'n!', ',': ',' };
    return L[k] || esc(k);
  }
  function renderDisplay() {
    if (!body || (S.tab !== 'calc' && S.tab !== 'frac')) return;
    const E = edOf(), inp = $('.fc-in', body);
    if (!inp) return;
    let h = '';
    E.tok.forEach((t, i) => {
      if (i === E.cur) h += '<span class="fc-caret"></span>';
      h += `<span data-i="${i}" class="${t[1] === '_' ? 'mix' : ''}">${esc(disp(t))}</span>`;
    });
    if (E.cur >= E.tok.length) h += '<span class="fc-caret"></span>';
    inp.innerHTML = h || '<span class="fc-caret"></span><span class="ph">' + (S.tab === 'frac' ? 'z. B. 1/2 + 3/4' : 'Rechnung eingeben') + '</span>';
    inp.scrollLeft = inp.scrollWidth;
    showResult();
  }
  function showResult() {
    const key = resOf(), R = res[key], out = $('.fc-res', body), pre = $('.fc-pretty', body), st = $('.fc-steps', body);
    if (!out) return;
    if (pre) { let ph = ''; try { ph = R && R.ast ? pretty(R.ast) : edOf().tok.length ? '' : ''; } catch (e) { ph = ''; } pre.innerHTML = ph || '&nbsp;'; }
    st.innerHTML = '';
    out.className = 'fc-res';
    if (!R) { out.innerHTML = '&nbsp;'; return; }
    if (R.err) {
      out.classList.add(R.live ? 'live' : 'err');
      out.innerHTML = R.live ? '&nbsp;' : esc(R.err);
      return;
    }
    if (R.value == null) { out.innerHTML = '&nbsp;'; return; }
    const d = C.describe(R.value), view = R.view || autoView(key, d);
    if (R.live) out.classList.add('live');
    let h = `<span class="fc-eq">=</span> <span class="fc-val">${valueHTML(R.value, view)}</span>`;
    if (key === 'frac' && d.frac) {
      const parts = [];
      if (view !== 'mixed' && d.mixed) parts.push(valueHTML(R.value, 'mixed'));
      if (view !== 'dec') parts.push(esc(d.dec));
      if (parts.length) h += ' <span class="fc-alt">= ' + parts.join(' = ') + '</span>';
    } else if (key === 'calc' && view === 'frac' && d.frac) h += ` <span class="fc-alt">= ${esc(d.dec)}</span>`;
    out.innerHTML = h;
    if (key === 'frac' && R.ast && !R.live) st.innerHTML = fracSteps(R.ast, R.value);
  }
  function resultText(withExpr) {
    const key = resOf(), R = res[key];
    if (!R || R.value == null || R.err) return '';
    const d = C.describe(R.value), view = R.view || autoView(key, d);
    let r = d.dec;
    if (d.frac && (view === 'frac' || key === 'frac')) r = C.plain(R.value) + (d.mixed ? ' = ' + (d.mixed.s < 0 ? '−' : '') + d.mixed.w + ' ' + d.mixed.n + '/' + d.mixed.d : '') + ' = ' + d.dec;
    if (view === 'sci') r = d.sci;
    if (!withExpr) return r.replace(/^≈ /, '');
    const e = edOf().tok.map(disp).join('').replace(/‿/g, ' ');
    return e + (r.startsWith('≈') ? ' ' : ' = ') + r + (/sin|cos|tan/.test(e) ? (S.deg ? '  (DEG)' : '  (RAD)') : '');
  }

  /* ---------- fraction steps */
  const bg = (a) => (a < 0n ? -a : a);
  const gcdB = (a, b) => { a = bg(a); b = bg(b); while (b) [a, b] = [b, a % b]; return a; };
  function simpleFrac(n) { // literal fraction/int/mixed (with optional minus) → [num, den] BigInt or null
    let s = 1n;
    n = np(n);
    if (n.k === 'neg') { s = -1n; n = np(n.a); }
    if (n.k === 'num' && n.q.isInt()) return { n: s * n.q.n, d: 1n, show: null };
    if (n.k === 'num' && !n.raw.match(/[eE]/)) return { n: s * n.q.n * 1n, d: n.q.d, dec: n.raw, show: null };
    if (n.k === 'mixed') { const w = n.w.q.n, a = n.n.q.n, b = n.d.q.n; return { n: s * (w * b + a), d: b, mixed: [s, w, a, b] }; }
    if (n.k === 'bin' && n.op === '/') {
      const a = np(n.a), b = np(n.b);
      const na = a.k === 'neg' ? np(a.a) : a, nb = b.k === 'neg' ? np(b.a) : b;
      if (na.k === 'num' && nb.k === 'num' && na.q.isInt() && nb.q.isInt()) {
        const sg = s * (a.k === 'neg' ? -1n : 1n) * (b.k === 'neg' ? -1n : 1n);
        return { n: sg * na.q.n, d: nb.q.n, raw: true };
      }
    }
    return null;
  }
  const F2 = (n, d) => { const neg = (n < 0n) !== (d < 0n) && n !== 0n; return (neg ? '−' : '') + fr(bg(n).toString(), bg(d).toString()); };
  const FV = (n, d) => (d === 1n ? (n < 0n ? '−' : '') + bg(n).toString() : F2(n, d));
  function reduceStep(n, d) {
    if (d < 0n) { n = -n; d = -d; }
    const g = gcdB(n, d);
    if (g > 1n && d / g !== 1n) return `<div class="fc-step"><span>Kürzen mit ${g}</span>${F2(n, d)} = ${F2(n / g, d / g)}</div>`;
    if (g > 1n) return `<div class="fc-step"><span>Kürzen mit ${g}</span>${F2(n, d)} = ${(n / g).toString().replace('-', '−')}</div>`;
    return '';
  }
  function fracSteps(ast, value) {
    let a = np(ast);
    const L = [];
    const one = simpleFrac(a);
    if (one) {
      if (one.dec) { const p = BigInt(10) ** BigInt((one.dec.split(/[.,]/)[1] || '').length); L.push(`<div class="fc-step"><span>Dezimal → Bruch</span>${esc(one.dec.replace('.', ','))} = ${F2(one.n * p / one.d, p)}</div>`); L.push(reduceStep(one.n * p / one.d, p)); }
      else if (one.mixed) { const [s, w, x, y] = one.mixed; L.push(`<div class="fc-step"><span>Gemischte Zahl → Bruch</span>${s < 0n ? '−' : ''}${w}${fr(x, y)} = ${fr(`${w}·${y} + ${x}`, y)} = ${F2(one.n, one.d)}</div>`); }
      else if (one.raw) L.push(reduceStep(one.n, one.d) || '<div class="fc-step"><span>Bruch</span>schon vollständig gekürzt</div>');
      return L.join('');
    }
    if (a.k === 'bin' && ['+', '-', '*', '/'].includes(a.op)) {
      const x = simpleFrac(a.a), y = simpleFrac(a.b);
      if (!x || !y) return '';
      for (const z of [x, y]) if (z.mixed) { const [s, w, p, q] = z.mixed; L.push(`<div class="fc-step"><span>Umwandeln</span>${s < 0n ? '−' : ''}${w}${fr(p, q)} = ${F2(z.n, z.d)}</div>`); }
      if (a.op === '+' || a.op === '-') {
        const g = gcdB(x.d, y.d), l = x.d / g * y.d, ex = l / x.d, ey = l / y.d;
        const o = a.op === '+' ? ' + ' : ' − ';
        if (x.d !== y.d) L.push(`<div class="fc-step"><span>Hauptnenner kgV(${x.d}, ${y.d}) = ${l}</span>${FV(x.n, x.d)}${o}${FV(y.n, y.d)} = ${F2(x.n * ex, l)}${o}${F2(y.n * ey, l)}</div>`);
        const nn = a.op === '+' ? x.n * ex + y.n * ey : x.n * ex - y.n * ey;
        L.push(`<div class="fc-step"><span>Zähler ${a.op === '+' ? 'addieren' : 'subtrahieren'}</span>${fr(`${(x.n * ex).toString().replace('-', '−')}${o}${y.n * ey < 0n ? '(' + (y.n * ey).toString().replace('-', '−') + ')' : (y.n * ey).toString()}`, l.toString())} = ${F2(nn, l)}</div>`);
        L.push(reduceStep(nn, l));
      } else if (a.op === '*') {
        const nn = x.n * y.n, dd = x.d * y.d;
        L.push(`<div class="fc-step"><span>Zähler · Zähler, Nenner · Nenner</span>${FV(x.n, x.d)} · ${FV(y.n, y.d)} = ${fr(`${x.n.toString().replace('-', '−')} · ${y.n.toString().replace('-', '−')}`, `${x.d} · ${y.d}`)} = ${F2(nn, dd)}</div>`);
        L.push(reduceStep(nn, dd));
      } else {
        if (y.n === 0n) return '';
        L.push(`<div class="fc-step"><span>Mit dem Kehrwert multiplizieren</span>${FV(x.n, x.d)} : ${FV(y.n, y.d)} = ${FV(x.n, x.d)} · ${F2(y.d * (y.n < 0n ? -1n : 1n), bg(y.n))}</div>`);
        const nn = x.n * y.d * (y.n < 0n ? -1n : 1n), dd = x.d * bg(y.n);
        L.push(`<div class="fc-step"><span>Multiplizieren</span>${F2(nn, dd)}</div>`);
        L.push(reduceStep(nn, dd));
      }
      const d = C.describe(value);
      if (d.mixed) L.push(`<div class="fc-step"><span>Gemischte Zahl</span>${valueHTML(value, 'frac')} = ${valueHTML(value, 'mixed')}</div>`);
      return L.join('');
    }
    return '';
  }

  /* ---------- formula picker (Formelsammlung → Rechner) */
  function formulaPicker() {
    const cards = (typeof FORMULAS !== 'undefined' ? FORMULAS : []).concat((App.settings && App.settings.ownF) || [])
      .map((c) => ({ c, eqs: C.formulaEquations(c) })).filter((x) => x.eqs.length);
    let q = '';
    const draw = () => {
      const ql = q.trim().toLowerCase();
      const list = cards.filter((x) => !ql || (x.c.name + ' ' + x.c.cat + ' ' + x.c.f).toLowerCase().includes(ql));
      $('.fc-flist', body).innerHTML = list.map((x) => `<button class="fc-fitem" data-id="${esc(x.c.id)}"><b>${esc(x.c.name)}</b><span>${esc(x.c.cat || 'Eigene')}</span><small>${x.c.f}</small></button>`).join('') || '<p class="muted">Keine Formel gefunden.</p>';
      $$('.fc-fitem', body).forEach((b) => b.onclick = () => formulaForm(cards.find((x) => x.c.id === b.dataset.id)));
    };
    body.innerHTML = `<div class="fc-sub"><button class="ibtn sm" data-act="back">${icon('back')}</button><b>Formel auswählen</b></div>
      <input class="fc-search" type="search" placeholder="Formel suchen (z. B. Ohm, Dichte, Kreis)" autocomplete="off">
      <div class="fc-flist"></div>`;
    $('[data-act=back]', body).onclick = () => render();
    const si = $('.fc-search', body);
    si.oninput = () => { q = si.value; draw(); };
    draw();
  }
  function formulaForm(entry, eqIdx = 0) {
    const card = entry.c, eq = entry.eqs[eqIdx];
    const meta = (sym) => (card.v || []).find((v) => v[0].replace(/\s+/g, '') === sym) || null;
    const vals = formulaForm.vals || (formulaForm.vals = {});
    const lm = meta(eq.lhs);
    body.innerHTML = `<div class="fc-sub"><button class="ibtn sm" data-act="back">${icon('back')}</button><b>${esc(card.name)}</b></div>
      <div class="fc-chips">${entry.eqs.map((e, i) => `<button class="chip ${i === eqIdx ? 'on' : ''}" data-i="${i}">${e.lhs} = …</button>`).join('')}</div>
      <div class="fc-formula">${eq.lhs} = ${eq.rhs}</div>
      <div class="fc-vars">${eq.vars.map((v) => { const m = meta(v); return `<label><span><b>${v}</b> ${m ? esc(m[1]) : ''}${m && m[2] ? ' <i>in ' + m[2] + '</i>' : ''}</span><input data-v="${esc(v)}" inputmode="decimal" autocomplete="off" value="${esc(vals[v] != null ? vals[v] : v === 'g' ? '9,81' : '')}"></label>`; }).join('')}</div>
      <div class="fc-fres"></div>
      <div class="fc-acts"><span class="fc-sp"></span><button data-act="take">In Rechner übernehmen</button><button data-act="note">Ins Heft</button></div>`;
    $('[data-act=back]', body).onclick = () => formulaPicker();
    $$('.fc-chips [data-i]', body).forEach((b) => b.onclick = () => formulaForm(entry, +b.dataset.i));
    let last = null;
    const run = () => {
      const values = {};
      $$('[data-v]', body).forEach((i) => { values[i.dataset.v] = i.value; vals[i.dataset.v] = i.value; });
      const out = $('.fc-fres', body);
      last = null;
      try {
        const v = C.evalFormula(eq, values, env());
        let sub = eq.rhs;
        for (const k of eq.vars.slice().sort((a, b) => b.length - a.length)) {
          const t = values[k].trim().replace(/^-/, '−');
          sub = sub.split(k).join(/^[\d,.]+$/.test(values[k].trim()) ? esc(t) : '(' + esc(t) + ')');
        }
        const d = C.describe(v), unit = lm && lm[2] ? ' ' + lm[2] : '';
        last = { v, text: `${eq.lhs.replace(/<\/?sub>/g, '')} = ${sub.replace(/<\/?sub>/g, '')} ${d.dec.startsWith('≈') ? '' : '= '}${d.dec}${unit.replace(/<[^>]+>/g, '')}`, plain: sub.replace(/<\/?sub>/g, '') };
        out.innerHTML = `<div class="fc-step"><span>Rechenweg</span>${eq.lhs} = ${sub} ${d.dec.startsWith('≈') ? '' : '='} <b>${esc(d.dec)}${unit}</b></div>`;
      } catch (e) {
        out.innerHTML = `<span class="fc-hint">${esc(e.message)}</span>`;
      }
    };
    $$('[data-v]', body).forEach((i) => i.addEventListener('input', run));
    run();
    $('[data-act=take]', body).onclick = () => {
      if (!last) { toast('Bitte alle Werte eingeben'); return; }
      S.tab = 'calc';
      ed.calc.tok = [[last.plain, last.plain]];
      ed.calc.cur = 1;
      res.calc = null;
      render();
      evaluate(true);
    };
    $('[data-act=note]', body).onclick = () => { if (last) toNote(last.text); else toast('Bitte alle Werte eingeben'); };
  }

  /* ============================================================ value table */
  function helperKeys(inp, keys) {
    const row = html(`<div class="fc-help">${keys.map((k) => `<button data-ins="${esc(k)}">${esc(k)}</button>`).join('')}</div>`);
    $$('[data-ins]', row).forEach((b) => b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const t = b.dataset.ins.replace(/^(sin|cos|tan|√|ln)$/, '$1(');
      const s = inp.selectionStart != null ? inp.selectionStart : inp.value.length, en = inp.selectionEnd != null ? inp.selectionEnd : s;
      inp.value = inp.value.slice(0, s) + t + inp.value.slice(en);
      const c = s + t.length;
      try { inp.setSelectionRange(c, c); } catch (x) { /* */ }
      inp.dispatchEvent(new Event('input'));
    }));
    return row;
  }
  const FKEYS = ['x', 'x²', '^', '√', '(', ')', 'sin', 'cos', 'π', ','];
  function fmtD(v, dec) {
    try { return C.describe(C.round(v, dec)).dec; } catch (e) { return '–'; }
  }
  function renderTable() {
    const t = S.tbl;
    body.innerHTML = `<div class="fc-form">
        <label class="wide"><span>f(x) =</span><input data-f="f" value="${esc(t.f)}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="z. B. 0,5x² + 2x − 1"></label>
        <div class="fc-helpbox"></div>
        <label><span>Start x</span><input data-f="a" value="${esc(t.a)}" inputmode="decimal"></label>
        <label><span>Ende x</span><input data-f="b" value="${esc(t.b)}" inputmode="decimal"></label>
        <label><span>Schritt</span><input data-f="h" value="${esc(t.h)}" inputmode="decimal"></label>
        <label><span>Stellen</span><select data-f="dec">${[0, 1, 2, 3, 4, 5, 6, 8, 10].map((d) => `<option ${+t.dec === d ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
      </div>
      <div class="fc-msg"></div>
      <div class="fc-tablewrap"><table class="fc-vt"></table></div>
      <div class="fc-acts"><span class="fc-info"></span><span class="fc-sp"></span>
        <button data-act="graph" title="Im Graph-Tab anzeigen">Graph</button><button data-act="copy">${icon('copy')} Kopieren</button><button data-act="note">Ins Heft</button></div>`;
    $('.fc-helpbox', body).appendChild(helperKeys($('[data-f=f]', body), FKEYS));
    $$('[data-f]', body).forEach((i) => i.addEventListener('input', () => {
      t[i.dataset.f] = i.dataset.f === 'dec' ? +i.value : i.value;
      if (i.dataset.f !== 'dec') t.edits = {};
      tableLater();
    }));
    $$('[data-f=dec]', body).forEach((i) => i.addEventListener('change', () => { t.dec = +i.value; drawTable(); save(); }));
    $('[data-act=copy]', body).onclick = () => { const r = tableData(); if (r) copyText(r.tsv); };
    $('[data-act=note]', body).onclick = () => tableToNote();
    $('[data-act=graph]', body).onclick = () => { addGraphFn(t.f); S.tab = 'graph'; render(); save(); };
    drawTable();
  }
  const tableLater = debounce(() => { drawTable(); save(); }, 250);
  let tcache = null;
  function tableData() {
    const t = S.tbl;
    let r;
    try { r = C.table(t.f, t.a, t.b, t.h, env()); } catch (e) { return { error: e.message }; }
    const rows = r.rows.map((row, i) => ({ i, x: row.x, y: row.y, err: row.err }));
    for (const k in t.edits) {
      const row = rows[+k];
      if (!row) continue;
      try { const xv = C.evaluate(C.parse(t.edits[k], {}), env()); row.x = xv; row.edited = true; try { row.y = r.g(xv); row.err = null; } catch (e) { row.y = null; row.err = e.message; } }
      catch (e) { row.err = 'x ungültig'; }
    }
    if (t.sort) {
      const [col, dir] = t.sort.split(':'), key = (o) => (col === 'x' ? C.F(o.x) : o.err ? Infinity : C.F(o.y));
      rows.sort((p, q) => (key(p) - key(q)) * (dir === 'desc' ? -1 : 1));
    }
    const fx = 'f(x)';
    const tsv = 'x\t' + fx + '\n' + rows.map((o) => fmtD(o.x, t.dec) + '\t' + (o.err ? 'n. def.' : fmtD(o.y, t.dec))).join('\n');
    return { rows, tsv };
  }
  function drawTable() {
    const t = S.tbl, tab = $('.fc-vt', body), msg = $('.fc-msg', body);
    if (!tab) return;
    const d = tableData();
    tcache = d;
    if (d.error) { msg.innerHTML = `<span class="fc-hint">${esc(d.error)}</span>`; tab.innerHTML = ''; $('.fc-info', body).textContent = ''; return; }
    msg.innerHTML = /sin|cos|tan/.test(t.f) ? `<span class="fc-note">Winkel in ${S.deg ? 'Grad (DEG)' : 'Bogenmaß (RAD)'}</span>` : '';
    const arrow = (c) => (t.sort === c + ':asc' ? ' ▲' : t.sort === c + ':desc' ? ' ▼' : '');
    tab.innerHTML = `<thead><tr><th data-s="x">x${arrow('x')}</th><th data-s="y">f(x)${arrow('y')}</th></tr></thead><tbody>${d.rows.map((o) =>
      `<tr class="${o.edited ? 'ed' : ''}"><td><input data-row="${o.i}" value="${esc(fmtD(o.x, Math.max(t.dec, 6)).replace(/ /g, ''))}" inputmode="decimal"></td><td class="${o.err ? 'nd' : ''}">${o.err ? 'n. def.' : esc(fmtD(o.y, t.dec))}</td></tr>`).join('')}</tbody>`;
    $('.fc-info', body).textContent = d.rows.length + ' Werte';
    $$('th[data-s]', tab).forEach((th) => th.onclick = () => {
      const c = th.dataset.s;
      t.sort = t.sort === c + ':asc' ? c + ':desc' : t.sort === c + ':desc' ? null : c + ':asc';
      drawTable(); save();
    });
    $$('input[data-row]', tab).forEach((i) => i.addEventListener('change', () => {
      if (i.value.trim() === '') delete t.edits[i.dataset.row]; else t.edits[i.dataset.row] = i.value;
      drawTable(); save();
    }));
  }
  function tableToNote() {
    const d = tcache && !tcache.error ? tcache : tableData();
    if (!d || d.error) { toast(d ? d.error : 'Tabelle ungültig'); return; }
    if (!editorReady()) return;
    if (d.rows.length > 200) { toast('Höchstens 200 Zeilen ins Heft – Schrittweite vergrößern'); return; }
    const t = S.tbl;
    const sh = SheetEngine.newSheet(d.rows.length + 1, 2);
    const put = (r, c, v) => { sh.cells[SheetEngine.refName(r, c)] = { v: String(v) }; };
    put(0, 0, 'x'); put(0, 1, 'f(x) = ' + t.f.replace(/^\s*(?:f\s*\(\s*x\s*\)|y)\s*=\s*/, ''));
    d.rows.forEach((o, j) => {
      put(j + 1, 0, fmtD(o.x, t.dec).replace(/ /g, '').replace(/^−/, '-'));
      put(j + 1, 1, o.err ? 'n. def.' : fmtD(o.y, t.dec).replace(/ /g, '').replace(/^−/, '-'));
    });
    sh.header = false;
    for (const c of [0, 1]) { sh.cells[SheetEngine.refName(0, c)].b = true; sh.cells[SheetEngine.refName(0, c)].bg = '#e9ecf3'; }
    const page = Editor.currentPage(), c = Editor.visibleCenter(page);
    Editor.placeTable(page, sh, c.y - 100, true);
    toast('Wertetabelle ins Heft eingefügt');
  }

  /* ============================================================ equations & functions */
  function renderEq() {
    const q = S.eq, solveMode = q.mode === 'solve';
    body.innerHTML = `<div class="fc-seg"><button data-m="solve" class="${solveMode ? 'on' : ''}">Gleichung lösen</button><button data-m="fn" class="${solveMode ? '' : 'on'}">Funktion untersuchen</button></div>
      ${solveMode ? `<div class="fc-form"><label class="wide"><span>Gleichung</span><input data-q="src" value="${esc(q.src)}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="z. B. x² − 5x + 6 = 0"></label><div class="fc-helpbox"></div></div>`
        : `<div class="fc-form"><label class="wide"><span>f(x) =</span><input data-q="fx" value="${esc(q.fx)}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="z. B. x² − 4"></label><div class="fc-helpbox"></div>
          <label><span>Funktionswert bei x =</span><input data-q="x0" value="${esc(q.x0)}" inputmode="decimal"></label></div>`}
      <div class="fc-out"></div>
      <div class="fc-acts"><span class="fc-sp"></span><button data-act="graph">Graph</button><button data-act="copy">${icon('copy')} Kopieren</button><button data-act="note">Ins Heft</button></div>`;
    const inp = $(solveMode ? '[data-q=src]' : '[data-q=fx]', body);
    $('.fc-helpbox', body).appendChild(helperKeys(inp, solveMode ? ['x', 'x²', '=', '^', '√', '(', ')', ','] : FKEYS));
    $$('[data-m]', body).forEach((b) => b.onclick = () => { q.mode = b.dataset.m; render(); save(); });
    $$('[data-q]', body).forEach((i) => i.addEventListener('input', () => { q[i.dataset.q] = i.value; eqLater(); }));
    $('[data-act=copy]', body).onclick = () => { if (eqText) copyText(eqText); };
    $('[data-act=note]', body).onclick = () => { if (eqText) toNote(eqText); else toast('Kein gültiges Ergebnis'); };
    $('[data-act=graph]', body).onclick = () => {
      let f = solveMode ? q.src : q.fx;
      if (solveMode) { const p = f.split('='); f = p.length === 2 && p[1].trim() && p[1].trim() !== '0' ? `(${p[0]}) - (${p[1]})` : p[0]; }
      addGraphFn(f); S.tab = 'graph'; render(); save();
    };
    drawEq();
  }
  let eqText = '';
  const eqLater = debounce(() => { drawEq(true); save(); }, 350);
  function drawEq(fromTyping) {
    const q = S.eq, out = $('.fc-out', body);
    if (!out) return;
    eqText = '';
    const rowsHTML = (rows) => `<div class="fc-ana">${rows.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>`;
    try {
      if (q.mode === 'solve') {
        const lo = parseFloat(String(q.lo).replace(',', '.')), hi = parseFloat(String(q.hi).replace(',', '.'));
        const r = C.solve(q.src, env(), [Number.isFinite(lo) ? lo : -100, Number.isFinite(hi) && hi > lo ? hi : 100]);
        const sol = r.sols.length ? r.sols.map((s, i) => `<div class="fc-sol"><span>${r.sols.length > 1 ? 'x' + '₁₂₃₄₅₆₇₈₉'[i] : 'x'}</span><b>= ${esc(s.text)}</b></div>`).join('') : '';
        out.innerHTML = `<div class="fc-solbox ${r.numeric ? 'num' : ''}">${sol}<div class="fc-note">${esc(r.note)}${r.numeric ? ' <span class="fc-badge">≈ numerisch</span>' : ''}</div></div>
          ${r.numeric ? `<div class="fc-form"><label><span>Suchbereich von</span><input data-r="lo" value="${esc(q.lo)}" inputmode="decimal"></label><label><span>bis</span><input data-r="hi" value="${esc(q.hi)}" inputmode="decimal"></label></div>` : ''}
          ${rowsHTML(r.steps)}${/sin|cos|tan/.test(q.src) ? `<div class="fc-note">Winkel in ${S.deg ? 'Grad (DEG)' : 'Bogenmaß (RAD)'}</div>` : ''}`;
        $$('[data-r]', out).forEach((i) => i.addEventListener('change', () => { q[i.dataset.r] = i.value; drawEq(); save(); }));
        eqText = q.src.trim() + '\n' + r.steps.map(([k, v]) => k + ': ' + v).join('\n') + '\n' + (r.sols.length ? r.sols.map((s, i) => (r.sols.length > 1 ? 'x' + '₁₂₃₄₅₆₇₈₉'[i] : 'x') + ' = ' + s.text).join(';  ') : r.note);
        if (!fromTyping) addHist({ k: 'eq', src: q.src, r: r.sols.length ? r.sols.map((s) => s.text).join(';  ') : r.note });
        else eqHistLater(q.src, r);
      } else {
        const a = C.analyze(q.fx, env(), q.x0);
        out.innerHTML = rowsHTML(a.rows) + (a.numeric ? '<div class="fc-note"><span class="fc-badge">≈ numerisch</span> Nullstellen sind Näherungswerte.</div>' : '') + (/sin|cos|tan/.test(q.fx) ? `<div class="fc-note">Winkel in ${S.deg ? 'Grad (DEG)' : 'Bogenmaß (RAD)'}</div>` : '');
        eqText = 'f(x) = ' + q.fx.replace(/^\s*(?:f\s*\(\s*x\s*\)|y)\s*=\s*/, '') + '\n' + a.rows.map(([k, v]) => k + ': ' + v).join('\n');
      }
    } catch (e) {
      out.innerHTML = `<div class="fc-hint">${esc(e instanceof C.CalcError ? e.message : 'Ungültige Eingabe')}</div>`;
    }
  }
  const eqHistLater = debounce((srcText, r) => { if (S.eq.src === srcText) addHist({ k: 'eq', src: srcText, r: r.sols.length ? r.sols.map((s) => s.text).join(';  ') : r.note }); }, 2500);

  /* ============================================================ graph */
  function addGraphFn(f) {
    const G = S.graph;
    f = String(f).trim();
    if (!f) return;
    if (G.fns.some((x) => x.expr.replace(/\s/g, '') === f.replace(/\s/g, ''))) return;
    const empty = G.fns.find((x) => !x.expr.trim());
    if (empty) empty.expr = f;
    else { if (G.fns.length >= 6) G.fns.shift(); G.fns.push({ expr: f, color: GCOL[G.fns.length % GCOL.length] }); }
  }
  let gview = null, gstate = null;
  function renderGraph() {
    const G = S.graph;
    body.innerHTML = `<div class="fc-fns">${G.fns.map((f, i) => `<div class="fc-fn" data-i="${i}"><span class="cdot" style="background:${f.color}">f${i ? i + 1 : ''}</span><input value="${esc(f.expr)}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="z. B. x² − 4"><button class="ibtn sm" data-act="vis">${icon(f.hidden ? 'eyeOff' : 'eye')}</button><button class="ibtn sm" data-act="del">${icon('trash')}</button></div><div class="fc-ferr" data-e="${i}"></div>`).join('')}
        <div class="fc-gbar"><button data-act="add">${icon('plus')} Funktion</button><label><input type="checkbox" data-act="marks" ${G.marks ? 'checked' : ''}> Nullstellen/Scheitel</label><span class="fc-sp"></span><span class="fc-deg-note"></span></div></div>
      <div class="fc-graph"><div class="fc-svg"></div>
        <div class="fc-gz"><button class="ibtn sm" data-z="out">${icon('zoomOut')}</button><button class="ibtn sm" data-z="in">${icon('zoomIn')}</button><button class="ibtn sm" data-z="reset" title="Standardansicht">${icon('target')}</button><button class="ibtn sm" data-act="note" title="Graph ins Heft">${icon('plus')}</button></div></div>`;
    $$('.fc-fn', body).forEach((row) => {
      const i = +row.dataset.i, inp = $('input', row);
      inp.addEventListener('input', () => { G.fns[i].expr = inp.value; gcompile(); drawGraph(); save(); });
      $('[data-act=vis]', row).onclick = () => { G.fns[i].hidden = !G.fns[i].hidden; renderGraph(); save(); };
      $('[data-act=del]', row).onclick = () => { G.fns.splice(i, 1); if (!G.fns.length) G.fns.push({ expr: '', color: GCOL[0] }); renderGraph(); save(); };
    });
    $('[data-act=add]', body).onclick = () => {
      if (G.fns.length >= 6) { toast('Höchstens 6 Funktionen'); return; }
      G.fns.push({ expr: '', color: GCOL.find((c) => !G.fns.some((f) => f.color === c)) || GCOL[0] });
      renderGraph(); $$('.fc-fn input', body).pop().focus(); save();
    };
    $('[data-act=marks]', body).onchange = (e) => { G.marks = e.target.checked; drawGraph(); save(); };
    $$('[data-z]', body).forEach((b) => b.onclick = () => {
      if (b.dataset.z === 'reset') { gview = null; G.view = null; } else zoomBy(b.dataset.z === 'in' ? 0.8 : 1.25);
      drawGraph(); save();
    });
    $('[data-act=note]', body).onclick = graphToNote;
    gcompile();
    requestAnimationFrame(() => drawGraph());
    graphGestures($('.fc-graph', body));
  }
  let gfns = [];
  function gcompile() {
    gfns = S.graph.fns.map((f, i) => {
      const e = $(`[data-e="${i}"]`, body);
      if (!f.expr.trim()) { if (e) e.textContent = ''; return null; }
      try { const c = C.numFn(f.expr, { deg: S.deg }); if (e) e.textContent = ''; return { expr: f.expr, color: f.color, hidden: f.hidden, f: c.f }; }
      catch (x) { if (e) e.textContent = x.message; return null; }
    });
    const trig = S.graph.fns.some((f) => /sin|cos|tan/.test(f.expr));
    const n = $('.fc-deg-note', body);
    if (n) n.textContent = trig ? (S.deg ? 'x in Grad (DEG)' : 'x im Bogenmaß') : '';
  }
  function gsize() { const el = $('.fc-svg', body); return el ? { w: Math.max(80, el.clientWidth), h: Math.max(80, el.clientHeight) } : { w: 300, h: 200 }; }
  function ensureView() {
    const { w, h } = gsize();
    if (!gview) {
      if (S.graph.view) gview = Object.assign({}, S.graph.view);
      else {
        const trig = S.deg && S.graph.fns.some((f) => /sin|cos|tan/.test(f.expr) && !f.hidden);
        const span = trig ? 720 : 20, ux = span / w;
        gview = { xmin: trig ? -360 : -10, xmax: trig ? 360 : 10, ymin: -ux * h / 2, ymax: ux * h / 2 };
        if (trig) { gview.ymin = -2; gview.ymax = 2; }
      }
      gstate = { w, h };
    }
    // keep scale when the window is resized
    if (gstate && (gstate.w !== w || gstate.h !== h)) {
      const ux = (gview.xmax - gview.xmin) / gstate.w, uy = (gview.ymax - gview.ymin) / gstate.h;
      const cx = (gview.xmin + gview.xmax) / 2, cy = (gview.ymin + gview.ymax) / 2;
      gview = { xmin: cx - ux * w / 2, xmax: cx + ux * w / 2, ymin: cy - uy * h / 2, ymax: cy + uy * h / 2 };
      gstate = { w, h };
    }
  }
  let gbusy = false;
  function drawGraph(fast) {
    const el = $('.fc-svg', body);
    if (!el) return;
    ensureView();
    const { w, h } = gsize();
    const fns = gfns.filter((f) => f && !f.hidden);
    el.innerHTML = Render.graphSVG(fns, gview, w, h, { marks: S.graph.marks && !fast, legend: false, fontSize: 12 });
    if (!fast) S.graph.view = Object.assign({}, gview);
  }
  function zoomBy(k, px, py) {
    ensureView();
    const v = gview, { w, h } = gsize();
    const cx = px == null ? (v.xmin + v.xmax) / 2 : v.xmin + (px / w) * (v.xmax - v.xmin);
    const cy = py == null ? (v.ymin + v.ymax) / 2 : v.ymax - (py / h) * (v.ymax - v.ymin);
    gview = { xmin: cx - (cx - v.xmin) * k, xmax: cx + (v.xmax - cx) * k, ymin: cy - (cy - v.ymin) * k, ymax: cy + (v.ymax - cy) * k };
  }
  function graphGestures(area) {
    const P = new Map();
    let g0 = null, raf = 0;
    const frame = () => { raf = 0; drawGraph(true); };
    const req = () => { if (!raf) raf = requestAnimationFrame(frame); };
    area.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      area.setPointerCapture(e.pointerId);
      P.set(e.pointerId, { x: e.clientX, y: e.clientY });
      ensureView();
      g0 = { view: Object.assign({}, gview), pts: new Map([...P].map(([k, v]) => [k, Object.assign({}, v)])) };
    });
    area.addEventListener('pointermove', (e) => {
      if (!P.has(e.pointerId) || !g0) return;
      P.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const { w, h } = gsize(), v = g0.view;
      const ids = [...P.keys()];
      if (ids.length === 1 && g0.pts.has(ids[0])) {
        const a = g0.pts.get(ids[0]), b = P.get(ids[0]);
        const dx = (b.x - a.x) / w * (v.xmax - v.xmin), dy = (b.y - a.y) / h * (v.ymax - v.ymin);
        gview = { xmin: v.xmin - dx, xmax: v.xmax - dx, ymin: v.ymin + dy, ymax: v.ymax + dy };
      } else if (ids.length >= 2 && g0.pts.has(ids[0]) && g0.pts.has(ids[1])) {
        const a0 = g0.pts.get(ids[0]), b0 = g0.pts.get(ids[1]), a1 = P.get(ids[0]), b1 = P.get(ids[1]);
        const d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y), d1 = Math.hypot(a1.x - b1.x, a1.y - b1.y);
        if (d0 > 10 && d1 > 10) {
          const r = area.getBoundingClientRect(), k = d0 / d1;
          gview = v;
          const mx = (a0.x + b0.x) / 2 - r.left, my = (a0.y + b0.y) / 2 - r.top;
          zoomBy(k, mx, my);
        }
      }
      req();
    });
    const up = (e) => {
      if (!P.has(e.pointerId)) return;
      P.delete(e.pointerId);
      ensureView();
      g0 = P.size ? { view: Object.assign({}, gview), pts: new Map([...P].map(([k, v]) => [k, Object.assign({}, v)])) } : null;
      if (!P.size) { drawGraph(); save(); }
    };
    area.addEventListener('pointerup', up);
    area.addEventListener('pointercancel', up);
    area.addEventListener('wheel', (e) => { e.preventDefault(); const r = area.getBoundingClientRect(); zoomBy(e.deltaY > 0 ? 1.15 : 0.87, e.clientX - r.left, e.clientY - r.top); req(); clearTimeout(area._wt); area._wt = setTimeout(() => { drawGraph(); save(); }, 200); }, { passive: false });
  }
  function graphToNote() {
    if (!editorReady()) return;
    const used = S.graph.fns.filter((f) => f.expr.trim() && !f.hidden);
    if (!used.length) { toast('Keine Funktion zum Einfügen'); return; }
    const bad = used.find((f) => { try { Expr.parse(f.expr); return false; } catch (e) { return true; } });
    if (bad) { toast('„' + bad.expr + '“ kann im Heft-Graph nicht dargestellt werden'); return; }
    if (S.deg && used.some((f) => /sin|cos|tan/.test(f.expr))) { toast('Heft-Graphen rechnen im Bogenmaß – bitte auf RAD umschalten'); return; }
    ensureView();
    const W = 640, H = 480, v = gview, { w, h } = gsize();
    const ux = (v.xmax - v.xmin) / w, uy = (v.ymax - v.ymin) / h, cx = (v.xmin + v.xmax) / 2, cy = (v.ymin + v.ymax) / 2, k = Math.min(w / W, h / H);
    const view = { xmin: cx - ux * W * k / 2, xmax: cx + ux * W * k / 2, ymin: cy - uy * H * k / 2, ymax: cy + uy * H * k / 2 };
    const E = Editor, page = E.currentPage(), c = E.visibleCenter(page);
    const tok = E.beginOp(page);
    const y = E.freeY(page, 120, W, Math.round(clamp(c.y - 250, 30, (page.h || A4_H) - 300)), H);
    page.els.push({ id: uid(), type: 'graph', x: 120, y, w: W, h: H, fns: used.map((f) => ({ expr: f.expr, color: f.color })), view, marks: S.graph.marks });
    E.rerenderPage(page);
    E.commitOp(tok);
    toast('Graph ins Heft eingefügt');
  }

  /* ============================================================ history */
  function addHist(item) {
    item.at = Date.now();
    const h = S.hist;
    const same = h[0] && h[0].k === item.k && (item.k === 'eq' ? h[0].src === item.src : JSON.stringify(h[0].tok) === JSON.stringify(item.tok));
    if (same) h[0] = item; else h.unshift(item);
    if (h.length > MAXH) h.length = MAXH;
    save();
  }
  function renderHist() {
    const h = S.hist;
    body.innerHTML = `<div class="fc-hist">${h.length ? h.map((it, i) => {
      const e = it.k === 'eq' ? esc(it.src) : esc((it.tok || []).map(disp).join(''));
      return `<div class="fc-hi" data-i="${i}"><button class="fc-he" data-act="load" title="Rechnung erneut aufrufen"><small>${it.k === 'eq' ? 'Gleichung' : it.k === 'frac' ? 'Bruch' : ''}</small>${e}</button><button class="fc-hr" data-act="use" title="Ergebnis übernehmen">${it.k === 'eq' ? '' : '= '}${esc(it.r)}</button></div>`;
    }).join('') : '<p class="muted fc-empty">Noch keine Berechnungen. Alles, was du mit „=“ ausrechnest, landet hier – auch nach einem Neustart.</p>'}</div>
      <div class="fc-acts"><span class="fc-info">${h.length} Einträge</span><span class="fc-sp"></span><button data-act="clear" ${h.length ? '' : 'disabled'}>${icon('trash')} Verlauf löschen</button></div>`;
    $$('.fc-hi', body).forEach((row) => {
      const it = h[+row.dataset.i];
      $('[data-act=load]', row).onclick = () => {
        if (it.k === 'eq') { S.eq.mode = 'solve'; S.eq.src = it.src; S.tab = 'eq'; }
        else { const t = it.k === 'frac' ? 'frac' : 'calc'; ed[t] = { tok: it.tok.map((x) => x.slice()), cur: it.tok.length }; res[t] = null; S.tab = t; }
        render(); save();
      };
      $('[data-act=use]', row).onclick = () => {
        if (it.k === 'eq') { copyText(it.r); return; }
        const v = C.deserialize(it.v);
        if (v == null) return;
        const t = S.tab === 'frac' ? 'frac' : 'calc';
        S.tab = it.k === 'frac' ? 'frac' : 'calc';
        const E = ed[S.tab];
        if (res[S.tab] && res[S.tab].done) { E.tok = []; E.cur = 0; res[S.tab].done = false; }
        E.tok.splice(E.cur, 0, [C.isQ(v) && !v.isInt() ? C.plain(v) : C.describe(v).dec.replace(/^≈ /, ''), C.toExpr(v)]);
        E.cur++;
        render(); save();
        void t;
      };
    });
    $('[data-act=clear]', body).onclick = async () => {
      if (!(await confirm2('Gesamten Rechenverlauf löschen?', 'Löschen'))) return;
      S.hist = []; save(); renderHist();
    };
  }

  /* ============================================================ integration helpers */
  // Auflagerkräfte live in the Werkzeugkasten (full screen); the floating window minimises meanwhile
  function openBeam() {
    const ed2 = typeof Editor !== 'undefined' && Editor.doc && Editor.root && Editor.root.isConnected;
    Toolbox.state.calc = 'auflager';
    Toolbox.open('calc', ed2 ? { insert: (h) => Editor.insertHTML(h) } : null);
    if (!S.min) setMin(true);
  }
  function editorReady() {
    if (typeof Editor !== 'undefined' && Editor.doc && Editor.root && Editor.root.isConnected) return true;
    toast('Öffne zuerst ein Heft – dann kannst du einfügen');
    return false;
  }
  function toNote(text) {
    if (!editorReady()) return;
    Editor.insertHTML(esc(text).replace(/\n/g, '<br>'));
    toast('Ins Heft eingefügt');
  }
  function copyText(text) {
    let ok = false;
    try { if (Native && Native.copyText) ok = Native.copyText(text); } catch (e) { ok = false; }
    if (!ok && !Native && navigator.clipboard && navigator.clipboard.writeText) { try { navigator.clipboard.writeText(text); ok = true; } catch (e) { ok = false; } }
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        ok = document.execCommand('copy');
        ta.remove();
      } catch (e) { ok = false; }
      if (!ok && navigator.clipboard) { navigator.clipboard.writeText(text).catch(() => {}); ok = true; }
    }
    toast(ok ? 'Kopiert – im Heft in ein Textfeld einfügen' : 'Kopieren nicht möglich');
  }

  /* ============================================================ keyboard, focus, viewport */
  const KB = { '*': '×', '/': '÷', '-': '−', 'Enter': '=', '=': '=', 'Backspace': '⌫', 'Delete': 'AC', 'Escape': 'AC', 'ArrowLeft': '◀', 'ArrowRight': '▶', '.': ',' };
  document.addEventListener('pointerdown', (e) => { if (root) active = root.contains(e.target); }, true);
  document.addEventListener('keydown', (e) => {
    if (!root || S.min || !active || (S.tab !== 'calc' && S.tab !== 'frac') || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    let k = KB[e.key] || e.key;
    if (S.tab === 'frac' && e.key === ' ') k = 'a b/c';
    else if (['=', '⌫', 'AC', '◀', '▶'].includes(k)) { /* control keys */ }
    else if (k.length !== 1 || !/[0-9a-zA-Z,+×÷−()^%!;°]/.test(k)) return;
    e.preventDefault(); e.stopPropagation();
    press(/^[a-zA-Z]$/.test(k) ? k.toLowerCase() : k);
  }, true);
  window.addEventListener('resize', () => { if (root) { place(); if (S.tab === 'graph') drawGraph(); } });

  return { open, close, toggle, isOpen, press, get state() { return S; }, _res: res, _ed: ed, pretty };
})();
