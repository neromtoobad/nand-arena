// Writes contracts/test/fixtures/seed.json: house-bot netlists plus the JS engine's expected
// round-robin results, assuming a fresh processor (circuit ids 1..n) in season 1.
import { writeFileSync, mkdirSync } from "node:fs";
import { compile } from "../dsl.js";
import { load } from "../vm.js";
import { playMatch, matchSeed } from "../game.js";
import { SEED_BOTS } from "../bots.js";

const bots = SEED_BOTS.map(b => compile(b.src));
const progs = bots.map(c => load(c.bytes, 8, 2));
const pairs = [];
for (let i = 0; i < bots.length; i++)
  for (let j = i + 1; j < bots.length; j++) {
    const r = playMatch(progs[i], progs[j], matchSeed(1, i + 1, j + 1));
    pairs.push({ a: i, b: j, result: r.result, ticks: r.ticks });
  }
const out = {
  netlists: bots.map(c => c.hex),
  gates: bots.map(c => c.gateCount),
  pairA: pairs.map(p => p.a),
  pairB: pairs.map(p => p.b),
  results: pairs.map(p => p.result),
  ticks: pairs.map(p => p.ticks),
};
mkdirSync(new URL("../../contracts/test/fixtures/", import.meta.url), { recursive: true });
writeFileSync(new URL("../../contracts/test/fixtures/seed.json", import.meta.url), JSON.stringify(out, null, 2));
console.log(`fixture: ${bots.length} bots, ${pairs.length} pairs`);
