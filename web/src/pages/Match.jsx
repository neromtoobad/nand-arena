import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../App.jsx";
import Board from "../components/Board.jsx";
import { ChipAvatar, Die, Pins } from "../components/Chip.jsx";
import { runMatch, botName, progOf } from "../sim.js";
import { arena, loadSeason, findMatchTx, short, txUrl, addrUrl } from "../chain.js";
import { INPUTS } from "@sdk/game.js";

const TURN = ["straight", "turn left", "turn right", "straight"];

export default function Match({ season: sNum, a, b }) {
  const { season: current } = useApp();
  const [data, setData] = useState(null);
  useEffect(() => {
    if (current && current.season === sNum) setData(current);
    else loadSeason(sNum).then(setData).catch(() => {});
  }, [current, sNum]);

  const ea = data?.entries[a], eb = data?.entries[b];
  const r = useMemo(() => (ea && eb ? runMatch(sNum, ea, eb) : null), [sNum, ea, eb]);
  const onchain = data?.matches.find(m => m.a === a && m.b === b);

  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(6);
  const raf = useRef();
  useEffect(() => {
    if (!r || !playing) return;
    let last = performance.now();
    const fr = now => {
      const dt = (now - last) / 1000; last = now;
      setT(x => { const n = x + dt * speed; if (n >= r.ticks) { setPlaying(false); return r.ticks; } return n; });
      raf.current = requestAnimationFrame(fr);
    };
    raf.current = requestAnimationFrame(fr);
    return () => cancelAnimationFrame(raf.current);
  }, [r, playing, speed]);

  const [verify, setVerify] = useState(null);
  const [tx, setTx] = useState(undefined);
  useEffect(() => { if (onchain?.played) findMatchTx(sNum, a, b).then(setTx); }, [onchain?.played, sNum, a, b]);

  if (!data) return <div className="loading">Loading match…</div>;
  if (!ea || !eb || !r) return <div className="loading">No such match.</div>;

  const k = Math.min(Math.floor(t), r.ticks - 1);
  const frame = r.trace[k];
  const winner = r.result === 0 ? "Draw" : `${r.result === 1 ? botName(ea) : botName(eb)} wins`;
  const doVerify = async () => {
    setVerify({ busy: true });
    try {
      const [res, ticks] = await arena.simulate(ea.circuitId, eb.circuitId, sNum);
      setVerify({ res: Number(res), ticks: Number(ticks) });
    } catch (e) { setVerify({ err: e.shortMessage || e.message }); }
  };
  const share = `${location.origin}${location.pathname}#/match/${sNum}/${a}/${b}`;
  const tweet = `https://x.com/intent/tweet?text=${encodeURIComponent(`${botName(ea)} vs ${botName(eb)} on NAND Arena: ${winner.toLowerCase()} in ${r.ticks} ticks. Every move refereed on-chain by TapeOut circuits on X Layer.`)}&url=${encodeURIComponent(share)}`;

  return (
    <div className="section">
      <div className="section-head">
        <div>
          <div className="eyebrow">Season {sNum} · match {a + 1}–{b + 1}</div>
          <h2 style={{ marginTop: 6 }}>{botName(ea)} <span style={{ color: "var(--muted)", fontWeight: 500 }}>vs</span> {botName(eb)}</h2>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a className="btn ghost sm" href={tweet} target="_blank" rel="noreferrer">Share on X</a>
          <a className="btn primary sm" href={`#/lab?vs=${ea.circuitId}`}>Build a bot to beat {botName(ea)}</a>
        </div>
      </div>

      <div className="replay">
        <BotPanel entry={ea} side="a" frame={frame?.bots[0]} crashed={t >= r.ticks && r.crash[0]} />
        <div>
          <div className="screen">
            <div className="screen-bar"><span className="tag-a">{botName(ea)}</span><span>tick {Math.min(r.ticks, Math.floor(t))}/{r.ticks}</span><span className="tag-b">{botName(eb)}</span></div>
            <Board match={r} t={t} size={540} />
            <div className="screen-foot"><span>{t >= r.ticks ? winner : "…"}</span><span>seed {("0x" + r.seed.toString(16)).slice(0, 10)}…</span></div>
          </div>
          <div className="controls">
            <button className="btn ghost sm" onClick={() => { if (t >= r.ticks) setT(0); setPlaying(p => !p); }}>{playing ? "Pause" : t >= r.ticks ? "Replay" : "Play"}</button>
            <input type="range" min={0} max={r.ticks} step={0.01} value={t} onChange={e => { setPlaying(false); setT(Number(e.target.value)); }} />
            <select value={speed} onChange={e => setSpeed(Number(e.target.value))} className="btn ghost sm">
              <option value={2}>0.3×</option><option value={6}>1×</option><option value={14}>2×</option><option value={30}>5×</option>
            </select>
          </div>
          <div className="card pad" style={{ marginTop: 16 }}>
            <h3>Refereed on-chain</h3>
            <dl className="kv" style={{ marginTop: 10 }}>
              <dt>Recorded result</dt><dd>{onchain?.played ? (onchain.result === 0 ? "draw" : `${onchain.result === 1 ? botName(ea) : botName(eb)} won`) : "not played yet"}</dd>
              <dt>Replay (this page)</dt><dd>{winner.toLowerCase()} in {r.ticks} ticks {onchain?.played && (onchain.result === r.result ? "✓ matches" : "⚠ differs")}</dd>
              <dt>Transaction</dt><dd>{tx ? <a className="addr" href={txUrl(tx)} target="_blank" rel="noreferrer">{short(tx)}</a> : tx === null ? "—" : onchain?.played ? "looking…" : "—"}</dd>
              <dt>Contract re-run</dt><dd>
                {!verify && <button className="btn ghost sm" onClick={doVerify}>Verify on X Layer</button>}
                {verify?.busy && "asking NandArena.simulate()…"}
                {verify?.res !== undefined && <>{["draw", "A wins", "B wins"][verify.res]} in {verify.ticks} ticks {verify.res === r.result && verify.ticks === r.ticks ? "✓ identical" : "⚠ differs"}</>}
                {verify?.err && <span style={{ color: "var(--red)" }}>{verify.err}</span>}
              </dd>
            </dl>
          </div>
        </div>
        <BotPanel entry={eb} side="b" frame={frame?.bots[1]} crashed={t >= r.ticks && r.crash[1]} />
      </div>
    </div>
  );
}

function BotPanel({ entry, side, frame, crashed }) {
  const prog = progOf(entry.netlist);
  const sensed = frame ? INPUTS.filter(p => (frame.in >> p.bit) & 1).map(p => p.key) : [];
  return (
    <div className="card botpanel">
      <h3><ChipAvatar entry={entry} side={side} /> <span style={{ color: side === "a" ? "var(--a)" : "var(--b)" }}>{botName(entry)}</span></h3>
      <dl className="kv" style={{ margin: "12px 0" }}>
        <dt>Circuit</dt><dd>#{entry.circuitId} · {entry.gates} gates{prog.nLatch ? ` · ${prog.nLatch} memory` : ""}</dd>
        <dt>Owner</dt><dd><a className="addr" href={addrUrl(entry.entrant)} target="_blank" rel="noreferrer">{short(entry.entrant)}</a></dd>
        <dt>Decision</dt><dd><b>{crashed ? "crashed" : frame ? TURN[frame.out] : "—"}</b></dd>
      </dl>
      <div className="eyebrow">Sensors this tick</div>
      <Pins inBits={frame?.in || 0} out={frame?.out || 0} />
      <div className="note" style={{ marginBottom: 10, minHeight: 18 }}>{sensed.length ? sensed.join(" · ") : "nothing sensed"}</div>
      <div className="eyebrow" style={{ marginBottom: 6 }}>Die · {prog.kind.length} elements lit by value</div>
      <Die prog={prog} sig={frame?.sig} />
    </div>
  );
}
