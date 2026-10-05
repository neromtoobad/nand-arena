// Glue between on-chain data and the shared sdk (the same code the contract tests compare against).
import { ethers } from "ethers";
import { load } from "@sdk/vm.js";
import { playMatch, matchSeed, START } from "@sdk/game.js";
import { DEPLOY } from "./chain.js";

const progCache = new Map();
export function progOf(netlist) {
  const key = ethers.hexlify(netlist);
  if (!progCache.has(key)) progCache.set(key, load(netlist, 8, 2));
  return progCache.get(key);
}

const matchCache = new Map();
/** Full trace of a match: positions per tick, per-tick signals, crash info. */
export function runMatch(season, ea, eb) {
  const key = `${season}:${ea.circuitId}:${eb.circuitId}:${ethers.hexlify(ea.netlist).length}:${ethers.hexlify(eb.netlist).length}`;
  if (matchCache.has(key)) return matchCache.get(key);
  const seed = matchSeed(season, ea.circuitId, eb.circuitId);
  const r = playMatch(progOf(ea.netlist), progOf(eb.netlist), seed, { trace: true });
  const out = { ...r, ...framesOf(r.trace), seed };
  matchCache.set(key, out);
  return out;
}

export function framesOf(trace) {
  const posA = [{ ...START[0] }], posB = [{ ...START[1] }];
  for (const f of trace) { posA.push(f.next[0]); posB.push(f.next[1]); }
  const last = trace[trace.length - 1];
  return { posA, posB, crash: last ? last.crash : [false, false] };
}

// ---------------------------------------------------------------- names

const ADJ = ["Copper", "Silent", "Feral", "Neon", "Stubborn", "Quiet", "Rogue", "Lucky", "Brass", "Static", "Hollow", "Velvet", "Iron", "Wired", "Glitch", "Amber", "Cobalt", "Tiny", "Grim", "Swift", "Lazy", "Polar", "Fuzzy", "Binary"];
const NOUN = ["Viper", "Latch", "Moth", "Gate", "Comet", "Ferret", "Relay", "Heron", "Fuse", "Pike", "Wisp", "Mantis", "Diode", "Lynx", "Spark", "Owl", "Rook", "Clock", "Hare", "Bolt", "Crab", "Shrike", "Toad", "Pulse"];

export function botName(entry) {
  const house = DEPLOY?.houseBots?.find(h => h.circuitId === entry.circuitId);
  if (house) return house.name;
  const h = ethers.keccak256(entry.netlist || ethers.toBeHex(entry.circuitId, 8));
  const n = BigInt(h);
  return `${ADJ[Number(n % 24n)]} ${NOUN[Number((n >> 8n) % 24n)]}`;
}

export function hashBytes(entry) {
  return ethers.getBytes(ethers.keccak256(entry.netlist || ethers.toBeHex(entry.circuitId, 8)));
}

/** Standings order used by the contract's finalize(): points, wins, fewer gates, earlier entry. */
export function standings(entries) {
  return [...entries].sort((x, y) =>
    y.points - x.points || y.wins - x.wins || x.gates - y.gates || x.idx - y.idx);
}

/** Per-entry list of results (w/d/l) in match order, for the form dots. */
export function formOf(season, entryIdx) {
  return season.matches
    .filter(m => m.played && (m.a === entryIdx || m.b === entryIdx))
    .map(m => (m.result === 0 ? "d" : (m.result === 1) === (m.a === entryIdx) ? "w" : "l"));
}
