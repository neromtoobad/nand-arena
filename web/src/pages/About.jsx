import { useApp } from "../App.jsx";
import { DEPLOY, FACTORY, addrUrl, txUrl, okb } from "../chain.js";
import { INPUTS, MAX_TICKS } from "@sdk/game.js";
import { CAST, HERO } from "../art.jsx";
import PageBar from "../components/PageBar.jsx";

export default function About() {
  const { season } = useApp();
  return (
    <>
      <PageBar eyebrow="How it works" title={<>A bot league where the bots are <span className="hl">hardware</span></>}>
        <a className="btn sun sm" href="#/lab">Build a bot</a>
      </PageBar>
      <div className="wrap page prose">
        <div className="mini-steps" style={{ marginTop: 0 }}>
          <div className="mini-step"><img src={CAST.Lookahead.src} alt="" /><div><b>1 · Write logic</b><span>Eight sensor bits in, two steering bits out, optional memory. The Lab compiles it to NAND gates.</span></div></div>
          <div className="mini-step"><img src={HERO} alt="" /><div><b>2 · Tape it out</b><span>One transaction mints exactly your transistors, tapes the circuit out on the Arena processor and enters it.</span></div></div>
          <div className="mini-step"><img src={CAST.Hunter.src} alt="" /><div><b>3 · Fight</b><span>The NandArena contract plays every pair on-chain. Top three player bots split the pool.</span></div></div>
        </div>

        <div className="grid2" style={{ marginTop: 24 }}>
          <div className="card pad">
            <h2 className="h-card">The game: light cycles</h2>
            <ul>
              <li>16 × 16 board. Bot A starts at (3,8) heading east, bot B at (12,7) heading west: a mirror image.</li>
              <li>Each tick both bots read 8 sensor bits and output 2: <code>left</code>, <code>right</code>. Neither or both means straight on.</li>
              <li>Both move at once and leave a trail. Leaving the board, hitting any trail or meeting head-on is a crash.</li>
              <li>One crash: the other bot wins. Both crash: draw. {MAX_TICKS} ticks with no crash: draw.</li>
              <li>LATCH bits are memory: they carry across ticks within a match and reset between matches.</li>
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
              <li>Round robin: every pair plays exactly once. Win = 3 points, draw = 1.</li>
              <li>Ranking: points, then wins, then <b>fewer gates</b>, then earlier entry. Copying a winner never beats the original.</li>
              <li>Anyone can call <code>playMatch</code>; the arena's keeper does it within a minute.</li>
              <li>When entries close and every pair has played, anyone can call <code>finalize</code>: the top three player bots get 50 / 30 / 20% of the pool. House bots never take prize money.</li>
              <li>Prizes go to whoever holds the winning circuit NFT, so bots are tradeable.</li>
              <li>The next season opens automatically for 7 days with the carry pool.</li>
              <li>Limits: 64 bots per season, 3 per wallet, 256 gates, 32 memory bits, native NAND/LATCH only.</li>
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
              <dt>Carry pool</dt><dd>{season ? `${okb(season.carry)} OKB` : "…"}</dd>
            </dl>
            <div className="split-bar" style={{ height: 52, marginTop: 16 }}>
              <div style={{ flex: 70, background: "var(--sun)" }}>70% pool</div>
              <div style={{ flex: 20, background: "var(--white)" }}>20% next</div>
              <div style={{ flex: 10, background: "var(--pink)", color: "var(--white)" }}>10%</div>
            </div>
            <p className="note" style={{ color: "var(--ink)", fontWeight: 600, marginTop: 10 }}>Mint income split by code in <code>sweep()</code>: season pool, next season, keeper gas.</p>
          </div>
        </div>

        <div className="grid2" style={{ marginTop: 22 }}>
          <div className="card pad">
            <h2 className="h-card">Built to be trusted</h2>
            <ul>
              <li><b>No owner.</b> No function moves pooled OKB except to prize winners. The ops address only receives its fixed 10% and is never eligible for prizes.</li>
              <li><b>Netlist snapshots.</b> Each bot's netlist hash is stored at entry; if a TapeOut upgrade ever changes it, that bot forfeits instead of jamming the season.</li>
              <li><b>A verified referee.</b> ArenaVM is fuzz-tested against TapeOut's own <code>step()</code>, and anyone can compare them on-chain with <code>crossCheck()</code>. A full match costs under $0.01.</li>
              <li><b>Pull payments</b>, state updated before every transfer, bounded loops.</li>
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
            <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
              <a className="btn sun sm" href="https://github.com/neromtoobad/nand-arena" target="_blank" rel="noreferrer">Source on GitHub</a>
              <a className="btn sm" href="#/lab">Build a bot</a>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
