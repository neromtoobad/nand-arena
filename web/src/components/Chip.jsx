import { useMemo } from "react";
import { INPUTS } from "@sdk/game.js";
import { hashBytes } from "../sim.js";

/** Procedural chip avatar: a 5x5 mirrored die pattern from the bot's netlist hash. */
export function ChipAvatar({ entry, size = 34, side }) {
  const { cells, hue } = useMemo(() => {
    const h = hashBytes(entry);
    const cells = [];
    for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) cells.push({ x, y, on: (h[y * 3 + x] & 1) === 1 });
    return { cells, hue: (h[20] * 360) / 256 };
  }, [entry.circuitId, entry.netlist]);
  const ring = side === "a" ? "var(--a)" : side === "b" ? "var(--b)" : `hsl(${hue} 45% 40%)`;
  const fg = `hsl(${hue} 60% 42%)`;
  const s = 5.2;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ flex: "none" }} aria-hidden>
      {[8, 16, 24, 32].map(p => (
        <g key={p} fill="#b9b6ab">
          <rect x={p - 1} y={1} width={2} height={4} rx={1} /><rect x={p - 1} y={35} width={2} height={4} rx={1} />
          <rect x={1} y={p - 1} width={4} height={2} rx={1} /><rect x={35} y={p - 1} width={4} height={2} rx={1} />
        </g>
      ))}
      <rect x={4.5} y={4.5} width={31} height={31} rx={6} fill="#1d1d1b" stroke={ring} strokeWidth={1.5} />
      {cells.filter(c => c.on).flatMap(c => {
        const xs = c.x === 2 ? [2] : [c.x, 4 - c.x];
        return xs.map(x => <rect key={`${x}-${c.y}`} x={7 + x * s} y={7 + c.y * s} width={s - 1} height={s - 1} rx={1} fill={fg} />);
      })}
      <rect x={7 + 2 * s} y={7 + 2 * s} width={s - 1} height={s - 1} rx={1} fill={side === "b" ? "var(--b-glow)" : "var(--a-glow)"} opacity={0.9} />
    </svg>
  );
}

/** The die: one cell per element (LATCHes first, as the compiler emits them), lit by signal value. */
export function Die({ prog, sig, cols = 16, exact }) {
  if (!prog) return null;
  const base = 2 + prog.nIn;
  const n = prog.kind.length;
  const c = exact ? Math.min(cols, Math.max(4, n)) : Math.min(cols, Math.max(8, Math.ceil(Math.sqrt(n * 1.6))));
  return (
    <div className="die" style={{ gridTemplateColumns: `repeat(${c}, 1fr)` }}>
      {Array.from({ length: n }, (_, i) => {
        const on = sig ? sig[base + i] === 1 : false;
        const latch = prog.kind[i] === 1;
        const out = i >= n - prog.nOut;
        return <div key={i} className={`cell${on ? " on" : ""}${latch ? " latch" : ""}${out ? " out" : ""}`} title={`${latch ? "LATCH" : "NAND"} #${i}${out ? (i === n - 2 ? " · output LEFT" : " · output RIGHT") : ""}`} />;
      })}
    </div>
  );
}

export function Pins({ inBits = 0, out = 0, onToggle }) {
  return (
    <div className="pins">
      {INPUTS.map(p => {
        const on = (inBits >> p.bit) & 1;
        return (
          <span key={p.key} className={`pin${on ? " on" : ""}${onToggle ? " btnpin" : ""}`} title={p.label}
            onClick={onToggle ? () => onToggle(p.bit) : undefined}>{p.key}</span>
        );
      })}
      <span style={{ width: 8 }} />
      <span className={`pin out${out & 1 ? " on" : ""}`} title="output: turn left">◀ L</span>
      <span className={`pin out${out & 2 ? " on" : ""}`} title="output: turn right">R ▶</span>
    </div>
  );
}
