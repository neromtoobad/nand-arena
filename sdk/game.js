// NAND Arena — Light Cycles. This file is the spec: NandArena.sol implements the same rules
// bit for bit, and tests compare the two.
//
// Board 16x16, cell = y*16 + x. Directions 0 N, 1 E, 2 S, 3 W.
// Bot A starts at (3,8) heading E, bot B at (12,7) heading W (point-symmetric).
// Each tick both bots see 8 input bits (relative to their own heading), run one beat of their
// circuit, and output 2 bits: bit0 = turn left, bit1 = turn right (both/neither = straight).
// Then both move at once. A bot crashes leaving the board, hitting any trail, or when both
// heads land on the same cell. Both crash = draw; MAX_TICKS without a crash = draw.

import { solidityPackedKeccak256 } from "ethers";
import { step } from "./vm.js";

export const SIZE = 16;
export const MAX_TICKS = 128;
export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];
export const START = [
  { x: 3, y: 8, d: 1 },
  { x: 12, y: 7, d: 3 },
];

export const INPUTS = [
  { key: "F", bit: 0, label: "blocked ahead" },
  { key: "L", bit: 1, label: "blocked left" },
  { key: "R", bit: 2, label: "blocked right" },
  { key: "F2", bit: 3, label: "blocked two ahead" },
  { key: "OL", bit: 4, label: "opponent is on my left" },
  { key: "OF", bit: 5, label: "opponent is ahead of me" },
  { key: "RL", bit: 6, label: "more open run to my left than my right" },
  { key: "COIN", bit: 7, label: "fair coin flip (per tick, per side)" },
];

export const RESULT = { DRAW: 0, A: 1, B: 2 };

/** Same as keccak256(abi.encodePacked(uint32 season, uint64 circuitA, uint64 circuitB)) */
export function matchSeed(season, circuitA, circuitB) {
  return BigInt(solidityPackedKeccak256(["uint32", "uint64", "uint64"], [season, circuitA, circuitB]));
}

const inBounds = (x, y) => x >= 0 && x < SIZE && y >= 0 && y < SIZE;

export function sense(occ, me, opp, coin) {
  const blocked = (x, y) => !inBounds(x, y) || occ[y * SIZE + x] !== 0;
  const d = me.d, l = (d + 3) & 3, r = (d + 1) & 3;
  const run = dir => {
    let n = 0, x = me.x + DX[dir], y = me.y + DY[dir];
    while (!blocked(x, y)) { n++; x += DX[dir]; y += DY[dir]; }
    return n;
  };
  const ddx = opp.x - me.x, ddy = opp.y - me.y;
  const fwd = ddx * DX[d] + ddy * DY[d];
  const lat = ddx * DX[l] + ddy * DY[l];
  let bits = 0;
  if (blocked(me.x + DX[d], me.y + DY[d])) bits |= 1;
  if (blocked(me.x + DX[l], me.y + DY[l])) bits |= 2;
  if (blocked(me.x + DX[r], me.y + DY[r])) bits |= 4;
  if (blocked(me.x + 2 * DX[d], me.y + 2 * DY[d])) bits |= 8;
  if (lat > 0) bits |= 16;
  if (fwd > 0) bits |= 32;
  if (run(l) > run(r)) bits |= 64;
  if (coin) bits |= 128;
  return bits;
}

export function turn(d, out) {
  const left = out & 1, right = (out >> 1) & 1;
  if (left && !right) return (d + 3) & 3;
  if (right && !left) return (d + 1) & 3;
  return d;
}

/**
 * Play one match. progs = [progA, progB] from vm.load(). seed = BigInt from matchSeed().
 * opts.trace = true records every tick (positions, inputs, outputs, signal values) for replays.
 */
export function playMatch(progA, progB, seed, opts = {}) {
  const progs = [progA, progB];
  const occ = new Uint8Array(SIZE * SIZE);
  const pos = START.map(s => ({ ...s }));
  occ[pos[0].y * SIZE + pos[0].x] = 1;
  occ[pos[1].y * SIZE + pos[1].x] = 2;
  const states = progs.map(p => new Array(p.nState).fill(0));
  const trace = opts.trace ? [] : null;

  for (let t = 0; t < MAX_TICKS; t++) {
    const frame = trace ? { t, bots: [] } : null;
    const next = [];
    for (let s = 0; s < 2; s++) {
      const coin = Number((seed >> BigInt(2 * t + s)) & 1n);
      const inBits = sense(occ, pos[s], pos[1 - s], coin);
      const r = step(progs[s], states[s], inBits);
      states[s] = r.state;
      const d = turn(pos[s].d, r.out);
      next.push({ x: pos[s].x + DX[d], y: pos[s].y + DY[d], d });
      if (frame) frame.bots.push({ x: pos[s].x, y: pos[s].y, d: pos[s].d, in: inBits, out: r.out, sig: r.sig, state: r.state });
    }
    const hit = n => !inBounds(n.x, n.y) || occ[n.y * SIZE + n.x] !== 0;
    let crashA = hit(next[0]), crashB = hit(next[1]);
    if (next[0].x === next[1].x && next[0].y === next[1].y) crashA = crashB = true;
    if (frame) { frame.next = next; frame.crash = [crashA, crashB]; trace.push(frame); }
    if (crashA || crashB) {
      const result = crashA && crashB ? RESULT.DRAW : crashA ? RESULT.B : RESULT.A;
      return { result, ticks: t + 1, trace };
    }
    occ[next[0].y * SIZE + next[0].x] = 1;
    occ[next[1].y * SIZE + next[1].x] = 2;
    pos[0] = next[0];
    pos[1] = next[1];
  }
  return { result: RESULT.DRAW, ticks: MAX_TICKS, trace };
}
