import { useEffect, useMemo, useState } from "react";
import { useApp } from "../App.jsx";
import Board from "../components/Board.jsx";
import { ChipAvatar } from "../components/Chip.jsx";
import { runMatch, botName, standings, formOf } from "../sim.js";
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
  return { left, text: left <= 0 ? "closed" : d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m ${s}s` };
}

const resultText = (m, ea, eb) => (m.result === 0 ? "draw" : `${m.result === 1 ? botName(ea) : botName(eb)} wins`);

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

  if (!season) return <div className="loading">{error ? `Couldn't load the arena: ${error}` : "Reading the arena from X Layer…"}</div>;

  const table = standings(season.entries);
  const played = season.matches.filter(m => m.played);
  const pending = season.matches.filter(m => !m.played);
  const shown = showAll ? played : played.slice(-24);
  const poolUsd = usd ? ` ≈ $${(Number(okb(season.pool, 6)) * usd).toFixed(2)}` : "";

  const crank = async () => {
    if (!wallet) return connect();
    setBusy(true);
    try {
      const batch = pending.slice(0, 6);
      const tx = await wallet.arena.playMatches(batch.map(m => m.a), batch.map(m => m.b));
      setToast({ node: <>Refereeing {batch.length} matches on-chain… <a href={txUrl(tx.hash)} target="_blank" rel="noreferrer">view tx</a></>, sticky: true });
      await tx.wait();
      setToast({ node: <>Done — {batch.length} matches played. <a href={txUrl(tx.hash)} target="_blank" rel="noreferrer">tx</a></> });
      refresh();
    } catch (e) { setToast({ text: e.shortMessage || e.message }); }
    setBusy(false);
  };

  return (
    <>
      <section className="hero">
        <div>
          <div className="eyebrow">TapeOut × X Layer · Season {season.season}</div>
          <h1 style={{ marginTop: 14 }}>Your bot<br />is a <em>chip.</em></h1>
          <p className="lead">
            Write a few lines of logic. It compiles to real NAND gates, gets taped out on X Layer as a TapeOut circuit,
            and fights every other bot in a light-cycle league that the chain referees, move by move.
          </p>
          <div className="ctas">
            <a className="btn primary" href="#/lab">Build a bot →</a>
            <a className="btn ghost" href="#standings">Season {season.season} standings</a>
          </div>
          <div className="stats">
            <div className="stat"><b>{okb(season.pool)} OKB</b><span>prize pool{poolUsd}</span></div>
            <div className="stat"><b>{season.nEntries}</b><span>bots entered</span></div>
            <div className="stat"><b>{season.played}/{season.matches.length}</b><span>matches refereed</span></div>
            <div className="stat"><b>{cd.text}</b><span>{season.finalized ? "season closed" : "until entries close"}</span></div>
          </div>
        </div>
        <div>
          {featured && (
            <a href={`#/match/${season.season}/${featured.m.a}/${featured.m.b}`} style={{ textDecoration: "none" }}>
              <div className="screen">
                <div className="screen-bar">
                  <span className="vs"><ChipAvatar entry={featured.ea} size={22} side="a" /><b className="tag-a">{botName(featured.ea)}</b></span>
                  <span>vs</span>
                  <span className="vs"><b className="tag-b">{botName(featured.eb)}</b><ChipAvatar entry={featured.eb} size={22} side="b" /></span>
                </div>
                <Board match={featured.r} loop size={520} />
                <div className="screen-foot">
                  <span>{featured.ea.gates} gates vs {featured.eb.gates} gates</span>
                  <span>{featured.r.ticks} ticks · {featured.m.played === false ? "preview" : resultText({ result: featured.r.result }, featured.ea, featured.eb)}</span>
                </div>
              </div>
            </a>
          )}
        </div>
      </section>

      <section className="section" id="standings">
        <div className="section-head">
          <div>
            <h2>Season {season.season} standings</h2>
            <p>Round robin: every bot plays every other bot once. Win 3, draw 1. Ties go to the smaller circuit.</p>
          </div>
          <span className="pill">Top 3 player bots split 50 / 30 / 20%</span>
        </div>
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="tbl">
            <thead><tr><th>#</th><th>Bot</th><th className="num">Gates</th><th className="num hide-xs">W</th><th className="num hide-xs">D</th><th className="num hide-xs">L</th><th className="num">Pts</th><th className="hide-xs">Form</th></tr></thead>
            <tbody>
              {table.map((e, i) => (
                <tr key={e.idx}>
                  <td className="rank">{i + 1}</td>
                  <td>
                    <div className="botcell">
                      <ChipAvatar entry={e} />
                      <div>
                        <div className="nm">{botName(e)}{e.house ? <span className="badge">house</span> : <span className="badge green">player</span>}</div>
                        <div className="own">circuit #{e.circuitId} · {short(e.entrant)}</div>
                      </div>
                    </div>
                  </td>
                  <td className="num mono">{e.gates}</td>
                  <td className="num hide-xs">{e.wins}</td>
                  <td className="num hide-xs">{e.draws}</td>
                  <td className="num hide-xs">{e.losses}</td>
                  <td className="num"><b>{e.points}</b></td>
                  <td className="hide-xs"><span className="form">{formOf(season, e.idx).slice(-8).map((r, k) => <i key={k} className={r} />)}</span></td>
                </tr>
              ))}
              {!table.length && <tr><td colSpan={8} className="note" style={{ padding: 24 }}>No bots yet — be the first.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="note" style={{ marginTop: 10 }}>House bots are sparring partners: they play every match but never take prize money.</p>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <h2>Matches</h2>
            <p>Every result below was computed by the NandArena contract. Click one to replay it gate by gate.</p>
          </div>
          {pending.length > 0 && (
            <button className="btn primary" disabled={busy} onClick={crank}>
              {busy ? "Refereeing…" : `Referee ${Math.min(6, pending.length)} pending match${pending.length === 1 ? "" : "es"}`}
            </button>
          )}
        </div>
        <div className="mgrid">
          {[...shown].reverse().map(m => <MatchCard key={`${m.a}-${m.b}`} season={season} m={m} />)}
          {pending.slice(0, 4).map(m => (
            <div key={`p${m.a}-${m.b}`} className="mcard pending">
              <div style={{ textAlign: "center" }}>{botName(season.entries[m.a])}<br />vs<br />{botName(season.entries[m.b])}<div className="res">waiting for referee</div></div>
            </div>
          ))}
        </div>
        {played.length > 24 && !showAll && <div style={{ textAlign: "center", marginTop: 16 }}><button className="btn ghost sm" onClick={() => setShowAll(true)}>Show all {played.length} matches</button></div>}
      </section>

      <section className="section">
        <div className="grid3">
          <div className="card pad"><div className="step-n">01 · DESIGN</div><h3 style={{ margin: "8px 0" }}>Write the logic</h3><p className="sub">Eight sensor bits in, two steering bits out, optional memory. The Bot Lab compiles it to NAND gates and shows every wire.</p></div>
          <div className="card pad"><div className="step-n">02 · TAPE OUT</div><h3 style={{ margin: "8px 0" }}>Burn real transistors</h3><p className="sub">One transaction mints exactly the transistors your circuit needs, tapes it out on the Arena processor and enters it. The circuit NFT is yours.</p></div>
          <div className="card pad"><div className="step-n">03 · COMPETE</div><h3 style={{ margin: "8px 0" }}>The chain referees</h3><p className="sub">Anyone can trigger a match. The contract runs both circuits tick by tick and records the result. Prizes go to whoever holds the winning bot.</p></div>
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
      <Board match={r} size={160} mini />
      <div className="who"><span className="tag-a" style={{ color: "var(--a)", fontWeight: m.result === 1 ? 700 : 400 }}>{botName(ea)}</span><span style={{ color: "var(--b)", fontWeight: m.result === 2 ? 700 : 400 }}>{botName(eb)}</span></div>
      <div className="res">{m.result === 0 ? "draw" : "win"} · {r.ticks} ticks{verified ? "" : " · ⚠ mismatch"}</div>
    </a>
  );
}
