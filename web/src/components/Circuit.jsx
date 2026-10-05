import { useMemo } from "react";
import { INPUTS } from "@sdk/game.js";

/** Layered schematic of a NAND/LATCH netlist; wires coloured by live signal values. */
export default function Circuit({ prog, sig, maxGates = 140 }) {
  const lay = useMemo(() => (prog && prog.kind.length <= maxGates ? layout(prog) : null), [prog, maxGates]);
  if (!prog) return null;
  if (!lay) return <div className="note">This circuit has {prog.kind.length} elements — showing the die view instead of a schematic.</div>;
  const on = s => (sig ? sig[s] === 1 : false);
  const { nodes, W, H, edges } = lay;
  return (
    <svg className="circuit" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="circuit schematic">
      {edges.map((e, i) => {
        const a = nodes.get(e.from), b = nodes.get(e.to);
        if (!a || !b) return null;
        const live = on(e.from);
        const x1 = a.x + 9, y1 = a.y, x2 = b.x - 9, y2 = b.y + e.dy;
        const mx = e.back ? Math.max(x1, x2) + 30 : (x1 + x2) / 2;
        const d = e.back
          ? `M${x1},${y1} C${mx},${y1} ${mx},${y2 - 26} ${(x1 + x2) / 2},${Math.min(y1, y2) - 26} S${x2 - 30},${y2} ${x2},${y2}`
          : `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
        return <path key={i} d={d} fill="none" stroke={live ? (e.back ? "#c98a12" : "#0f6b5c") : "#d9d7cf"} strokeWidth={live ? 1.8 : 1.1} strokeDasharray={e.back ? "3 3" : undefined} />;
      })}
      {[...nodes.values()].map(n => {
        const live = on(n.s);
        if (n.type === "in") return (
          <g key={n.s}>
            <rect x={n.x - 26} y={n.y - 9} width={34} height={18} rx={5} fill={live ? "#0f6b5c" : "#efede7"} />
            <text x={n.x - 9} y={n.y + 4} textAnchor="middle" fontSize={9.5} fontFamily="JetBrains Mono" fill={live ? "#fff" : "#8a8880"}>{n.label}</text>
          </g>
        );
        if (n.type === "const") return (
          <text key={n.s} x={n.x} y={n.y + 4} textAnchor="middle" fontSize={10} fontFamily="JetBrains Mono" fill="#8a8880">{n.label}</text>
        );
        if (n.type === "latch") return (
          <g key={n.s}>
            <rect x={n.x - 9} y={n.y - 9} width={18} height={18} rx={3} fill={live ? "#c98a12" : "#fbf1db"} stroke="#c98a12" />
            <text x={n.x} y={n.y + 3.5} textAnchor="middle" fontSize={8} fontFamily="JetBrains Mono" fill={live ? "#fff" : "#c98a12"}>M</text>
          </g>
        );
        return (
          <g key={n.s}>
            <path d={`M${n.x - 8},${n.y - 8} h8 a8,8 0 0 1 0,16 h-8 z`} fill={live ? "#0f6b5c" : "#fff"} stroke={live ? "#0f6b5c" : "#b9b6ab"} strokeWidth={1.2} />
            <circle cx={n.x + 10} cy={n.y} r={2} fill="#fff" stroke={live ? "#0f6b5c" : "#b9b6ab"} />
            {n.out && <text x={n.x + 16} y={n.y + 4} fontSize={10} fontWeight={700} fontFamily="JetBrains Mono" fill="#1d1d1b">{n.out}</text>}
          </g>
        );
      })}
    </svg>
  );
}

function layout(prog) {
  const { nIn, kind, a, b, latchD, nSignals, nOut } = prog;
  const base = 2 + nIn;
  const depth = new Int32Array(nSignals);
  const used = new Set();
  for (let i = 0; i < kind.length; i++) {
    const s = base + i;
    if (kind[i] === 0) { depth[s] = 1 + Math.max(depth[a[i]], depth[b[i]]); used.add(a[i]); used.add(b[i]); }
    else { depth[s] = 0; used.add(latchD[a[i]]); }
  }
  const cols = new Map();
  const put = (s, c) => { if (!cols.has(c)) cols.set(c, []); cols.get(c).push(s); };
  const inputs = INPUTS.filter(p => used.has(2 + p.bit)).map(p => 2 + p.bit);
  const consts = [0, 1].filter(s => used.has(s));
  for (const s of [...consts, ...inputs]) put(s, 0);
  for (let i = 0; i < kind.length; i++) {
    const s = base + i;
    put(s, kind[i] === 1 ? 0 : depth[s]);
  }
  const colW = 64, rowH = 28, padX = 44, padY = 24;
  const nCols = Math.max(...cols.keys()) + 1;
  const maxRows = Math.max(...[...cols.values()].map(v => v.length));
  const H = padY * 2 + maxRows * rowH;
  const nodes = new Map();
  for (const [c, list] of cols) {
    const off = (maxRows - list.length) * rowH / 2;
    list.forEach((s, r) => {
      const y = padY + off + r * rowH + rowH / 2;
      const x = padX + c * colW + (c === 0 ? 0 : 10);
      let type = "gate", label = "";
      if (s < 2) { type = "const"; label = String(s); }
      else if (s < base) { type = "in"; label = INPUTS[s - 2].key; }
      else if (kind[s - base] === 1) type = "latch";
      const outIdx = s - (nSignals - nOut);
      nodes.set(s, { s, x, y, type, label, out: outIdx === 0 ? "L" : outIdx === 1 ? "R" : null });
    });
  }
  const edges = [];
  for (let i = 0; i < kind.length; i++) {
    const s = base + i;
    if (kind[i] === 0) {
      edges.push({ from: a[i], to: s, dy: -4 });
      edges.push({ from: b[i], to: s, dy: 4 });
    } else edges.push({ from: latchD[a[i]], to: s, dy: 0, back: true });
  }
  return { nodes, edges, W: padX * 2 + nCols * colW + 20, H };
}
