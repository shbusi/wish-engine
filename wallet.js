// One wallet layer for the tower page and the investor page.
//   · finds every installed wallet (EIP-6963) and falls back to window.ethereum
//   · lets the user pick when several are installed, remembers the choice
//   · switches the wallet to our chain and ADDS the chain if the wallet doesn't know it yet
//   · silent reconnect on the next visit, account / chain change events
//   · deep links that open this page inside a mobile wallet when no wallet is injected
// No build step, no external SDK: works with MetaMask, Rabby, Coinbase Wallet, Trust, OKX, Phantom (EVM) …

const found = new Map(); // rdns → { info, provider }
if (typeof window !== "undefined") {
  window.addEventListener("eip6963:announceProvider", (e) => { const d = e.detail; if (d?.info?.rdns && d.provider) found.set(d.info.rdns, d); });
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}
const KEY = "cairn_wallet";
const remember = (rdns) => { try { localStorage.setItem(KEY, rdns); } catch {} };
const remembered = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
export const forget = () => { try { localStorage.removeItem(KEY); } catch {} };

/** Installed wallets, best first. */
export function wallets() {
  const list = [...found.values()];
  if (!list.length && window.ethereum) list.push({ info: { name: window.ethereum.isMetaMask ? "MetaMask" : window.ethereum.isCoinbaseWallet ? "Coinbase Wallet" : "Browser wallet", rdns: "injected", icon: "" }, provider: window.ethereum });
  return list;
}
export const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
/** Links that open the current page inside a mobile wallet's browser. */
export function deepLinks() {
  const href = location.href, bare = href.replace(/^https?:\/\//, "");
  return [
    { name: "MetaMask", href: `https://metamask.app.link/dapp/${bare}` },
    { name: "Coinbase Wallet", href: `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(href)}` },
    { name: "Trust Wallet", href: `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(href)}` },
  ];
}
export const explorerTx = (chain, hash) => chain.explorer ? `${chain.explorer}/tx/${hash}` : null;
export const explorerAddr = (chain, addr) => chain.explorer ? `${chain.explorer}/address/${addr}` : null;

const hex = (n) => "0x" + Number(n).toString(16);
/** Make the wallet sit on our chain; add it when the wallet has never seen it. */
export async function ensureChain(provider, chain) {
  const want = hex(chain.chainId);
  const cur = await provider.request({ method: "eth_chainId" });
  if (Number(cur) === Number(chain.chainId)) return;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: want }] });
  } catch (e) {
    const unknown = e?.code === 4902 || e?.data?.originalError?.code === 4902 || /unrecognized|not added|add(ed)? (this|the) (chain|network)/i.test(e?.message ?? "");
    if (!unknown) throw Object.assign(new Error("wrong_chain"), { cause: e });
    await provider.request({ method: "wallet_addEthereumChain", params: [{
      chainId: want, chainName: chain.chainName ?? `Chain ${chain.chainId}`, rpcUrls: [chain.rpcUrl],
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, ...(chain.explorer ? { blockExplorerUrls: [chain.explorer] } : {}),
    }] });
  }
  const after = await provider.request({ method: "eth_chainId" });
  if (Number(after) !== Number(chain.chainId)) throw new Error("wrong_chain");
}

/** Small picker when more than one wallet is installed. Resolves to the chosen entry (or null if dismissed). */
function pick(list, labels) {
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.setAttribute("style", "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px;font-family:ui-sans-serif,system-ui,sans-serif");
    const box = document.createElement("div");
    box.setAttribute("style", "background:#15131f;color:#f3efe6;border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:18px;min-width:260px;max-width:92vw;display:flex;flex-direction:column;gap:8px");
    box.innerHTML = `<div style="font-weight:700;margin-bottom:4px">${labels.title}</div>`;
    for (const w of list) {
      const b = document.createElement("button");
      b.setAttribute("style", "display:flex;align-items:center;gap:10px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:inherit;border-radius:12px;padding:10px 12px;font:inherit;font-size:15px;cursor:pointer;text-align:left");
      b.innerHTML = `${w.info.icon ? `<img src="${w.info.icon}" alt="" width="24" height="24" style="border-radius:6px">` : "🪪"} <span>${w.info.name}</span>`;
      b.addEventListener("click", () => { wrap.remove(); resolve(w); });
      box.appendChild(b);
    }
    const c = document.createElement("button"); c.textContent = labels.cancel;
    c.setAttribute("style", "background:none;border:0;color:#b4ad9f;font:inherit;cursor:pointer;margin-top:4px"); c.addEventListener("click", () => { wrap.remove(); resolve(null); });
    box.appendChild(c); wrap.appendChild(box); document.body.appendChild(wrap);
    wrap.addEventListener("click", (e) => { if (e.target === wrap) { wrap.remove(); resolve(null); } });
  });
}

/**
 * Connect: choose a wallet, request accounts, land on our chain.
 * Throws Error("no_wallet" | "rejected" | "wrong_chain" | "cancelled").
 * Returns { provider (EIP-1193), address, info }.
 */
export async function connect(chain, labels = { title: "Choose a wallet", cancel: "Cancel" }) {
  const list = wallets();
  if (!list.length) throw new Error("no_wallet");
  let w = list.length === 1 ? list[0] : list.find((x) => x.info.rdns === remembered()) ?? (await pick(list, labels));
  if (!w) throw new Error("cancelled");
  let accounts;
  try { accounts = await w.provider.request({ method: "eth_requestAccounts" }); }
  catch (e) { throw Object.assign(new Error(e?.code === 4001 || /rejected|denied/i.test(e?.message ?? "") ? "rejected" : "failed"), { cause: e }); }
  if (!accounts?.length) throw new Error("rejected");
  await ensureChain(w.provider, chain);
  remember(w.info.rdns);
  return { provider: w.provider, address: accounts[0], info: w.info };
}

/** Reconnect without a prompt if the user connected before and the wallet still exposes an account on our chain. */
export async function silent(chain) {
  const list = wallets();
  const w = list.find((x) => x.info.rdns === remembered()) ?? (list.length === 1 && remembered() ? list[0] : null);
  if (!w) return null;
  try {
    const accounts = await w.provider.request({ method: "eth_accounts" });
    if (!accounts?.length) return null;
    const cur = await w.provider.request({ method: "eth_chainId" });
    if (Number(cur) !== Number(chain.chainId)) return null; // never switch chains behind the user's back
    return { provider: w.provider, address: accounts[0], info: w.info };
  } catch { return null; }
}

/** Fire cb({ accounts, chainId }) when the user switches account or network in the wallet. */
export function onChange(provider, cb) {
  if (!provider?.on) return () => {};
  const a = (accounts) => cb({ accounts }), c = (chainId) => cb({ chainId: Number(chainId) });
  provider.on("accountsChanged", a); provider.on("chainChanged", c);
  return () => { provider.removeListener?.("accountsChanged", a); provider.removeListener?.("chainChanged", c); };
}
export const short = (a) => a.slice(0, 6) + "…" + a.slice(-4);
