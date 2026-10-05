// NAND Arena keeper: plays pending round-robin matches, finalizes seasons and pushes prizes.
// Everything it calls is permissionless — anyone can run this.
//
//   KEEPER_KEY=0x... ARENA=0x... node scripts/keeper.mjs        (Railway)
//   node scripts/keeper.mjs                                       (local: deployments/xlayer.json + ~/.nandarena-keeper.json)
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import http from "node:http";
import { ethers } from "ethers";

const RPC = process.env.RPC_URL || "https://rpc.xlayer.tech";
const INTERVAL = Number(process.env.INTERVAL_MS || 45_000);
const BATCH = Number(process.env.BATCH || 8);
const GAS_PER_MATCH = 4_500_000n;

function key() {
  if (process.env.KEEPER_KEY) return process.env.KEEPER_KEY;
  const f = `${homedir()}/.nandarena-keeper.json`;
  const d = JSON.parse(readFileSync(f, "utf8")).data;
  return (Array.isArray(d) ? d[0] : d).private_key;
}
function arenaAddress() {
  if (process.env.ARENA) return process.env.ARENA;
  const f = new URL("../deployments/xlayer.json", import.meta.url);
  if (!existsSync(f)) throw new Error("set ARENA");
  return JSON.parse(readFileSync(f, "utf8")).arena;
}

const ABI = [
  "function currentSeason() view returns (uint256)",
  "function seasons(uint256) view returns (uint64 entryClose, uint32 nEntries, uint32 played, bool finalized, uint256 pool)",
  "function pairResult(uint256,uint256) view returns (uint8)",
  "function playMatches(uint256[],uint256[])",
  "function finalize()",
  "function podium(uint256) view returns (uint256[3])",
  "function prizeOf(uint256,uint256) view returns (uint256)",
  "function claim(uint256,uint256)",
];

const provider = new ethers.JsonRpcProvider(RPC, 196, { staticNetwork: true });
const wallet = new ethers.Wallet(key(), provider);
const arena = new ethers.Contract(arenaAddress(), ABI, wallet);
const status = { started: new Date().toISOString(), lastTick: null, lastAction: null, errors: 0, keeper: wallet.address, arena: arena.target };
const log = (...a) => { console.log(new Date().toISOString(), ...a); };

async function tick() {
  const s = Number(await arena.currentSeason());
  const S = await arena.seasons(s);
  const n = Number(S.nEntries);
  const total = (n * (n - 1)) / 2;
  const now = Math.floor(Date.now() / 1000);

  if (Number(S.played) < total) {
    const pending = [];
    for (let a = 0; a < n && pending.length < BATCH; a++)
      for (let b = a + 1; b < n && pending.length < BATCH; b++)
        if (Number(await arena.pairResult(s, a * 64 + b)) === 0) pending.push([a, b]);
    if (pending.length) {
      const tx = await arena.playMatches(pending.map(p => p[0]), pending.map(p => p[1]), { gasLimit: GAS_PER_MATCH * BigInt(pending.length) + 200_000n });
      log(`season ${s}: refereeing ${pending.length} matches`, tx.hash);
      await tx.wait();
      status.lastAction = { at: new Date().toISOString(), what: `played ${pending.length}`, tx: tx.hash };
      return;
    }
  }

  if (!S.finalized && now >= Number(S.entryClose) && Number(S.played) === total) {
    const tx = await arena.finalize();
    log(`season ${s}: finalize`, tx.hash);
    await tx.wait();
    status.lastAction = { at: new Date().toISOString(), what: `finalized season ${s}`, tx: tx.hash };
    const pod = await arena.podium(s);
    for (const p of pod) {
      if (Number(p) === 0) continue;
      const idx = Number(p) - 1;
      if ((await arena.prizeOf(s, idx)) > 0n) {
        const c = await arena.claim(s, idx);
        log(`season ${s}: pushed prize for entry ${idx}`, c.hash);
        await c.wait();
      }
    }
  }
}

async function loop() {
  try { await tick(); status.lastTick = new Date().toISOString(); }
  catch (e) { status.errors++; log("error:", e.shortMessage || e.message); }
  setTimeout(loop, INTERVAL);
}

log("keeper", wallet.address, "arena", arena.target, "balance", ethers.formatEther(await provider.getBalance(wallet.address)), "OKB");
loop();

const port = Number(process.env.PORT || 0);
if (port) http.createServer((_, res) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(status)); }).listen(port);
