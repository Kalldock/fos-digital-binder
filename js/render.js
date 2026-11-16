/* Rendering of pages (paper, ink, elements) and ink geometry. Shared by editor, thumbnails and print. */
'use strict';
const PAGE_W = 1000, A4_H = 1414;
const GRID = 23.81;     // 5 mm squares
const LINE = 40;        // ~8.5 mm line spacing
const MARGIN_X = 900;   // correction margin (right)

const Ink = {
  /** Filled outline path for a pressure-sensitive pen stroke. p = flat [x,y,pressure,...] */
  outline(p, w) {
    const n = p.length / 3;
    const half = (i) => (w / 2) * (0.55 + 0.9 * p[i * 3 + 2]);
    if (n < 2 || Ink.length(p) < 0.8) {
      const r = Math.max(half(0), 0.6), x = p[0], y = p[1];
      return `M${(x - r).toFixed(1)} ${y.toFixed(1)}a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(2 * r).toFixed(2)} 0a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(-2 * r).toFixed(2)} 0Z`;
    }
    const L = [], R = [];
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      let dx = p[b * 3] - p[a * 3], dy = p[b * 3 + 1] - p[a * 3 + 1];
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len, r = half(i);
      const x = p[i * 3], y = p[i * 3 + 1];
      L.push([x + nx * r, y + ny * r]);
      R.push([x - nx * r, y - ny * r]);
    }
    const rEnd = half(n - 1), rStart = half(0);
    const f = (v) => v.toFixed(1);
    let d = `M${f(L[0][0])} ${f(L[0][1])}` + Ink.smooth(L);
    d += `A${rEnd.toFixed(2)} ${rEnd.toFixed(2)} 0 0 0 ${f(R[n - 1][0])} ${f(R[n - 1][1])}`;
    R.reverse();
    d += Ink.smooth(R);
    d += `A${rStart.toFixed(2)} ${rStart.toFixed(2)} 0 0 0 ${f(L[0][0])} ${f(L[0][1])}Z`;
    return d;
  },
  /** quadratic smoothing through midpoints, starting at pts[0] (assumes path is already at pts[0]) */
  smooth(pts) {
    let d = '';
    const f = (v) => v.toFixed(1);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      d += `Q${f(pts[i][0])} ${f(pts[i][1])} ${f(mx)} ${f(my)}`;
    }
    const l = pts[pts.length - 1];
    d += `L${f(l[0])} ${f(l[1])}`;
    return d;
  },
  /** centerline (for highlighter) */
  center(p) {
    const pts = [];
    for (let i = 0; i < p.length; i += 3) pts.push([p[i], p[i + 1]]);
    if (pts.length === 1) pts.push([pts[0][0] + 0.1, pts[0][1]]);
    return `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}` + Ink.smooth(pts);
  },
  length(p) { let l = 0; for (let i = 3; i < p.length; i += 3) l += Math.hypot(p[i] - p[i - 3], p[i + 1] - p[i - 2]); return l; },
  bbox(p) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < p.length; i += 3) { const x = p[i], y = p[i + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return { x0, y0, x1, y1 };
  },
  segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  },
  hit(s, x, y, r) {
    const p = s.p, rr = r + s.w / 2;
    const b = s._bb || (s._bb = Ink.bbox(p));
    if (x < b.x0 - rr || x > b.x1 + rr || y < b.y0 - rr || y > b.y1 + rr) return false;
    if (p.length === 3) return Math.hypot(p[0] - x, p[1] - y) <= rr;
    for (let i = 3; i < p.length; i += 3) if (Ink.segDist(x, y, p[i - 3], p[i - 2], p[i], p[i + 1]) <= rr) return true;
    return false;
  },
  /** insert points so that consecutive points are at most `step` apart */
  resample(p, step) {
    const out = [p[0], p[1], p[2]];
    for (let i = 3; i < p.length; i += 3) {
      const ax = p[i - 3], ay = p[i - 2], ap = p[i - 1], bx = p[i], by = p[i + 1], bp = p[i + 2];
      const d = Math.hypot(bx - ax, by - ay), k = Math.ceil(d / step);
      for (let j = 1; j < k; j++) { const t = j / k; out.push(ax + (bx - ax) * t, ay + (by - ay) * t, ap + (bp - ap) * t); }
      out.push(bx, by, bp);
    }
    return out.map((v, i) => (i % 3 === 2 ? Math.round(v * 100) / 100 : Math.round(v * 10) / 10));
  },
  /** partial erase: returns array of remaining pieces (may be empty) or null when untouched */
  erasePartial(s, x, y, r) {
    if (!Ink.hit(s, x, y, r)) return null;
    const p = s.p, pieces = [];
    let cur = [];
    const rr = r + s.w / 2;
    for (let i = 0; i < p.length; i += 3) {
      if (Math.hypot(p[i] - x, p[i + 1] - y) <= rr) { if (cur.length >= 6) pieces.push(cur); cur = []; }
      else cur.push(p[i], p[i + 1], p[i + 2]);
    }
    if (cur.length >= 6) pieces.push(cur);
    if (pieces.length === 1 && pieces[0].length === p.length) return null;
    return pieces;
  },
  /** straight stroke from (x0,y0) to (x1,y1) with constant pressure, resampled so eraser/lasso keep working */
  makeLine(x0, y0, x1, y1, pr) {
    const r = (v) => Math.round(v * 10) / 10;
    if (Math.hypot(x1 - x0, y1 - y0) < 0.5) return [r(x0), r(y0), pr];
    return Ink.resample([r(x0), r(y0), pr, r(x1), r(y1), pr], 4);
  },
  /** Decides whether a freehand stroke is meant as a straight line (Goodnotes-style hold-to-straighten).
   *  Returns null for handwriting / curves. Thresholds are in page units (page = 1000 wide). */
  lineFit(p) {
    const n = p.length / 3;
    if (n < 4) return null;
    const x0 = p[0], y0 = p[1], x1 = p[p.length - 3], y1 = p[p.length - 2];
    const L = Math.hypot(x1 - x0, y1 - y0);
    if (L < 30) return null;                                   // too short: letters, dots
    let maxDev = 0, path = 0;
    const nx = -(y1 - y0) / L, ny = (x1 - x0) / L;
    for (let i = 0; i < p.length; i += 3) {
      const d = Math.abs((p[i] - x0) * nx + (p[i + 1] - y0) * ny);
      if (d > maxDev) maxDev = d;
      if (i) path += Math.hypot(p[i] - p[i - 3], p[i + 1] - p[i - 2]);
    }
    if (maxDev > Math.max(6, 0.12 * L)) return null;           // too curvy (handwriting, arcs)
    if (path > 1.35 * L) return null;                          // zig-zag / back and forth
    const prs = []; for (let i = 2; i < p.length; i += 3) prs.push(p[i]);
    prs.sort((a, b) => a - b);
    return { x0, y0, x1, y1, pr: prs[Math.floor(prs.length / 2)] };
  },
  /** Smooths handwriting: resample to even spacing, then Gaussian-average positions.
   *  Window shrinks towards both ends, so first/last points stay exactly where they were. level: 0 off, 1 light, 2 strong */
  stabilize(p, level) {
    if (!level || p.length < 12) return p;
    const q = Ink.resample(p, 2.5), n = q.length / 3;
    const sigma = level === 1 ? 1.3 : 2.4, K = Math.ceil(sigma * 2.5);
    const w = []; for (let k = 0; k <= K; k++) w.push(Math.exp(-(k * k) / (2 * sigma * sigma)));
    const out = q.slice();
    for (let i = 1; i < n - 1; i++) {
      const k = Math.min(K, i, n - 1 - i);
      let sx = q[i * 3] * w[0], sy = q[i * 3 + 1] * w[0], sw = w[0];
      for (let j = 1; j <= k; j++) {
        sx += (q[(i - j) * 3] + q[(i + j) * 3]) * w[j];
        sy += (q[(i - j) * 3 + 1] + q[(i + j) * 3 + 1]) * w[j];
        sw += 2 * w[j];
      }
      out[i * 3] = Math.round(sx / sw * 10) / 10;
      out[i * 3 + 1] = Math.round(sy / sw * 10) / 10;
    }
    return out;
  },
  /** closed point list → stroke points along the outline */
  polyStroke(corners, pr) {
    const p = [];
    corners.concat([corners[0]]).forEach(([x, y]) => p.push(x, y, pr));
    return Ink.resample(p, 4);
  },
  rdp(pts, eps) {
    if (pts.length < 3) return pts.slice();
    const [a, b] = [pts[0], pts[pts.length - 1]];
    let idx = -1, max = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = Ink.segDist(pts[i][0], pts[i][1], a[0], a[1], b[0], b[1]);
      if (d > max) { max = d; idx = i; }
    }
    if (max <= eps) return [a, b];
    const l = Ink.rdp(pts.slice(0, idx + 1), eps), r = Ink.rdp(pts.slice(idx), eps);
    return l.slice(0, -1).concat(r);
  },
  /** Recognises a closed hand-drawn shape (ellipse/circle, triangle, rectangle/quadrilateral).
   *  Returns {kind, p} with perfect-shape stroke points, or null (open strokes, handwriting, small letters). */
  shapeFit(p) {
    const pts = []; for (let i = 0; i < p.length; i += 3) pts.push([p[i], p[i + 1]]);
    if (pts.length < 10) return null;
    const b = Ink.bbox(p), W = b.x1 - b.x0, H = b.y1 - b.y0, diag = Math.hypot(W, H);
    if (diag < 50 || Math.min(W, H) < 12) return null;          // letters like o/a/e stay untouched
    let per = 0; for (let i = 1; i < pts.length; i++) per += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const gap = Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]);
    if (gap > Math.max(25, 0.16 * per)) return null;             // not closed → no shape
    const pr = 0.5;
    // --- polygon candidate
    const eps = 0.06 * diag;
    let far = 0, fd = 0;
    pts.forEach((q, i) => { const d = Math.hypot(q[0] - pts[0][0], q[1] - pts[0][1]); if (d > fd) { fd = d; far = i; } });
    let poly = Ink.rdp(pts.slice(0, far + 1), eps).slice(0, -1).concat(Ink.rdp(pts.slice(far), eps));
    if (Math.hypot(poly[0][0] - poly.at(-1)[0], poly[0][1] - poly.at(-1)[1]) < 0.2 * diag) poly.pop();
    // merge corners that are too close, drop nearly straight corners
    for (let changed = true; changed && poly.length > 2;) {
      changed = false;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[(i + poly.length - 1) % poly.length], c = poly[i], d = poly[(i + 1) % poly.length];
        const v1 = [a[0] - c[0], a[1] - c[1]], v2 = [d[0] - c[0], d[1] - c[1]];
        const ang = Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(...v1) * Math.hypot(...v2) || 1)))) * 180 / Math.PI;
        if (Math.hypot(...v2) < 0.12 * diag || ang > 155) { poly.splice(i, 1); changed = true; break; }
      }
    }
    const edgeRes = (corners) => {
      let s = 0;
      for (const q of pts) {
        let m = Infinity;
        for (let i = 0; i < corners.length; i++) { const a = corners[i], c = corners[(i + 1) % corners.length]; m = Math.min(m, Ink.segDist(q[0], q[1], a[0], a[1], c[0], c[1])); }
        s += m;
      }
      return s / pts.length / diag;
    };
    if ((poly.length === 3 || poly.length === 4) && edgeRes(poly) < 0.035) {
      if (poly.length === 3) return { kind: 'Dreieck', p: Ink.polyStroke(poly, pr) };
      // rectangle if all corners are ~90°
      const angles = poly.map((c, i) => { const a = poly[(i + 3) % 4], d = poly[(i + 1) % 4]; const v1 = [a[0] - c[0], a[1] - c[1]], v2 = [d[0] - c[0], d[1] - c[1]]; return Math.acos((v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(...v1) * Math.hypot(...v2))) * 180 / Math.PI; });
      if (angles.every((a) => Math.abs(a - 90) < 14)) {
        let sx = 0, sy = 0;
        for (let i = 0; i < 4; i++) { const a = poly[i], c = poly[(i + 1) % 4]; const t = Math.atan2(c[1] - a[1], c[0] - a[0]) * 4; sx += Math.cos(t); sy += Math.sin(t); }
        let th = Math.atan2(sy, sx) / 4;
        if (Math.abs(th) < 7 * Math.PI / 180) th = 0;            // snap to the paper axes
        const ux = [Math.cos(th), Math.sin(th)], uy = [-Math.sin(th), Math.cos(th)];
        let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
        for (const q of pts) { const u = q[0] * ux[0] + q[1] * ux[1], v = q[0] * uy[0] + q[1] * uy[1]; a0 = Math.min(a0, u); a1 = Math.max(a1, u); b0 = Math.min(b0, v); b1 = Math.max(b1, v); }
        const P = (u, v) => [u * ux[0] + v * uy[0], u * ux[1] + v * uy[1]];
        return { kind: 'Rechteck', p: Ink.polyStroke([P(a0, b0), P(a1, b0), P(a1, b1), P(a0, b1)], pr) };
      }
      return { kind: 'Viereck', p: Ink.polyStroke(poly, pr) };
    }
    // --- ellipse / circle candidate (axis aligned, from the bounding box)
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    let rx = W / 2, ry = H / 2, err = 0;
    for (const q of pts) err += Math.abs(Math.hypot((q[0] - cx) / rx, (q[1] - cy) / ry) - 1);
    err /= pts.length;
    if (err < 0.1) {
      let kind = 'Ellipse';
      if (Math.abs(rx - ry) / Math.max(rx, ry) < 0.15) { rx = ry = (rx + ry) / 2; kind = 'Kreis'; }
      const N = Math.max(48, Math.round(Math.PI * (rx + ry) / 4)), e = [];
      for (let i = 0; i <= N; i++) { const t = (i / N) * Math.PI * 2; e.push(Math.round((cx + rx * Math.cos(t)) * 10) / 10, Math.round((cy + ry * Math.sin(t)) * 10) / 10, pr); }
      return { kind, p: e };
    }
    return null;
  },
  pointInPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
};

const Render = {
  paperColor() { return (App.settings && App.settings.paperColor) || '#ffffff'; },

  paperSVG(page) {
    const h = page.h || A4_H;
    let inner = '';
    if (page.paper === 'lined') {
      for (let y = 130; y < h - 50; y += LINE) inner += `<line x1="0" y1="${y}" x2="${PAGE_W}" y2="${y}"/>`;
      inner = `<g stroke="#b9cbe6" stroke-width="1.3">${inner}</g><line x1="${MARGIN_X}" y1="0" x2="${MARGIN_X}" y2="${h}" stroke="#f0a8a8" stroke-width="1.6"/>`;
    } else if (page.paper === 'mm') {
      // Millimeterpapier: 1 mm / 5 mm / 10 mm lines on A4 (page width = 210 mm)
      const MM = PAGE_W / 210, x0 = 10 * MM, y0 = 10 * MM;
      const cols = 190, rows = Math.floor(((h / MM) - 20)), x1 = x0 + cols * MM, y1 = y0 + rows * MM;
      const d = ['', '', ''];
      for (let i = 0; i <= cols; i++) { const x = (x0 + i * MM).toFixed(2); d[i % 10 === 0 ? 2 : i % 5 === 0 ? 1 : 0] += `M${x} ${y0.toFixed(2)}V${y1.toFixed(2)}`; }
      for (let j = 0; j <= rows; j++) { const y = (y0 + j * MM).toFixed(2); d[j % 10 === 0 ? 2 : j % 5 === 0 ? 1 : 0] += `M${x0.toFixed(2)} ${y}H${x1.toFixed(2)}`; }
      inner = `<path d="${d[0]}" stroke="#f8e3d4" stroke-width=".5" fill="none"/><path d="${d[1]}" stroke="#f2c9ab" stroke-width=".8" fill="none"/><path d="${d[2]}" stroke="#eaa97c" stroke-width="1.15" fill="none"/>`;
    } else if (page.paper === 'grid') {
      const x0 = 24, y0 = 48;
      const cols = Math.floor((MARGIN_X - x0) / GRID), rows = Math.floor((h - y0 - 40) / GRID);
      const x1 = x0 + cols * GRID, y1 = y0 + rows * GRID;
      for (let i = 0; i <= cols; i++) { const x = (x0 + i * GRID).toFixed(2); inner += `<line x1="${x}" y1="${y0}" x2="${x}" y2="${y1.toFixed(2)}"/>`; }
      for (let j = 0; j <= rows; j++) { const y = (y0 + j * GRID).toFixed(2); inner += `<line x1="${x0}" y1="${y}" x2="${x1.toFixed(2)}" y2="${y}"/>`; }
      inner = `<g stroke="#c4d3ea" stroke-width="1">${inner}</g>`;
    }
    else if (page.paper === 'parch' || page.paper === 'parchl') inner = Render.parchment(h, page.paper === 'parchl');
    else if (page.paper === 'lcd') {
      // helles LCD-Grün mit feinem Punktraster (ruhig, gut zum Schreiben)
      inner = `<defs><pattern id="lcdDot" width="25" height="25" patternUnits="userSpaceOnUse"><rect x="11" y="11" width="3" height="3" fill="#b9cda6"/></pattern></defs><rect width="${PAGE_W}" height="${h}" fill="#eef4e6"/><rect width="${PAGE_W}" height="${h}" fill="url(#lcdDot)"/>`;
    }
    return `<svg class="paper" viewBox="0 0 ${PAGE_W} ${h}" preserveAspectRatio="none">${inner}</svg>`;
  },
  /** Pergament: warmer Grundton, sanfte Flecken und Randschatten – ruhig genug zum Schreiben */
  parchment(h, lined) {
    const sp = [[180, 260, 260, 170, .10], [760, 520, 300, 220, .08], [320, 980, 340, 240, .09], [820, 1250, 260, 200, .07], [540, 160, 220, 120, .06]];
    let s = `<defs><radialGradient id="pchV" cx="50%" cy="50%" r="72%"><stop offset="62%" stop-color="#b08a4a" stop-opacity="0"/><stop offset="100%" stop-color="#9c7536" stop-opacity=".30"/></radialGradient>
      <radialGradient id="pchS"><stop offset="0" stop-color="#b8945a" stop-opacity="1"/><stop offset="1" stop-color="#b8945a" stop-opacity="0"/></radialGradient></defs>
      <rect width="${PAGE_W}" height="${h}" fill="#f2e8cf"/>`;
    for (let i = 0; i < Math.ceil(h / A4_H); i++) for (const [x, y, rx, ry, o] of sp) s += `<ellipse cx="${x}" cy="${y + i * A4_H}" rx="${rx}" ry="${ry}" fill="url(#pchS)" opacity="${o}"/>`;
    s += `<rect width="${PAGE_W}" height="${h}" fill="url(#pchV)"/>`;
    if (lined) {
      let l = '';
      for (let y = 130; y < h - 50; y += LINE) l += `<line x1="0" y1="${y}" x2="${PAGE_W}" y2="${y}"/>`;
      s += `<g stroke="#c5ad80" stroke-width="1.3">${l}</g><line x1="${MARGIN_X}" y1="0" x2="${MARGIN_X}" y2="${h}" stroke="#c98d76" stroke-width="1.6"/>`;
    }
    return s;
  },

  strokePath(s) {
    if (s.t === 'hl') return `<path data-id="${s.id}" d="${Ink.center(s.p)}" fill="none" stroke="${s.c}" stroke-opacity=".42" stroke-width="${s.w}" stroke-linecap="round" stroke-linejoin="round"/>`;
    return `<path data-id="${s.id}" d="${Ink.outline(s.p, s.w)}" fill="${s.c}"/>`;
  },

  inkSVG(page) {
    const h = page.h || A4_H;
    let hl = '', pen = '';
    for (const s of page.strokes) { if (s.t === 'hl') hl += Render.strokePath(s); else pen += Render.strokePath(s); }
    return `<svg class="ink" viewBox="0 0 ${PAGE_W} ${h}"><g class="hl">${hl}</g><g class="pen">${pen}</g></svg>`;
  },

  elStyle(el) {
    let s = `left:${el.x}px;top:${el.y}px;`;
    if (el.type === 'text' || el.type === 'check') s += `width:${el.w}px;font-size:${el.fs || 22}px;`;
    else if (el.type === 'table') s += `transform:scale(${el.s || 1});`;
    else s += `width:${el.w}px;height:${el.h}px;`;
    return s;
  },

  elInner(el, doc) {
    switch (el.type) {
      case 'text': return `<div class="tx">${el.html || ''}</div>`;
      case 'image': return `<img src="${(doc.images && doc.images[el.img]) || ''}" draggable="false" alt="">`;
      case 'table': return Render.tableHTML(el.sheet);
      case 'check': return (el.items || []).map((it, i) => `<div class="ck-row${it.d ? ' done' : ''}"><span class="ck-box" data-i="${i}"></span><span class="ck-t">${esc(it.t)}</span></div>`).join('');
      case 'graph': return Render.graphSVG(el.fns, el.view, el.w, el.h, { marks: el.marks !== false, legend: true });
    }
    return '';
  },

  elHTML(el, doc) {
    return `<div class="el el-${el.type}" data-id="${el.id}" style="${Render.elStyle(el)}">${Render.elInner(el, doc)}</div>`;
  },

  /** Full page DOM (string). */
  pageHTML(page, doc) {
    const h = page.h || A4_H;
    const bg = page.bg && doc.images && doc.images[page.bg] ? `<img class="pdfbg" src="${doc.images[page.bg]}" alt="">` : '';
    const els = page.els.map((e) => Render.elHTML(e, doc)).join('');
    return `<div class="page" data-id="${page.id}" style="height:${h}px;background:${Render.paperColor()}">${Render.paperSVG(page)}${bg}<div class="els">${els}</div>${Render.inkSVG(page)}<svg class="ovl" viewBox="0 0 ${PAGE_W} ${h}"></svg></div>`;
  },

  /** Lightweight vector thumbnail (images included, text as grey bars). */
  thumbSVG(page, doc, opts = {}) {
    const h = page.h || A4_H;
    let s = `<svg class="pg" viewBox="0 0 ${PAGE_W} ${h}" xmlns="http://www.w3.org/2000/svg"><rect width="${PAGE_W}" height="${h}" fill="${Render.paperColor()}"/>`;
    s += Render.paperSVG(page).replace('<svg class="paper"', '<svg').replace('preserveAspectRatio="none"', `width="${PAGE_W}" height="${h}"`);
    if (page.bg && doc.images && doc.images[page.bg] && !opts.noImages) s += `<image href="${doc.images[page.bg]}" width="${PAGE_W}" height="${h}" preserveAspectRatio="xMidYMid meet"/>`;
    for (const el of page.els) {
      if (el.type === 'image' && !opts.noImages && doc.images && doc.images[el.img]) s += `<image href="${doc.images[el.img]}" x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" preserveAspectRatio="none"/>`;
      else if (el.type === 'check') {
        const fs = el.fs || 22;
        (el.items || []).forEach((it, i) => {
          const y = el.y + 6 + i * fs * 1.6;
          s += `<rect x="${el.x + 4}" y="${y}" width="${fs}" height="${fs}" rx="4" fill="${it.d ? '#16a34a' : 'none'}" stroke="${it.d ? '#16a34a' : '#6b7488'}" stroke-width="3"/>`;
          s += `<rect x="${el.x + fs * 1.6}" y="${y + fs * 0.25}" width="${Math.min(el.w - fs * 2, 12 * it.t.length)}" height="${fs * 0.5}" rx="4" fill="${it.d ? '#c3c9d6' : '#9aa3b8'}"/>`;
        });
      } else if (el.type === 'text') {
        const lines = Math.max(1, Math.round((el._h || 40) / ((el.fs || 22) * 1.35)));
        for (let i = 0; i < lines; i++) s += `<rect x="${el.x + 6}" y="${el.y + 8 + i * (el.fs || 22) * 1.35}" width="${el.w * (i === lines - 1 ? 0.6 : 0.95)}" height="${(el.fs || 22) * 0.55}" rx="4" fill="#9aa3b8"/>`;
      } else {
        const w = el.w || (el._w || 300), hh = el.h || (el._h || 150);
        s += `<rect x="${el.x}" y="${el.y}" width="${w * (el.s || 1)}" height="${hh * (el.s || 1)}" fill="#eef1f8" stroke="#6b7488" stroke-width="3"/>`;
        if (el.type === 'graph') s += `<path d="M${el.x + 10} ${el.y + el.h - 20} Q${el.x + el.w / 2} ${el.y - el.h * 0.4} ${el.x + el.w - 10} ${el.y + el.h - 20}" fill="none" stroke="#2563eb" stroke-width="6"/>`;
      }
    }
    const step = opts.simplify ? 2 : 1;
    let hl = '', pen = '';
    for (const st of page.strokes) {
      let p = st.p;
      if (step > 1 && p.length > 30) { const q = []; for (let i = 0; i < p.length; i += 3 * step) q.push(p[i], p[i + 1], p[i + 2]); q.push(p[p.length - 3], p[p.length - 2], p[p.length - 1]); p = q; }
      const s2 = Object.assign({}, st, { p });
      if (st.t === 'hl') hl += Render.strokePath(s2); else pen += Render.strokePath(s2);
    }
    s += hl.replace(/ data-id="[^"]*"/g, '') + pen.replace(/ data-id="[^"]*"/g, '') + '</svg>';
    return s;
  },

  /* ------------------------------------------------------------ tables */
  tableHTML(sheet, opts = {}) {
    const ev = SheetEngine.evaluator(sheet);
    const covered = new Set(), spans = {};
    for (const m of sheet.merges || []) {
      spans[m.r + ',' + m.c] = m;
      for (let r = m.r; r < m.r + m.rs; r++) for (let c = m.c; c < m.c + m.cs; c++) if (r !== m.r || c !== m.c) covered.add(r + ',' + c);
    }
    const cls = ['sh', 'b-' + (sheet.border || 'all')];
    if (sheet.header) cls.push('hdr');
    if (sheet.wrap) cls.push('wrap');
    // optionale Spaltenbreiten (px, ungeskaliert) – ältere Tabellen ohne cw bleiben unverändert automatisch breit
    const cw = Array.isArray(sheet.cw) && sheet.cw.length === sheet.cols ? sheet.cw : null;
    if (cw) cls.push('cw');
    let s = cw ? `<table class="${cls.join(' ')}" style="width:${cw.reduce((a, w) => a + w, 0)}px"><colgroup>${cw.map((w) => `<col style="width:${w}px">`).join('')}</colgroup>` : `<table class="${cls.join(' ')}">`;
    for (let r = 0; r < sheet.rows; r++) {
      s += '<tr>';
      for (let c = 0; c < sheet.cols; c++) {
        if (covered.has(r + ',' + c)) continue;
        const ref = SheetEngine.refName(r, c);
        const cell = sheet.cells[ref] || {};
        const res = ev.get(ref);
        const m = spans[r + ',' + c];
        const tdc = [];
        if (res.e) tdc.push('err'); else if (typeof res.v === 'number') tdc.push('num');
        if (cell.b) tdc.push('b');
        let st = cell.bg ? `background-color:${cell.bg};` : '';
        if (cell.al) st += `text-align:${cell.al};`;
        s += `<td data-c="${c}"${m ? ` rowspan="${m.rs}" colspan="${m.cs}"` : ''} class="${tdc.join(' ')}"${st ? ` style="${st}"` : ''}>${esc(SheetEngine.display(res))}</td>`;
      }
      s += '</tr>';
    }
    return s + '</table>';
  },

  /* ------------------------------------------------------------ graphs */
  niceStep(range, target) {
    const raw = range / target, mag = Math.pow(10, Math.floor(Math.log10(raw))), r = raw / mag;
    return (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag;
  },

  graphSVG(fns, view, w, h, opts = {}) {
    const { xmin, xmax, ymin, ymax } = view;
    const sx = (x) => ((x - xmin) / (xmax - xmin)) * w;
    const sy = (y) => h - ((y - ymin) / (ymax - ymin)) * h;
    const fs = opts.fontSize || Math.max(11, Math.min(18, Math.min(w, h) / 32));
    const fmt = (v) => (Math.round(v * 1e6) / 1e6 + 0).toLocaleString('de-DE');
    const xs = Render.niceStep(xmax - xmin, Math.max(4, w / (fs * 5))), ys = Render.niceStep(ymax - ymin, Math.max(4, h / (fs * 3.5)));
    let g = `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,sans-serif" font-size="${fs}"><rect width="${w}" height="${h}" fill="#fff"/>`;
    // minor + major grid
    let grid = '';
    const mxs = xs / 2, mys = ys / 2;
    for (let x = Math.ceil(xmin / mxs) * mxs; x <= xmax; x += mxs) grid += `<line x1="${sx(x).toFixed(1)}" y1="0" x2="${sx(x).toFixed(1)}" y2="${h}" stroke="${Math.abs(x / xs - Math.round(x / xs)) < 1e-6 ? '#cfd8e8' : '#ebeff6'}"/>`;
    for (let y = Math.ceil(ymin / mys) * mys; y <= ymax; y += mys) grid += `<line x1="0" y1="${sy(y).toFixed(1)}" x2="${w}" y2="${sy(y).toFixed(1)}" stroke="${Math.abs(y / ys - Math.round(y / ys)) < 1e-6 ? '#cfd8e8' : '#ebeff6'}"/>`;
    g += grid;
    // axes
    const ax = clamp(sy(0), 0, h), ay = clamp(sx(0), 0, w);
    g += `<g stroke="#253047" stroke-width="1.8" fill="#253047"><line x1="0" y1="${ax}" x2="${w - 2}" y2="${ax}"/><line x1="${ay}" y1="${h}" x2="${ay}" y2="2"/>`;
    g += `<path d="M${w} ${ax}l-${fs * 0.7} -${fs * 0.35}v${fs * 0.7}z"/><path d="M${ay} 0l-${fs * 0.35} ${fs * 0.7}h${fs * 0.7}z"/></g>`;
    g += `<text x="${w - fs * 0.9}" y="${ax - fs * 0.6}" fill="#253047" font-weight="700" font-style="italic">x</text><text x="${ay + fs * 0.6}" y="${fs * 1.1}" fill="#253047" font-weight="700" font-style="italic">y</text>`;
    // tick labels
    let lab = '';
    for (let x = Math.ceil(xmin / xs) * xs; x <= xmax; x += xs) {
      if (Math.abs(x) < xs * 1e-6) continue;
      const px = sx(x);
      if (px < fs || px > w - fs * 2) continue;
      const ty = ax + fs * 1.25 > h - 2 ? ax - fs * 0.5 : ax + fs * 1.25;
      lab += `<line x1="${px.toFixed(1)}" y1="${ax - 4}" x2="${px.toFixed(1)}" y2="${ax + 4}" stroke="#253047" stroke-width="1.5"/><text x="${px.toFixed(1)}" y="${ty}" text-anchor="middle">${fmt(x)}</text>`;
    }
    for (let y = Math.ceil(ymin / ys) * ys; y <= ymax; y += ys) {
      if (Math.abs(y) < ys * 1e-6) continue;
      const py = sy(y);
      if (py < fs * 1.5 || py > h - fs) continue;
      const left = ay - 6 < fs * 2.5;
      lab += `<line x1="${ay - 4}" y1="${py.toFixed(1)}" x2="${ay + 4}" y2="${py.toFixed(1)}" stroke="#253047" stroke-width="1.5"/><text x="${left ? ay + 8 : ay - 8}" y="${(py + fs * 0.35).toFixed(1)}" text-anchor="${left ? 'start' : 'end'}">${fmt(y)}</text>`;
    }
    if (sx(0) > 0 && sx(0) < w && sy(0) > 0 && sy(0) < h) lab += `<text x="${ay - 6}" y="${ax + fs * 1.15}" text-anchor="end">0</text>`;
    g += `<g fill="#3a455e">${lab}</g>`;
    // curves
    const clip = 'c' + Math.random().toString(36).slice(2, 7);
    g += `<clipPath id="${clip}"><rect width="${w}" height="${h}"/></clipPath><g clip-path="url(#${clip})" fill="none" stroke-width="${Math.max(2.5, fs * 0.2)}" stroke-linejoin="round" stroke-linecap="round">`;
    let marks = '', legend = '', li = 0;
    for (const fn of fns) {
      if (fn.hidden) continue;
      let f;
      try { f = fn.f || Expr.parse(fn.expr); } catch (e) { continue; }
      const N = Math.max(300, Math.round(w * 1.2));
      let d = '', pen = false, py0 = null;
      const span = (ymax - ymin);
      for (let i = 0; i <= N; i++) {
        const x = xmin + ((xmax - xmin) * i) / N, y = f(x);
        if (!Number.isFinite(y) || Math.abs(y - (ymin + ymax) / 2) > span * 50) { pen = false; py0 = null; continue; }
        const py = sy(y);
        if (py0 !== null && Math.abs(py - py0) > h * 3) pen = false;
        d += (pen ? 'L' : 'M') + sx(x).toFixed(1) + ' ' + py.toFixed(1);
        pen = true; py0 = py;
      }
      g += `<path d="${d}" stroke="${fn.color}"/>`;
      if (opts.marks) {
        try {
          const a = Expr.analyze(f);
          const pts = (a.zeros || []).map((z) => [z, 0, 'N']);
          if (a.vertex) pts.push([a.vertex[0], a.vertex[1], 'S']);
          if (Number.isFinite(f(0)) && a.type !== 'allgemein') pts.push([0, f(0), '']);
          for (const [x, y, t] of pts.slice(0, 12)) {
            const px = sx(x), py = sy(y);
            if (px < 0 || px > w || py < 0 || py > h) continue;
            marks += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${fs * 0.33}" fill="${fn.color}" stroke="#fff" stroke-width="1.5"/>`;
            const below = t === 'N' && li % 2 === 1;
            if (t) marks += `<text x="${(px + fs * 0.5).toFixed(1)}" y="${(below ? py + fs * 1.4 : py - fs * 0.5).toFixed(1)}" fill="${fn.color}" font-weight="700" paint-order="stroke" stroke="#fff" stroke-width="3">${t}(${fmt(Math.round(x * 100) / 100)}|${fmt(Math.round(y * 100) / 100)})</text>`;
          }
        } catch (e) { /* ignore */ }
      }
      if (opts.legend) {
        const label = 'f' + (li ? li + 1 : '') + '(x) = ' + Expr.normalize(fn.expr).replace(/\*/g, '·').replace(/\^2(?!\d)/g, '²').replace(/\^3(?!\d)/g, '³');
        legend += `<text x="${fs * 0.8}" y="${fs * (1.5 + li * 1.4)}" fill="${fn.color}" font-weight="700" paint-order="stroke" stroke="#fff" stroke-width="4">${esc(label)}</text>`;
      }
      li++;
    }
    g += '</g>' + marks + legend + `<rect width="${w}" height="${h}" fill="none" stroke="#9aa6bd" stroke-width="1.5"/></svg>`;
    return g;
  }
};
