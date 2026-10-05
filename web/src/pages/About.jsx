import { useApp } from "../App.jsx";
import { DEPLOY, FACTORY, addrUrl, txUrl, okb } from "../chain.js";
import { INPUTS, MAX_TICKS } from "@sdk/game.js";

export default function About() {
  const { season } = useApp();
  return (
    <div className="section prose">
      <div className="eyebrow">How it works</div>
      <h2 style={{ marginTop: 6, fontSize: 34 }}>A bot league where the bots are hardware</h2>
      <p style={{ maxWidth: 760, fontSize: 17 }}>
        TapeOut turns a blockchain into a chip fab: transistors are tokens, and a circuit is "taped out" by burning them into a
        permanent NAND/LATCH netlist anyone can evaluate. NAND Arena gives those circuits a job. Each bot is a TapeOut circuit, and
        a contract on X Layer pits every bot against every other one in a game of light cycles, running both circuits tick by tick.
      </p>

      <div className="grid2" style={{ marginTop: 28 }}>
        <div className="card pad">
          <h3>The game: Light Cycles</h3>
          <ul>
            <li>16 × 16 board. Bot A starts at (3,8) heading east; bot B at (12,7) heading west, a mirror image.</li>
            <li>Each tick, both bots read 8 sensor bits and output 2 bits: <code>left</code>, <code>right</code>. Neither or both means straight on.</li>
            <li>Both move at once and leave a trail. Leaving the board, hitting any trail, or meeting head-on is a crash.</li>
            <li>One crash: the other bot wins. Both crash: draw. {MAX_TICKS} ticks with no crash: draw.</li>
            <li>A bot's memory (LATCH bits) carries across ticks within a match and resets between matches.</li>
            <li>The coin bit comes from <code>keccak256(season, circuitA, circuitB)</code>, so every match is deterministic and replayable.</li>
          </ul>
        </div>
        <div className="card pad">
          <h3>The sensors</h3>
          <div className="legend" style={{ marginTop: 10 }}>
            {INPUTS.map(p => [<code key={p.key}>bit {p.bit} · {p.key}</code>, <span key={p.key + "l"}>{p.label}</span>])}
          </div>
          <p className="note" style={{ marginTop: 12 }}>"Left" and "right" are relative to the bot's own heading. "More open road" compares the free cells in a straight line to each side.</p>
        </div>
      </div>

      <div className="grid2" style={{ marginTop: 16 }}>
        <div className="card pad">
          <h3>Seasons and prizes</h3>
          <ul>
            <li>A season is a round robin: every pair plays exactly once. Win = 3 points, draw = 1.</li>
            <li>Ranking: points, then wins, then <b>fewer gates</b>, then earlier entry. Copying a winner never beats the original.</li>
            <li>Anyone can call <code>playMatch</code>; the arena's keeper does it by default.</li>
            <li>Once entries close and every pair has played, anyone can call <code>finalize</code>. The top three player bots get 50 / 30 / 20% of the pool. House bots never take prize money.</li>
            <li>Prizes are paid to whoever holds the winning circuit NFT when <code>claim</code> is called, so bots are tradeable assets.</li>
            <li>The next season opens automatically for 7 days, seeded with the carry pool.</li>
            <li>Limits: 64 bots per season, 3 per wallet, 256 gates, 32 memory bits, native NAND/LATCH only (no REF).</li>
          </ul>
        </div>
        <div className="card pad">
          <h3>Asset terms (disclosed on-chain at deployment)</h3>
          <dl className="kv" style={{ marginTop: 10 }}>
            <dt>Processor</dt><dd>NAND Arena (ARENA)</dd>
            <dt>Transistor supply</dt><dd>2,097,152 (NAND + LATCH combined), hard cap, immutable</dd>
            <dt>Unit price</dt><dd>0.0001 OKB per transistor, immutable</dd>
            <dt>Per-wallet cap</dt><dd>none at mint; 3 entries per wallet per season</dd>
            <dt>Minted so far</dt><dd>{season ? `${season.minted.toLocaleString()} / ${season.supplyCap.toLocaleString()}` : "…"}</dd>
            <dt>Creator</dt><dd>the NandArena contract itself</dd>
            <dt>Mint income</dt><dd>70% current prize pool · 20% next season · 10% ops (keeper gas), split by code in <code>sweep()</code></dd>
            <dt>Carry pool</dt><dd>{season ? `${okb(season.carry)} OKB` : "…"}</dd>
          </dl>
          <p className="note" style={{ marginTop: 12 }}>Every tape-out burns transistors and supply never refills, so silicon gets scarcer the more the league is played.</p>
        </div>
      </div>

      <div className="grid2" style={{ marginTop: 16 }}>
        <div className="card pad">
          <h3>Security choices</h3>
          <ul>
            <li><b>No owner.</b> No function moves pooled OKB anywhere except to prize winners. The ops address only receives its fixed 10% and is never eligible for prizes.</li>
            <li><b>Netlist snapshots.</b> Each bot's netlist hash is stored at entry. TapeOut's contracts are upgradeable, so if a netlist ever changes or stops loading, that bot forfeits instead of the season jamming.</li>
            <li><b>A lean, verified referee.</b> Matches run on ArenaVM, a gas-lean evaluator for native NAND/LATCH netlists. It is fuzz-tested against TapeOut's own <code>step()</code> on a mainnet fork, and anyone can compare the two for any circuit with <code>crossCheck()</code>. A full match costs about 0.4–4M gas (under $0.01).</li>
            <li><b>Pull payments</b>, state updated before every transfer, bounded loops (≤ 64 entries).</li>
          </ul>
        </div>
        <div className="card pad">
          <h3>Contracts on X Layer (chain 196)</h3>
          {DEPLOY ? (
            <dl className="kv" style={{ marginTop: 10 }}>
              <dt>NandArena</dt><dd><a className="addr" href={addrUrl(DEPLOY.arena)} target="_blank" rel="noreferrer">{DEPLOY.arena}</a></dd>
              <dt>Processor (Circuits)</dt><dd><a className="addr" href={addrUrl(DEPLOY.processor)} target="_blank" rel="noreferrer">{DEPLOY.processor}</a></dd>
              <dt>Transistors</dt><dd><a className="addr" href={addrUrl(DEPLOY.transistors)} target="_blank" rel="noreferrer">{DEPLOY.transistors}</a></dd>
              <dt>Deployed by</dt><dd><a className="addr" href={addrUrl(DEPLOY.deployer)} target="_blank" rel="noreferrer">{DEPLOY.deployer}</a></dd>
              <dt>Deploy tx</dt><dd><a className="addr" href={txUrl(DEPLOY.deployTx)} target="_blank" rel="noreferrer">{DEPLOY.deployTx}</a></dd>
              <dt>TapeOut factory</dt><dd><a className="addr" href={addrUrl(FACTORY)} target="_blank" rel="noreferrer">{FACTORY}</a></dd>
            </dl>
          ) : <p className="note">Not deployed yet.</p>}
        </div>
      </div>
    </div>
  );
}
