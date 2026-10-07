import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { useApp } from "../App.jsx";
import Board from "../components/Board.jsx";
import Circuit from "../components/Circuit.jsx";
import { Die, Pins } from "../components/Chip.jsx";
import { Head } from "../art.jsx";
import PageBar from "../components/PageBar.jsx";
import { compile } from "@sdk/dsl.js";
import { load, step } from "@sdk/vm.js";
import { playMatch, matchSeed, INPUTS, RESULT } from "@sdk/game.js";
import { SEED_BOTS } from "@sdk/bots.js";
import { circuits, okb, txUrl, DEPLOY } from "../chain.js";
import { botName, progOf, framesOf } from "../sim.js";

const STARTER = `# 8 sensor bits in, 2 steering bits out.
#  F L R  blocked ahead / left / right
#  F2     blocked two cells ahead
#  OL OF  opponent on my left / ahead of me
#  RL     more open road on my left
#  COIN   a fair coin flip
# left, right: neither or both = straight
# memory: mem x  then  next x = <expr>

let danger = F | (F2 & OF)
left  = danger & RL & !L
right = danger & !(RL & !L) & !R
`;

const PRICE = ethers.parseEther("0.0001");
const PROTOCOL_FEE = ethers.parseEther("0.00066");
const TAPEOUT_FEE = ethers.parseEther("0.0013");
const GATE_CAP = 256, STATE_CAP = 32;
const INPUT_KEYS = new Set(INPUTS.map(i => i.key));

function loadDraft() { try { return localStorage.getItem("nandarena:draft"); } catch { return null; } }
function saveDraft(s) { try { localStorage.setItem("nandarena:draft", s); } catch { /* private mode */ } }

const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function highlight(src) {
  return src.split("\n").map(line => {
    const hash = line.indexOf("#");
    const code = hash >= 0 ? line.slice(0, hash) : line;
    const comment = hash >= 0 ? line.slice(hash) : "";
    const body = code.split(/(\s+|[()!~&|^=,])/).map(w => {
      if (!w) return "";
      if (/^(mem|let|next)$/.test(w)) return `<span class="tk-k">${w}</span>`;
      if (INPUT_KEYS.has(w.toUpperCase()) && /^[A-Za-z0-9]+$/.test(w)) return `<span class="tk-in">${w}</span>`;
      if (/^(left|right)$/.test(w)) return `<span class="tk-o">${w}</span>`;
      if (/^[()!~&|^=,]$/.test(w)) return `<span class="tk-op">${esc(w)}</span>`;
      if (/^[01]$/.test(w)) return `<span class="tk-n">${w}</span>`;
      return esc(w);
    }).join("");
    return body + (comment ? `<span class="tk-c">${esc(comment)}</span>` : "");
  }).join("\n") + "\n";
}

export default function Lab({ query }) {
  const { season, wallet, connect, setToast, refresh } = useApp();
  const [src, setSrc] = useState(() => loadDraft() || STARTER);
  const [inBits, setInBits] = useState(0);
  const [nextId, setNextId] = useState(null);
  const vs = query.get("vs") ? Number(query.get("vs")) : null;
  const [focus, setFocus] = useState(vs);
  const [busy, setBusy] = useState(false);

  useEffect(() => { saveDraft(src); }, [src]);
  useEffect(() => { circuits?.nextId().then(n => setNextId(Number(n) + 1)).catch(() => {}); }, [season?.played, season?.nEntries]);

  const built = useMemo(() => {
    try { const c = compile(src); return { c, prog: load(c.bytes, 8, 2) }; }
    catch (e) { return { err: e.message, line: e.line }; }
  }, [src]);
  const html = useMemo(() => highlight(src), [src]);
  const beat = useMemo(() => (built.prog ? step(built.prog, new Array(built.prog.nState).fill(0), inBits) : null), [built, inBits]);
  const me = useMemo(() => (built.c ? { circuitId: nextId || 0, netlist: built.c.bytes } : null), [built, nextId]);

  const spar = useMemo(() => {
    if (!built.prog || !season || !nextId) return null;
    return season.entries.map(e => {
      const r = playMatch(progOf(e.netlist), built.prog, matchSeed(season.season, e.circuitId, nextId), { trace: e.circuitId === focus });
      const res = r.result === RESULT.DRAW ? "d" : r.result === RESULT.B ? "w" : "l";
      return { e, r, res };
    });
  }, [built, season, nextId, focus]);

  const points = spar ? spar.reduce((s, x) => s + (x.res === "w" ? 3 : x.res === "d" ? 1 : 0), 0) : 0;
  const wins = spar ? spar.filter(x => x.res === "w").length : 0;
  const focusRow = spar?.find(x => x.e.circuitId === focus);
  const focusMatch = focusRow?.r.trace ? { ...focusRow.r, ...framesOf(focusRow.r.trace) } : null;
  const target = vs && season ? season.entries.find(e => e.circuitId === vs) : null;

  const cost = built.c
    ? PRICE * BigInt(built.c.gateCount) + (built.c.nNand ? PROTOCOL_FEE : 0n) + (built.c.nLatch ? PROTOCOL_FEE : 0n) + TAPEOUT_FEE
    : 0n;
  const problems = [];
  if (built.c && built.c.gateCount > GATE_CAP) problems.push(`Over the ${GATE_CAP}-gate cap.`);
  if (built.c && built.c.nLatch > STATE_CAP) problems.push(`Over the ${STATE_CAP}-memory cap.`);
  if (season && (season.finalized || Date.now() / 1000 >= season.entryClose)) problems.push("Entries for this season are closed.");
  if (season && season.nEntries >= 64) problems.push("This season is full (64 bots).");

  const tapeOut = async () => {
    if (!wallet) return connect();
    setBusy(true);
    try {
      const quote = await wallet.arena.quoteBuild(built.c.hex);
      const tx = await wallet.arena.buildAndEnter(built.c.hex, { value: quote });
      setToast({ node: <>Taping out {built.c.gateCount} gates on X Layer… <a href={txUrl(tx.hash)} target="_blank" rel="noreferrer">view tx</a></>, sticky: true });
      const rc = await tx.wait();
      const ev = rc.logs.map(l => { try { return wallet.arena.interface.parseLog(l); } catch { return null; } }).find(e => e?.name === "Entered");
      setToast({ node: <>Your bot is circuit #{ev?.args.circuitId.toString()} and it's in Season {ev?.args.season.toString()}. <a href="#/">See the leaderboard →</a></>, sticky: true });
      refresh();
    } catch (e) { setToast({ text: e.shortMessage || e.info?.error?.message || e.message }); }
    setBusy(false);
  };

  const lines = src.split("\n").length;
  return (
    <>
      <PageBar eyebrow={`Bot Lab · Season ${season?.season ?? 1} · runs in your browser with the contract's exact rules`}
        title={target ? <>Build a bot to <span className="hl">beat {botName(target)}</span></> : <>Design a bot. <span className="hl">Spar free.</span></>}>
        {target && <Head entry={target} size={56} />}
        <a className="btn sm" href="#/">Back to the arena</a>
      </PageBar>
      <section>
        <div className="wrap page">
          <div className="lab">
            <div style={{ display: "grid", gap: 22 }}>
              <div className="console">
                <div className="console-bar">
                  <span className="dots3"><i /><i /><i /></span>
                  <span className="eyebrow" style={{ color: "#8f88b8", marginRight: 4 }}>Fork</span>
                  <div className="forks">
                    {SEED_BOTS.map((b, i) => (
                      <button key={b.name} className="fork" onClick={() => setSrc(b.src + "\n")} title={b.blurb}>
                        <Head entry={{ circuitId: i + 1 }} size={24} round />{b.name}
                      </button>
                    ))}
                    <button className="fork" onClick={() => setSrc(STARTER)} style={{ paddingLeft: 10 }}>Starter</button>
                  </div>
                </div>
                <div className="code-wrap">
                  <div className="gutter">{Array.from({ length: lines }, (_, i) => <div key={i} className={built.line === i + 1 ? "err" : ""}>{i + 1}</div>)}</div>
                  <pre aria-hidden dangerouslySetInnerHTML={{ __html: html }} />
                  <textarea spellCheck={false} value={src} onChange={e => setSrc(e.target.value)} rows={Math.max(16, lines + 1)} aria-label="bot source" />
                </div>
                {built.err
                  ? <div className="statusbar err">✗ {built.err}</div>
                  : <div className="statusbar ok"><span>✓ compiles</span><span>{built.c.nNand} NAND</span><span>{built.c.nLatch} LATCH</span><span>{built.c.bytes.length} bytes</span><span>saved in this browser</span></div>}
              </div>

              <div className="tapeout">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                  <div>
                    <div className="eyebrow">One transaction</div>
                    <h2 className="h-card" style={{ fontSize: 34, marginTop: 6 }}>Tape out &amp; enter</h2>
                  </div>
                  {me && <Head entry={me} size={64} />}
                </div>
                <p style={{ margin: "6px 0 0", fontWeight: 600, fontSize: 14.5, lineHeight: 1.5 }}>Mints exactly the transistors your netlist burns, tapes it out on the Arena processor, enters Season {season?.season ?? 1} and sends you the circuit NFT. Prizes follow the NFT.</p>
                {built.c && (
                  <div className="cost">
                    <span>{built.c.gateCount} transistors × 0.0001 OKB (70% → prize pool)</span><span className="mono">{okb(PRICE * BigInt(built.c.gateCount), 6)}</span>
                    <span>TapeOut mint fee{built.c.nLatch && built.c.nNand ? " × 2" : ""}</span><span className="mono">{okb((built.c.nNand ? PROTOCOL_FEE : 0n) + (built.c.nLatch ? PROTOCOL_FEE : 0n), 6)}</span>
                    <span>TapeOut tape-out fee</span><span className="mono">{okb(TAPEOUT_FEE, 6)}</span>
                    <span className="tot">Total</span><span className="tot">{okb(cost, 5)} OKB</span>
                  </div>
                )}
                {problems.map(p => <p key={p} style={{ color: "var(--pink-d)", fontWeight: 700, fontSize: 14, margin: "0 0 10px" }}>{p}</p>)}
                <button className="btn ink lg" style={{ width: "100%" }} disabled={!!built.err || problems.length > 0 || busy || !DEPLOY} onClick={tapeOut}>
                  {busy ? "Waiting for X Layer…" : wallet ? `Tape out · ${okb(cost, 5)} OKB` : "Connect wallet to tape out"}
                </button>
                <p className="note" style={{ color: "var(--ink2)", marginTop: 12, fontWeight: 600 }}>Max 3 bots per wallet per season. Circuits are permanent.</p>
              </div>
            </div>

            <div style={{ display: "grid", gap: 22 }}>
              <div className="card pad">
                <div className="chipstat">
                  <div className="gates">{built.c ? built.c.gateCount : "—"}<small>gates</small></div>
                  <div>
                    <div className="eyebrow" style={{ color: "var(--muted)" }}>Your chip, live</div>
                    <div className="mini" style={{ marginTop: 8 }}>
                      <span className="pill">{built.c?.nNand ?? 0} NAND</span>
                      <span className="pill sun">{built.c?.nLatch ?? 0} LATCH</span>
                      <span className="pill player">{built.c ? `${okb(cost, 4)} OKB` : "—"}</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18 }}>
                  <span className="eyebrow" style={{ color: "var(--muted)" }}>Flip the sensor pins</span>
                </div>
                <Pins inBits={inBits} out={beat?.out || 0} onToggle={bit => setInBits(x => x ^ (1 << bit))} />
                {built.prog && (built.prog.kind.length <= 140
                  ? <Circuit prog={built.prog} sig={beat?.sig} />
                  : <div className="dark"><Die prog={built.prog} sig={beat?.sig} /></div>)}
                <details style={{ marginTop: 12 }}>
                  <summary className="eyebrow" style={{ cursor: "pointer", color: "var(--violet)" }}>Sensor reference</summary>
                  <div className="legend">
                    {INPUTS.map(p => [<code key={p.key}>{p.key}</code>, <span key={p.key + "l"} className="note" style={{ fontSize: 13 }}>{p.label}</span>])}
                  </div>
                </details>
              </div>

              <div className="card pad">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                  <h2 className="h-card">Fight card</h2>
                  {spar && <span className="pill sun" style={{ fontSize: 13 }}>{points} pts · {wins} win{wins === 1 ? "" : "s"}</span>}
                </div>
                <p className="note" style={{ margin: "0 0 14px" }}>The exact on-chain outcome if you enter now: same seeds, same referee. Tap a fight to watch it.</p>
                {focusMatch && (
                  <div className="tv" style={{ marginBottom: 14 }}>
                    <div className="tv-bar"><span className="b">{botName(focusRow.e)}</span><span className="vs">VS</span><span className="a">You</span></div>
                    <Board match={focusMatch} loop size={460} speed={10} />
                  </div>
                )}
                <div className="fights">
                  {spar?.map(x => (
                    <div key={x.e.idx} className={`fightrow${x.e.circuitId === focus ? " sel" : ""}`} onClick={() => setFocus(x.e.circuitId === focus ? null : x.e.circuitId)}>
                      {me && <Head entry={me} size={44} />}
                      <span className="vs">VS</span>
                      <Head entry={x.e} size={44} />
                      <span className="nm">{botName(x.e)}<small>{x.e.gates} gates · {x.r.ticks} ticks</small></span>
                      <span className={`stamp ${x.res === "w" ? "win" : x.res === "d" ? "draw" : "loss"}`}>{x.res === "w" ? "Win" : x.res === "d" ? "Draw" : "Loss"}</span>
                    </div>
                  ))}
                  {!spar && <div className="note">{built.err ? "Fix the error to spar." : "Loading the field…"}</div>}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
