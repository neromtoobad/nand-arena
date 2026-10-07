import { useEffect, useMemo, useState } from "react";
import { useApp } from "../App.jsx";
import Board from "../components/Board.jsx";
import { BotArt, Head, CAST, HERO } from "../art.jsx";
import { runMatch, botName, standings } from "../sim.js";
import { okb, short, txUrl } from "../chain.js";

export function useOkbUsd() {
  const [usd, setUsd] = useState(null);
  useEffect(() => {
    fetch("https://api.coingecko.com/api/v3/simple/price?ids=okb&vs_currencies=usd")
      .then(r => r.json()).then(j => setUsd(j?.okb?.usd ?? null)).catch(() => {});
  }, []);
  return usd;
}

export function useCountdown(ts) {
  const [now, setNow] = useState(Date.now() / 1000);
  useEffect(() => { const id = setInterval(() => setNow(Date.now() / 1000), 1000); return () => clearInterval(id); }, []);
  const left = Math.max(0, (ts || 0) - now);
  const d = Math.floor(left / 86400), h = Math.floor((left % 86400) / 3600), m = Math.floor((left % 3600) / 60), s = Math.floor(left % 60);
  return { left, d, h, m, s, text: left <= 0 ? "closed" : d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m ${s}s` };
}

export function Countdown({ ts }) {
  const c = useCountdown(ts);
  const pad = n => String(n).padStart(2, "0");
  return (
    <div className="countdown">
      {[[c.d, "days"], [c.h, "hrs"], [c.m, "min"], [c.s, "sec"]].map(([v, l]) => <div key={l}><b>{pad(v)}</b><span>{l}</span></div>)}
    </div>
  );
}

export default function Arena() {
  const { season, error, wallet, connect, setToast, refresh } = useApp();
  const usd = useOkbUsd();
  const cd = useCountdown(season?.entryClose);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);

  const featured = useMemo(() => {
    if (!season || season.entries.length < 2) return null;
    const played = season.matches.filter(m => m.played);
    const pick = played.length
      ? played.map(m => ({ m, r: runMatch(season.season, season.entries[m.a], season.entries[m.b]) })).sort((x, y) => y.r.ticks - x.r.ticks)[0]
      : { m: { a: 0, b: 1 }, r: runMatch(season.season, season.entries[0], season.entries[1]) };
    return { ...pick, ea: season.entries[pick.m.a], eb: season.entries[pick.m.b] };
  }, [season]);

  if (!season) return (<><Hero season={null} tick={[<>Reading the arena from <b>X Layer</b></>, <>Every bot is a <b>TapeOut</b> circuit</>, <><b>2,097,152</b> transistors, ever</>]} />
    <div className="loading">{error ? `Couldn't load the arena: ${error}` : "Loading the season…"}</div></>);

  const table = standings(season.entries);
  const played = season.matches.filter(m => m.played);
  const pending = season.matches.filter(m => !m.played);
  const shown = showAll ? played : played.slice(-12);
  const poolUsd = usd ? `≈ $${(Number(okb(season.pool, 6)) * usd).toFixed(2)}` : "";
  const players = season.entries.filter(e => !e.house).length;

  const crank = async () => {
    if (!wallet) return connect();
    setBusy(true);
    try {
      const batch = pending.slice(0, 6);
      const tx = await wallet.arena.playMatches(batch.map(m => m.a), batch.map(m => m.b));
      setToast({ node: <>Refereeing {batch.length} matches on-chain… <a href={txUrl(tx.hash)} target="_blank" rel="noreferrer">view tx</a></>, sticky: true });
      await tx.wait();
      setToast({ node: <>Done: {batch.length} matches played. <a href={txUrl(tx.hash)} target="_blank" rel="noreferrer">tx</a></> });
      refresh();
    } catch (e) { setToast({ text: e.shortMessage || e.message }); }
    setBusy(false);
  };


  const tick = [
    <>Season <b>{season.season}</b> is live</>,
    <>Prize pool <b>{okb(season.pool)} OKB</b></>,
    <><b>{season.nEntries}</b> bots entered</>,
    <><b>{season.played}</b> matches refereed on-chain</>,
    <>Entries close in <b>{cd.text}</b></>,
    <><b>2,097,152</b> transistors, ever</>,
    <>Every bot is a <b>TapeOut</b> circuit</>,
  ];

  return (
    <>
      <Hero season={season} tick={tick} />

      {/* ---------------------------------------------------------------- live match */}
      <section className="band cream dots-ink" id="arena">
        <div className="wrap">
          <div className="showcase">
            {featured && (
              <a href={`#/match/${season.season}/${featured.m.a}/${featured.m.b}`} style={{ textDecoration: "none" }}>
                <div className="tv">
                  <BotArt entry={featured.ea} className="peek l" />
                  <BotArt entry={featured.eb} className="peek r" />
                  <div className="tv-bar"><span className="a">{botName(featured.ea)}</span><span className="vs">VS</span><span className="b">{botName(featured.eb)}</span></div>
                  <Board match={featured.r} loop size={560} />
                  <div className="tv-foot"><span>{featured.ea.gates} gates vs {featured.eb.gates} gates</span><span>{featured.r.ticks} ticks · {featured.r.result === 0 ? "draw" : `${botName(featured.r.result === 1 ? featured.ea : featured.eb)} wins`}</span></div>
                </div>
              </a>
            )}
            <div>
              <div className="eyebrow" style={{ color: "var(--violet)" }}>Now playing</div>
              <h2 className="display h-sec" style={{ marginTop: 10 }}>The chain is <span className="hl">the ref.</span></h2>
              <p className="sub" style={{ marginTop: 18 }}>
                Each tick, both bots read 8 sensor bits, run one beat of their circuit and output a turn. The NandArena
                contract plays the whole match on X Layer and records the result. Your browser replays it gate by gate.
              </p>
              <div className="facts">
                <div className="fact"><b>{season.played}</b><span>matches refereed</span></div>
                <div className="fact"><b>{"<"}$0.01</b><span>gas per full match</span></div>
                <div className="fact"><b>16×16</b><span>light-cycle arena</span></div>
                <div className="fact"><b>100%</b><span>deterministic & replayable</span></div>
              </div>
              {featured && <a className="btn violet" href={`#/match/${season.season}/${featured.m.a}/${featured.m.b}`}>Watch the replay</a>}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- how */}
      <section className="band pink dots">
        <div className="wrap">
          <div className="sec-head">
            <div>
              <h2 className="display h-sec" style={{ textShadow: "0 6px 0 var(--ink)" }}>Three steps to <span className="hl">the arena</span></h2>
              <p>No Solidity, no Verilog. A few lines of logic, one transaction, and your circuit is fighting on-chain.</p>
            </div>
            <a className="btn sun lg" href="#/lab">Open the Bot Lab</a>
          </div>
          <div className="steps">
            <div className="step"><div className="n">01</div><h3>Write logic</h3><p>Eight sensors in, two steering bits out, optional memory. The Lab compiles it to NAND gates live and lets you spar for free.</p><img src={CAST.Lookahead.src} alt="" /></div>
            <div className="step"><div className="n">02</div><h3>Tape it out</h3><p>One transaction mints exactly the transistors you need, tapes your circuit out on the Arena processor and hands you the NFT.</p><img src={HERO} alt="" /></div>
            <div className="step"><div className="n">03</div><h3>Fight</h3><p>Your bot plays every bot in the season. The contract referees each match. Top three split the prize pool.</p><img src={CAST.Hunter.src} alt="" /></div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- leaderboard */}
      <section className="band cream" id="standings">
        <div className="wrap">
          <div className="sec-head">
            <div>
              <h2 className="display h-sec">Season {season.season} <span className="hl">leaderboard</span></h2>
              <p className="sub">Round robin: every bot plays every other bot once. Win 3, draw 1. Ties go to the smaller circuit.</p>
            </div>
          </div>
          <div className="board-grid">
            <div className="lb">
              {table.map((e, i) => (
                <a className={`lb-row${e.house ? "" : " me"}`} key={e.idx} href={`#/lab?vs=${e.circuitId}`} title={`Build a bot to beat ${botName(e)}`}>
                  <div className={`medal${i < 3 ? ` g${i + 1}` : ""}`}>{i + 1}</div>
                  <Head entry={e} size={60} />
                  <div style={{ minWidth: 0 }}>
                    <div className="lb-name">{botName(e)} <span className={`pill ${e.house ? "house" : "player"}`}>{e.house ? "house" : "player"}</span></div>
                    <div className="lb-own">#{e.circuitId} · {e.gates} gates<span className="hide-xs"> · {short(e.entrant)}</span></div>
                  </div>
                  <div className="lb-wdl"><span className="w">{e.wins}W</span><span className="d">{e.draws}D</span><span className="l">{e.losses}L</span></div>
                  <div className="lb-pts">{e.points}<small>PTS</small></div>
                </a>
              ))}
            </div>
            <aside className="pool">
              <div className="eyebrow">Prize pool</div>
              <div className="big">{okb(season.pool)} <span style={{ fontSize: 28 }}>OKB</span></div>
              <div style={{ fontWeight: 700 }}>{poolUsd}{poolUsd && " · "}grows with every bot entered</div>
              <div className="split">
                <div><b>50%</b><span>1st</span></div><div><b>30%</b><span>2nd</span></div><div><b>20%</b><span>3rd</span></div>
              </div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>{season.finalized ? "Season closed" : "Entries close in"}</div>
              <Countdown ts={season.entryClose} />
              <p style={{ fontSize: 13.5, fontWeight: 600, margin: "16px 0 18px", lineHeight: 1.5 }}>
                {players ? `${players} player bot${players === 1 ? "" : "s"} in.` : "No player bots yet: the podium is empty."} House bots play every match but never take prize money.
              </p>
              <a className="btn ink" style={{ width: "100%" }} href="#/lab">Enter the season</a>
              <img src={CAST.Weaver.src} alt="" style={{ position: "absolute", right: -34, top: -58, height: 118, transform: "rotate(14deg)", filter: "drop-shadow(0 8px 8px rgba(23,19,43,.3))" }} />
            </aside>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- matches */}
      <section className="band ink dots">
        <div className="wrap">
          <div className="sec-head">
            <div>
              <h2 className="display h-sec">Fight <span className="hl">log</span></h2>
              <p style={{ color: "#c9c4e6" }}>Every result was computed by the NandArena contract. Tap one to replay it gate by gate.</p>
            </div>
            {pending.length > 0 && (
              <button className="btn mint lg" disabled={busy} onClick={crank}>
                {busy ? "Refereeing…" : `Referee ${Math.min(6, pending.length)} match${pending.length === 1 ? "" : "es"}`}
              </button>
            )}
          </div>
          <div className="mgrid">
            {pending.slice(0, 3).map(m => (
              <div key={`p${m.a}-${m.b}`} className="mcard pending">
                <div>{botName(season.entries[m.a])}<br /><span style={{ color: "var(--sun)" }}>vs</span><br />{botName(season.entries[m.b])}<div className="note" style={{ marginTop: 8, fontFamily: "var(--mono)", textTransform: "none" }}>waiting for the referee</div></div>
              </div>
            ))}
            {[...shown].reverse().map(m => <MatchCard key={`${m.a}-${m.b}`} season={season} m={m} />)}
          </div>
          {played.length > 12 && !showAll && <div style={{ textAlign: "center", marginTop: 26 }}><button className="btn" onClick={() => setShowAll(true)}>Show all {played.length} fights</button></div>}
        </div>
      </section>

      {/* ---------------------------------------------------------------- money */}
      <section className="band mint dots-ink" style={{ overflow: "hidden" }}>
        <div className="wrap" style={{ position: "relative" }}>
          <img className="hide-md" src={CAST.Coward.src} alt="" style={{ position: "absolute", right: 30, top: 26, height: 200, transform: "rotate(-8deg)", filter: "drop-shadow(0 10px 10px rgba(23,19,43,.25))" }} />
          <div className="sec-head">
            <div>
              <h2 className="display h-sec">Real silicon, <span className="hl">real stakes</span></h2>
              <p className="sub" style={{ color: "var(--ink)" }}>The Arena processor's terms are written into its on-chain story at deployment and can never change.</p>
            </div>
            <a className="btn" href="#/how" style={{ marginRight: 230 }}>Read the rules</a>
          </div>
          <div className="money">
            <div className="card"><b>2,097,152</b><span>transistors, ever. NAND + LATCH share one hard cap.</span></div>
            <div className="card"><b>0.0001</b><span>OKB per transistor. Fixed forever. A 20-gate bot costs about $0.40 all in.</span></div>
            <div className="card"><b>{(season.minted || 0).toLocaleString()}</b><span>transistors minted so far, and every tape-out burns them for good.</span></div>
            <div className="card"><b>0</b><span>owners. No one can move the pool. Prizes follow the circuit NFT.</span></div>
          </div>
          <div className="split-bar">
            <div style={{ flex: 70, background: "var(--sun)" }}>70% season pool</div>
            <div style={{ flex: 20, background: "var(--white)" }}>20% next</div>
            <div style={{ flex: 10, background: "var(--pink)", color: "var(--white)" }}>10%</div>
          </div>
          <p className="note" style={{ color: "var(--ink)", fontWeight: 600, marginTop: 12 }}>How mint income splits, by code: 70% to this season's prize pool, 20% seeds the next season, 10% pays the keeper's gas.</p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- final */}
      <section className="band violet dots final">
        <div className="wrap">
          <h2 className="display">Build a bot that beats <span style={{ color: "var(--sun)" }}>these five</span></h2>
          <div style={{ marginTop: 28 }}><a className="btn sun lg" href="#/lab">Open the Bot Lab</a></div>
          <div className="row" aria-hidden>
            <img src={CAST.Cautious.src} alt="" /><img src={CAST.Lookahead.src} alt="" /><img className="big" src={CAST.Hunter.src} alt="" /><img src={CAST.Coward.src} alt="" /><img src={CAST.Weaver.src} alt="" />
          </div>
        </div>
      </section>
    </>
  );
}

function Hero({ season, tick }) {
  const n = season?.season ?? 1;
  return (
    <>
      {/* ---------------------------------------------------------------- hero */}
      <section className="band violet dots hero">
        <div className="wrap">
          <div className="copy">
            <span className="hero-tag"><i /> Season {n} live on X Layer</span>
            <h1 className="display">Your bot<br />is a <span className="chipword">chip.</span></h1>
            <p className="lead">
              Write a few lines of logic. It compiles to real NAND gates, gets taped out on X Layer as a TapeOut circuit,
              and fights every other bot in a light-cycle league the chain referees, move by move.
            </p>
            <div className="ctas">
              <a className="btn sun lg" href="#/lab">Build a bot</a>
              <a className="btn lg" href="#arena">Watch matches</a>
            </div>
          </div>
          <div className="squad" aria-hidden>
            <img className="s5" src={CAST.Weaver.src} alt="" />
            <img className="s1" src={CAST.Cautious.src} alt="" />
            <img className="s3" src={CAST.Coward.src} alt="" />
            <img className="s2" src={CAST.Lookahead.src} alt="" />
            <img className="s4" src={CAST.Hunter.src} alt="" />
            <img className="s-hero" src={HERO} alt="" />
          </div>
        </div>
        <div className="ticker" aria-hidden>
          <div className="row">{[...tick, ...tick].map((t, i) => <span key={i}>{t}</span>)}</div>
        </div>
      </section>

    </>
  );
}

function MatchCard({ season, m }) {
  const ea = season.entries[m.a], eb = season.entries[m.b];
  const r = useMemo(() => runMatch(season.season, ea, eb), [season.season, ea, eb]);
  const verified = r.result === m.result;
  return (
    <a className="mcard" href={`#/match/${season.season}/${m.a}/${m.b}`}>
      <Board match={r} size={200} mini />
      {[[ea, 1, "var(--a-glow)"], [eb, 2, "var(--b-glow)"]].map(([e, side, col]) => (
        <div className="who" key={side} style={{ opacity: m.result !== 0 && m.result !== side ? 0.45 : 1 }}>
          <div className="heads"><Head entry={e} size={30} round /><span className="nm" style={{ color: col }}>{botName(e)}</span></div>
          {m.result === side && <span style={{ color: "var(--sun)", fontSize: 16 }}>★</span>}
        </div>
      ))}
      <div className="res">
        <span className={`stamp ${m.result === 0 ? "draw" : "ko"}`}>{m.result === 0 ? "Draw" : "KO"}</span>
        <span>{r.ticks} ticks{verified ? "" : " ⚠"}</span>
      </div>
    </a>
  );
}
