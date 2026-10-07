import { useApp } from "../App.jsx";
import { DEPLOY, FACTORY, addrUrl, txUrl, okb } from "../chain.js";
import { INPUTS, MAX_TICKS } from "@sdk/game.js";
import { CAST, HERO } from "../art.jsx";

export default function About() {
  const { season } = useApp();
  return (
    <>
      <section className="band sun dots-ink" style={{ overflow: "hidden" }}>
        <div className="wrap" style={{ position: "relative", paddingTop: 60, paddingBottom: 60 }}>
          <div className="eyebrow">How it works</div>
          <h1 className="display h-sec" style={{ marginTop: 10, maxWidth: 820 }}>A bot league where the bots are <span style={{ color: "var(--violet)" }}>hardware</span></h1>
          <p className="sub" style={{ color: "var(--ink)", maxWidth: 680, fontSize: 18, marginTop: 16 }}>
            TapeOut turns a blockchain into a chip fab: transistors are tokens, and a circuit is taped out by burning them into a
            permanent NAND/LATCH netlist anyone can evaluate. NAND Arena gives those circuits a job: every bot is a TapeOut circuit,
            and a contract on X Layer pits them against each other in light cycles, running both circuits tick by tick.
          </p>
          <img className="hide-md" src={CAST.Lookahead.src} alt="" style={{ position: "absolute", right: 40, bottom: -30, height: 300, transform: "rotate(-6deg)", filter: "drop-shadow(0 12px 12px rgba(23,19,43,.3))" }} />
        </div>
      </section>

      <section className="band cream prose">
        <div className="wrap">
          <div className="grid2">
            <div className="card pad">
              <h2 className="h-card">The game: light cycles</h2>
              <ul>
                <li>16 × 16 board. Bot A starts at (3,8) heading east, bot B at (12,7) heading west: a mirror image.</li>
                <li>Each tick both bots read 8 sensor bits and output 2: <code>left</code>, <code>right</code>. Neither or both means straight on.</li>
                <li>Both move at once and leave a trail. Leaving the board, hitting any trail or meeting head-on is a crash.</li>
                <li>One crash: the other bot wins. Both crash: draw. {MAX_TICKS} ticks with no crash: draw.</li>
                <li>LATCH bits are the bot's memory: they carry across ticks within a match and reset between matches.</li>
                <li>The coin bit comes from <code>keccak256(season, circuitA, circuitB)</code>, so every match is deterministic and replayable.</li>
              </ul>
            </div>
            <div className="card pad">
              <h2 className="h-card">The sensors</h2>
              <div className="legend" style={{ fontSize: 15 }}>
                {INPUTS.map(p => [<code key={p.key}>bit {p.bit} · {p.key}</code>, <span key={p.key + "l"}>{p.label}</span>])}
              </div>
              <p className="note" style={{ marginTop: 14 }}>Left and right are relative to the bot's own heading. "More open road" compares the free cells in a straight line to each side.</p>
            </div>
          </div>

          <div className="grid2" style={{ marginTop: 22 }}>
            <div className="card pad">
              <h2 className="h-card">Seasons & prizes</h2>
              <ul>
                <li>A season is a round robin: every pair plays exactly once. Win = 3 points, draw = 1.</li>
                <li>Ranking: points, then wins, then <b>fewer gates</b>, then earlier entry. Copying a winner never beats the original.</li>
                <li>Anyone can call <code>playMatch</code>; the arena's keeper does it within a minute.</li>
                <li>Once entries close and every pair has played, anyone can call <code>finalize</code>. The top three player bots get 50 / 30 / 20% of the pool. House bots never take prize money.</li>
                <li>Prizes are paid to whoever holds the winning circuit NFT, so bots are tradeable assets.</li>
                <li>The next season opens automatically for 7 days, seeded with the carry pool.</li>
                <li>Limits: 64 bots per season, 3 per wallet, 256 gates, 32 memory bits, native NAND/LATCH only (no REF).</li>
              </ul>
            </div>
            <div className="card pad" style={{ background: "var(--mint)" }}>
              <h2 className="h-card">Asset terms (on-chain since deployment)</h2>
              <dl className="kv">
                <dt>Processor</dt><dd>NAND Arena (ARENA)</dd>
                <dt>Supply</dt><dd>2,097,152 transistors (NAND + LATCH), hard cap, immutable</dd>
                <dt>Unit price</dt><dd>0.0001 OKB per transistor, immutable</dd>
                <dt>Per-wallet cap</dt><dd>none at mint; 3 entries per wallet per season</dd>
                <dt>Minted so far</dt><dd>{season ? `${season.minted.toLocaleString()} / ${season.supplyCap.toLocaleString()}` : "…"}</dd>
                <dt>Creator</dt><dd>the NandArena contract itself</dd>
                <dt>Mint income</dt><dd>70% prize pool · 20% next season · 10% keeper gas, split by code in <code>sweep()</code></dd>
                <dt>Carry pool</dt><dd>{season ? `${okb(season.carry)} OKB` : "…"}</dd>
              </dl>
            </div>
          </div>
        </div>
      </section>

      <section className="band ink dots prose">
        <div className="wrap">
          <div className="grid2">
            <div>
              <h2 className="display h-sec" style={{ fontSize: 56 }}>Built to be <span className="hl">trusted</span></h2>
              <ul style={{ color: "#d9d5ef" }}>
                <li style={{ color: "#d9d5ef" }}><b style={{ color: "var(--white)" }}>No owner.</b> No function moves pooled OKB anywhere except to prize winners. The ops address only receives its fixed 10% and is never eligible for prizes.</li>
                <li style={{ color: "#d9d5ef" }}><b style={{ color: "var(--white)" }}>Netlist snapshots.</b> Each bot's netlist hash is stored at entry. TapeOut's contracts are upgradeable, so if a netlist ever changes, that bot forfeits instead of jamming the season.</li>
                <li style={{ color: "#d9d5ef" }}><b style={{ color: "var(--white)" }}>A verified referee.</b> Matches run on ArenaVM, a gas-lean NAND/LATCH evaluator fuzz-tested against TapeOut's own <code>step()</code> on a mainnet fork. Anyone can compare the two on-chain with <code>crossCheck()</code>. A full match costs 0.4–4M gas (under $0.01).</li>
                <li style={{ color: "#d9d5ef" }}><b style={{ color: "var(--white)" }}>Pull payments</b>, state updated before every transfer, bounded loops.</li>
              </ul>
            </div>
            <div className="card pad">
              <h2 className="h-card">Contracts on X Layer (196)</h2>
              {DEPLOY ? (
                <dl className="kv">
                  <dt>NandArena</dt><dd><a className="addr" href={addrUrl(DEPLOY.arena)} target="_blank" rel="noreferrer">{DEPLOY.arena}</a></dd>
                  <dt>Processor</dt><dd><a className="addr" href={addrUrl(DEPLOY.processor)} target="_blank" rel="noreferrer">{DEPLOY.processor}</a></dd>
                  <dt>Transistors</dt><dd><a className="addr" href={addrUrl(DEPLOY.transistors)} target="_blank" rel="noreferrer">{DEPLOY.transistors}</a></dd>
                  <dt>Deployed by</dt><dd><a className="addr" href={addrUrl(DEPLOY.deployer)} target="_blank" rel="noreferrer">{DEPLOY.deployer}</a></dd>
                  <dt>Deploy tx</dt><dd><a className="addr" href={txUrl(DEPLOY.deployTx)} target="_blank" rel="noreferrer">{DEPLOY.deployTx}</a></dd>
                  <dt>TapeOut factory</dt><dd><a className="addr" href={addrUrl(FACTORY)} target="_blank" rel="noreferrer">{FACTORY}</a></dd>
                  <dt>Source</dt><dd><a href={`https://repo.sourcify.dev/196/${DEPLOY.arena}`} target="_blank" rel="noreferrer">Verified on Sourcify (exact match)</a></dd>
                </dl>
              ) : <p className="note">Not deployed yet.</p>}
              <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
                <a className="btn sun sm" href="https://github.com/neromtoobad/nand-arena" target="_blank" rel="noreferrer">Source on GitHub</a>
                <a className="btn sm" href="#/lab">Build a bot</a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="band violet dots final">
        <div className="wrap">
          <h2 className="display" style={{ fontSize: "clamp(40px, 6vw, 84px)" }}>Your turn to <span style={{ color: "var(--sun)" }}>tape out</span></h2>
          <div style={{ marginTop: 26 }}><a className="btn sun lg" href="#/lab">Open the Bot Lab</a></div>
          <div className="row" aria-hidden><img src={CAST.Weaver.src} alt="" /><img className="big" src={HERO} alt="" /><img src={CAST.Cautious.src} alt="" /></div>
        </div>
      </section>
    </>
  );
}
