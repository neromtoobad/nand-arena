// Run: node sdk/test/sdk.test.mjs
import assert from "node:assert/strict";
import { compile } from "../dsl.js";
import { load, step } from "../vm.js";
import { playMatch, matchSeed, RESULT } from "../game.js";
import { SEED_BOTS } from "../bots.js";

const INPUT_KEYS = ["F", "L", "R", "F2", "OL", "OF", "RL", "COIN"];

// --- 1. DSL vs direct JS evaluation, random expressions --------------------------------
function randExpr(depth, vars) {
  if (depth === 0 || Math.random() < 0.25) {
    const r = Math.random();
    if (r < 0.06) return "0";
    if (r < 0.12) return "1";
    return vars[Math.floor(Math.random() * vars.length)];
  }
  const k = Math.random();
  if (k < 0.2) return "!" + randExpr(depth - 1, vars);
  const op = ["&", "|", "^"][Math.floor(Math.random() * 3)];
  return `(${randExpr(depth - 1, vars)} ${op} ${randExpr(depth - 1, vars)})`;
}
const jsEval = (expr, env) => Function(...Object.keys(env), `return (${expr}) ? 1 : 0;`)(...Object.values(env));

for (let trial = 0; trial < 300; trial++) {
  const vars = [...INPUT_KEYS, "m0", "m1"];
  const eL = randExpr(4, vars), eR = randExpr(4, vars), n0 = randExpr(3, vars), n1 = randExpr(3, vars);
  const src = `mem m0, m1\nleft = ${eL}\nright = ${eR}\nnext m0 = ${n0}\nnext m1 = ${n1}`;
  const c = compile(src);
  const prog = load(c.bytes, 8, 2);
  // drive 40 random beats, tracking memory both ways
  let jsMem = { m0: 0, m1: 0 };
  let st = new Array(prog.nState).fill(0);
  for (let beat = 0; beat < 40; beat++) {
    const inp = Math.floor(Math.random() * 256);
    const env = { ...Object.fromEntries(INPUT_KEYS.map((k, i) => [k, (inp >> i) & 1])), ...jsMem };
    const want = jsEval(eL, env) | (jsEval(eR, env) << 1);
    const r = step(prog, st, inp);
    assert.equal(r.out, want, `trial ${trial} beat ${beat}\n${src}`);
    // live mems only appear in the netlist if read; compare through behaviour, so map by name
    const nextJs = { m0: jsEval(n0, env), m1: jsEval(n1, env) };
    const nextNl = { ...nextJs };
    c.mems.forEach((name, k) => { nextNl[name] = r.state[k]; });
    for (const name of c.mems) assert.equal(nextNl[name], nextJs[name], `mem ${name} trial ${trial}`);
    jsMem = nextJs;
    st = r.state;
  }
}
console.log("dsl fuzz ok (300 programs x 40 beats)");

// --- 2. Seed bots compile and report sizes ---------------------------------------------
const bots = SEED_BOTS.map(b => ({ ...b, c: compile(b.src) }));
for (const b of bots) {
  b.prog = load(b.c.bytes, 8, 2);
  console.log(`${b.name.padEnd(10)} ${String(b.c.gateCount).padStart(3)} gates (${b.c.nNand} NAND, ${b.c.nLatch} LATCH), ${b.c.bytes.length} bytes`);
}

// --- 3. Symmetry: a bot without COIN against itself must draw ---------------------------
const cautious = bots[0].prog;
assert.equal(playMatch(cautious, cautious, 0n).result, RESULT.DRAW);

// --- 4. Round robin ---------------------------------------------------------------------
const table = bots.map(b => ({ name: b.name, pts: 0, w: 0, d: 0, l: 0 }));
const lines = [];
for (let i = 0; i < bots.length; i++)
  for (let j = i + 1; j < bots.length; j++) {
    const seed = matchSeed(1, i + 1, j + 1);
    const r = playMatch(bots[i].prog, bots[j].prog, seed);
    lines.push(`${bots[i].name} vs ${bots[j].name}: ${["draw", bots[i].name, bots[j].name][r.result]} (${r.ticks} ticks)`);
    if (r.result === RESULT.DRAW) { table[i].pts++; table[j].pts++; table[i].d++; table[j].d++; }
    else { const [w, l] = r.result === RESULT.A ? [i, j] : [j, i]; table[w].pts += 3; table[w].w++; table[l].l++; }
  }
console.log(lines.join("\n"));
console.table(table.sort((a, b) => b.pts - a.pts));
