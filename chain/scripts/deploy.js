/**
 * Deploy the Wish Cairn on-chain layer.
 *
 *   DEPLOYER_KEY=0x… TREASURY=0x… TEAM=0x… COMMUNITY=0x… LIQUIDITY=0x… VOUCHER_SIGNER=0x… \
 *   SALE_START=2026-12-01T00:00:00Z SALE_DAYS=14 STABLES='[{"symbol":"USDC","address":"0x…","decimals":6,"price":"100000"}]' \
 *   npx hardhat run scripts/deploy.js --network base
 *
 * Stablecoins: STABLES is a JSON list of { symbol, address, decimals, price } where price is the stone price in that
 * token's units. On Base mainnet the defaults are USDC and EURC; on test networks mock USDC / EURC / JPYC / BRZ are
 * deployed. The first entry is the default token. Prints every address and writes chain/deployments/<network>.json.
 */
const { ethers, network } = require("hardhat");
const fs = require("node:fs");

const env = (k, d) => { const v = (process.env[k] ?? "").trim(); return v && v !== "0x..." ? v : d; }; // blank or placeholder → default
const BASE_STABLES = [
  { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6, price: "100000" },   // $0.10
  { symbol: "EURC", address: "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42", decimals: 6, price: "92000" },    // €0.092
];
const TEST_STABLES = [
  { symbol: "USDC", decimals: 6, price: "100000" },
  { symbol: "EURC", decimals: 6, price: "92000" },
  { symbol: "JPYC", decimals: 18, price: ethers.parseUnits("15", 18).toString() },
  { symbol: "BRZ", decimals: 18, price: ethers.parseUnits("0.55", 18).toString() },
];

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No deployer account: set DEPLOYER_KEY (private key of the deployer wallet) in chain/.env");
  const treasury = env("TREASURY", deployer.address);
  const team = env("TEAM", deployer.address);
  const community = env("COMMUNITY", deployer.address);
  const liquidity = env("LIQUIDITY", deployer.address);
  const signer = env("VOUCHER_SIGNER", deployer.address);
  const revenueBps = Number(env("REVENUE_BPS", 5000)); // share of every stone that goes to stakers
  const donation = env("DONATION", null), donationBps = donation ? Number(env("DONATION_BPS", 1000)) : 0; // pledged share of every stone to a charity wallet
  const tokenPrice = BigInt(env("TOKEN_PRICE_USDC", "20000"));  // $0.02
  const softCap = BigInt(env("SOFT_CAP_USDC", String(250_000e6)));
  const hardCap = BigInt(env("HARD_CAP_USDC", String(2_000_000e6)));
  const maxPerWallet = BigInt(env("MAX_PER_WALLET_USDC", String(25_000e6)));
  const start = Math.floor(new Date(env("SALE_START", new Date(Date.now() + 86_400_000).toISOString())).getTime() / 1000);
  const end = start + Number(env("SALE_DAYS", 14)) * 86400;
  const tokenName = env("TOKEN_NAME", "Dol"), tokenSymbol = env("TOKEN_SYMBOL", "DOL"); // placeholder until the real name is chosen
  // STAGE=stones  → only StoneCairn, 100% of revenue to the treasury (run the product for real before the token exists)
  // STAGE=token   → token + vesting + RevenueShare + sale, then route REVENUE_BPS of the existing StoneCairn to stakers
  // STAGE=all     → everything at once (default; what the testnet rehearsal does)
  const stage = env("STAGE", "all");
  const prevFile = `deployments/${network.name}.json`, prev = fs.existsSync(prevFile) ? JSON.parse(fs.readFileSync(prevFile, "utf8")) : null;
  console.log(`network ${network.name} · deployer ${deployer.address} · stage ${stage}`);

  // Stablecoins
  let stables = process.env.STABLES ? JSON.parse(process.env.STABLES) : stage === "token" && prev?.stables ? prev.stables : network.name === "base" ? BASE_STABLES : TEST_STABLES;
  for (const s of stables) {
    if (!s.address) { const m = await ethers.deployContract("MockStable", [`${s.symbol} (mock)`, s.symbol, s.decimals]); await m.waitForDeployment(); s.address = await m.getAddress(); s.mock = true; console.log(`Mock ${s.symbol}`, s.address); }
  }
  const usdc = stables[0];

  let vest = null, token = null, share = null, sale = null, cairn = null;
  if (stage !== "stones") {
    vest = await ethers.deployContract("VestingWallet", [team, Math.floor(Date.now() / 1000), 730 * 86400]);
    await vest.waitForDeployment();
    console.log("VestingWallet (team)", await vest.getAddress());

    token = await ethers.deployContract("CairnToken", [tokenName, tokenSymbol, community, deployer.address, await vest.getAddress(), treasury, liquidity]);
    await token.waitForDeployment();
    console.log(`Token ${tokenName} (${tokenSymbol})`, await token.getAddress());

    share = await ethers.deployContract("RevenueShare", [await token.getAddress(), deployer.address]);
    await share.waitForDeployment();
    console.log("RevenueShare", await share.getAddress());

    sale = await ethers.deployContract("CairnSale", [await token.getAddress(), usdc.address, tokenPrice, softCap, hardCap, maxPerWallet, start, end, treasury, deployer.address]);
    await sale.waitForDeployment();
    const saleAlloc = (await token.TOTAL_SUPPLY()) * 2500n / 10000n;
    await (await token.transfer(await sale.getAddress(), saleAlloc)).wait();
    console.log("Sale", await sale.getAddress(), `· ${ethers.formatUnits(saleAlloc, 18)} ${tokenSymbol} at $${Number(tokenPrice) / 1e6}`);
  }

  if (stage === "token" && prev?.stoneCairn) {
    // the stones are already live: point their revenue split at the new RevenueShare
    cairn = await ethers.getContractAt("StoneCairn", prev.stoneCairn);
    await (await cairn.setSplit(treasury, await share.getAddress(), revenueBps)).wait();
    await (await share.setNotifier(prev.stoneCairn, true)).wait();
    console.log("StoneCairn", prev.stoneCairn, `· split updated: ${revenueBps / 100}% to stakers`);
  } else {
    const bps = stage === "stones" ? 0 : revenueBps, sink = stage === "stones" ? ethers.ZeroAddress : await share.getAddress();
    cairn = await ethers.deployContract("StoneCairn", [usdc.address, BigInt(usdc.price), treasury, sink, bps, signer, deployer.address]);
    await cairn.waitForDeployment();
    for (const s of stables.slice(1)) await (await cairn.setPrice(s.address, BigInt(s.price))).wait();
    if (share) await (await share.setNotifier(await cairn.getAddress(), true)).wait();
    console.log("StoneCairn", await cairn.getAddress(), `· ${stables.map((s) => s.symbol).join(", ")} · ${bps / 100}% to stakers${bps ? "" : " (all revenue to the treasury until the token stage)"}`);
  }
  if (donation && stage !== "token") { await (await cairn.setCharity(donation, donationBps)).wait(); console.log(`donation pledge: ${donationBps / 100}% of every stone → ${donation}`); }
  else if (donation && stage === "token" && prev?.donation !== donation) { await (await cairn.setCharity(donation, donationBps)).wait(); console.log(`donation pledge updated: ${donationBps / 100}% → ${donation}`); }
  const addr = async (c) => (c ? await c.getAddress() : null);

  const out = {
    network: network.name, chainId: Number((await ethers.provider.getNetwork()).chainId),
    stables: stables.map(({ symbol, address, decimals, price, mock }) => ({ symbol, address, decimals, price, mock: !!mock })),
    usdc: usdc.address, token: await addr(token), sale: await addr(sale), stoneCairn: await addr(cairn), revenueShare: await addr(share), vesting: await addr(vest),
    tokenName: token ? tokenName : null, tokenSymbol: token ? tokenSymbol : "DOL", stage: stage === "stones" ? "stones" : "all",
    treasury, donation: donation ?? prev?.donation ?? null, donationBps: donation ? donationBps : prev?.donationBps ?? 0, revenueBps: stage === "stones" ? 0 : revenueBps, voucherSigner: stage === "token" && prev ? prev.voucherSigner : signer, stonePrice: usdc.price, tokenPrice: tokenPrice.toString(), saleStart: start, saleEnd: end, deployedAt: new Date().toISOString(),
  };
  fs.mkdirSync("deployments", { recursive: true });
  fs.writeFileSync(`deployments/${network.name}.json`, JSON.stringify(out, null, 2));
  console.log("wrote", `deployments/${network.name}.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
