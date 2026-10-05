// Bit-exact JS port of TapeOut NetlistVM.run for NAND/LATCH netlists.
// One beat: LATCH k outputs state bit k (previous beat); after every signal is computed,
// new state bit k = signal[d_k]. Outputs are the last nOut signals.

import { decode } from "./netlist.js";

export function load(netlist, nIn, nOut) {
  const dec = decode(netlist, nIn);
  const n = dec.records.length;
  const kind = new Uint8Array(n);          // 0 nand, 1 latch
  const a = new Int32Array(n), b = new Int32Array(n);
  const latchD = [];
  dec.records.forEach((r, i) => {
    if (r.op === "nand") { kind[i] = 0; a[i] = r.a; b[i] = r.b; }
    else { kind[i] = 1; a[i] = latchD.length; latchD.push(r.d); }
  });
  if (dec.nSignals < 2 + nIn + nOut) throw new Error("too few signals for outputs");
  return { nIn, nOut, nSignals: dec.nSignals, kind, a, b, latchD, nState: latchD.length, gateCount: dec.gateCount, nNand: dec.nNand, nLatch: dec.nLatch };
}

/**
 * state: array of 0/1 (length nState), inputs: integer bitmask (bit i = input i).
 * Returns { state, out (bitmask), sig (Uint8Array of every signal this beat) }.
 */
export function step(prog, state, inputs) {
  const { nIn, nSignals, kind, a, b, latchD, nOut } = prog;
  const sig = new Uint8Array(nSignals);
  sig[1] = 1;
  for (let i = 0; i < nIn; i++) sig[2 + i] = (inputs >> i) & 1;
  let pos = 2 + nIn;
  for (let i = 0; i < kind.length; i++, pos++) {
    sig[pos] = kind[i] === 0 ? ((sig[a[i]] & sig[b[i]]) ? 0 : 1) : (state[a[i]] | 0);
  }
  const next = latchD.map(d => sig[d]);
  let out = 0;
  for (let i = 0; i < nOut; i++) out |= sig[nSignals - nOut + i] << i;
  return { state: next, out, sig };
}

export const packBits = arr => {
  const bytes = new Uint8Array(Math.ceil(arr.length / 8));
  arr.forEach((v, i) => { if (v) bytes[i >> 3] |= 1 << (i & 7); });
  return bytes;
};
