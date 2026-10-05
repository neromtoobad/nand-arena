// Deploy NandArena (which creates the Arena processor through the TapeOut factory), enter the
// house bots in Season 1, play their round robin and seed the prize pool.
//
//   node scripts/deploy.mjs                     # X Layer mainnet (chain 196)
//   RPC_URL=http://127.0.0.1:8545 FORK=1 node scripts/deploy.mjs   # rehearsal on an anvil fork
//
// Env: SEASON1_CLOSE (unix seconds), POT (OKB to donate, default 0), SKIP_MATCHES=1
import { writeFileSync, mkdirSync } from "node:fs";
import { ethers } from "ethers";
import { artifact, connect, deploymentsPath, ROOT } from "./lib.mjs";
import { compile } from "../sdk/dsl.js";
import { SEED_BOTS } from "../sdk/bots.js";

const FACTORY = "0x1f09DAeFA827f02CBb40967cc91b259763760761";
const SEASON1_CLOSE = BigInt(process.env.SEASON1_CLOSE || Math.floor(Date.UTC(2026, 9, 11, 18, 0, 0) / 1000));
const POT = ethers.parseEther(process.env.POT || "0");

const { provider, wallet, chainId } = await connect();
const fork = process.env.FORK === "1";
if (chainId !== 196) throw new Error(`expected chain 196 (X Layer), got ${chainId}`);
if (fork) await provider.send("anvil_setBalance", [wallet.address, ethers.toQuantity(ethers.parseEther("1"))]);

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const bal = async () => ethers.formatEther(await provider.getBalance(wallet.address));
log("deployer", wallet.address, "balance", await bal(), "OKB", fork ? "(fork)" : "(MAINNET)");

const factory = new ethers.Contract(FACTORY, ["function deployFee() view returns (uint256)"], provider);
const deployFee = await factory.deployFee();
const { abi, bytecode } = artifact("NandArena");
const Arena = new ethers.ContractFactory(abi, bytecode, wallet);

log("deploying NandArena, deployFee", ethers.formatEther(deployFee), "season 1 closes", new Date(Number(SEASON1_CLOSE) * 1000).toISOString());
const arena = await Arena.deploy(SEASON1_CLOSE, { value: deployFee });
const deployTx = arena.deploymentTransaction();
log("tx", deployTx.hash);
await arena.waitForDeployment();
const arenaAddr = await arena.getAddress();
const processor = await arena.processor();
const transistors = await arena.transistors();
const receipt = await provider.getTransactionReceipt(deployTx.hash);
log("arena", arenaAddr, "processor", processor, "transistors", transistors, "block", receipt.blockNumber);

const out = {
  chainId, arena: arenaAddr, processor, transistors, deployer: wallet.address,
  deployTx: deployTx.hash, deployBlock: receipt.blockNumber, season1Close: Number(SEASON1_CLOSE),
  houseBots: [], matches: [],
};
const save = () => {
  mkdirSync(`${ROOT}deployments`, { recursive: true });
  writeFileSync(deploymentsPath(chainId), JSON.stringify(out, null, 2));
};
save();

for (const bot of SEED_BOTS) {
  const c = compile(bot.src);
  const value = await arena.quoteBuild(c.hex);
  const tx = await arena.buildAndEnter(c.hex, { value });
  const rc = await tx.wait();
  const ev = rc.logs.map(l => { try { return arena.interface.parseLog(l); } catch { return null; } }).find(e => e?.name === "Entered");
  out.houseBots.push({ name: bot.name, circuitId: Number(ev.args.circuitId), entry: Number(ev.args.entry), gates: c.gateCount, tx: tx.hash, cost: ethers.formatEther(value) });
  log(`house bot ${bot.name}: circuit #${ev.args.circuitId}, ${c.gateCount} gates, ${ethers.formatEther(value)} OKB, tx ${tx.hash}`);
  save();
}

if (process.env.SKIP_MATCHES !== "1") {
  const n = out.houseBots.length;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++) {
      const tx = await arena.playMatch(a, b);
      const rc = await tx.wait();
      const ev = rc.logs.map(l => { try { return arena.interface.parseLog(l); } catch { return null; } }).find(e => e?.name === "MatchPlayed");
      out.matches.push({ a, b, result: Number(ev.args.result), ticks: Number(ev.args.ticks), gas: Number(rc.gasUsed), tx: tx.hash });
      log(`match ${a}-${b}: result ${ev.args.result} in ${ev.args.ticks} ticks, gas ${rc.gasUsed}`);
      save();
    }
}

if (POT > 0n) {
  const tx = await arena.donate({ value: POT });
  await tx.wait();
  out.potTx = tx.hash;
  log("donated", ethers.formatEther(POT), "OKB to the Season 1 pool, tx", tx.hash);
  save();
}

const s1 = await arena.seasons(1);
log("season 1 pool", ethers.formatEther(s1.pool), "OKB; carry", ethers.formatEther(await arena.carry()), "; deployer balance", await bal());
log("saved", deploymentsPath(chainId));
