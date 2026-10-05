import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { ethers } from "ethers";

export const XLAYER_RPC = process.env.RPC_URL || "https://rpc.xlayer.tech";
export const ROOT = new URL("..", import.meta.url).pathname;

export function artifact(name) {
  const a = JSON.parse(readFileSync(`${ROOT}contracts/out/${name}.sol/${name}.json`, "utf8"));
  return { abi: a.abi, bytecode: a.bytecode.object };
}

export function deployerKey() {
  if (process.env.PRIVATE_KEY) return process.env.PRIVATE_KEY;
  const f = `${homedir()}/.nandarena-deployer.json`;
  if (!existsSync(f)) throw new Error("no deployer key");
  const d = JSON.parse(readFileSync(f, "utf8")).data;
  return (Array.isArray(d) ? d[0] : d).private_key;
}

export async function connect() {
  const provider = new ethers.JsonRpcProvider(XLAYER_RPC, undefined, { staticNetwork: false });
  const net = await provider.getNetwork();
  const wallet = new ethers.Wallet(deployerKey(), provider);
  return { provider, wallet, chainId: Number(net.chainId) };
}

export function deploymentsPath(chainId) {
  const fork = process.env.FORK === "1";
  return `${ROOT}deployments/${fork ? "fork" : chainId === 196 ? "xlayer" : "chain-" + chainId}.json`;
}

export function loadDeployment(chainId) {
  return JSON.parse(readFileSync(deploymentsPath(chainId), "utf8"));
}
