import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../App.jsx";
import Board from "../components/Board.jsx";
import { Die, Pins } from "../components/Chip.jsx";
import { BotArt } from "../art.jsx";
import { runMatch, botName, progOf } from "../sim.js";
import { arena, loadSeason, findMatchTx, short, txUrl, addrUrl } from "../chain.js";
import { INPUTS } from "@sdk/game.js";

const TURN = ["Straight", "Turn left", "Turn right", "Straight"];

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

  if (!data) return <div className="loading">Loading the fight…</div>;
  if (!ea || !eb || !r) return <div className="loading">No such match.</div>;

  const k = Math.min(Math.floor(t), r.ticks - 1);
  const frame = r.trace[k];
  const done = t >= r.ticks;
  const winner = r.result === 0 ? null : r.result === 1 ? ea : eb;
  const doVerify = async () => {
    setVerify({ busy: true });
    try {
      const [res, ticks] = await arena.simulate(ea.circuitId, eb.circuitId, sNum);
      setVerify({ res: Number(res), ticks: Number(ticks) });
    } catch (e) { setVerify({ err: e.shortMessage || e.message }); }
  };
  const share = `${location.origin}${location.pathname}#/match/${sNum}/${a}/${b}`;
  const tweet = `https://x.com/intent/tweet?text=${encodeURIComponent(`${botName(ea)} vs ${botName(eb)} on NAND Arena: ${winner ? `${botName(winner)} wins` : "draw"} in ${r.ticks} ticks. Every move refereed on-chain by TapeOut circuits on X Layer.`)}&url=${encodeURIComponent(share)}`;

  return (
    <section className="band violet dots" style={{ minHeight: "calc(100vh - 70px)" }}>
      <div className="wrap" style={{ paddingTop: 40 }}>
        <div className="sec-head" style={{ marginBottom: 26 }}>
          <div>
            <span className="hero-tag"><i /> Season {sNum} · match {a + 1}–{b + 1}</span>
            <h1 className="display h-sec" style={{ marginTop: 12, textShadow: "0 6px 0 var(--ink)" }}>
              {botName(ea)} <span style={{ color: "var(--sun)" }}>vs</span> {botName(eb)}
            </h1>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a className="btn" href={tweet} target="_blank" rel="noreferrer">Share on X</a>
            <a className="btn sun" href={`#/lab?vs=${ea.circuitId}`}>Beat {botName(ea)}</a>
          </div>
        </div>

        <div className="fight">
          <Fighter entry={ea} side="a" frame={frame?.bots[0]} crashed={done && r.crash[0]} won={done && r.result === 1} />
          <div>
            <div className="tv" style={{ position: "relative" }}>
              <div className="tv-bar"><span className="a">{botName(ea)}</span><span className="vs">{String(Math.min(r.ticks, Math.floor(t))).padStart(3, "0")}/{r.ticks}</span><span className="b">{botName(eb)}</span></div>
              <div style={{ position: "relative" }}>
                <Board match={r} t={t} size={540} />
                {done && <div className="ko-banner"><span>{winner ? "K.O.!" : "Draw!"}</span></div>}
              </div>
              <div className="tv-foot"><span>{done ? (winner ? `${botName(winner)} wins` : "Both crashed") : "fight!"}</span><span>seed {("0x" + r.seed.toString(16)).slice(0, 10)}…</span></div>
            </div>
            <div className="controls">
              <button className="btn sun sm" onClick={() => { if (done) setT(0); setPlaying(p => !p); }}>{playing ? "Pause" : done ? "Replay" : "Play"}</button>
              <input type="range" min={0} max={r.ticks} step={0.01} value={t} onChange={e => { setPlaying(false); setT(Number(e.target.value)); }} />
              <select value={speed} onChange={e => setSpeed(Number(e.target.value))}>
                <option value={2}>0.3×</option><option value={6}>1×</option><option value={14}>2×</option><option value={30}>5×</option>
              </select>
            </div>
            <div className="card pad" style={{ marginTop: 18 }}>
              <h2 className="h-card" style={{ fontSize: 24 }}>Refereed on-chain</h2>
              <dl className="kv">
                <dt>Recorded result</dt><dd>{onchain?.played ? (onchain.result === 0 ? "draw" : `${botName(onchain.result === 1 ? ea : eb)} won`) : "not played yet"}</dd>
                <dt>This replay</dt><dd>{winner ? `${botName(winner)} wins` : "draw"} in {r.ticks} ticks {onchain?.played && (onchain.result === r.result ? <span className="pill player">✓ matches</span> : <span className="pill">⚠ differs</span>)}</dd>
                <dt>Transaction</dt><dd>{tx ? <a className="addr" href={txUrl(tx)} target="_blank" rel="noreferrer">{short(tx)}</a> : tx === null ? "—" : onchain?.played ? "looking…" : "—"}</dd>
                <dt>Contract re-run</dt><dd>
                  {!verify && <button className="btn sm violet" onClick={doVerify}>Verify on X Layer</button>}
                  {verify?.busy && "asking NandArena.simulate()…"}
                  {verify?.res !== undefined && <>{["draw", "A wins", "B wins"][verify.res]} in {verify.ticks} ticks {verify.res === r.result && verify.ticks === r.ticks ? <span className="pill player">✓ identical</span> : <span className="pill">⚠ differs</span>}</>}
                  {verify?.err && <span style={{ color: "var(--pink-d)" }}>{verify.err}</span>}
                </dd>
              </dl>
            </div>
          </div>
          <Fighter entry={eb} side="b" frame={frame?.bots[1]} crashed={done && r.crash[1]} won={done && r.result === 2} />
        </div>
      </div>
    </section>
  );
}

function Fighter({ entry, side, frame, crashed, won }) {
  const prog = progOf(entry.netlist);
  const sensed = frame ? INPUTS.filter(p => (frame.in >> p.bit) & 1).map(p => p.key) : [];
  return (
    <div className="fighter dark">
      <div className={`art ${side}`}>
        <BotArt entry={entry} style={{ filter: crashed ? "grayscale(1) brightness(.6)" : undefined, transform: `${side === "b" ? "scaleX(-1) " : ""}${won ? "translateY(-8px) rotate(-4deg)" : crashed ? "rotate(14deg)" : ""}` }} />
      </div>
      <h3 style={{ color: side === "a" ? "var(--a-glow)" : "var(--b-glow)" }}>{botName(entry)}</h3>
      <div className="meta">circuit #{entry.circuitId} · {entry.gates} gates{prog.nLatch ? ` · ${prog.nLatch} memory` : ""} · <a href={addrUrl(entry.entrant)} target="_blank" rel="noreferrer" style={{ color: "#a49fc0" }}>{short(entry.entrant)}</a></div>
      <div className="decision" style={{ color: crashed ? "var(--pink)" : won ? "var(--sun)" : "var(--white)" }}>{crashed ? "Crashed" : won ? "Winner" : frame ? TURN[frame.out] : "Ready"}</div>
      <div className="lbl">Sensors</div>
      <Pins inBits={frame?.in || 0} out={frame?.out || 0} />
      <div className="note" style={{ color: "#a49fc0", minHeight: 18 }}>{sensed.length ? sensed.join(" · ") : "nothing sensed"}</div>
      <div className="lbl" style={{ marginBottom: 8 }}>Die · {prog.kind.length} elements lit by value</div>
      <Die prog={prog} sig={frame?.sig} />
    </div>
  );
}
