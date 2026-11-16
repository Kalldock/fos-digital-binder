/* Rechenkern für den wissenschaftlichen Taschenrechner.
 * - eigener Parser (kein eval): Punkt vor Strich, Klammern, Potenzen (rechtsassoziativ), implizite Multiplikation
 * - exakte rationale Zahlen (BigInt-Brüche), Gleitkomma nur wo nötig (π, sin, ln …)
 * - DEG/RAD, Gleichungen (linear/quadratisch exakt, sonst numerisch), Funktionsanalyse, Wertetabellen */
(function (global) {
  'use strict';

  class CalcError extends Error {}
  const err = (m) => { throw new CalcError(m); };

  /* ------------------------------------------------------------ BigInt helpers */
  const babs = (a) => (a < 0n ? -a : a);
  function gcd(a, b) { a = babs(a); b = babs(b); while (b) { const t = a % b; a = b; b = t; } return a; }
  function bitlen(a) { a = babs(a); return a === 0n ? 0 : a.toString(2).length; }
  // floor of the k-th root of n ≥ 0 (Newton from above)
  function iroot(n, k) {
    if (n < 2n) return n;
    const K = BigInt(k);
    let x = 1n << BigInt(Math.ceil(bitlen(n) / k) + 1);
    for (;;) {
      const y = ((K - 1n) * x + n / (x ** (K - 1n))) / K;
      if (y >= x) break;
      x = y;
    }
    while (x ** K > n) x--;
    while ((x + 1n) ** K <= n) x++;
    return x;
  }

  /* ------------------------------------------------------------ exact fractions */
  class Q {
    constructor(n, d = 1n) {
      if (d === 0n) err('Division durch 0 ist nicht definiert');
      if (d < 0n) { n = -n; d = -d; }
      const g = gcd(n, d);
      if (g > 1n) { n /= g; d /= g; }
      this.n = n; this.d = d;
    }
    static of(i) { return new Q(BigInt(i)); }
    add(o) { return new Q(this.n * o.d + o.n * this.d, this.d * o.d); }
    sub(o) { return new Q(this.n * o.d - o.n * this.d, this.d * o.d); }
    mul(o) { return new Q(this.n * o.n, this.d * o.d); }
    div(o) { if (o.n === 0n) err('Division durch 0 ist nicht definiert'); return new Q(this.n * o.d, this.d * o.n); }
    neg() { return new Q(-this.n, this.d); }
    isInt() { return this.d === 1n; }
    sign() { return this.n > 0n ? 1 : this.n < 0n ? -1 : 0; }
    eq(o) { return this.n === o.n && this.d === o.d; }
    floor() { let q = this.n / this.d; if (this.n < 0n && q * this.d !== this.n) q -= 1n; return q; }
    toNumber() {
      let n = this.n, d = this.d;
      const s = Math.max(bitlen(n), bitlen(d)) - 1000;
      if (s > 0) {
        const S = BigInt(s);
        n = n < 0n ? -((-n) >> S) : n >> S;
        d >>= S;
        if (d === 0n) return n < 0n ? -Infinity : Infinity;
      }
      return Number(n) / Number(d);
    }
  }
  const Q0 = Q.of(0), Q1 = Q.of(1), Q2 = Q.of(2), Q4 = Q.of(4), Q100 = Q.of(100);
  const isQ = (v) => v instanceof Q;
  const F = (v) => (isQ(v) ? v.toNumber() : v);
  function fin(x) {
    if (Number.isNaN(x)) err('Ergebnis ist nicht definiert');
    if (!Number.isFinite(x)) err('Zahl zu groß (Überlauf)');
    return x;
  }
  // keep exact values only while they stay reasonably small
  function norm(q) { return bitlen(q.n) + bitlen(q.d) > 40000 ? fin(q.toNumber()) : q; }
  const clean = (x) => (Math.abs(x) < 1e-15 ? 0 : x);

  /* ------------------------------------------------------------ arithmetic on values (Q | number) */
  const add = (a, b) => (isQ(a) && isQ(b) ? norm(a.add(b)) : fin(F(a) + F(b)));
  const sub = (a, b) => (isQ(a) && isQ(b) ? norm(a.sub(b)) : fin(F(a) - F(b)));
  const mul = (a, b) => (isQ(a) && isQ(b) ? norm(a.mul(b)) : fin(F(a) * F(b)));
  function div(a, b) {
    if (isQ(a) && isQ(b)) return norm(a.div(b));
    const y = F(b);
    if (y === 0) err('Division durch 0 ist nicht definiert');
    return fin(F(a) / y);
  }
  const neg = (a) => (isQ(a) ? a.neg() : -a);
  const sgn = (a) => (isQ(a) ? a.sign() : Math.sign(a));
  function exactRoot(a, k) {
    if (a.sign() < 0) {
      if (k % 2 === 0) err('Gerade Wurzel aus einer negativen Zahl ist nicht reell');
      const r = exactRoot(a.neg(), k);
      return r && r.neg();
    }
    const K = BigInt(k), rn = iroot(a.n, k), rd = iroot(a.d, k);
    return rn ** K === a.n && rd ** K === a.d ? new Q(rn, rd) : null;
  }
  function nroot(a, k) {
    if (!(k >= 2) || !Number.isInteger(k)) err('Wurzelexponent muss eine natürliche Zahl ≥ 2 sein');
    if (isQ(a)) { const r = exactRoot(a, k); if (r) return r; }
    const x = F(a);
    if (x < 0) {
      if (k % 2 === 0) err(k === 2 ? 'Wurzel aus einer negativen Zahl ist nicht reell' : 'Gerade Wurzel aus einer negativen Zahl ist nicht reell');
      return -Math.pow(-x, 1 / k);
    }
    return fin(k === 2 ? Math.sqrt(x) : k === 3 ? Math.cbrt(x) : Math.pow(x, 1 / k));
  }
  function pow(a, b) {
    if (isQ(a) && isQ(b) && b.isInt()) {
      const e = b.n;
      if (a.n === 0n) {
        if (e < 0n) err('0 hoch eine negative Zahl ist nicht definiert');
        if (e === 0n) err('0⁰ ist nicht definiert');
        return Q0;
      }
      if (a.d === 1n && babs(a.n) === 1n) return a.n === 1n || e % 2n === 0n ? Q1 : Q.of(-1);
      const ae = babs(e);
      if ((bitlen(a.n) + bitlen(a.d)) * Number(ae) <= 40000) {
        const n = a.n ** ae, d = a.d ** ae;
        return e < 0n ? new Q(d, n) : new Q(n, d);
      }
      return fin(Math.pow(a.toNumber(), Number(e)));
    }
    if (isQ(a) && isQ(b) && b.d <= 64n) {
      const k = Number(b.d);
      if (a.sign() < 0 && k % 2 === 0) err('Negative Basis mit diesem Exponenten ist nicht reell');
      const r = exactRoot(a, k);
      if (r) return pow(r, new Q(b.n));
      if (a.sign() < 0) return fin(-Math.pow(-a.toNumber(), b.toNumber()));
      return fin(Math.pow(a.toNumber(), b.toNumber()));
    }
    const x = F(a), y = F(b);
    if (x < 0 && !Number.isInteger(y)) err('Negative Basis mit Kommazahl-Exponent ist nicht reell');
    if (x === 0 && y < 0) err('0 hoch eine negative Zahl ist nicht definiert');
    return fin(Math.pow(x, y));
  }
  function fact(a) {
    if (!isQ(a) || !a.isInt() || a.sign() < 0) err('Fakultät (n!) gibt es nur für natürliche Zahlen 0, 1, 2, …');
    if (a.n > 3000n) err('Fakultät zu groß (höchstens 3000!)');
    let r = 1n;
    for (let i = 2n; i <= a.n; i++) r *= i;
    return norm(new Q(r));
  }
  function mod(a, b) {
    if (sgn(b) === 0) err('Modulo 0 ist nicht definiert');
    if (isQ(a) && isQ(b)) { const q = new Q(a.div(b).floor()); return a.sub(b.mul(q)); }
    const x = F(a), y = F(b);
    return fin(x - y * Math.floor(x / y));
  }
  function toQ(v) { // float → exact decimal (15 significant digits)
    if (isQ(v)) return v;
    const m = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/.exec(v.toPrecision(15));
    return decQ(m[1], m[2], m[3] || '', +(m[4] || 0));
  }
  function roundTo(v, nd) {
    const q = toQ(v), m = Q.of(10).n ** BigInt(Math.abs(nd));
    const scale = nd >= 0 ? new Q(m) : new Q(1n, m);
    const s = q.sign(), a = s < 0 ? q.neg() : q;
    const r = new Q(a.mul(scale).add(new Q(1n, 2n)).floor()).div(scale);
    return s < 0 ? r.neg() : r;
  }
  function decQ(sign, ip, fp, exp) {
    if (Math.abs(exp) > 5000) err('Exponent zu groß');
    let n = BigInt((ip || '0') + fp), d = 10n ** BigInt(fp.length);
    if (exp > 0) n *= 10n ** BigInt(exp); else if (exp < 0) d *= 10n ** BigInt(-exp);
    if (sign === '-') n = -n;
    return new Q(n, d);
  }

  /* ------------------------------------------------------------ trigonometry */
  const SIN_T = { 0: Q0, 30: new Q(1n, 2n), 90: Q1, 150: new Q(1n, 2n), 180: Q0, 210: new Q(-1n, 2n), 270: Q.of(-1), 330: new Q(-1n, 2n) };
  const TAN_T = { 0: Q0, 45: Q1, 135: Q.of(-1), 180: Q0, 225: Q1, 315: Q.of(-1) };
  function degInt(v) { if (!isQ(v) || !v.isInt()) return null; let a = v.n % 360n; if (a < 0n) a += 360n; return Number(a); }
  function trig(f, v, deg) {
    if (deg) {
      const a = degInt(v);
      if (a !== null) {
        if (f === 'sin' && a in SIN_T) return SIN_T[a];
        if (f === 'cos' && (a + 90) % 360 in SIN_T) return SIN_T[(a + 90) % 360];
        if (f === 'tan') { if (a % 180 === 90) err(`tan(${a}°) ist nicht definiert`); if (a in TAN_T) return TAN_T[a]; }
      }
    } else if (isQ(v) && v.sign() === 0) return f === 'cos' ? Q1 : Q0;
    const r = deg ? F(v) * Math.PI / 180 : F(v);
    if (f === 'sin') return clean(Math.sin(r));
    if (f === 'cos') return clean(Math.cos(r));
    const c = Math.cos(r);
    if (Math.abs(c) < 1e-15) err('tan ist hier nicht definiert (cos = 0)');
    return fin(clean(Math.sin(r) / c));
  }
  const ASIN_T = [[-1, -90], [-0.5, -30], [0, 0], [0.5, 30], [1, 90]];
  const ACOS_T = [[-1, 180], [-0.5, 120], [0, 90], [0.5, 60], [1, 0]];
  const ATAN_T = [[-1, -45], [0, 0], [1, 45]];
  function atrig(f, v, deg) {
    const x = F(v);
    if ((f === 'asin' || f === 'acos') && (x < -1 || x > 1)) err(`${f === 'asin' ? 'arcsin' : 'arccos'} ist nur für −1 ≤ x ≤ 1 definiert`);
    if (isQ(v)) {
      const T = f === 'asin' ? ASIN_T : f === 'acos' ? ACOS_T : ATAN_T;
      const hit = T.find(([k]) => new Q(BigInt(k * 2), 2n).eq(v));
      if (hit) {
        if (deg) return Q.of(hit[1]);
        if (hit[1] === 0) return Q0;
      }
    }
    const r = f === 'asin' ? Math.asin(x) : f === 'acos' ? Math.acos(x) : Math.atan(x);
    return deg ? r * 180 / Math.PI : r;
  }

  /* ------------------------------------------------------------ logarithms */
  function pow10Exp(n) { const s = n.toString(); return /^10*$/.test(s) ? s.length - 1 : -1; }
  function log10(v) {
    if (sgn(v) <= 0) err('Logarithmus gibt es nur für positive Zahlen');
    if (isQ(v)) {
      if (v.d === 1n) { const k = pow10Exp(v.n); if (k >= 0) return Q.of(k); }
      if (v.n === 1n) { const k = pow10Exp(v.d); if (k >= 0) return Q.of(-k); }
    }
    return fin(Math.log10(F(v)));
  }
  function ln(v) {
    if (sgn(v) <= 0) err('Logarithmus gibt es nur für positive Zahlen');
    if (isQ(v) && v.eq(Q1)) return Q0;
    return fin(Math.log(F(v)));
  }
  function logb(b, v) {
    if (sgn(b) <= 0 || (isQ(b) ? b.eq(Q1) : F(b) === 1)) err('Basis muss positiv und ≠ 1 sein');
    if (sgn(v) <= 0) err('Logarithmus gibt es nur für positive Zahlen');
    const t = Math.log(F(v)) / Math.log(F(b));
    if (isQ(b) && isQ(v)) {
      for (let q = 1; q <= 12; q++) {
        const p = Math.round(t * q);
        if (Math.abs(t * q - p) < 1e-9) {
          try { if (pow(v, Q.of(q)).eq(pow(b, Q.of(p)))) return new Q(BigInt(p), BigInt(q)); } catch (e) { /* too big */ }
        }
      }
    }
    return fin(t);
  }

  /* ------------------------------------------------------------ tokenizer & parser */
  const FUNCS = {
    sin: 1, cos: 1, tan: 1, asin: 1, acos: 1, atan: 1, arcsin: 1, arccos: 1, arctan: 1,
    sinh: 1, cosh: 1, tanh: 1, asinh: 1, acosh: 1, atanh: 1, arsinh: 1, arcosh: 1, artanh: 1,
    sqrt: 1, wurzel: 1, cbrt: 1, root: 2, ln: 1, log: [1, 2], lg: 1, exp: 1, abs: 1, betrag: 1,
    round: [1, 2], runden: [1, 2], floor: 1, ceil: 1, mod: 2
  };
  const ALIAS = { arcsin: 'asin', arccos: 'acos', arctan: 'atan', arsinh: 'asinh', arcosh: 'acosh', artanh: 'atanh', wurzel: 'sqrt', betrag: 'abs', runden: 'round', lg: 'log' };
  const NAMES = Object.keys(FUNCS).concat(['pi', 'e', 'ans', 'x']);

  function normalize(src) {
    return String(src)
      .replace(/[   ]/g, '')
      .replace(/[−‒–—]/g, '-').replace(/[·×∙⋅]/g, '*').replace(/[÷:]/g, '/')
      .replace(/sinh⁻¹/g, 'asinh').replace(/cosh⁻¹/g, 'acosh').replace(/tanh⁻¹/g, 'atanh')
      .replace(/sin⁻¹/g, 'asin').replace(/cos⁻¹/g, 'acos').replace(/tan⁻¹/g, 'atan')
      .replace(/⁻¹/g, '^(-1)').replace(/²/g, '^2').replace(/³√/g, 'cbrt').replace(/∛/g, 'cbrt').replace(/³/g, '^3')
      .replace(/√/g, 'sqrt').replace(/π/g, 'pi').replace(/ᴇ/g, 'E')
      .replace(/½/g, '(1/2)').replace(/⅓/g, '(1/3)').replace(/¼/g, '(1/4)').replace(/¾/g, '(3/4)')
      .replace(/(\d)\s+(?=\d+\s*\/\s*\d)/g, '$1_')
      .replace(/\s+/g, '');
  }

  function tokenize(s, opt) {
    const out = [], vars = (opt.vars || []).slice().sort((a, b) => b.length - a.length);
    let i = 0;
    while (i < s.length) {
      const rest = s.slice(i), ch = s[i];
      if (/[0-9.,]/.test(ch)) {
        const m = /^(\d*)(?:[.,](\d*))?(?:[eE]([+-]?\d+))?/.exec(rest);
        if (!m[0] || (m[1] === '' && !m[2])) err('Ungültige Zahl');
        if (/^[.,]/.test(s.slice(i + m[0].length))) err('Ungültige Zahl (zwei Kommas?)');
        out.push({ t: 'num', q: decQ('', m[1], m[2] || '', m[3] ? +m[3] : 0), raw: m[0], dec: /[.,]/.test(m[0]) });
        i += m[0].length;
        continue;
      }
      if ('+-*/^();!%°_'.includes(ch)) { out.push({ t: 'op', v: ch }); i++; continue; }
      if (ch === ',') err('Ungültige Zahl');
      // names: longest match among functions/constants/variables
      let best = null;
      const low = rest.toLowerCase();
      for (const n of NAMES) if ((n !== 'x' || opt.x) && low.startsWith(n) && (!best || n.length > best.len)) best = { t: 'id', v: n, len: n.length };
      for (const v of vars) if (rest.startsWith(v) && (!best || v.length > best.len)) best = { t: 'var', v, len: v.length };
      if (!best && !opt.x && low.startsWith('x')) err('x geht nur bei Gleichung, Wertetabelle und Graph');
      if (!best) {
        const w = /^[^\d\s+\-*/^();!%°_.,]+/.exec(rest);
        err('Unbekannt: „' + (w ? w[0] : ch) + '“');
      }
      out.push({ t: best.t, v: best.v });
      i += best.len;
    }
    return out;
  }

  function parse(src, opt = {}) {
    const toks = tokenize(normalize(src), opt);
    if (!toks.length) err('Leere Eingabe');
    let p = 0;
    const peek = () => toks[p];
    const isOp = (v) => toks[p] && toks[p].t === 'op' && toks[p].v === v;
    const startsPrimary = (t) => t && (t.t === 'num' || t.t === 'var' || (t.t === 'id' && t.v !== 'mod') || (t.t === 'op' && t.v === '('));
    function close() {
      if (isOp(')')) { p++; return false; }
      if (p >= toks.length) return true; // auto-close at the end
      err('„)“ fehlt');
    }
    function expr() {
      let n = term();
      while (isOp('+') || isOp('-')) { const op = toks[p++].v; n = { k: 'bin', op, a: n, b: term() }; }
      return n;
    }
    function term() {
      let n = unary();
      for (;;) {
        if (isOp('*') || isOp('/')) { const op = toks[p++].v; n = { k: 'bin', op, a: n, b: unary() }; }
        else if (peek() && peek().t === 'id' && peek().v === 'mod') { p++; n = { k: 'bin', op: 'mod', a: n, b: unary() }; }
        else if (startsPrimary(peek())) n = { k: 'bin', op: '*', imp: true, a: n, b: power() };
        else break;
      }
      return n;
    }
    function unary() {
      if (isOp('-')) { p++; return { k: 'neg', a: unary() }; }
      if (isOp('+')) { p++; return unary(); }
      return power();
    }
    function power() {
      const b = postfix();
      if (isOp('^')) { p++; if (p >= toks.length) err('Exponent fehlt'); return { k: 'pow', a: b, b: unary() }; }
      return b;
    }
    function postfix() {
      let n = primary();
      while (isOp('!') || isOp('%') || isOp('°')) n = { k: 'post', op: toks[p++].v, a: n };
      return n;
    }
    function primary() {
      const t = toks[p++];
      if (!t) err('Ausdruck unvollständig');
      if (t.t === 'num') {
        if (isOp('_')) {
          p++;
          const a = toks[p++], sl = toks[p++], b = toks[p++];
          if (!t.q.isInt() || !a || a.t !== 'num' || !a.q.isInt() || !sl || sl.v !== '/' || !b || b.t !== 'num' || !b.q.isInt()) err('Gemischte Zahl: z. B. 1 1/4 (Ganze, Zähler/Nenner)');
          if (b.q.sign() === 0) err('Division durch 0 ist nicht definiert');
          return { k: 'mixed', w: t, n: a, d: b };
        }
        return { k: 'num', q: t.q, raw: t.raw, dec: t.dec };
      }
      if (t.t === 'var') return { k: 'var', v: t.v };
      if (t.t === 'op' && t.v === '(') {
        if (isOp(')')) err('Leere Klammer');
        const a = expr();
        return { k: 'par', a, auto: close() };
      }
      if (t.t === 'id') {
        if (t.v === 'pi' || t.v === 'e') return { k: 'const', v: t.v };
        if (t.v === 'ans') return { k: 'ans' };
        if (t.v === 'x') return { k: 'x' };
        const f = ALIAS[t.v] || t.v;
        if (isOp('(')) {
          p++;
          if (isOp(')')) err(t.v + '( ) – Wert fehlt');
          const args = [expr()];
          while (isOp(';')) { p++; args.push(expr()); }
          const auto = close();
          const ar = FUNCS[t.v], ok = Array.isArray(ar) ? ar.includes(args.length) : ar === args.length;
          if (!ok) err(`${t.v} erwartet ${Array.isArray(ar) ? ar.join(' oder ') : ar} Wert${(Array.isArray(ar) ? ar[ar.length - 1] : ar) > 1 ? 'e (getrennt mit ;)' : ''}`);
          return { k: 'fn', f, name: t.v, args, paren: true, auto };
        }
        if (FUNCS[t.v] !== 1 && !(Array.isArray(FUNCS[t.v]) && FUNCS[t.v].includes(1))) err(t.v + ' braucht Klammern, z. B. ' + t.v + '(…;…)');
        if (p >= toks.length) err(t.v + ': Wert fehlt');
        return { k: 'fn', f, name: t.v, args: [power()] };
      }
      if (t.t === 'op') {
        if (t.v === ')') err('Zu viele „)“ oder Wert fehlt');
        if (t.v === ';') err('„;“ nur zwischen Werten einer Funktion, z. B. root(3;8)');
        err('Wert fehlt vor „' + t.v.replace('*', '×').replace('/', '÷') + '“');
      }
      err('Unerwartet: „' + t.v + '“');
    }
    const ast = expr();
    if (p < toks.length) {
      const t = toks[p];
      if (t.t === 'op' && t.v === ')') err('Zu viele „)“');
      err('Unerwartet: „' + (t.v || '') + '“');
    }
    return ast;
  }

  /* ------------------------------------------------------------ evaluation */
  const strip = (n) => { while (n.k === 'par') n = n.a; return n; };
  function evaluate(n, env) {
    switch (n.k) {
      case 'num': return n.q;
      case 'mixed': { const f = n.n.q.div(n.d.q); return n.w.q.add(f); }
      case 'const': return n.v === 'pi' ? Math.PI : Math.E;
      case 'ans': if (env.ans == null) err('Noch kein Ergebnis für „Ans“ vorhanden'); return env.ans;
      case 'x': if (env.x == null) err('x ist hier nicht erlaubt – Gleichung/Funktion verwenden'); return env.x;
      case 'var': { const v = env.vars && env.vars[n.v]; if (v == null) err('Wert für ' + n.v + ' fehlt'); return v; }
      case 'par': return evaluate(n.a, env);
      case 'neg': return neg(evaluate(n.a, env));
      case 'pow': return pow(evaluate(n.a, env), evaluate(n.b, env));
      case 'bin': {
        const pb = strip(n.b);
        if ((n.op === '+' || n.op === '-') && n.b.k === 'post' && n.b.op === '%') { // 200 + 19 % = 238
          const a = evaluate(n.a, env), part = mul(a, div(evaluate(pb.a, env), Q100));
          return n.op === '+' ? add(a, part) : sub(a, part);
        }
        const a = evaluate(n.a, env), b = evaluate(n.b, env);
        if (n.op === '+') return add(a, b);
        if (n.op === '-') return sub(a, b);
        if (n.op === '*') return mul(a, b);
        if (n.op === '/') return div(a, b);
        return mod(a, b);
      }
      case 'post': {
        const v = evaluate(n.a, env);
        if (n.op === '!') return fact(v);
        if (n.op === '%') return div(v, Q100);
        return env.deg ? v : mul(v, Math.PI / 180); // °
      }
      case 'fn': return callFn(n, env);
    }
    err('Interner Fehler');
  }
  function callFn(n, env) {
    const f = n.f;
    if (f === 'sin' || f === 'cos' || f === 'tan') {
      const a = strip(n.args[0]);
      if (a.k === 'post' && a.op === '°') return trig(f, evaluate(a.a, env), true);
      return trig(f, evaluate(n.args[0], env), !!env.deg);
    }
    const v = n.args.map((a) => evaluate(a, env)), x = v[0];
    switch (f) {
      case 'asin': case 'acos': case 'atan': return atrig(f, x, !!env.deg);
      case 'sinh': return fin(Math.sinh(F(x)));
      case 'cosh': return fin(Math.cosh(F(x)));
      case 'tanh': return Math.tanh(F(x));
      case 'asinh': return Math.asinh(F(x));
      case 'acosh': if (F(x) < 1) err('arcosh ist nur für x ≥ 1 definiert'); return Math.acosh(F(x));
      case 'atanh': if (Math.abs(F(x)) >= 1) err('artanh ist nur für −1 < x < 1 definiert'); return Math.atanh(F(x));
      case 'sqrt': return nroot(x, 2);
      case 'cbrt': return nroot(x, 3);
      case 'root': { const k = v[0]; if (!isQ(k) || !k.isInt()) return pow(v[1], div(Q1, k)); return nroot(v[1], Number(k.n)); }
      case 'ln': return ln(x);
      case 'log': return v.length === 2 ? logb(v[0], v[1]) : log10(x);
      case 'exp': return isQ(x) && x.sign() === 0 ? Q1 : fin(Math.exp(F(x)));
      case 'abs': return sgn(x) < 0 ? neg(x) : x;
      case 'round': {
        const nd = v.length > 1 ? v[1] : Q0;
        if (!isQ(nd) || !nd.isInt() || babs(nd.n) > 20n) err('round(x;n): n = Anzahl Nachkommastellen (0 … 20)');
        return roundTo(x, Number(nd.n));
      }
      case 'floor': return isQ(x) ? new Q(x.floor()) : Math.floor(x);
      case 'ceil': return isQ(x) ? new Q(-x.neg().floor()) : Math.ceil(x);
      case 'mod': return mod(v[0], v[1]);
    }
    err('Unbekannte Funktion ' + f);
  }
  const usesX = (n) => !!n && (n.k === 'x' || ['a', 'b', 'w'].some((k) => n[k] && typeof n[k] === 'object' && usesX(n[k])) || (n.args && n.args.some(usesX)));

  /* ------------------------------------------------------------ formatting */
  const SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' };
  const supNum = (e) => String(e).split('').map((c) => SUP[c] || c).join('');
  const NB = ' ';
  function group(intStr) {
    const neg = intStr[0] === '-', d = neg ? intStr.slice(1) : intStr;
    if (d.length <= 4) return intStr;
    return (neg ? '−' : '') + d.replace(/\B(?=(\d{3})+(?!\d))/g, NB);
  }
  const minus = (s) => s.replace(/^-/, '−');
  function sciFloat(x, sig = 12) {
    let [m, e] = x.toExponential(sig - 1).split('e');
    m = m.replace(/\.?0+$/, '');
    return minus(m.replace('.', ',')) + ' · 10' + supNum(+e);
  }
  function fmtFloat(x, sig = 12) {
    if (x === 0 || Object.is(x, -0)) return '0';
    const ax = Math.abs(x);
    if (ax >= 1e15 || ax < 1e-7) return sciFloat(x, sig);
    let s = String(Number(x.toPrecision(sig)));
    if (/e/.test(s)) return sciFloat(x, sig);
    const [ip, fp] = s.split('.');
    return minus(group(ip)) + (fp ? ',' + fp : '');
  }
  // exact decimal expansion of a fraction (with period detection)
  function qDecimal(q) {
    const s = q.sign(), n = babs(q.n), d = q.d;
    const ip = n / d;
    let r = n % d;
    const head = (s < 0 ? '-' : '') + ip.toString();
    if (r === 0n) return { text: minus(group(head)), exact: true };
    if (ip.toString().length > 15) return { text: '≈ ' + fmtFloat(q.toNumber()), exact: false };
    const seen = new Map(), digits = [];
    while (r !== 0n && !seen.has(r) && digits.length < 60) {
      seen.set(r, digits.length);
      r *= 10n;
      digits.push((r / d).toString());
      r %= d;
    }
    const sig = ip === 0n ? digits.join('').replace(/^0+/, '').length : ip.toString().length + digits.length;
    if (r === 0n && sig <= 20) {
      if (ip === 0n && digits.length > 7 && /^0{7}/.test(digits.join(''))) return { text: sciFloat(q.toNumber()), exact: sig <= 12 };
      return { text: minus(group(head)) + ',' + digits.join(''), exact: true };
    }
    if (r !== 0n && seen.has(r)) {
      const st = seen.get(r), per = digits.slice(st), pre = digits.slice(0, st);
      if (per.length <= 12 && pre.length <= 12) {
        return { text: minus(group(head)) + ',' + pre.join('') + per.map((c) => c + '̅').join(''), exact: true, periodic: true, approx: fmtFloat(q.toNumber()) };
      }
    }
    return { text: '≈ ' + fmtFloat(q.toNumber()), exact: false };
  }
  function fmtInt(n) {
    const s = n.toString();
    if (s.replace('-', '').length <= 40) return { text: minus(group(s)), exact: true };
    const neg = s[0] === '-', d = neg ? s.slice(1) : s;
    const m = (d[0] + ',' + d.slice(1, 12)).replace(/,?0+$/, '');
    return { text: '≈ ' + (neg ? '−' : '') + m + ' · 10' + supNum(d.length - 1), exact: false, full: s };
  }
  /** Describes a value for display: decimal text, fraction, mixed number, scientific. */
  function describe(v) {
    if (isQ(v)) {
      const o = { exact: true, q: v };
      if (v.isInt()) { Object.assign(o, fmtInt(v.n)); o.isInt = true; o.dec = o.text; }
      else {
        const dd = qDecimal(v);
        o.dec = dd.text; o.decExact = dd.exact; o.periodic = !!dd.periodic; o.approx = dd.approx;
        o.frac = { s: v.sign(), n: babs(v.n).toString(), d: v.d.toString() };
        if (babs(v.n) > v.d) { const w = babs(v.n) / v.d; o.mixed = { s: v.sign(), w: w.toString(), n: (babs(v.n) % v.d).toString(), d: v.d.toString() }; }
        o.text = o.dec;
      }
      const x = v.toNumber();
      o.sci = Number.isFinite(x) && x !== 0 ? sciFloat(x) : o.dec;
      return o;
    }
    const t = fmtFloat(v);
    const o = { exact: false, f: v, dec: t, text: t, sci: v === 0 ? '0' : sciFloat(v) };
    const af = approxFrac(v);
    if (af && !af.isInt()) o.fracApprox = { s: af.sign(), n: babs(af.n).toString(), d: af.d.toString() };
    return o;
  }
  // continued fraction approximation for float results (≈ fraction)
  function approxFrac(x, maxD = 100000) {
    if (!Number.isFinite(x) || Math.abs(x) > 1e12) return null;
    let h0 = 1, h1 = 0, k0 = 0, k1 = 1, b = x;
    for (let i = 0; i < 40; i++) {
      const a = Math.floor(b);
      [h0, h1] = [a * h0 + h1, h0];
      [k0, k1] = [a * k0 + k1, k0];
      if (k0 > maxD) return null;
      if (Math.abs(x - h0 / k0) <= 1e-12 * Math.max(1, Math.abs(x))) return new Q(BigInt(h0), BigInt(k0));
      if (b - a < 1e-15) return null;
      b = 1 / (b - a);
    }
    return null;
  }
  // plain text of an exact/approx value usable in notes (1/2 instead of stacked)
  function plain(v, style) {
    const d = describe(v);
    if (d.exact && d.frac && style !== 'dec') {
      const s = d.frac.s < 0 ? '−' : '';
      return s + d.frac.n + '/' + d.frac.d;
    }
    return d.dec;
  }
  // expression text that re-enters the parser without precision loss
  function toExpr(v) {
    if (isQ(v)) return v.isInt() ? v.n.toString() : '(' + v.n.toString() + '/' + v.d.toString() + ')';
    const s = String(v).replace('e', 'E');
    return v < 0 ? '(' + s + ')' : s;
  }
  function serialize(v) { return isQ(v) ? { q: [v.n.toString(), v.d.toString()] } : { f: v }; }
  function deserialize(o) { if (!o) return null; if (o.q) return new Q(BigInt(o.q[0]), BigInt(o.q[1])); return typeof o.f === 'number' ? o.f : null; }

  // short text for coefficients in steps (fractions as a/b, floats rounded)
  function ct(v) {
    if (isQ(v)) return v.isInt() ? minus(v.n.toString()) : minus(v.n.toString()) + '/' + v.d.toString();
    return fmtFloat(v, 10);
  }
  const paren = (v) => (sgn(v) < 0 || (isQ(v) && !v.isInt()) ? '(' + ct(v) + ')' : ct(v));
  function polyText(terms) {
    let s = '';
    for (const [c, v] of terms) {
      if (sgn(c) === 0) continue;
      const negc = sgn(c) < 0, a = negc ? neg(c) : c;
      const one = isQ(a) ? a.eq(Q1) : Math.abs(a - 1) < 1e-15;
      const num = v && one ? '' : ct(a);
      const part = num + (v && num && /\//.test(num) ? '·' : '') + v;
      s += !s ? (negc ? '−' : '') + part : (negc ? ' − ' : ' + ') + part;
    }
    return s || '0';
  }

  /* ------------------------------------------------------------ calculator entry point */
  function calc(src, env = {}) {
    const ast = parse(src, {});
    return { ast, value: evaluate(ast, env) };
  }

  /* ------------------------------------------------------------ polynomials, equations, analysis */
  function compileX(ast, env) {
    const e = Object.assign({}, env);
    return (x) => { e.x = x; return evaluate(ast, e); };
  }
  // number function for graphs (NaN where undefined)
  function numFn(src, env) {
    const ast = parse(src.replace(/^\s*(?:[a-zA-Z]\s*\(\s*x\s*\)|y)\s*=\s*/, ''), { x: true });
    const g = compileX(ast, env);
    return { ast, f: (x) => { try { return F(g(x)); } catch (e) { return NaN; } } };
  }
  const FIT_PTS = [Q.of(2), Q.of(-2), Q.of(3), new Q(1n, 2n), new Q(-7n, 3n), Q.of(10), new Q(1n, 7n)];
  function polyFit(g) {
    let f0, f1, fm;
    try { f0 = g(Q0); f1 = g(Q1); fm = g(Q.of(-1)); } catch (e) { return null; }
    const exact = isQ(f0) && isQ(f1) && isQ(fm);
    const c = f0, a = sub(div(add(f1, fm), Q2), c), b = div(sub(f1, fm), Q2);
    for (const x of FIT_PTS) {
      let y;
      try { y = g(x); } catch (e) { return null; }
      const py = add(mul(a, mul(x, x)), add(mul(b, x), c));
      if (exact && isQ(y)) { if (!y.eq(py)) return null; }
      else {
        const Y = F(y), P = F(py);
        if (!(Math.abs(Y - P) <= 1e-9 * Math.max(1, Math.abs(Y)))) return null;
      }
    }
    if (!exact) { // tidy float coefficients that are integers / simple decimals
      const t = (v) => { const r = Math.round(F(v) * 1e9) / 1e9; return Math.abs(F(v) - r) < 1e-12 * Math.max(1, Math.abs(r)) ? toQ(r) : F(v); };
      return { a: t(a), b: t(b), c: t(c), exact: false };
    }
    return { a, b, c, exact: true };
  }
  function squareFree(k) { // k BigInt > 0 → [outer, inner] with k = outer² · inner
    let o = 1n, i = k;
    for (let f = 2n; f * f <= i && f < 20000n; f++) while (i % (f * f) === 0n) { i /= f * f; o *= f; }
    return [o, i];
  }
  function sqrtForm(D) { // exact √D as [t (Q), k (BigInt)] meaning t·√k, k square-free; null if not exact rational
    if (!isQ(D) || D.sign() <= 0) return null;
    const pq = D.n * D.d;
    const [o, i] = squareFree(pq);
    return [new Q(o, D.d), i];
  }
  function fmtSurd(r, t, k) { // r ± t·√k
    const tn = t.n, td = t.d;
    const rad = (tn === 1n ? '' : tn.toString()) + '√' + k.toString() + (td === 1n ? '' : ' / ' + td.toString());
    return (r.sign() === 0 ? '' : ct(r) + ' ') + '± ' + rad;
  }
  function numericRoots(g, lo, hi, N = 20000) {
    const h = (x) => { try { return F(g(x)); } catch (e) { return NaN; } };
    const zs = [];
    const step = (hi - lo) / N;
    let px = lo, py = h(lo);
    if (py === 0) zs.push(lo);
    for (let i = 1; i <= N; i++) {
      const x = lo + i * step, y = h(x);
      if (Number.isFinite(y) && Number.isFinite(py)) {
        if (y === 0) zs.push(x);
        else if (py * y < 0) {
          let a = px, b = x, fa = py;
          for (let k = 0; k < 90; k++) {
            const m = (a + b) / 2, fm = h(m);
            if (!Number.isFinite(fm)) break;
            if (fa * fm <= 0) b = m; else { a = m; fa = fm; }
          }
          const r = (a + b) / 2, fr = h(r);
          if (Number.isFinite(fr) && Math.abs(fr) < 1e-6 * Math.max(1, Math.abs(py), Math.abs(y))) zs.push(r);
        }
      }
      px = x; py = y;
      if (zs.length > 50) break;
    }
    const out = [];
    for (const z of zs) {
      const zz = Math.abs(z - Math.round(z)) < 1e-9 ? Math.round(z) : z;
      if (!out.length || Math.abs(zz - out[out.length - 1]) > 1e-7) out.push(zz === 0 ? 0 : zz);
    }
    return out;
  }
  const sub1 = ['₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
  function xname(i, n) { if (n === 1) return 'x'; return i < 9 ? 'x' + sub1[i] : 'x' + (i + 1); }

  /** Solves an equation in x. Returns { kind, steps[[label,text]], sols[{v,text,approx}], note }. */
  function solve(src, env = {}, range = [-100, 100]) {
    const s = String(src).trim();
    if (!s) err('Bitte eine Gleichung eingeben, z. B. x² − 5x + 6 = 0');
    const parts = s.split('=');
    if (parts.length > 2) err('Nur ein „=“ erlaubt');
    if (parts.length === 2 && !parts[1].trim()) err('Rechte Seite fehlt (z. B. „= 0“)');
    const L = parse(parts[0], { x: true }), R = parts.length === 2 ? parse(parts[1], { x: true }) : { k: 'num', q: Q0 };
    if (!usesX(L) && !usesX(R)) err('Die Gleichung enthält kein x');
    const gl = compileX(L, env), gr = compileX(R, env);
    const g = (x) => sub(gl(x), gr(x));
    const fit = polyFit(g);
    const steps = [], sols = [];
    const approxMark = fit && !fit.exact;
    const show = (v) => {
      const d = describe(v);
      const text = d.exact && d.frac ? ct(v) + (d.decExact ? ' = ' + d.dec : ' ≈ ' + (d.approx || d.dec).replace('≈ ', '')) : !d.exact && !/^≈/.test(d.dec) ? '≈ ' + d.dec : d.dec;
      return { v, text, approx: !d.exact || approxMark };
    };
    if (fit && sgn(fit.a) === 0) {
      const { b, c } = fit;
      steps.push(['Typ', 'Lineare Gleichung']);
      steps.push(['Normalform', polyText([[b, 'x'], [c, '']]) + ' = 0']);
      if (sgn(b) === 0) {
        if (sgn(c) === 0) return { kind: 'all', steps: steps.concat([['Ergebnis', 'Wahre Aussage (0 = 0) → jede Zahl ist Lösung']]), sols: [], note: 'unendlich viele Lösungen' };
        return { kind: 'none', steps: steps.concat([['Ergebnis', 'Widerspruch (' + ct(c) + ' = 0) → keine Lösung']]), sols: [], note: 'keine Lösung' };
      }
      const x = div(neg(c), b);
      steps.push(['Umstellen', polyText([[b, 'x']]) + ' = ' + ct(neg(c))]);
      steps.push(['Lösung', 'x = ' + ct(neg(c)) + ' / ' + paren(b) + ' = ' + ct(x)]);
      sols.push(show(x));
      return { kind: 'linear', steps, sols, note: 'genau eine Lösung' };
    }
    if (fit) {
      const { a, b, c } = fit;
      steps.push(['Typ', 'Quadratische Gleichung']);
      steps.push(['Normalform', polyText([[a, 'x²'], [b, 'x'], [c, '']]) + ' = 0']);
      steps.push(['Koeffizienten', 'a = ' + ct(a) + ',  b = ' + ct(b) + ',  c = ' + ct(c)]);
      const D = sub(mul(b, b), mul(Q4, mul(a, c)));
      steps.push(['Diskriminante', 'D = b² − 4·a·c = ' + paren(b) + '² − 4·' + paren(a) + '·' + paren(c) + ' = ' + ct(D)]);
      steps.push(['Formel', 'x₁,₂ = (−b ± √D) / (2a)  (abc-/Mitternachtsformel)']);
      const ds = sgn(D) === 0 || (!fit.exact && Math.abs(F(D)) < 1e-12 * Math.max(1, F(b) * F(b))) ? 0 : sgn(D);
      if (ds < 0) { steps.push(['Ergebnis', 'D < 0 → keine reelle Lösung']); return { kind: 'none', steps, sols, note: 'keine reelle Lösung (D < 0)' }; }
      const r = div(neg(b), mul(Q2, a));
      if (ds === 0) {
        steps.push(['Ergebnis', 'D = 0 → genau eine (doppelte) Lösung: x = −b / (2a) = ' + ct(neg(b)) + ' / ' + paren(mul(Q2, a)) + ' = ' + ct(r)]);
        sols.push(show(r));
        return { kind: 'quad1', steps, sols, note: 'genau eine Lösung (D = 0)' };
      }
      let x1, x2, exactForm = null;
      if (isQ(D)) {
        const sq = exactRoot(D, 2);
        if (sq) { const den = mul(Q2, a); x1 = div(sub(neg(b), sq), den); x2 = div(add(neg(b), sq), den); }
        else {
          const [t, k] = sqrtForm(D);
          const tt = div(t, mul(Q2, a)), ta = sgn(tt) < 0 ? neg(tt) : tt;
          exactForm = fmtSurd(r, ta, k);
          const w = F(ta) * Math.sqrt(Number(k));
          x1 = F(r) - w; x2 = F(r) + w;
        }
      } else {
        const sq = Math.sqrt(F(D)), den = 2 * F(a);
        x1 = (-F(b) - sq) / den; x2 = (-F(b) + sq) / den;
      }
      if (F(x1) > F(x2)) [x1, x2] = [x2, x1];
      steps.push(['Einsetzen', 'x₁,₂ = (' + ct(neg(b)) + ' ± √' + paren(D) + ') / ' + paren(mul(Q2, a)) + (exactForm ? '  =  ' + exactForm : '')]);
      steps.push(['Ergebnis', 'D > 0 → zwei Lösungen']);
      sols.push(show(x1), show(x2));
      return { kind: 'quad2', steps, sols, note: 'zwei Lösungen (D > 0)', exactForm };
    }
    // anything else: numeric
    const rs = numericRoots(g, range[0], range[1]);
    steps.push(['Typ', 'Keine lineare/quadratische Gleichung → numerische Näherung']);
    steps.push(['Verfahren', 'Vorzeichenwechsel suchen und Intervall halbieren im Bereich ' + fmtFloat(range[0]) + ' … ' + fmtFloat(range[1])]);
    const near = rs.slice().sort((p, q) => Math.abs(p) - Math.abs(q)).slice(0, 12).sort((p, q) => p - q);
    near.forEach((z) => sols.push({ v: z, text: (Number.isInteger(z) ? '' : '≈ ') + fmtFloat(z, 10), approx: true }));
    const more = rs.length > near.length ? ' (weitere vorhanden)' : '';
    return { kind: 'numeric', steps, sols, note: rs.length ? rs.length + ' Lösung' + (rs.length > 1 ? 'en' : '') + ' gefunden – numerisch angenähert' + more : 'keine Lösung im Suchbereich gefunden', numeric: true };
  }

  /** School-level analysis of f(x). */
  function analyze(src, env = {}, x0 = null) {
    const body = String(src).replace(/^\s*(?:[a-zA-Z]\s*\(\s*x\s*\)|y)\s*=\s*/, '');
    if (!body.trim()) err('Bitte eine Funktion eingeben, z. B. f(x) = x² − 4');
    const ast = parse(body, { x: true });
    const g = compileX(ast, env);
    const fit = polyFit(g);
    const rows = [], out = { rows, zeros: [], vertex: null };
    const val = (v) => { const d = describe(v); return d.exact && d.frac ? ct(v) + ' (' + d.dec + ')' : d.dec; };
    const mark = fit && !fit.exact ? ' (gerundet)' : '';
    let y0 = null;
    try { y0 = g(Q0); } catch (e) { y0 = null; }
    if (fit && sgn(fit.a) === 0) {
      const { b, c } = fit;
      out.type = sgn(b) === 0 ? 'konstant' : 'linear';
      rows.push(['Typ', out.type === 'linear' ? 'Lineare Funktion' : 'Konstante Funktion']);
      rows.push(['Normalform', 'f(x) = ' + polyText([[b, 'x'], [c, '']])]);
      rows.push(['Steigung m', val(b) + (out.type === 'linear' ? (sgn(b) > 0 ? ' → steigend' : ' → fallend') : ' → waagrecht') + mark]);
      rows.push(['y-Achsenabschnitt', 'b = ' + val(c) + '  →  P(0 | ' + ct(c) + ')']);
      if (out.type === 'linear') { const z = div(neg(c), b); out.zeros = [F(z)]; rows.push(['Nullstelle', 'x₀ = −b / m = ' + val(z)]); }
      else rows.push(['Nullstelle', sgn(c) === 0 ? 'unendlich viele (f liegt auf der x-Achse)' : 'keine']);
    } else if (fit) {
      const { a, b, c } = fit;
      out.type = 'quadratisch';
      const xs = div(neg(b), mul(Q2, a)), ys = sub(c, div(mul(b, b), mul(Q4, a)));
      out.vertex = [F(xs), F(ys)];
      rows.push(['Typ', 'Quadratische Funktion (Parabel)']);
      rows.push(['Normalform', 'f(x) = ' + polyText([[a, 'x²'], [b, 'x'], [c, '']])]);
      const inner = sgn(xs) === 0 ? 'x²' : '(x ' + (sgn(xs) > 0 ? '− ' + ct(xs) : '+ ' + ct(neg(xs))) + ')²';
      rows.push(['Scheitelpunktform', 'f(x) = ' + polyText([[a, inner], [ys, '']])]);
      rows.push(['Scheitelpunkt', 'S(' + ct(xs) + ' | ' + ct(ys) + ')' + (isQ(xs) && !xs.isInt() || isQ(ys) && !ys.isInt() ? '  ≈ S(' + fmtFloat(F(xs), 6) + ' | ' + fmtFloat(F(ys), 6) + ')' : '') + mark]);
      rows.push(['Öffnung', (sgn(a) > 0 ? 'nach oben (Tiefpunkt)' : 'nach unten (Hochpunkt)') + ', ' + (Math.abs(Math.abs(F(a)) - 1) < 1e-12 ? 'wie Normalparabel' : Math.abs(F(a)) > 1 ? 'gestreckt' : 'gestaucht')]);
      rows.push(['y-Achsenabschnitt', 'P(0 | ' + ct(c) + ')']);
      const r = solve(body + '=0', env);
      out.zeros = r.sols.map((s) => F(s.v));
      rows.push(['Nullstellen', r.sols.length ? r.sols.map((s, i) => xname(i, r.sols.length) + ' = ' + s.text).join(';   ') : 'keine (D < 0)']);
    } else {
      out.type = 'allgemein';
      rows.push(['Typ', 'Allgemeine Funktion (Ergebnisse teils numerisch angenähert)']);
      rows.push(['y-Achsenabschnitt', y0 === null ? 'f(0) ist nicht definiert' : 'P(0 | ' + describe(y0).dec + ')']);
      const zs = numericRoots(g, -100, 100);
      out.zeros = zs;
      out.numeric = true;
      rows.push(['Nullstellen ≈ (−100 … 100)', zs.length ? zs.slice(0, 10).map((z) => fmtFloat(z, 8)).join(';   ') + (zs.length > 10 ? ' … (' + zs.length + ')' : '') : 'keine gefunden']);
    }
    if (x0 !== null && x0 !== '') {
      const xv = evaluate(parse(String(x0), {}), env);
      try { out.fx = g(xv); rows.push(['f(' + describe(xv).dec + ')', val(out.fx)]); }
      catch (e) { rows.push(['f(' + describe(xv).dec + ')', e.message]); }
    }
    return out;
  }

  /** Value table rows [{x, y | err}] with exact x stepping. */
  function table(src, from, to, step, env = {}, max = 1001) {
    const body = String(src).replace(/^\s*(?:[a-zA-Z]\s*\(\s*x\s*\)|y)\s*=\s*/, '');
    if (!body.trim()) err('Bitte eine Funktion eingeben, z. B. 2x + 3');
    const ast = parse(body, { x: true });
    const num = (s, name) => {
      if (String(s).trim() === '') err(name + ' fehlt');
      let v;
      try { v = evaluate(parse(String(s), {}), env); } catch (e) { err(name + ': ' + e.message); }
      return v;
    };
    const a = num(from, 'Startwert'), b = num(to, 'Endwert'), h = num(step, 'Schrittweite');
    if (sgn(h) <= 0) err('Schrittweite muss größer als 0 sein');
    if (F(b) < F(a)) err('Endwert muss größer oder gleich dem Startwert sein');
    const n = Math.floor(F(div(sub(b, a), h)) + 1e-9) + 1;
    if (n > max) err('Zu viele Zeilen (' + n.toLocaleString('de-DE') + ') – höchstens ' + (max - 1) + '. Schrittweite vergrößern.');
    const g = compileX(ast, env), rows = [];
    for (let i = 0; i < n; i++) {
      const x = add(a, mul(Q.of(i), h));
      try { rows.push({ x, y: g(x) }); } catch (e) { rows.push({ x, err: e.message }); }
    }
    return { ast, rows, g };
  }

  /* ------------------------------------------------------------ formulas from the Formelsammlung */
  const VAR_RE = /Δ?[A-Za-zÄÖÜäöüßα-ωΑ-Ω](?:[A-Za-zÄÖÜäöüß]*)(?:<sub>[^<]*<\/sub>|[₀-₉]+)?/g;
  function formulaEquations(card) {
    const list = [card.f].concat(card.alt || []);
    const out = [];
    for (let raw of list) {
      raw = String(raw).replace(/^[A-Za-zÄÖÜäöüß /()-]+:\s*/, '').trim();
      if ((raw.match(/=/g) || []).length !== 1) continue;
      const [lhs, rhs] = raw.split('=').map((s) => s.trim());
      const lm = lhs.match(VAR_RE);
      if (!lm || lm.length !== 1 || lm[0] !== lhs.replace(/\s+/g, '')) continue;
      if (/[≈→„“|,]/.test(rhs.replace(/(\d),(\d)/g, '$1$2')) || /\(.*(aufrunden|\+ Zuschlag)/.test(rhs)) continue;
      const cands = [...new Set((rhs.match(VAR_RE) || []).filter((v) => v !== 'π' && !NAMES.includes(v.toLowerCase())))];
      // words/units glued by spaces are text, not a formula ("Mörtelbedarf je m²", "9,81 m/s²")
      if (/[\dA-Za-zÄÖÜäöüßα-ω>₀-₉]\s+[A-Za-zÄÖÜäöüßα-ωΔ]/.test(rhs)) continue;
      let ast;
      try { ast = parse(rhs, { vars: cands }); } catch (e) { continue; }
      if (!cands.length) continue;
      if (out.some((o) => o.lhs === lhs.replace(/\s+/g, '') && o.rhs === rhs)) continue;
      out.push({ lhs: lhs.replace(/\s+/g, ''), rhs, vars: cands, ast });
    }
    return out;
  }
  function evalFormula(eq, values, env = {}) {
    const vars = {};
    for (const v of eq.vars) {
      const s = values[v];
      if (s == null || String(s).trim() === '') err('Wert für ' + v.replace(/<\/?sub>/g, '') + ' fehlt');
      try { vars[v] = evaluate(parse(String(s), {}), env); } catch (e) { err(v.replace(/<\/?sub>/g, '') + ': ' + e.message); }
    }
    return evaluate(eq.ast, Object.assign({}, env, { vars }));
  }

  global.CalcEngine = {
    Q, CalcError, isQ, F, parse, evaluate, calc, describe, plain, toExpr, serialize, deserialize, normalize,
    fmtFloat, sciFloat, solve, analyze, table, numFn, round: roundTo, toQ, polyFit, approxFrac, formulaEquations, evalFormula, ct, usesX
  };
})(typeof window !== 'undefined' ? window : globalThis);
