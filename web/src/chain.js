import { ethers } from "ethers";

const NETWORK = import.meta.env.VITE_NETWORK || "xlayer";
const deployments = import.meta.glob("../../deployments/*.json", { eager: true, import: "default" });
export const DEPLOY = deployments[`../../deployments/${NETWORK === "fork" ? "fork" : "xlayer"}.json`] || null;
export const IS_FORK = NETWORK === "fork";
export const CHAIN_ID = 196;
export const RPC = IS_FORK ? "http://127.0.0.1:8546" : "https://rpc.xlayer.tech";
export const LOG_RPCS = IS_FORK ? [[RPC, 90_000]] : [["https://xlayer-mainnet.rpc.sentio.xyz", 90_000], ["https://xlayer.drpc.org", 9_000]];   // [url, max getLogs range]
export const EXPLORER = "https://www.oklink.com/xlayer";
export const FACTORY = "0x1f09DAeFA827f02CBb40967cc91b259763760761";

export const ARENA_ABI = [
  "function currentSeason() view returns (uint256)",
  "function seasons(uint256) view returns (uint64 entryClose, uint32 nEntries, uint32 played, bool finalized, uint256 pool)",
  "function entries(uint256) view returns (tuple(uint64 circuitId, address entrant, uint32 gates, uint16 points, uint8 wins, uint8 draws, uint8 losses, bytes32 nlHash)[])",
  "function pairResult(uint256,uint256) view returns (uint8)",
  "function carry() view returns (uint256)",
  "function ops() view returns (address)",
  "function quoteBuild(bytes) view returns (uint256)",
  "function buildAndEnter(bytes) payable returns (uint64, uint256)",
  "function enter(uint64) returns (uint256)",
  "function playMatch(uint256,uint256) returns (uint8,uint256)",
  "function playMatches(uint256[],uint256[])",
  "function podium(uint256) view returns (uint256[3])",
  "function prizeOf(uint256,uint256) view returns (uint256)",
  "function claim(uint256,uint256)",
  "function finalize()",
  "function simulate(uint64,uint64,uint256) view returns (uint8,uint256)",
  "function crossCheck(uint64,uint256,uint8) view returns (bool same, uint256 arenaState, uint256 arenaOut, bytes tapeoutState, bytes tapeoutOut)",
  "event MatchPlayed(uint256 indexed season, uint256 indexed a, uint256 indexed b, uint8 result, uint256 ticks)",
  "event Entered(uint256 indexed season, uint256 indexed entry, uint64 indexed circuitId, address entrant, uint32 gates)",
];
export const CIRCUITS_ABI = [
  "function netlist(uint256) view returns (bytes)",
  "function ownerOf(uint256) view returns (address)",
  "function nextId() view returns (uint256)",
];
export const TRANSISTORS_ABI = [
  "function minted() view returns (uint256)",
  "function supplyCap() view returns (uint256)",
  "function mintPrice() view returns (uint256)",
  "function protocolFee() view returns (uint256)",
];

export const provider = new ethers.JsonRpcProvider(RPC, CHAIN_ID, { staticNetwork: true, batchMaxCount: 25 });
export const arena = DEPLOY ? new ethers.Contract(DEPLOY.arena, ARENA_ABI, provider) : null;
export const circuits = DEPLOY ? new ethers.Contract(DEPLOY.processor, CIRCUITS_ABI, provider) : null;
export const transistors = DEPLOY ? new ethers.Contract(DEPLOY.transistors, TRANSISTORS_ABI, provider) : null;

export const short = a => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "");
export const okb = (wei, dp = 4) => Number(ethers.formatEther(wei ?? 0n)).toFixed(dp).replace(/\.?0+$/, "") || "0";
export const txUrl = h => `${EXPLORER}/tx/${h}`;
export const addrUrl = a => `${EXPLORER}/address/${a}`;

// ---------------------------------------------------------------- reads

const MULTICALL3 = new ethers.Contract("0xcA11bde05977b3631167028862bE2a173976CA11",
  ["function aggregate3((address target, bool allowFailure, bytes callData)[] calls) view returns ((bool success, bytes returnData)[])"], provider);

/** calls: [contract, fnName, args][] -> decoded first return value of each, in chunks of 400. */
async function multicall(calls) {
  const out = [];
  for (let i = 0; i < calls.length; i += 400) {
    const chunk = calls.slice(i, i + 400);
    const res = await MULTICALL3.aggregate3.staticCall(chunk.map(([c, fn, args]) =>
      ({ target: c.target, allowFailure: false, callData: c.interface.encodeFunctionData(fn, args) })));
    res.forEach((r, k) => { const [c, fn] = chunk[k]; out.push(c.interface.decodeFunctionResult(fn, r.returnData)[0]); });
  }
  return out;
}

const netlistCache = new Map();
export async function netlistOf(circuitId) {
  const k = Number(circuitId);
  if (!netlistCache.has(k)) netlistCache.set(k, circuits.netlist(k).then(b => ethers.getBytes(b)));
  return netlistCache.get(k);
}

/** Everything the UI needs about one season, in a few batched RPC round trips. */
export async function loadSeason(seasonArg) {
  const season = seasonArg ?? Number(await arena.currentSeason());
  const [info, list, carry, ops, minted, cap] = await Promise.all([
    arena.seasons(season), arena.entries(season), arena.carry(), arena.ops(), transistors.minted(), transistors.supplyCap(),
  ]);
  const entries = list.map((e, i) => ({
    idx: i, circuitId: Number(e.circuitId), entrant: e.entrant, gates: Number(e.gates),
    points: Number(e.points), wins: Number(e.wins), draws: Number(e.draws), losses: Number(e.losses),
    house: e.entrant.toLowerCase() === ops.toLowerCase(),
  }));
  const pairs = [];
  for (let a = 0; a < entries.length; a++) for (let b = a + 1; b < entries.length; b++) pairs.push([a, b]);
  const results = await multicall(pairs.map(([a, b]) => [arena, "pairResult", [season, a * 64 + b]]));
  const matches = pairs.map(([a, b], i) => ({ a, b, played: Number(results[i]) > 0, result: Number(results[i]) - 1 }));
  const missing = entries.filter(e => !netlistCache.has(e.circuitId));
  const fetched = await multicall(missing.map(e => [circuits, "netlist", [e.circuitId]]));
  missing.forEach((e, i) => netlistCache.set(e.circuitId, Promise.resolve(ethers.getBytes(fetched[i]))));
  const netlists = await Promise.all(entries.map(e => netlistOf(e.circuitId)));
  entries.forEach((e, i) => { e.netlist = netlists[i]; });
  return {
    season,
    entryClose: Number(info.entryClose), nEntries: Number(info.nEntries), played: Number(info.played),
    finalized: info.finalized, pool: info.pool, carry, ops, entries, matches,
    minted: Number(minted), supplyCap: Number(cap),
  };
}

/** Find the MatchPlayed log (tx hash) for a pair, scanning forward from the deploy block. */
export async function findMatchTx(season, a, b) {
  const topics = [ethers.id("MatchPlayed(uint256,uint256,uint256,uint8,uint256)"),
    ethers.toBeHex(season, 32), ethers.toBeHex(a, 32), ethers.toBeHex(b, 32)];
  for (const [url, span] of LOG_RPCS) {
    try {
      const p = new ethers.JsonRpcProvider(url, CHAIN_ID, { staticNetwork: true });
      const latest = await p.getBlockNumber();
      for (let from = DEPLOY.deployBlock; from <= latest; from += span) {
        const logs = await p.getLogs({ address: DEPLOY.arena, topics, fromBlock: from, toBlock: Math.min(from + span - 1, latest) });
        if (logs.length) return logs[0].transactionHash;
      }
      return null;
    } catch { /* try next RPC */ }
  }
  return null;
}

// ---------------------------------------------------------------- wallet

export function hasWallet() { return typeof window !== "undefined" && !!window.ethereum; }

export async function connectWallet() {
  if (!hasWallet()) throw new Error("No wallet found. Install OKX Wallet or MetaMask.");
  const eth = window.ethereum;
  await eth.request({ method: "eth_requestAccounts" });
  const hex = "0x" + CHAIN_ID.toString(16);
  const current = await eth.request({ method: "eth_chainId" });
  if (current !== hex) {
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
    } catch (e) {
      if (e.code !== 4902) throw e;
      await eth.request({ method: "wallet_addEthereumChain", params: [{
        chainId: hex, chainName: "X Layer Mainnet", rpcUrls: ["https://rpc.xlayer.tech"],
        nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 }, blockExplorerUrls: [EXPLORER],
      }] });
    }
  }
  const bp = new ethers.BrowserProvider(eth);
  const net = await bp.getNetwork();
  if (Number(net.chainId) !== CHAIN_ID) throw new Error("Switch your wallet to X Layer (chain 196).");
  const signer = await bp.getSigner();
  return { signer, address: await signer.getAddress(), arena: new ethers.Contract(DEPLOY.arena, ARENA_ABI, signer) };
}
