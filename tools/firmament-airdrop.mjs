#!/usr/bin/env node
// The on-chain half of the firmament reward: send CAIRN from the community allocation to every wallet that owns an
// on-chain stone stacked before the touch (one share per wallet, however many stones).
//
//   CHAIN_DEPLOYMENT=chain/deployments/baseSepolia.json COMMUNITY_KEY=0x… \
//   node tools/firmament-airdrop.mjs --amount 100 [--until <tokenId>] [--dry-run] [--rpc https://…]
//
// --until   last StoneCairn token id that counts (default: the keystone's chain id from the server's /api/stones, else all)
// --amount  CAIRN per wallet (default 100). --dry-run lists recipients and the total without sending.
// Writes out/airdrop-<timestamp>.json with every transfer hash so a crashed run can be resumed with --skip-done <file>.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { ethers } from "ethers";

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const DRY = process.argv.includes("--dry-run");
const cfg = JSON.parse(readFileSync(process.env.CHAIN_DEPLOYMENT ?? "chain/deployments/localhost.json", "utf8"));
const rpc = arg("rpc", process.env.CHAIN_RPC_URL ?? (cfg.network === "base" ? "https://mainnet.base.org" : cfg.network === "baseSepolia" ? "https://sepolia.base.org" : "http://127.0.0.1:8545"));
const provider = new ethers.JsonRpcProvider(rpc, cfg.chainId, { staticNetwork: true, cacheTimeout: -1 });
const amount = ethers.parseUnits(String(arg("amount", "100")), 18);
const until = Number(arg("until", 0)) || Infinity;
const skip = arg("skip-done") ? new Set(JSON.parse(readFileSync(arg("skip-done"), "utf8")).sent.map((s) => s.to.toLowerCase())) : new Set();

// owners of every stone up to --until, by reading Stacked events in chunks
const cairn = new ethers.Contract(cfg.stoneCairn, ["event Stacked(uint256 indexed id, address indexed owner, bytes32 wishHash, string name, uint256 height, bool free, address token, uint256 amount)"], provider);
const latest = await provider.getBlockNumber(); const owners = new Map();
for (let from = 0; from <= latest; from += 5000) {
  for (const ev of await cairn.queryFilter(cairn.filters.Stacked(), from, Math.min(latest, from + 4999))) { const id = Number(ev.args.id); if (id <= until) owners.set(ev.args.owner.toLowerCase(), (owners.get(ev.args.owner.toLowerCase()) ?? 0) + 1); }
}
const recipients = [...owners.keys()].filter((a) => !skip.has(a));
console.log(`${owners.size} wallet(s) own on-chain stones up to #${until === Infinity ? "latest" : until}; ${recipients.length} to pay · ${ethers.formatUnits(amount, 18)} CAIRN each · total ${ethers.formatUnits(amount * BigInt(recipients.length), 18)} CAIRN`);
for (const a of recipients) console.log(`  ${a}  (${owners.get(a)} stone${owners.get(a) === 1 ? "" : "s"})`);
if (DRY || !recipients.length) process.exit(0);

if (!process.env.COMMUNITY_KEY) { console.error("COMMUNITY_KEY (private key of the community allocation wallet) is required to send"); process.exit(1); }
const wallet = new ethers.Wallet(process.env.COMMUNITY_KEY, provider);
const token = new ethers.Contract(cfg.token, ["function balanceOf(address) view returns (uint256)", "function transfer(address,uint256) returns (bool)"], wallet);
const bal = await token.balanceOf(wallet.address);
if (bal < amount * BigInt(recipients.length)) { console.error(`community wallet ${wallet.address} holds ${ethers.formatUnits(bal, 18)} CAIRN, needs ${ethers.formatUnits(amount * BigInt(recipients.length), 18)}`); process.exit(1); }
mkdirSync("out", { recursive: true });
const log = { network: cfg.network, token: cfg.token, from: wallet.address, amount: amount.toString(), until: until === Infinity ? null : until, sent: [] };
const file = `out/airdrop-${Date.now()}.json`;
let nonce = await provider.getTransactionCount(wallet.address, "pending"); // explicit nonces: no stale-cache "nonce too low" on fast chains
for (const to of recipients) {
  const tx = await token.transfer(to, amount, { nonce: nonce++ }); const rc = await tx.wait();
  log.sent.push({ to, hash: rc.hash }); writeFileSync(file, JSON.stringify(log, null, 2));
  console.log(`sent → ${to}  ${rc.hash}`);
}
console.log(`done: ${log.sent.length} transfers · ${file}`);
