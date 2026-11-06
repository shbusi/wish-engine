// Server-side bridge to the StoneCairn contract: config, free-stone voucher signing, event indexer.
// Enabled when CHAIN_DEPLOYMENT points at a chain/deployments/<network>.json and VOUCHER_SIGNER_KEY is set.
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { ethers } from "ethers";

let cfg = null;
try { if (process.env.CHAIN_DEPLOYMENT) cfg = JSON.parse(readFileSync(process.env.CHAIN_DEPLOYMENT, "utf8")); } catch (e) { console.error("chain config unreadable:", e.message); }
if (cfg) cfg.rpcUrl = process.env.CHAIN_RPC_URL ?? (cfg.network === "base" ? "https://mainnet.base.org" : cfg.network === "baseSepolia" ? "https://sepolia.base.org" : "http://127.0.0.1:8545");

export const ABI = [
  "event Stacked(uint256 indexed id, address indexed owner, bytes32 wishHash, string name, uint256 height, bool free)",
  "function stack(bytes32 wishHash, string name) returns (uint256)",
  "function stackFree(bytes32 wishHash, string name, uint256 nonce, uint256 expires, bytes signature) returns (uint256)",
  "function price() view returns (uint256)",
  "function height() view returns (uint256)",
  "function usdc() view returns (address)",
];
export const ERC20_ABI = ["function approve(address,uint256) returns (bool)", "function allowance(address,address) view returns (uint256)", "function balanceOf(address) view returns (uint256)"];

export const chain = () => cfg;
/** What the page needs: addresses, chain id, rpc, price. Never the signer key. */
export function chainPublic() {
  if (!cfg) return null;
  return { network: cfg.network, chainId: cfg.chainId, rpcUrl: cfg.rpcUrl, stoneCairn: cfg.stoneCairn, usdc: cfg.usdc, token: cfg.token, sale: cfg.sale, stonePrice: cfg.stonePrice, abi: ABI, erc20Abi: ERC20_ABI };
}

/** keccak256(wish|salt): the chain sees the hash, the server keeps the text. */
export function preparePending(wish) {
  const salt = randomBytes(16).toString("hex");
  return { wishHash: ethers.keccak256(ethers.toUtf8Bytes(`${wish}|${salt}`)), salt };
}

const signer = process.env.VOUCHER_SIGNER_KEY ? new ethers.Wallet(process.env.VOUCHER_SIGNER_KEY) : null;
export const voucherSignerAddress = () => signer?.address ?? null;
/** EIP-712 voucher the contract's stackFree() accepts. One per (to, nonce). */
export async function signVoucher(to, ttlSec = 15 * 60) {
  if (!cfg || !signer) throw new Error("voucher signer not configured");
  const nonce = BigInt("0x" + randomBytes(16).toString("hex"));
  const expires = Math.floor(Date.now() / 1000) + ttlSec;
  const domain = { name: "WishCairn", version: "1", chainId: cfg.chainId, verifyingContract: cfg.stoneCairn };
  const types = { Voucher: [{ name: "to", type: "address" }, { name: "nonce", type: "uint256" }, { name: "expires", type: "uint256" }] };
  const signature = await signer.signTypedData(domain, types, { to, nonce, expires });
  return { nonce: nonce.toString(), expires, signature };
}

/** Poll Stacked events and hand each new stone to the app. Cheap: one eth_getLogs per interval. */
export function startIndexer({ onStacked, fromTokenId = 1, intervalMs = Number(process.env.CHAIN_POLL_MS ?? 6000) }) {
  if (!cfg) return null;
  const provider = new ethers.JsonRpcProvider(cfg.rpcUrl, cfg.chainId, { staticNetwork: true });
  const contract = new ethers.Contract(cfg.stoneCairn, ABI, provider);
  let lastBlock = Number(process.env.CHAIN_FROM_BLOCK ?? 0), busy = false;
  const tick = async () => {
    if (busy) return; busy = true;
    try {
      const head = await provider.getBlockNumber();
      if (head < lastBlock) return;
      const from = lastBlock, to = Math.min(head, from + 2000); // chunked so public RPCs accept it
      const logs = await contract.queryFilter(contract.filters.Stacked(), from, to);
      for (const ev of logs) {
        const id = Number(ev.args.id);
        if (id < fromTokenId) continue;
        const block = await ev.getBlock();
        onStacked({ tokenId: id, owner: ev.args.owner, wishHash: ev.args.wishHash, name: ev.args.name, free: ev.args.free, at: block.timestamp * 1000 });
      }
      lastBlock = to + 1;
    } catch (e) { console.error("indexer:", e.message?.slice(0, 160)); }
    finally { busy = false; }
  };
  tick();
  const h = setInterval(tick, intervalMs); h.unref();
  return () => clearInterval(h);
}
