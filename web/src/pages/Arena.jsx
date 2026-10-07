import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../App.jsx";
import Board from "../components/Board.jsx";
import { Head, CAST, HERO } from "../art.jsx";
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

/** Plays every refereed match back to back, like a broadcast. */
function LiveTV({ season }) {
  const list = useMemo(() => {
    if (!season || season.entries.length < 2) return [];
    const played = season.matches.filter(m => m.played);
    const src = played.length ? played : [{ a: 0, b: 1, played: false }];
    return src
      .map(m => ({ m, ea: season.entries[m.a], eb: season.entries[m.b], r: runMatch(season.season, season.entries[m.a], season.entries[m.b]) }))
      .sort((x, y) => y.r.ticks - x.r.ticks);
  }, [season]);
  const [idx, setIdx] = useState(0);
  const [t, setT] = useState(0);
  const raf = useRef();
  const cur = list[idx % Math.max(1, list.length)];
  useEffect(() => {
    if (!cur) return;
    let last = performance.now(), tt = 0;
    const speed = 11, hold = 1.8;
    const fr = now => {
      tt += (now - last) / 1000 * speed; last = now;
      if (tt > cur.r.ticks + hold * speed) { setIdx(i => (i + 1) % list.length); return; }
      setT(Math.min(tt, cur.r.ticks));
      raf.current = requestAnimationFrame(fr);
    };
    raf.current = requestAnimationFrame(fr);
    return () => cancelAnimationFrame(raf.current);
  }, [cur, list.length]);
  if (!cur) return <div className="tv tv-fit" style={{ aspectRatio: "1 / 1.12", display: "grid", placeItems: "center", color: "#a49fc0" }}>Loading matches…</div>;
  const done = t >= cur.r.ticks;
  const winner = cur.r.result === 0 ? null : cur.r.result === 1 ? cur.ea : cur.eb;
  const next = list[(idx + 1) % list.length];
  return (
    <>
      <a className="tv tv-fit" href={`#/match/${season.season}/${cur.m.a}/${cur.m.b}`} style={{ textDecoration: "none", display: "block" }}>
        <div className="tv-bar"><span className="a">{botName(cur.ea)}</span><span className="vs">{String(Math.floor(t)).padStart(3, "0")}/{cur.r.ticks}</span><span className="b">{botName(cur.eb)}</span></div>
        <div style={{ position: "relative" }}>
          <Board match={cur.r} t={t} size={560} />
          {done && <div className="ko-banner"><span style={{ fontSize: 54 }}>{winner ? "K.O.!" : "Draw!"}</span></div>}
        </div>
        <div className="tv-foot"><span>{done ? (winner ? `${botName(winner)} wins` : "both crashed") : "live · refereed on X Layer"}</span><span>tap for the full replay ↗</span></div>
      </a>
      {list.length > 1 && (
        <div className="queue">
          <span>Match {idx % list.length + 1} of {list.length}</span>
          {list.map((_, i) => <i key={i} className={i === idx % list.length ? "on" : ""} onClick={() => setIdx(i)} title={`${botName(list[i].ea)} vs ${botName(list[i].eb)}`} />)}
          <span>· up next: {botName(next.ea)} vs {botName(next.eb)}</span>
        </div>
      )}
    </>
  );
}

export default function Arena() {
  const { season, error, wallet, connect, setToast, refresh } = useApp();
  const usd = useOkbUsd();
  const cd = useCountdown(season?.entryClose);
  const [busy, setBusy] = useState(false);

  const table = season ? standings(season.entries) : [];
  const played = season ? season.matches.filter(m => m.played) : [];
  const pending = season ? season.matches.filter(m => !m.played) : [];
  const poolUsd = season && usd ? `≈ $${(Number(okb(season.pool, 6)) * usd).toFixed(2)}` : "";
  const players = season ? season.entries.filter(e => !e.house).length : 0;

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

  return (
    <div className="wrap">
      {/* ---------------------------------------------------------------- first screen: pitch + live match */}
      <section className="fold">
        <div className="pitch">
          <span className="hero-tag" style={{ alignSelf: "flex-start" }}><i /> Season {season?.season ?? 1} live on X Layer</span>
          <h1>Your bot is a <span className="hl">chip.</span></h1>
          <p>Write a few lines of logic. It compiles to real NAND gates, gets taped out on X Layer as a TapeOut circuit, and fights every other bot in a league the chain referees.</p>
          <div className="ctas">
            <a className="btn sun" href="#/lab">Build a bot</a>
            <a className="btn" href="#/how">How it works</a>
          </div>
          <div className="chips">
            <div className="chip"><b>{season ? `${okb(season.pool)} OKB` : "…"}</b><span>prize pool {poolUsd}</span></div>
            <div className="chip"><b>{season ? cd.text : "…"}</b><span>entries close</span></div>
            <div className="chip"><b>{season ? season.nEntries : "…"}</b><span>bots entered</span></div>
            <div className="chip"><b>{season ? `${season.played}/${season.matches.length}` : "…"}</b><span>matches refereed</span></div>
          </div>
          <div className="lineup" aria-hidden>
            <img src={CAST.Cautious.src} alt="" /><img src={CAST.Lookahead.src} alt="" /><img className="big" src={HERO} alt="" /><img src={CAST.Hunter.src} alt="" /><img src={CAST.Coward.src} alt="" />
          </div>
        </div>
        <div className="livecol">
          {season ? <LiveTV season={season} /> : <div className="tv tv-fit" style={{ aspectRatio: "1 / 1.12", display: "grid", placeItems: "center", color: "#a49fc0", fontFamily: "var(--display)", fontSize: 24 }}>{error ? "Couldn't reach X Layer" : "Loading the arena…"}</div>}
        </div>
      </section>

      {/* ---------------------------------------------------------------- second screen: standings, pool, fight log */}
      {season && (
        <section className="dash" id="standings">
          <div className="panel">
            <div className="panel-h"><h2>Season {season.season} leaderboard</h2><span className="note">win 3 · draw 1 · smaller circuit wins ties</span></div>
            <div className="panel-b">
              <div className="lb tight">
                {table.map((e, i) => (
                  <a className={`lb-row${e.house ? "" : " me"}`} key={e.idx} href={`#/lab?vs=${e.circuitId}`} title={`Build a bot to beat ${botName(e)}`}>
                    <div className={`medal${i < 3 ? ` g${i + 1}` : ""}`}>{i + 1}</div>
                    <Head entry={e} size={48} />
                    <div style={{ minWidth: 0 }}>
                      <div className="lb-name">{botName(e)} <span className={`pill ${e.house ? "house" : "player"}`}>{e.house ? "house" : "player"}</span></div>
                      <div className="lb-own">#{e.circuitId} · {e.gates} gates<span className="hide-xs"> · {short(e.entrant)}</span></div>
                    </div>
                    <div className="lb-wdl"><span className="w">{e.wins}W</span><span className="d">{e.draws}D</span><span className="l">{e.losses}L</span></div>
                    <div className="lb-pts">{e.points}<small>PTS</small></div>
                  </a>
                ))}
              </div>
              <p className="note" style={{ margin: "12px 2px 0" }}>House bots play every match but never take prize money. {players ? `${players} player bot${players === 1 ? "" : "s"} in so far.` : "No player bots yet: the podium is open."}</p>
            </div>
          </div>

          <div style={{ display: "grid", gap: 24 }}>
            <div className="pool mini">
              <div className="eyebrow">Prize pool</div>
              <div className="big">{okb(season.pool)} <span style={{ fontSize: 22 }}>OKB</span></div>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{poolUsd}{poolUsd && " · "}top 3 player bots split 50 / 30 / 20</div>
              <div style={{ marginTop: 12 }}><Countdown ts={season.entryClose} /></div>
              <a className="btn ink" style={{ width: "100%", marginTop: 14 }} href="#/lab">Enter the season</a>
            </div>

            <div className="panel">
              <div className="panel-h">
                <h2>Fight log</h2>
                {pending.length > 0
                  ? <button className="btn mint sm" disabled={busy} onClick={crank}>{busy ? "Refereeing…" : `Referee ${Math.min(6, pending.length)}`}</button>
                  : <span className="note">{played.length} refereed</span>}
              </div>
              <div className="panel-b">
                <div className="fl">
                  {pending.slice(0, 3).map(m => (
                    <div key={`p${m.a}-${m.b}`} className="fl-row" style={{ borderStyle: "dashed", background: "transparent" }}>
                      <div className="pair"><Head entry={season.entries[m.a]} size={34} round /><Head entry={season.entries[m.b]} size={34} round /></div>
                      <div className="vsn"><span>{botName(season.entries[m.a])} vs {botName(season.entries[m.b])}</span><small>waiting for the referee</small></div>
                      <span className="note">…</span>
                    </div>
                  ))}
                  {[...played].reverse().map(m => <FightRow key={`${m.a}-${m.b}`} season={season} m={m} />)}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------------- one-line how-to */}
      <section className="mini-steps" style={{ marginBottom: 64 }}>
        <a className="mini-step" href="#/lab" style={{ textDecoration: "none" }}><img src={CAST.Lookahead.src} alt="" /><div><b>1 · Write logic</b><span>8 sensors in, 2 steering bits out. Spar the field for free.</span></div></a>
        <a className="mini-step" href="#/lab" style={{ textDecoration: "none" }}><img src={HERO} alt="" /><div><b>2 · Tape it out</b><span>One tx mints your transistors, tapes out and enters. ~$0.50.</span></div></a>
        <a className="mini-step" href="#/how" style={{ textDecoration: "none" }}><img src={CAST.Hunter.src} alt="" /><div><b>3 · Fight</b><span>The contract referees every match. Prizes follow the NFT.</span></div></a>
      </section>
    </div>
  );
}

function FightRow({ season, m }) {
  const ea = season.entries[m.a], eb = season.entries[m.b];
  const r = useMemo(() => runMatch(season.season, ea, eb), [season.season, ea, eb]);
  const verified = r.result === m.result;
  const winner = m.result === 0 ? null : m.result === 1 ? ea : eb;
  return (
    <a className="fl-row" href={`#/match/${season.season}/${m.a}/${m.b}`}>
      <div className="pair"><Head entry={ea} size={34} round /><Head entry={eb} size={34} round /></div>
      <div className="vsn">
        <span>{botName(ea)} <span style={{ display: "inline", color: "var(--muted)" }}>vs</span> {botName(eb)}</span>
        <small>{winner ? `${botName(winner)} wins` : "draw"} · {r.ticks} ticks{verified ? "" : " ⚠"}</small>
      </div>
      <span className={`stamp ${winner ? "ko" : "draw"}`}>{winner ? "KO" : "Draw"}</span>
    </a>
  );
}
