/* Spreadsheet engine: cell references, ranges, formulas (German + English names). */
(function (global) {
  'use strict';

  const colName = (c) => {
    let s = '';
    c++;
    while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); }
    return s;
  };
  const colIndex = (s) => { let n = 0; for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
  const refName = (r, c) => colName(c) + (r + 1);
  const parseRef = (ref) => {
    const m = /^\$?([A-Z]{1,2})\$?(\d+)$/.exec(ref.toUpperCase());
    return m ? { r: parseInt(m[2], 10) - 1, c: colIndex(m[1]) } : null;
  };

  const FN = {
    SUMME: 'sum', SUM: 'sum', MITTELWERT: 'avg', AVERAGE: 'avg', MW: 'avg', MIN: 'min', MAX: 'max',
    ANZAHL: 'count', COUNT: 'count', PRODUKT: 'prod', PRODUCT: 'prod', RUNDEN: 'round', ROUND: 'round',
    WURZEL: 'sqrt', SQRT: 'sqrt', ABS: 'abs', POTENZ: 'pow', POWER: 'pow', WENN: 'if', IF: 'if'
  };

  class SheetError extends Error {}
  const ERR = (code) => { const e = new SheetError(code); e.code = code; return e; };

  function tokenize(src) {
    const toks = [];
    let i = 0;
    while (i < src.length) {
      const rest = src.slice(i);
      let m;
      if (/^\s/.test(rest)) { i++; continue; }
      if ((m = /^\d+(?:[.,]\d+)?(?:[eE][+-]?\d+)?/.exec(rest)) || (m = /^[.,]\d+/.exec(rest))) {
        toks.push({ t: 'num', v: parseFloat(m[0].replace(',', '.')) }); i += m[0].length; continue;
      }
      if ((m = /^\$?[A-Za-z]{1,2}\$?\d+(?::\$?[A-Za-z]{1,2}\$?\d+)?(?![A-Za-z(])/.exec(rest))) {
        const parts = m[0].toUpperCase().split(':');
        toks.push(parts.length === 2 ? { t: 'range', a: parts[0], b: parts[1] } : { t: 'ref', v: parts[0] });
        i += m[0].length; continue;
      }
      if ((m = /^[A-Za-zÄÖÜäöü]+(?=\s*\()/.exec(rest))) { toks.push({ t: 'fn', v: m[0].toUpperCase() }); i += m[0].length; continue; }
      if ((m = /^"([^"]*)"/.exec(rest))) { toks.push({ t: 'str', v: m[1] }); i += m[0].length; continue; }
      if ((m = /^(<=|>=|<>|[-+*/^();,%<>=&])/.exec(rest))) { toks.push({ t: 'op', v: m[0] }); i += m[0].length; continue; }
      if (rest.startsWith('#REF!')) { toks.push({ t: 'badref' }); i += 5; continue; }
      throw ERR('#NAME?');
    }
    return toks;
  }

  function parseFormula(src) {
    const toks = tokenize(src);
    let p = 0;
    const isOp = (v) => toks[p] && toks[p].t === 'op' && toks[p].v === v;
    function comparison() {
      let l = concat();
      while (toks[p] && toks[p].t === 'op' && ['=', '<', '>', '<=', '>=', '<>'].includes(toks[p].v)) {
        const o = toks[p++].v; const r = concat(); l = { k: 'bin', o, l, r };
      }
      return l;
    }
    function concat() {
      let l = add();
      while (isOp('&')) { p++; const r = add(); l = { k: 'bin', o: '&', l, r }; }
      return l;
    }
    function add() {
      let l = mul();
      while (isOp('+') || isOp('-')) { const o = toks[p++].v; const r = mul(); l = { k: 'bin', o, l, r }; }
      return l;
    }
    function mul() {
      let l = unary();
      while (isOp('*') || isOp('/')) { const o = toks[p++].v; const r = unary(); l = { k: 'bin', o, l, r }; }
      return l;
    }
    function unary() {
      if (isOp('-')) { p++; return { k: 'neg', e: unary() }; }
      if (isOp('+')) { p++; return unary(); }
      return pow();
    }
    function pow() {
      let b = postfix();
      if (isOp('^')) { p++; return { k: 'bin', o: '^', l: b, r: unary() }; }
      return b;
    }
    function postfix() {
      let e = primary();
      while (isOp('%')) { p++; e = { k: 'bin', o: '/', l: e, r: { k: 'num', v: 100 } }; }
      return e;
    }
    function primary() {
      const t = toks[p++];
      if (!t) throw ERR('#WERT!');
      if (t.t === 'num') return { k: 'num', v: t.v };
      if (t.t === 'str') return { k: 'str', v: t.v };
      if (t.t === 'ref') return { k: 'ref', v: t.v };
      if (t.t === 'range') return { k: 'range', a: t.a, b: t.b };
      if (t.t === 'badref') return { k: 'badref' };
      if (t.t === 'fn') {
        const name = FN[t.v];
        if (!name) throw ERR('#NAME?');
        if (!isOp('(')) throw ERR('#WERT!');
        p++;
        const args = [];
        if (!isOp(')')) {
          args.push(comparison());
          while (isOp(';') || isOp(',')) { p++; args.push(comparison()); }
        }
        if (!isOp(')')) throw ERR('#WERT!');
        p++;
        return { k: 'fn', f: name, args };
      }
      if (t.t === 'op' && t.v === '(') {
        const e = comparison();
        if (!isOp(')')) throw ERR('#WERT!');
        p++;
        return e;
      }
      throw ERR('#WERT!');
    }
    const ast = comparison();
    if (p < toks.length) throw ERR('#WERT!');
    return ast;
  }

  /** Parses a plain (non formula) cell input into a number or keeps text. */
  function literal(raw) {
    const s = String(raw).trim();
    if (s === '') return '';
    if (/^[-+]?(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/.test(s) && s.includes(',')) return parseFloat(s.replace(/\./g, '').replace(',', '.'));
    if (/^[-+]?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(s)) return parseFloat(s);
    if (/^[-+]?\d+(,\d+)?\s*%$/.test(s)) return parseFloat(s.replace(',', '.')) / 100;
    return s;
  }

  /** sheet = {rows, cols, cells:{A1:{v:'raw'}}} → returns evaluator with get(ref) */
  function evaluator(sheet) {
    const cache = new Map();
    const visiting = new Set();

    function cellValue(ref) {
      if (cache.has(ref)) return cache.get(ref);
      const pr = parseRef(ref);
      if (!pr || pr.r >= sheet.rows || pr.c >= sheet.cols) return { e: '#REF!' };
      if (visiting.has(ref)) return { e: '#ZIRKEL!' };
      const raw = sheet.cells[ref] ? sheet.cells[ref].v : '';
      let res;
      if (typeof raw === 'string' && raw.startsWith('=') && raw.length > 1) {
        visiting.add(ref);
        try {
          const v = evalNode(parseFormula(raw.slice(1)));
          if (Array.isArray(v)) res = { v: v[0] === undefined ? 0 : v[0] };
          else res = { v };
          if (typeof res.v === 'number' && !Number.isFinite(res.v)) res = { e: '#DIV/0!' };
        } catch (err) {
          res = { e: err.code || '#WERT!' };
        }
        visiting.delete(ref);
      } else {
        res = { v: literal(raw == null ? '' : raw) };
      }
      cache.set(ref, res);
      return res;
    }

    function scalar(ref) {
      const r = cellValue(ref);
      if (r.e) throw ERR(r.e);
      return r.v;
    }
    function num(v) {
      if (Array.isArray(v)) throw ERR('#WERT!');
      if (v === '' || v == null) return 0;
      if (typeof v === 'boolean') return v ? 1 : 0;
      if (typeof v === 'number') return v;
      const l = literal(v);
      if (typeof l === 'number') return l;
      throw ERR('#WERT!');
    }
    function rangeValues(a, b) {
      const A = parseRef(a), B = parseRef(b);
      if (!A || !B) throw ERR('#REF!');
      const out = [];
      for (let r = Math.min(A.r, B.r); r <= Math.max(A.r, B.r); r++)
        for (let c = Math.min(A.c, B.c); c <= Math.max(A.c, B.c); c++) {
          if (r >= sheet.rows || c >= sheet.cols) continue;
          out.push(scalar(refName(r, c)));
        }
      return out;
    }
    function flatNums(args) {
      const out = [];
      for (const a of args) {
        if (a.k === 'range' || a.k === 'ref') {
          const vals = a.k === 'range' ? rangeValues(a.a, a.b) : [scalar(a.v)];
          for (const v of vals) if (typeof v === 'number') out.push(v);
        } else {
          out.push(num(evalNode(a)));
        }
      }
      return out;
    }
    function evalNode(n) {
      switch (n.k) {
        case 'num': case 'str': return n.v;
        case 'ref': return scalar(n.v);
        case 'range': return rangeValues(n.a, n.b);
        case 'badref': throw ERR('#REF!');
        case 'neg': return -num(evalNode(n.e));
        case 'bin': {
          const l = evalNode(n.l), r = evalNode(n.r);
          switch (n.o) {
            case '+': return num(l) + num(r);
            case '-': return num(l) - num(r);
            case '*': return num(l) * num(r);
            case '/': { const d = num(r); if (d === 0) throw ERR('#DIV/0!'); return num(l) / d; }
            case '^': return Math.pow(num(l), num(r));
            case '&': return String(l) + String(r);
            case '=': return l === r || (typeof l === 'number' && typeof r === 'number' && Math.abs(l - r) < 1e-12);
            case '<>': return l !== r;
            case '<': return num(l) < num(r);
            case '>': return num(l) > num(r);
            case '<=': return num(l) <= num(r);
            case '>=': return num(l) >= num(r);
          }
          throw ERR('#WERT!');
        }
        case 'fn': {
          const a = n.args;
          switch (n.f) {
            case 'sum': return flatNums(a).reduce((s, v) => s + v, 0);
            case 'avg': { const v = flatNums(a); if (!v.length) throw ERR('#DIV/0!'); return v.reduce((s, x) => s + x, 0) / v.length; }
            case 'min': { const v = flatNums(a); return v.length ? Math.min(...v) : 0; }
            case 'max': { const v = flatNums(a); return v.length ? Math.max(...v) : 0; }
            case 'count': return flatNums(a).length;
            case 'prod': return flatNums(a).reduce((s, v) => s * v, 1);
            case 'round': { const d = a[1] ? num(evalNode(a[1])) : 0; const f = Math.pow(10, d); return Math.round(num(evalNode(a[0])) * f) / f; }
            case 'sqrt': { const v = num(evalNode(a[0])); if (v < 0) throw ERR('#ZAHL!'); return Math.sqrt(v); }
            case 'abs': return Math.abs(num(evalNode(a[0])));
            case 'pow': return Math.pow(num(evalNode(a[0])), num(evalNode(a[1])));
            case 'if': { const c = evalNode(a[0]); const t = typeof c === 'number' ? c !== 0 : !!c; return t ? (a[1] ? evalNode(a[1]) : true) : (a[2] ? evalNode(a[2]) : false); }
          }
          throw ERR('#NAME?');
        }
      }
      throw ERR('#WERT!');
    }
    return { get: cellValue };
  }

  function display(res) {
    if (res.e) return res.e;
    const v = res.v;
    if (typeof v === 'number') {
      if (Math.abs(v) >= 1e12 || (Math.abs(v) < 1e-6 && v !== 0)) return v.toExponential(4).replace('.', ',');
      return v.toLocaleString('de-DE', { maximumFractionDigits: 6 });
    }
    if (typeof v === 'boolean') return v ? 'WAHR' : 'FALSCH';
    return String(v);
  }

  /** Shift references in a formula after inserting/removing a row or column. */
  function shiftFormula(raw, axis, index, delta) {
    if (typeof raw !== 'string' || !raw.startsWith('=')) return raw;
    return '=' + raw.slice(1).replace(/(\$?)([A-Za-z]{1,2})(\$?)(\d+)(?![A-Za-z(])/g, (m, d1, col, d2, row) => {
      let c = colIndex(col.toUpperCase()), r = parseInt(row, 10) - 1;
      const v = axis === 'r' ? r : c;
      if (delta < 0 && v >= index && v < index - delta) return '#REF!';
      if (v >= index) {
        if (axis === 'r') r += delta; else c += delta;
      }
      return d1 + colName(c) + d2 + (r + 1);
    });
  }

  function insertLine(sheet, axis, index, delta) {
    const cells = {};
    for (const [ref, cell] of Object.entries(sheet.cells)) {
      const p = parseRef(ref);
      if (!p) continue;
      let { r, c } = p;
      const v = axis === 'r' ? r : c;
      if (delta < 0 && v >= index && v < index - delta) continue;
      if (v >= index) { if (axis === 'r') r += delta; else c += delta; }
      cells[refName(r, c)] = Object.assign({}, cell, { v: shiftFormula(cell.v, axis, index, delta) });
    }
    sheet.cells = cells;
    if (axis === 'r') sheet.rows += delta; else sheet.cols += delta;
    if (axis === 'c' && Array.isArray(sheet.cw)) {
      if (delta > 0) sheet.cw.splice(index, 0, ...Array(delta).fill(sheet.cw[Math.max(0, index - 1)] || 160));
      else sheet.cw.splice(index, -delta);
      if (sheet.cw.length !== sheet.cols) delete sheet.cw;
    }
    sheet.merges = (sheet.merges || []).map((m) => {
      m = Object.assign({}, m);
      const start = axis === 'r' ? m.r : m.c, size = axis === 'r' ? m.rs : m.cs;
      const end = start + size; // exclusive
      let ns = start, ne = end;
      if (delta > 0) {
        if (index <= start) { ns += delta; ne += delta; } else if (index < end) ne += delta;
      } else {
        const d0 = index, d1 = index - delta;
        const cut = (x) => (x <= d0 ? x : x >= d1 ? x + delta : d0);
        ns = cut(start); ne = cut(end);
      }
      if (axis === 'r') { m.r = ns; m.rs = ne - ns; } else { m.c = ns; m.cs = ne - ns; }
      return m;
    }).filter((m) => m.rs > 0 && m.cs > 0 && (m.rs > 1 || m.cs > 1));
  }

  function newSheet(rows, cols) {
    return { rows, cols, cells: {}, merges: [], border: 'all', header: true };
  }

  global.SheetEngine = { colName, colIndex, refName, parseRef, evaluator, display, insertLine, shiftFormula, newSheet, literal };
})(typeof window !== 'undefined' ? window : globalThis);
