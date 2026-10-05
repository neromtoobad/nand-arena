// Bot rule language -> NAND/LATCH netlist (TAP-02), 8 inputs, 2 outputs.
//
//   # comments
//   mem m, k               # 1-bit memories (LATCHes); read them by name
//   let danger = F | F2    # names (also plain `x = expr`)
//   left  = danger & RL    # outputs: left, right (missing = 0)
//   right = danger & !RL
//   next m = m ^ COIN      # next value of a memory (missing = hold)
//
// Operators, tightest first: ! (not, ~)  & (and, &&)  ^ (xor)  | (or, ||). Constants 0 / 1.
// Inputs: F L R F2 OL OF RL COIN (see game.js INPUTS).

import { INPUTS } from "./game.js";
import { encode, bytesToHex } from "./netlist.js";

const N_IN = 8;
const INPUT_INDEX = Object.fromEntries(INPUTS.map(i => [i.key, i.bit]));

class Graph {
  constructor() {
    this.nodes = [];          // {k:"c0"|"c1"|"in"|"latch"|"nand", a, b, i}
    this.memo = new Map();
    this.c0 = this._add({ k: "c0" });
    this.c1 = this._add({ k: "c1" });
    this.inputs = Array.from({ length: N_IN }, (_, i) => this._add({ k: "in", i }));
  }
  _add(n) { this.nodes.push(n); return this.nodes.length - 1; }
  latch(i) { return this._add({ k: "latch", i }); }
  isNot(x) { const n = this.nodes[x]; return n.k === "nand" && n.a === n.b; }
  raw(a, b) { return this._add({ k: "nand", a, b, fresh: true }); }       // never merged or simplified
  not(x) {
    if (x === this.c0) return this.c1;
    if (x === this.c1) return this.c0;
    if (this.isNot(x)) return this.nodes[x].a;
    return this._nand(x, x);
  }
  nand(x, y) {
    if (x === this.c0 || y === this.c0) return this.c1;
    if (x === this.c1) return this.not(y);
    if (y === this.c1) return this.not(x);
    if (x === y) return this.not(x);
    if ((this.isNot(x) && this.nodes[x].a === y) || (this.isNot(y) && this.nodes[y].a === x)) return this.c1;
    return this._nand(x, y);
  }
  _nand(x, y) {
    const [a, b] = x < y ? [x, y] : [y, x];
    const key = a + "," + b;
    if (!this.memo.has(key)) this.memo.set(key, this._add({ k: "nand", a, b }));
    return this.memo.get(key);
  }
  and(x, y) { return this.not(this.nand(x, y)); }
  or(x, y) { return this.nand(this.not(x), this.not(y)); }
  xor(x, y) {
    if (x === y) return this.c0;
    if (x === this.c0) return y;
    if (y === this.c0) return x;
    if (x === this.c1) return this.not(y);
    if (y === this.c1) return this.not(x);
    const t = this.nand(x, y);
    return this.nand(this.nand(x, t), this.nand(y, t));
  }
}

export class DslError extends Error {
  constructor(msg, line) { super(line ? `line ${line}: ${msg}` : msg); this.line = line; }
}

function tokenize(src, line) {
  const toks = [];
  const re = /\s*(?:(&&|\|\||[!~&|^()=,])|([A-Za-z_][A-Za-z0-9_]*)|(\d+))/y;
  let m, pos = 0;
  const s = src.replace(/#.*$/, "");
  while (pos < s.length) {
    if (/^\s*$/.test(s.slice(pos))) break;
    re.lastIndex = pos;
    m = re.exec(s);
    if (!m) throw new DslError(`unexpected "${s.slice(pos).trim()[0]}"`, line);
    pos = re.lastIndex;
    if (m[1]) toks.push({ t: "op", v: m[1] });
    else if (m[2]) {
      const w = m[2];
      const lw = w.toLowerCase();
      if (lw === "and") toks.push({ t: "op", v: "&" });
      else if (lw === "or") toks.push({ t: "op", v: "|" });
      else if (lw === "xor") toks.push({ t: "op", v: "^" });
      else if (lw === "not") toks.push({ t: "op", v: "!" });
      else toks.push({ t: "id", v: w });
    } else toks.push({ t: "num", v: m[3] });
  }
  return toks;
}

function parseExpr(toks, g, lookup, line) {
  let i = 0;
  const peek = () => toks[i];
  const isOp = v => peek() && peek().t === "op" && (peek().v === v || (v === "&" && peek().v === "&&") || (v === "|" && peek().v === "||"));
  const atom = () => {
    const t = toks[i++];
    if (!t) throw new DslError("expression ends early", line);
    if (t.t === "op" && (t.v === "!" || t.v === "~")) return g.not(atom());
    if (t.t === "op" && t.v === "(") {
      const v = or();
      if (!isOp(")")) throw new DslError("missing )", line);
      i++;
      return v;
    }
    if (t.t === "num") {
      if (t.v === "0") return g.c0;
      if (t.v === "1") return g.c1;
      throw new DslError(`only 0 and 1 are allowed, got ${t.v}`, line);
    }
    if (t.t === "id") return lookup(t.v);
    throw new DslError(`unexpected "${t.v}"`, line);
  };
  const and = () => { let v = atom(); while (isOp("&")) { i++; v = g.and(v, atom()); } return v; };
  const xor = () => { let v = and(); while (isOp("^")) { i++; v = g.xor(v, and()); } return v; };
  const or = () => { let v = xor(); while (isOp("|")) { i++; v = g.or(v, xor()); } return v; };
  const v = or();
  if (i < toks.length) throw new DslError(`unexpected "${toks[i].v}"`, line);
  return v;
}

/** Compile DSL source. Returns { bytes, hex, nIn, nOut, nNand, nLatch, gateCount, mems, records }. */
export function compile(src) {
  const g = new Graph();
  const names = new Map();
  const mems = [];               // {name, q, next}
  let left = null, right = null;
  const lookup = line => name => {
    const up = name.toUpperCase();
    if (names.has(name)) return names.get(name);
    if (up in INPUT_INDEX && !names.has(name)) return g.inputs[INPUT_INDEX[up]];
    throw new DslError(`unknown name "${name}"`, line);
  };

  src.split(/\r?\n/).forEach((raw, idx) => {
    const line = idx + 1;
    const toks = tokenize(raw, line);
    if (!toks.length) return;
    const head = toks[0];
    if (head.t === "id" && head.v === "mem") {
      for (let i = 1; i < toks.length; i++) {
        const t = toks[i];
        if (t.t === "op" && t.v === ",") continue;
        if (t.t !== "id") throw new DslError("mem expects names", line);
        if (names.has(t.v) || t.v.toUpperCase() in INPUT_INDEX) throw new DslError(`"${t.v}" is already defined`, line);
        const q = g.latch(mems.length);
        mems.push({ name: t.v, q, next: null });
        names.set(t.v, q);
      }
      return;
    }
    let k = 0, isNext = false;
    if (head.t === "id" && (head.v === "let" || head.v === "next")) { isNext = head.v === "next"; k = 1; }
    const target = toks[k];
    if (!target || target.t !== "id" || !toks[k + 1] || toks[k + 1].v !== "=")
      throw new DslError('expected "name = expression"', line);
    const value = parseExpr(toks.slice(k + 2), g, lookup(line), line);
    if (isNext) {
      const mem = mems.find(m => m.name === target.v);
      if (!mem) throw new DslError(`"${target.v}" is not a mem`, line);
      mem.next = value;
      return;
    }
    if (target.v.toUpperCase() in INPUT_INDEX) throw new DslError(`"${target.v}" is an input`, line);
    if (mems.some(m => m.name === target.v)) throw new DslError(`use "next ${target.v} = ..." to set a mem`, line);
    if (target.v === "left") left = value;
    if (target.v === "right") right = value;
    names.set(target.v, value);
  });

  if (left === null) left = g.c0;
  if (right === null) right = g.c0;
  mems.forEach(m => { if (m.next === null) m.next = m.q; });
  return emit(g, left, right, mems);
}

function emit(g, left, right, mems) {
  const N = g.nodes;
  // Outputs that are not gates get fresh buffer gates so they can sit at the netlist tail.
  const asGate = x => {
    const n = N[x];
    if (n.k === "nand") return x;
    if (n.k === "c0") return g.raw(g.c1, g.c1);
    if (n.k === "c1") return g.raw(g.c0, g.c0);
    const inv = g.raw(x, x);
    return g.raw(inv, inv);
  };
  const L = asGate(left), R = asGate(right);   // L === R falls through to tail buffers below

  // Liveness from the outputs, pulling in memories whose value is read.
  const live = new Uint8Array(N.length);
  const memByQ = new Map(mems.map(m => [m.q, m]));
  const stack = [L, R];
  while (stack.length) {
    const x = stack.pop();
    if (live[x]) continue;
    live[x] = 1;
    const n = N[x];
    if (n.k === "nand") stack.push(n.a, n.b);
    if (n.k === "latch") stack.push(memByQ.get(x).next);
  }
  const liveMems = mems.filter(m => live[m.q]);

  // Users of each gate among live gates (latch d edges don't count: d may point forward).
  const users = new Map();
  N.forEach((n, x) => {
    if (!live[x] || n.k !== "nand") return;
    for (const c of new Set([n.a, n.b])) {
      if (!users.has(c)) users.set(c, new Set());
      users.get(c).add(x);
    }
  });
  const usersOf = x => users.get(x) || new Set();
  const lUsers = usersOf(L);
  const canDefer = N[L].k === "nand" && N[R].k === "nand" && L !== R &&
    [...lUsers].every(u => u === R) && usersOf(R).size === 0;

  const sigOf = new Map([[g.c0, 0], [g.c1, 1]]);
  g.inputs.forEach((x, i) => sigOf.set(x, 2 + i));
  const records = [];
  liveMems.forEach((m, k) => { sigOf.set(m.q, 2 + N_IN + k); records.push({ op: "latch", d: -1, mem: m }); });
  const emitGate = x => {
    const n = N[x];
    records.push({ op: "nand", a: sigOf.get(n.a), b: sigOf.get(n.b) });
    sigOf.set(x, 2 + N_IN + records.length - 1);
  };
  N.forEach((n, x) => {
    if (!live[x] || n.k !== "nand") return;
    if (canDefer && (x === L || x === R)) return;
    emitGate(x);
  });
  if (canDefer) { emitGate(L); emitGate(R); }
  else {
    const sl = sigOf.get(L), sr = sigOf.get(R);
    const base = 2 + N_IN + records.length;
    records.push({ op: "nand", a: sl, b: sl }, { op: "nand", a: sr, b: sr });
    records.push({ op: "nand", a: base, b: base }, { op: "nand", a: base + 1, b: base + 1 });
  }
  for (const r of records) if (r.op === "latch") { r.d = sigOf.get(r.mem.next); delete r.mem; }

  const bytes = encode(records);
  const nLatch = liveMems.length;
  const nNand = records.length - nLatch;
  return {
    bytes, hex: bytesToHex(bytes), nIn: N_IN, nOut: 2,
    nNand, nLatch, gateCount: nNand + nLatch,
    mems: liveMems.map(m => m.name), records,
  };
}
