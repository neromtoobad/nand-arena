import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { useApp } from "../App.jsx";
import Board from "../components/Board.jsx";
import Circuit from "../components/Circuit.jsx";
import { ChipAvatar, Die, Pins } from "../components/Chip.jsx";
import { compile } from "@sdk/dsl.js";
import { load, step } from "@sdk/vm.js";
import { playMatch, matchSeed, INPUTS, RESULT } from "@sdk/game.js";
import { SEED_BOTS } from "@sdk/bots.js";
import { circuits, okb, txUrl, DEPLOY } from "../chain.js";
import { botName, progOf, framesOf } from "../sim.js";

const STARTER = `# Your bot sees 8 bits every tick and answers with 2.
# Inputs:  F  L  R   blocked ahead / left / right
#          F2        blocked two cells ahead
#          OL OF     opponent is on my left / ahead of me
#          RL        more open road to my left than my right
#          COIN      a fair coin flip
# Outputs: left, right  (neither or both = keep going straight)
# Memory:  mem x   then   next x = <expr>
# Operators: !  &  ^  |  ( )

let danger = F | (F2 & OF)
left  = danger & RL & !L
right = danger & !(RL & !L) & !R
`;

const PRICE = ethers.parseEther("0.0001");
const PROTOCOL_FEE = ethers.parseEther("0.00066");
const TAPEOUT_FEE = ethers.parseEther("0.0013");
const GATE_CAP = 256, STATE_CAP = 32;

function loadDraft() { try { return localStorage.getItem("nandarena:draft"); } catch { return null; } }
function saveDraft(s) { try { localStorage.setItem("nandarena:draft", s); } catch { /* private mode */ } }

export default function Lab({ query }) {
  const { season, wallet, connect, setToast, refresh } = useApp();
  const [src, setSrc] = useState(() => loadDraft() || STARTER);
  const [inBits, setInBits] = useState(0);
  const [nextId, setNextId] = useState(null);
  const [focus, setFocus] = useState(query.get("vs") ? Number(query.get("vs")) : null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { saveDraft(src); }, [src]);
  useEffect(() => { circuits?.nextId().then(n => setNextId(Number(n) + 1)).catch(() => {}); }, [season?.played, season?.nEntries]);

  const built = useMemo(() => {
    try { const c = compile(src); return { c, prog: load(c.bytes, 8, 2) }; }
    catch (e) { return { err: e.message, line: e.line }; }
  }, [src]);

  const beat = useMemo(() => (built.prog ? step(built.prog, new Array(built.prog.nState).fill(0), inBits) : null), [built, inBits]);

  const spar = useMemo(() => {
    if (!built.prog || !season || !nextId) return null;
    const me = { circuitId: nextId, netlist: built.c.bytes };
    return season.entries.map(e => {
      const r = playMatch(progOf(e.netlist), built.prog, matchSeed(season.season, e.circuitId, nextId), { trace: e.circuitId === focus });
      const res = r.result === RESULT.DRAW ? "d" : r.result === RESULT.B ? "w" : "l";
      return { e, r, res, me };
    });
  }, [built, season, nextId, focus]);

  const points = spar ? spar.reduce((s, x) => s + (x.res === "w" ? 3 : x.res === "d" ? 1 : 0), 0) : 0;
  const focusRow = spar?.find(x => x.e.circuitId === focus);
  const focusMatch = focusRow?.r.trace ? { ...focusRow.r, ...framesOf(focusRow.r.trace) } : null;

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
      setToast({ node: <>Your bot is circuit #{ev?.args.circuitId.toString()} and it's in Season {ev?.args.season.toString()}. <a href="#/">See the standings →</a></>, sticky: true });
      refresh();
    } catch (e) { setToast({ text: e.shortMessage || e.info?.error?.message || e.message }); }
    setBusy(false);
  };

  const lines = src.split("\n").length;
  return (
    <div className="section">
      <div className="section-head">
        <div>
          <div className="eyebrow">Bot Lab</div>
          <h2 style={{ marginTop: 6 }}>Design a bot, spar for free, tape it out</h2>
          <p>Everything here runs in your browser with the same rules the contract uses. You only pay when you tape out.</p>
        </div>
      </div>

      <div className="lab">
        <div style={{ display: "grid", gap: 16 }}>
          <div className="card">
            <div className="toolbar">
              <select value="" onChange={e => { const b = SEED_BOTS.find(x => x.name === e.target.value); if (b) setSrc(b.src + "\n"); else if (e.target.value === "starter") setSrc(STARTER); }}>
                <option value="">Start from…</option>
                <option value="starter">Starter template</option>
                {SEED_BOTS.map(b => <option key={b.name} value={b.name}>House bot: {b.name}</option>)}
              </select>
              <span className="note" style={{ marginLeft: "auto" }}>Draft saves in this browser</span>
            </div>
            <div className="editor">
              <div className="gutter">{Array.from({ length: lines }, (_, i) => <div key={i} className={built.line === i + 1 ? "err" : ""}>{i + 1}</div>)}</div>
              <textarea spellCheck={false} value={src} onChange={e => setSrc(e.target.value)} rows={Math.max(16, lines + 2)} aria-label="bot source" />
            </div>
            {built.err
              ? <div className="errbar">{built.err}</div>
              : <div className="okbar"><span>✓ compiles</span><span>{built.c.gateCount} gates</span><span>{built.c.nNand} NAND</span><span>{built.c.nLatch} LATCH</span><span>{built.c.bytes.length} bytes</span></div>}
          </div>

          <div className="card pad">
            <h3>Tape out &amp; enter Season {season?.season ?? ""}</h3>
            <p className="sub" style={{ margin: "6px 0 14px", fontSize: 14 }}>One transaction mints exactly the transistors your netlist burns, tapes it out on the Arena processor, enters it, and sends you the circuit NFT. Prizes follow the NFT.</p>
            {built.c && (
              <div className="cost">
                <span>{built.c.gateCount} transistors × 0.0001 OKB <span className="note">(70% goes to this season's pool)</span></span><span className="mono">{okb(PRICE * BigInt(built.c.gateCount), 6)}</span>
                <span>TapeOut mint fee{built.c.nLatch && built.c.nNand ? " × 2 (NAND + LATCH)" : ""}</span><span className="mono">{okb((built.c.nNand ? PROTOCOL_FEE : 0n) + (built.c.nLatch ? PROTOCOL_FEE : 0n), 6)}</span>
                <span>TapeOut tape-out fee</span><span className="mono">{okb(TAPEOUT_FEE, 6)}</span>
                <span className="tot">Total</span><span className="tot mono">{okb(cost, 6)} OKB</span>
              </div>
            )}
            {problems.map(p => <p key={p} style={{ color: "var(--red)", fontSize: 13.5, margin: "10px 0 0" }}>{p}</p>)}
            <button className="btn primary" style={{ marginTop: 16, width: "100%" }} disabled={!!built.err || problems.length > 0 || busy || !DEPLOY} onClick={tapeOut}>
              {busy ? "Waiting for X Layer…" : wallet ? `Tape out & enter · ${okb(cost, 5)} OKB` : "Connect wallet to tape out"}
            </button>
            <p className="note" style={{ marginTop: 10 }}>Max 3 bots per wallet per season. Circuits are permanent — you can always enter the same circuit again next season.</p>
          </div>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <div className="card pad">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3>Live schematic</h3>
              <span className="note">click the input pins</span>
            </div>
            <Pins inBits={inBits} out={beat?.out || 0} onToggle={bit => setInBits(x => x ^ (1 << bit))} />
            {built.prog && (built.prog.kind.length <= 140
              ? <Circuit prog={built.prog} sig={beat?.sig} />
              : <Die prog={built.prog} sig={beat?.sig} />)}
            <div className="legend" style={{ marginTop: 14 }}>
              {INPUTS.map(p => [<code key={p.key}>{p.key}</code>, <span key={p.key + "l"} className="note" style={{ fontSize: 13 }}>{p.label}</span>])}
            </div>
          </div>

          <div className="card pad">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <h3>Spar against Season {season?.season ?? ""}</h3>
              {spar && <span className="mono" style={{ fontWeight: 700 }}>{points} pts projected</span>}
            </div>
            <p className="note" style={{ margin: "6px 0 12px" }}>Exact on-chain outcome if you enter now (same seed, same referee rules).</p>
            {focusMatch && (
              <div className="screen" style={{ marginBottom: 12 }}>
                <div className="screen-bar"><span className="tag-a">{botName(focusRow.e)}</span><span>vs</span><span className="tag-b">your bot</span></div>
                <Board match={focusMatch} loop size={420} speed={10} />
              </div>
            )}
            <div className="spar">
              {spar?.map(x => (
                <a key={x.e.idx} className="sparrow" href="#/lab" onClick={ev => { ev.preventDefault(); setFocus(x.e.circuitId === focus ? null : x.e.circuitId); }}
                  style={x.e.circuitId === focus ? { borderColor: "var(--green)" } : undefined}>
                  <ChipAvatar entry={x.e} size={26} />
                  <span>{botName(x.e)} <span className="note">· {x.e.gates} gates</span></span>
                  <span className={`r ${x.res}`}>{x.res === "w" ? "WIN" : x.res === "d" ? "DRAW" : "LOSS"} · {x.r.ticks}t</span>
                </a>
              ))}
              {!spar && <div className="note">{built.err ? "Fix the error to spar." : "Loading the field…"}</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
