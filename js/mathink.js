/* Handwritten arithmetic recognition ("Rechenhilfe").
 * - Symbol recognizer: $P point-cloud recognizer (Vatavu, Anthony, Wobbrock 2012) against built-in
 *   templates (several handwriting variants per symbol, augmented) plus the user's own trained samples.
 * - Size heuristics for tiny symbols (decimal comma, multiplication dot, colon).
 * - Expression finder: when "=" is written, the strokes to its left on the same line are grouped into symbols.
 * - Result is written back as single-stroke "handwriting" glyphs. Everything runs offline. */
'use strict';
const MathInk = (() => {
  const N = 32;

  /* ------------------------------------------------------------ $P */
  function cloud(strokes) {
    // strokes: [[x,y,x,y,...], ...] → normalised N-point cloud
    let pts = [];
    strokes.forEach((s, id) => { for (let i = 0; i < s.length; i += 2) pts.push([s[i], s[i + 1], id]); });
    pts = resample(pts, N);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    const sc = Math.max(x1 - x0, y1 - y0) || 1;
    let cx = 0, cy = 0;
    pts = pts.map((p) => { const q = [(p[0] - x0) / sc, (p[1] - y0) / sc]; cx += q[0]; cy += q[1]; return q; });
    cx /= pts.length; cy /= pts.length;
    return pts.map((p) => [p[0] - cx, p[1] - cy]);
  }
  function pathLen(pts) { let d = 0; for (let i = 1; i < pts.length; i++) if (pts[i][2] === pts[i - 1][2]) d += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return d; }
  function resample(pts, n) {
    const I = pathLen(pts) / (n - 1);
    if (!(I > 0)) { const p = pts[0]; return Array.from({ length: n }, () => [p[0], p[1], 0]); }
    let D = 0;
    const out = [pts[0].slice()];
    pts = pts.map((p) => p.slice());
    for (let i = 1; i < pts.length; i++) {
      if (pts[i][2] !== pts[i - 1][2]) continue;
      const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (D + d >= I) {
        const t = (I - D) / d;
        const q = [pts[i - 1][0] + t * (pts[i][0] - pts[i - 1][0]), pts[i - 1][1] + t * (pts[i][1] - pts[i - 1][1]), pts[i][2]];
        out.push(q); pts.splice(i, 0, q); D = 0;
      } else D += d;
    }
    while (out.length < n) out.push(pts[pts.length - 1].slice());
    return out.slice(0, n);
  }
  function cloudDist(a, b, start) {
    const n = a.length, used = new Uint8Array(n);
    let sum = 0, i = start;
    do {
      let min = Infinity, idx = -1;
      for (let j = 0; j < n; j++) if (!used[j]) { const d = (a[i][0] - b[j][0]) ** 2 + (a[i][1] - b[j][1]) ** 2; if (d < min) { min = d; idx = j; } }
      used[idx] = 1;
      sum += (1 - ((i - start + n) % n) / n) * Math.sqrt(min);
      i = (i + 1) % n;
    } while (i !== start);
    return sum;
  }
  function match(a, b) {
    const step = Math.floor(Math.pow(N, 0.5));
    let min = Infinity;
    for (let i = 0; i < N; i += step) min = Math.min(min, cloudDist(a, b, i), cloudDist(b, a, i));
    return min;
  }

  /* ------------------------------------------------------------ built-in templates (box: x 0..60, y 0..100) */
  const ell = (cx, cy, rx, ry, a0 = -Math.PI / 2, turn = 1) => { const o = []; for (let i = 0; i <= 28; i++) { const t = a0 + i / 28 * Math.PI * 2 * turn; o.push(cx + rx * Math.cos(t), cy + ry * Math.sin(t)); } return o; };
  const P = (...xy) => xy.flat();
  const T = {
    '0': [[ell(30, 50, 25, 50)], [ell(30, 50, 30, 48, -Math.PI / 2, 1.08)], [ell(30, 50, 20, 50, -Math.PI * 0.4)]],
    '1': [[P([32, 0], [32, 100])], [P([12, 24], [36, 0], [36, 100])], [P([12, 24], [36, 0], [36, 100]), P([14, 100], [58, 100])], [P([18, 20], [38, 0], [33, 100])]],
    '2': [[P([6, 24], [14, 8], [30, 0], [48, 6], [55, 24], [46, 48], [4, 100], [60, 100])],
          [P([6, 18], [30, 0], [54, 16], [52, 38], [5, 100], [60, 98])],
          [P([8, 22], [28, 0], [52, 12], [50, 40], [10, 92], [8, 100], [22, 90], [40, 96], [60, 100])]],
    '3': [[P([6, 12], [28, 0], [50, 8], [52, 28], [30, 46], [52, 58], [58, 80], [40, 100], [16, 100], [4, 90])],
          [P([4, 0], [56, 0], [26, 40], [48, 50], [58, 74], [40, 100], [4, 92])],
          [P([8, 8], [40, 0], [52, 22], [24, 48], [56, 62], [52, 92], [28, 100], [6, 94])]],
    '4': [[P([44, 0], [2, 66], [60, 66]), P([44, 26], [44, 100])],
          [P([20, 0], [6, 60], [58, 60]), P([46, 30], [46, 100])],
          [P([46, 100], [46, 0], [2, 66], [60, 66])],
          [P([8, 0], [4, 56], [56, 56]), P([50, 0], [50, 100])]],
    '5': [[P([56, 0], [10, 0], [6, 44], [28, 38], [50, 48], [56, 72], [42, 96], [20, 100], [4, 92])],
          [P([10, 2], [6, 44], [28, 38], [50, 48], [56, 72], [42, 96], [20, 100], [4, 92]), P([10, 0], [56, 0])],
          [P([10, 0], [6, 46], [32, 40], [54, 56], [52, 86], [28, 100], [4, 92]), P([12, 2], [58, 2])],
          [P([12, 20], [8, 48], [32, 42], [52, 56], [50, 82], [30, 98], [6, 90]), P([28, 2], [60, 0], [88, 6])],
          [P([12, 16], [8, 46], [32, 40], [52, 56], [50, 82], [30, 98], [6, 90]), P([22, 0], [74, 2])]],
    '6': [[P([50, 4], [30, 6], [12, 30], [6, 62], [12, 90], [30, 100], [50, 92], [56, 72], [46, 56], [28, 54], [10, 66])],
          [P([46, 0], [16, 34], [6, 70], [16, 96], [40, 100], [56, 80], [48, 60], [24, 58], [8, 74])]],
    '7': [[P([4, 0], [58, 0], [22, 100])], [P([4, 0], [58, 0], [22, 100]), P([14, 50], [50, 50])],
          [P([2, 12], [8, 0], [58, 2], [30, 100])], [P([4, 2], [56, 0], [30, 52], [24, 100])], [P([10, 4], [50, 4], [26, 100])]],
    '8': [[P([30, 46], [52, 30], [48, 8], [30, 0], [12, 8], [8, 28], [30, 46], [55, 68], [52, 92], [30, 100], [8, 92], [5, 68], [30, 46])],
          [ell(30, 24, 20, 24), ell(30, 74, 26, 26)],
          [P([52, 10], [30, 0], [8, 14], [12, 36], [48, 62], [54, 88], [30, 100], [6, 88], [12, 62], [48, 36], [54, 14], [44, 4])]],
    '9': [[P([52, 32], [40, 48], [18, 48], [6, 32], [10, 10], [30, 0], [50, 8], [54, 32], [48, 100])],
          [P([52, 28], [30, 46], [8, 36], [10, 8], [32, 0], [52, 12], [52, 50], [44, 78], [26, 100])],
          [ell(30, 25, 23, 25, 0), P([53, 25], [53, 100])]],
    '+': [[P([30, 20], [30, 80]), P([0, 50], [60, 50])], [P([0, 50], [60, 50]), P([30, 18], [30, 82])], [P([30, 25], [30, 75]), P([5, 48], [55, 52])]],
    '-': [[P([0, 50], [60, 50])], [P([0, 52], [60, 48])]],
    '×': [[P([5, 20], [55, 80]), P([55, 20], [5, 80])], [P([55, 20], [5, 80]), P([5, 20], [55, 80])], [P([10, 30], [50, 75]), P([50, 28], [8, 78])]],
    '/': [[P([55, 0], [5, 100])], [P([45, 0], [15, 100])]],
    '(': [[P([42, 0], [18, 24], [10, 50], [18, 76], [42, 100])], [P([36, 0], [20, 30], [18, 70], [36, 100])]],
    ')': [[P([18, 0], [42, 24], [50, 50], [42, 76], [18, 100])], [P([24, 0], [40, 30], [42, 70], [24, 100])]]
  };

  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  function augment(strokes, k) {
    const out = [];
    for (let n = 0; n < k; n++) {
      const rot = (rnd() - 0.5) * 0.24, skew = (rnd() - 0.5) * 0.4, sx = 0.8 + rnd() * 0.4, j = 1.6;
      const c = Math.cos(rot), s = Math.sin(rot);
      out.push(strokes.map((st) => {
        const o = []; let wx = 0, wy = 0;
        for (let i = 0; i < st.length; i += 2) {
          wx = wx * 0.7 + (rnd() - 0.5) * j; wy = wy * 0.7 + (rnd() - 0.5) * j;
          let x = (st[i] - 30) * sx + (st[i + 1] - 50) * skew, y = st[i + 1] - 50;
          o.push(x * c - y * s + 30 + wx, x * s + y * c + 50 + wy);
        }
        return o;
      }));
    }
    return out;
  }
  let templates = null;
  function build() {
    seed = 1;
    templates = [];
    for (const [sym, vars] of Object.entries(T)) for (const v of vars) {
      templates.push({ sym, c: cloud(v), user: false });
      for (const a of augment(v, 5)) templates.push({ sym, c: cloud(a), user: false });
    }
    const userT = (typeof App !== 'undefined' && App.settings && App.settings.mathT) || {};
    for (const [sym, list] of Object.entries(userT)) for (const strokes of list) {
      templates.push({ sym, c: cloud(strokes), user: true });
      for (const a of augment(strokes, 2)) templates.push({ sym, c: cloud(a), user: true });
    }
  }
  function classify(strokes) {
    if (!templates) build();
    const c = cloud(strokes);
    const best = {};
    for (const t of templates) {
      const d = match(c, t.c) * (t.user ? 0.9 : 1);
      if (!(t.sym in best) || d < best[t.sym]) best[t.sym] = d;
    }
    const ranked = Object.entries(best).sort((a, b) => a[1] - b[1]);
    let sym = ranked[0][0];
    // "1" vs "/": decide by the slant of the longest stroke (a 1 stands almost upright)
    if (sym === '1' || sym === '/') {
      let longest = strokes[0], L = 0;
      for (const st of strokes) { const l = Math.hypot(st[st.length - 2] - st[0], st[st.length - 1] - st[1]); if (l > L) { L = l; longest = st; } }
      const dx = longest[longest.length - 2] - longest[0], dy = longest[longest.length - 1] - longest[1];
      const lean = Math.abs(Math.atan2(Math.abs(dx), Math.abs(dy))) * 180 / Math.PI;
      const rising = dx * dy < 0;                        // bottom-left ↔ top-right
      if (strokes.length === 1 && lean > 14 && rising) sym = '/'; else if (sym === '/' && lean <= 14) sym = '1';
    }
    return { sym, d: ranked[0][1], second: ranked[1] };
  }

  /* ------------------------------------------------------------ geometry helpers on stored strokes */
  const bb = (pts) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (let i = 0; i < pts.length; i += 3) { x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]); } return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 }; };
  const xy = (p) => { const o = []; for (let i = 0; i < p.length; i += 3) o.push(p[i], p[i + 1]); return o; };
  const isFlat = (b) => b.w >= 5 && b.h <= Math.max(3.5, 0.36 * b.w);   // works for small handwriting too

  /** If `s` together with a recent stroke forms "=", returns its bounding box */
  function findEquals(page, s) {
    const b = bb(s.p);
    if (!isFlat(b) || b.w > 220) return null;
    const recent = page.strokes.slice(-4, -1).reverse();
    for (const o of recent) {
      if (o.t !== 'pen' || o.calc) continue;
      const c = bb(o.p);
      if (!isFlat(c)) continue;
      const ov = Math.min(b.x1, c.x1) - Math.max(b.x0, c.x0);
      const gap = Math.abs(b.cy - c.cy);
      if (ov > 0.45 * Math.min(b.w, c.w) && gap > 1.5 && gap < 1.1 * Math.max(b.w, c.w) && Math.max(b.w, c.w) < 2.3 * Math.min(b.w, c.w))
        return { x0: Math.min(b.x0, c.x0), x1: Math.max(b.x1, c.x1), y0: Math.min(b.y0, c.y0), y1: Math.max(b.y1, c.y1), w: Math.max(b.x1, c.x1) - Math.min(b.x0, c.x0), cy: (b.cy + c.cy) / 2, ids: [s.id, o.id] };
    }
    return null;
  }

  /** Groups strokes left of "=" into symbols and recognizes them. Returns {tokens, groups, H, base} or {error} */
  function readExpression(page, eq) {
    const H0 = Math.max(14, eq.w * 1.7);
    const cand = page.strokes.filter((s) => s.t === 'pen' && !s.calc && !eq.ids.includes(s.id)).map((s) => ({ s, b: bb(s.p) }))
      .filter(({ b }) => b.x1 <= eq.x0 + 6 && b.cy > eq.cy - 1.2 * H0 && b.cy < eq.cy + 1.2 * H0 && b.h < 2.6 * H0 && b.w < 3 * H0)
      .sort((a, b) => a.b.x0 - b.b.x0);
    // group overlapping strokes into symbols
    const groups = [];
    for (const c of cand) {
      const g = groups[groups.length - 1];
      if (g) {
        const ov = Math.min(g.b.x1, c.b.x1) - Math.max(g.b.x0, c.b.x0);
        if (ov > 0.3 * Math.min(g.b.w || 1, c.b.w || 1) || (c.b.w < 0.15 * H0 && c.b.x0 < g.b.x1 + 2 && c.b.cy < g.b.y0)) {
          g.strokes.push(c.s);
          g.b = { x0: Math.min(g.b.x0, c.b.x0), x1: Math.max(g.b.x1, c.b.x1), y0: Math.min(g.b.y0, c.b.y0), y1: Math.max(g.b.y1, c.b.y1) };
          Object.assign(g.b, { w: g.b.x1 - g.b.x0, h: g.b.y1 - g.b.y0, cx: (g.b.x0 + g.b.x1) / 2, cy: (g.b.y0 + g.b.y1) / 2 });
          continue;
        }
      }
      groups.push({ strokes: [c.s], b: Object.assign({}, c.b) });
    }
    // a short flat stroke at the TOP of a neighbouring taller symbol is its roof (5, 7), not a minus sign
    const flat = (b) => b.w >= 3 && b.h <= Math.max(3.5, 0.36 * b.w);
    const merge = (a, b) => { a.strokes.push(...b.strokes); a.b = { x0: Math.min(a.b.x0, b.b.x0), x1: Math.max(a.b.x1, b.b.x1), y0: Math.min(a.b.y0, b.b.y0), y1: Math.max(a.b.y1, b.b.y1) }; Object.assign(a.b, { w: a.b.x1 - a.b.x0, h: a.b.y1 - a.b.y0, cx: (a.b.x0 + a.b.x1) / 2, cy: (a.b.y0 + a.b.y1) / 2 }); };
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      if (g.strokes.length !== 1 || !flat(g.b)) continue;
      const isRoofOf = (o) => o && o.b.h > 2.5 * Math.max(g.b.h, 2) && g.b.cy < o.b.y0 + 0.28 * o.b.h && g.b.y1 < o.b.y0 + 0.4 * o.b.h;
      const prev = groups[i - 1], next = groups[i + 1];
      const nearPrev = prev && g.b.x0 - prev.b.x1 < 0.5 * prev.b.h, nearNext = next && next.b.x0 - g.b.x1 < 0.5 * next.b.h;
      const cands = [];
      if (nearPrev && isRoofOf(prev)) cands.push([prev, Math.max(0, g.b.x0 - prev.b.x1)]);
      if (nearNext && isRoofOf(next)) cands.push([next, Math.max(0, next.b.x0 - g.b.x1) + (next.b.x0 > g.b.x0 ? 0 : 0)]);
      if (!cands.length) continue;
      // prefer the symbol the roof overlaps most / is closest to its left part (a 5's roof starts above its body)
      cands.sort((a, b) => (Math.min(g.b.x1, a[0].b.x1) - Math.max(g.b.x0, a[0].b.x0) > Math.min(g.b.x1, b[0].b.x1) - Math.max(g.b.x0, b[0].b.x0) ? -1 : 1));
      merge(cands[0][0], g);
      groups.splice(i, 1); i--;
    }
    // keep only the contiguous run that ends at "="
    const run = [];
    let right = eq.x0;
    for (let i = groups.length - 1; i >= 0; i--) {
      if (right - groups[i].b.x1 > Math.max(1.6 * H0, 70)) break;
      run.unshift(groups[i]); right = groups[i].b.x0;
    }
    if (!run.length) return { error: 'leer' };
    const tall = run.map((g) => g.b.h).sort((a, b) => a - b);
    const maxH = tall[tall.length - 1];
    const bigs = tall.filter((h) => h >= 0.45 * maxH);
    const H = Math.max(14, bigs[bigs.length >> 1]);
    const digitsB = run.filter((g) => g.b.h >= 0.6 * H).map((g) => g.b);
    const mid = digitsB.length ? digitsB.reduce((s, b) => s + b.cy, 0) / digitsB.length : eq.cy;
    const base = digitsB.length ? digitsB.map((b) => b.y1).sort((a, b) => a - b)[digitsB.length >> 1] : eq.cy + H / 2;
    const tokens = [];
    let worst = 0;
    for (const g of run) {
      const size = Math.max(g.b.w, g.b.h);
      // decimal comma: one short stroke that starts at/below the middle of the digits and reaches the baseline or below
      if (g.strokes.length === 1 && g.b.h < 0.75 * H && g.b.w < 0.4 * H && g.b.y0 > mid - 0.05 * H && g.b.y1 > base - 0.15 * H) { tokens.push({ v: ',', g }); continue; }
      // ":" = two tiny dots above each other (together they can be fairly tall)
      if (g.strokes.length === 2 && g.strokes.every((st) => { const q = bb(st.p); return Math.max(q.w, q.h) < 0.22 * H; }) && g.b.h > g.b.w * 1.4) { tokens.push({ v: ':', g }); continue; }
      if (size < 0.3 * H) {
        if (g.strokes.length === 2 && g.b.h > g.b.w * 1.4) tokens.push({ v: ':', g });
        else if (g.b.cy > mid + 0.22 * H) tokens.push({ v: ',', g });
        else tokens.push({ v: '·', g });
        continue;
      }
      const r = classify(g.strokes.map((s) => xy(s.p)));
      worst = Math.max(worst, r.d);
      let v = r.sym;
      if (/\d/.test(v) && g.b.h < 0.72 * H && g.b.y1 < mid) v = '^' + v;            // small raised digit = power
      tokens.push({ v, g, d: r.d, alt: r.second });
    }
    return { tokens, run, H, base, mid, worst };
  }

  function toFormula(tokens) {
    let s = '';
    for (const t of tokens) {
      const v = t.v;
      if (v === '×' || v === '·') s += '*';
      else if (v === ':') s += '/';
      else if (v === ',') s += '.';
      else if (v[0] === '^') s += (s.endsWith('^') ? '' : '^') + v.slice(1);
      else s += v;
    }
    return s.replace(/\^(\d)\^/g, '^$1');
  }
  function pretty(tokens) { return tokens.map((t) => (t.v === '-' ? '−' : t.v[0] === '^' ? ({ 2: '²', 3: '³' }[t.v[1]] || '^' + t.v[1]) : t.v)).join(' ').replace(/(\d) (?=[\d,])/g, '$1').replace(/, /g, ',').replace(/(^|[(] )− (?=\d)/g, '$1−'); }

  function evaluate(formula) {
    if (!/\d/.test(formula) || !/[+\-*/^]/.test(formula.replace(/^-/, ''))) return null;   // a bare number is not a task
    if (/[+\-*/^.]$/.test(formula) || /^[*/^.]/.test(formula)) return null;
    let f;
    try { f = Expr.parse(formula.replace(/\./g, ',')); } catch (e) { return null; }
    const v = f(0);
    return Number.isFinite(v) ? v : null;
  }
  function formatNumber(v) {
    if (Math.abs(v) >= 1e12) return null;
    let r = Math.round(v * 10000) / 10000;
    if (Object.is(r, -0)) r = 0;
    return String(r).replace('.', ',');
  }

  /* ------------------------------------------------------------ single-stroke glyphs for the answer (box 60×100) */
  const G = {
    '0': [ell(30, 50, 26, 50)],
    '1': [P([12, 24], [38, 0], [38, 100])],
    '2': T['2'][0], '3': T['3'][0], '4': T['4'][0], '5': [T['5'][1][1], T['5'][1][0]].reverse(), '6': T['6'][0],
    '7': [P([4, 0], [58, 0], [22, 100])], '8': T['8'][0], '9': T['9'][0],
    '-': [P([8, 56], [52, 56])], ',': [P([26, 88], [30, 100], [20, 118])]
  };
  function chaikin(a, it = 2) {
    for (let k = 0; k < it; k++) {
      if (a.length < 6) return a;
      const o = [a[0], a[1]];
      for (let i = 0; i < a.length - 2; i += 2) { o.push(0.75 * a[i] + 0.25 * a[i + 2], 0.75 * a[i + 1] + 0.25 * a[i + 3], 0.25 * a[i] + 0.75 * a[i + 2], 0.25 * a[i + 1] + 0.75 * a[i + 3]); }
      o.push(a[a.length - 2], a[a.length - 1]);
      a = o;
    }
    return a;
  }
  /** strokes (page coords) that write `text` with its baseline at `base`, starting at x, glyph height H */
  function writeText(text, x, base, H) {
    const out = [], k = H / 100;
    let cx = x;
    for (const ch of text) {
      const g = G[ch];
      if (!g) { cx += 0.4 * H; continue; }
      const wch = ch === ',' ? 0.35 : ch === '1' ? 0.5 : 0.62;
      for (const st of g) {
        const sm = ch === '1' || ch === '7' || ch === '-' || ch === '4' ? st : chaikin(st);
        const p = [];
        for (let i = 0; i < sm.length; i += 2) p.push(Math.round((cx + sm[i] * k * (ch === ',' ? 1 : 0.92)) * 10) / 10, Math.round((base - H + sm[i + 1] * k) * 10) / 10, 0.5);
        out.push(p);
      }
      cx += wch * H + 0.14 * H;
    }
    return out;
  }

  const REJECT = 0.8;   // $P distance above which a symbol counts as unreadable (measured: correct ≤ 0.68 in 95 %, scribbles ≥ 0.91 in 95 %)
  return { REJECT, cloud, classify, build, findEquals, readExpression, toFormula, pretty, evaluate, formatNumber, writeText, bb, templatesFor: () => T, reset: () => { templates = null; } };
})();
