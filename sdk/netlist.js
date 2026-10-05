// TAP-02 netlist encoding (TapeOut protocol). Integers inside the netlist are big-endian;
// I/O and state bits are packed LSB-first. Signals: 0 = const 0, 1 = const 1,
// 2..2+nIn-1 = inputs, then one signal per NAND/LATCH record in order.

export const OP_NAND = 0;
export const OP_LATCH = 1;
export const OP_REF = 2;

export function hexToBytes(hex) {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(2 * i, 2 * i + 2), 16);
  return out;
}

export function bytesToHex(bytes) {
  let s = "0x";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

const u24 = (b, p) => (b[p] << 16) | (b[p + 1] << 8) | b[p + 2];

/** records: [{op:"nand", a, b} | {op:"latch", d}] -> Uint8Array */
export function encode(records) {
  const out = [];
  const push24 = v => out.push((v >> 16) & 255, (v >> 8) & 255, v & 255);
  for (const r of records) {
    if (r.op === "nand") { out.push(OP_NAND); push24(r.a); push24(r.b); }
    else if (r.op === "latch") { out.push(OP_LATCH); push24(r.d); }
    else throw new Error("unsupported record " + r.op);
  }
  return Uint8Array.from(out);
}

/** Decode a NAND/LATCH-only netlist. Throws on REF (Arena bots must be native silicon). */
export function decode(input, nIn) {
  const b = typeof input === "string" ? hexToBytes(input) : input;
  const records = [];
  let p = 0, nNand = 0, nLatch = 0;
  while (p < b.length) {
    const op = b[p];
    if (op === OP_NAND) { records.push({ op: "nand", a: u24(b, p + 1), b: u24(b, p + 4) }); p += 7; nNand++; }
    else if (op === OP_LATCH) { records.push({ op: "latch", d: u24(b, p + 1) }); p += 4; nLatch++; }
    else if (op === OP_REF) throw new Error("REF elements are not allowed in Arena bots");
    else throw new Error("bad opcode " + op);
  }
  const nSignals = 2 + nIn + records.length;
  // Same well-formedness rules as NetlistVM.analyze (for NAND/LATCH).
  records.forEach((r, i) => {
    const self = 2 + nIn + i;
    if (r.op === "nand" && (r.a >= self || r.b >= self)) throw new Error("NAND: future signal");
    if (r.op === "latch" && r.d >= nSignals) throw new Error("LATCH d out of range");
  });
  return { records, nNand, nLatch, nSignals, gateCount: nNand + nLatch };
}
