/* Math expression parser for the function plotter.
 * Accepts school notation: "y = 2x + 3", "f(x)=x²-4", "0,5x^2", "3(x-1)^2+2", "sin(x)", "√x", "|x|"
 * Compiles to a closure tree (no eval). */
(function (global) {
  'use strict';
  const FUNCS = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan, sqrt: Math.sqrt, wurzel: Math.sqrt, abs: Math.abs,
    ln: Math.log, log: Math.log10, lg: Math.log10, exp: Math.exp, asin: Math.asin, acos: Math.acos, atan: Math.atan
  };
  const CONSTS = { pi: Math.PI, e: Math.E };

  function normalize(src) {
    let s = String(src).trim();
    s = s.replace(/^\s*([a-zA-Z]\s*\(\s*x\s*\)|y)\s*=\s*/, '');
    s = s.replace(/[·×∙⋅]/g, '*').replace(/[÷:]/g, '/').replace(/−/g, '-').replace(/π/g, 'pi')
      .replace(/²/g, '^2').replace(/³/g, '^3').replace(/√/g, 'sqrt').replace(/\s+/g, '');
    return s;
  }

  function tokenize(s) {
    const out = [];
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (/[0-9.,]/.test(ch)) {
        let m = /^(\d+(?:[.,]\d*)?|[.,]\d+)/.exec(s.slice(i));
        if (!m) throw new Error('Ungültige Zahl');
        out.push({ t: 'num', v: parseFloat(m[1].replace(',', '.')) });
        i += m[1].length;
      } else if (/[a-zA-Z]/.test(ch)) {
        let m = /^[a-zA-Z]+/.exec(s.slice(i))[0].toLowerCase();
        // split identifiers like "xpi" or "2xx" into known pieces
        while (m.length) {
          let found = null;
          for (const name of Object.keys(FUNCS).concat(Object.keys(CONSTS), ['x']).sort((a, b) => b.length - a.length)) {
            if (m.startsWith(name)) { found = name; break; }
          }
          if (!found) throw new Error('Unbekannt: „' + m + '“');
          if (FUNCS[found]) out.push({ t: 'fn', v: found });
          else if (found === 'x') out.push({ t: 'x' });
          else out.push({ t: 'num', v: CONSTS[found], c: found });
          m = m.slice(found.length);
          i += found.length;
        }
      } else if ('+-*/^()|'.includes(ch)) {
        out.push({ t: 'op', v: ch });
        i++;
      } else {
        throw new Error('Zeichen „' + ch + '“ nicht erlaubt');
      }
    }
    // implicit multiplication
    const res = [];
    let absDepth = 0;
    for (let k = 0; k < out.length; k++) {
      const a = res[res.length - 1], b = out[k];
      const aEnds = a && (a.t === 'num' || a.t === 'x' || (a.t === 'op' && a.v === ')') || (a.t === 'op' && a.v === '|' && a.close));
      const bStarts = b.t === 'num' || b.t === 'x' || b.t === 'fn' || (b.t === 'op' && b.v === '(') || (b.t === 'op' && b.v === '|' && !(absDepth > 0 && aEnds));
      if (b.t === 'op' && b.v === '|') {
        if (absDepth > 0 && aEnds) { b.close = true; absDepth--; } else { absDepth++; }
      }
      if (aEnds && bStarts && !(b.t === 'op' && b.v === '|' && b.close)) res.push({ t: 'op', v: '*' });
      res.push(b);
    }
    return res;
  }

  function parse(src) {
    const toks = tokenize(normalize(src));
    if (!toks.length) throw new Error('Leere Eingabe');
    let p = 0;
    const peek = () => toks[p];
    const isOp = (v) => peek() && peek().t === 'op' && peek().v === v;
    function expr() {
      let n = term();
      while (isOp('+') || isOp('-')) {
        const o = toks[p++].v, l = n, r = term();
        n = o === '+' ? (x) => l(x) + r(x) : (x) => l(x) - r(x);
      }
      return n;
    }
    function term() {
      let n = unary();
      while (isOp('*') || isOp('/')) {
        const o = toks[p++].v, l = n, r = unary();
        n = o === '*' ? (x) => l(x) * r(x) : (x) => l(x) / r(x);
      }
      return n;
    }
    function unary() {
      if (isOp('-')) { p++; const u = unary(); return (x) => -u(x); }
      if (isOp('+')) { p++; return unary(); }
      return power();
    }
    function power() {
      const b = primary();
      if (isOp('^')) {
        p++;
        const e = unary();
        return (x) => Math.pow(b(x), e(x));
      }
      return b;
    }
    function primary() {
      const t = toks[p++];
      if (!t) throw new Error('Ausdruck unvollständig');
      if (t.t === 'num') { const v = t.v; return () => v; }
      if (t.t === 'x') return (x) => x;
      if (t.t === 'fn') {
        const f = FUNCS[t.v];
        let arg;
        if (isOp('(')) { p++; arg = expr(); if (!isOp(')')) throw new Error('„)“ fehlt'); p++; }
        else arg = power();
        return (x) => f(arg(x));
      }
      if (t.t === 'op' && t.v === '(') {
        const e = expr();
        if (!isOp(')')) throw new Error('„)“ fehlt');
        p++;
        return e;
      }
      if (t.t === 'op' && t.v === '|') {
        const e = expr();
        if (!isOp('|')) throw new Error('„|“ fehlt');
        p++;
        return (x) => Math.abs(e(x));
      }
      throw new Error('Unerwartet: „' + t.v + '“');
    }
    const f = expr();
    if (p < toks.length) throw new Error('Unerwartet: „' + (toks[p].v || toks[p].t) + '“');
    return f;
  }

  const fmt = (v, d = 4) => {
    if (!Number.isFinite(v)) return '–';
    const r = Math.round(v * Math.pow(10, d)) / Math.pow(10, d);
    return (Object.is(r, -0) ? 0 : r).toLocaleString('de-DE', { maximumFractionDigits: d });
  };
  const signed = (v) => (v < 0 ? '− ' + fmt(-v) : '+ ' + fmt(v));
  // builds "a·x² + b·x + c" in school notation, skipping zero terms and 1-coefficients
  function polyStr(terms) {
    let s = '';
    for (const [k, v] of terms) {
      if (Math.abs(k) < 1e-12 && (v || s)) continue;
      const neg = k < 0, ak = Math.abs(k);
      const num = v && Math.abs(ak - 1) < 1e-12 ? '' : fmt(ak);
      const part = num + v;
      if (!s) s = (neg ? '−' : '') + part;
      else s += (neg ? ' − ' : ' + ') + part;
    }
    return s || '0';
  }

  /** Detects linear / quadratic functions and returns school-level properties. */
  function analyze(f) {
    const c = f(0), f1 = f(1), fm1 = f(-1);
    const a = (f1 + fm1) / 2 - c, b = (f1 - fm1) / 2;
    const poly = (x) => a * x * x + b * x + c;
    let isPoly = [2, -2, 3.7, -5.3, 0.5, 10].every((x) => {
      const y = f(x);
      return Number.isFinite(y) && Math.abs(y - poly(x)) <= 1e-7 * Math.max(1, Math.abs(y));
    });
    const info = { rows: [] };
    if (isPoly && Math.abs(a) < 1e-10) {
      info.type = Math.abs(b) < 1e-12 ? 'konstant' : 'linear';
      info.m = b; info.b = c;
      info.rows.push(['Typ', info.type === 'linear' ? 'Lineare Funktion' : 'Konstante Funktion']);
      info.rows.push(['Normalform', 'y = ' + polyStr([[b, 'x'], [c, '']])]);
      info.rows.push(['Steigung m', fmt(b)]);
      info.rows.push(['y-Achsenabschnitt b', fmt(c) + '  →  P(0 | ' + fmt(c) + ')']);
      if (info.type === 'linear') {
        info.zeros = [-c / b];
        info.rows.push(['Nullstelle', 'x₀ = ' + fmt(-c / b) + '  →  N(' + fmt(-c / b) + ' | 0)']);
        info.rows.push(['Verlauf', b > 0 ? 'steigend' : 'fallend']);
      } else {
        info.zeros = [];
        info.rows.push(['Nullstelle', Math.abs(c) < 1e-12 ? 'unendlich viele (x-Achse)' : 'keine']);
      }
    } else if (isPoly) {
      info.type = 'quadratisch';
      info.a = a; info.b = b; info.c = c;
      const xs = -b / (2 * a), ys = poly(xs);
      info.vertex = [xs, ys];
      const D = b * b - 4 * a * c;
      info.rows.push(['Typ', 'Quadratische Funktion (Parabel)']);
      info.rows.push(['Normalform', 'y = ' + polyStr([[a, 'x²'], [b, 'x'], [c, '']])]);
      const inner = Math.abs(xs) < 1e-12 ? 'x²' : '(x ' + signed(-xs) + ')²';
      info.rows.push(['Scheitelpunktform', 'y = ' + polyStr([[a, inner], [ys, '']])]);
      info.rows.push(['Scheitelpunkt', 'S(' + fmt(xs) + ' | ' + fmt(ys) + ')']);
      info.rows.push(['Öffnung', (a > 0 ? 'nach oben' : 'nach unten') + ', ' +
        (Math.abs(Math.abs(a) - 1) < 1e-12 ? 'Normalparabel-Form' : Math.abs(a) > 1 ? 'gestreckt' : 'gestaucht')]);
      info.rows.push(['Diskriminante', 'D = b² − 4ac = ' + fmt(D)]);
      if (D > 1e-12) {
        const r = [(-b - Math.sqrt(D)) / (2 * a), (-b + Math.sqrt(D)) / (2 * a)].sort((p, q) => p - q);
        info.zeros = r;
        info.rows.push(['Nullstellen', 'x₁ = ' + fmt(r[0]) + ',  x₂ = ' + fmt(r[1])]);
      } else if (Math.abs(D) <= 1e-12) {
        info.zeros = [xs];
        info.rows.push(['Nullstelle', 'x₀ = ' + fmt(xs) + ' (doppelt, Berührpunkt)']);
      } else {
        info.zeros = [];
        info.rows.push(['Nullstellen', 'keine (D < 0)']);
      }
      info.rows.push(['y-Achsenabschnitt', 'P(0 | ' + fmt(c) + ')']);
    } else {
      info.type = 'allgemein';
      info.zeros = numericZeros(f, -50, 50);
      info.rows.push(['Typ', 'Allgemeine Funktion']);
      info.rows.push(['y-Achsenabschnitt', Number.isFinite(c) ? 'P(0 | ' + fmt(c) + ')' : 'nicht definiert']);
      info.rows.push(['Nullstellen (−50…50)', info.zeros.length ? info.zeros.slice(0, 8).map((z) => fmt(z)).join(';  ') + (info.zeros.length > 8 ? ' …' : '') : 'keine gefunden']);
    }
    return info;
  }

  function numericZeros(f, a, b) {
    const zs = [];
    const step = 0.01;
    let px = a, py = f(a);
    for (let x = a + step; x <= b + 1e-9; x += step) {
      const y = f(x);
      if (Number.isFinite(y) && Number.isFinite(py)) {
        if (y === 0) zs.push(x);
        else if (py * y < 0 && Math.abs(y - py) < 10) {
          let lo = px, hi = x;
          for (let k = 0; k < 60; k++) {
            const m = (lo + hi) / 2;
            if (f(lo) * f(m) <= 0) hi = m; else lo = m;
          }
          zs.push((lo + hi) / 2);
        }
      }
      px = x; py = y;
    }
    return zs.filter((z, i) => i === 0 || Math.abs(z - zs[i - 1]) > 1e-6);
  }

  function valueTable(f, from, to, step) {
    const rows = [];
    if (!(step > 0) || to < from) return rows;
    const n = Math.min(500, Math.floor((to - from) / step + 1e-9) + 1);
    for (let i = 0; i < n; i++) {
      const x = Math.round((from + i * step) * 1e10) / 1e10;
      rows.push([x, f(x)]);
    }
    return rows;
  }

  global.Expr = { parse, analyze, valueTable, fmt, normalize };
})(typeof window !== 'undefined' ? window : globalThis);
