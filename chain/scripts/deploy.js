/**
 * Deploy the Wish Cairn on-chain layer.
 *
 *   DEPLOYER_KEY=0x… TREASURY=0x… TEAM=0x… COMMUNITY=0x… LIQUIDITY=0x… VOUCHER_SIGNER=0x… \
 *   SALE_START=2026-12-01T00:00:00Z SALE_DAYS=14 \
 *   npx hardhat run scripts/deploy.js --network baseSepolia   # or --network base
 *
 * On Base mainnet USDC is 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913; on Base Sepolia a MockUSDC is deployed
 * unless USDC is set. Prints every address and writes chain/deployments/<network>.json for the app and indexer.
 */
const { ethers, network } = require("hardhat");
const fs = require("node:fs");

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const env = (k, d) => process.env[k] ?? d;

async function main() {
  const [deployer] = await ethers.getSigners();
  const treasury = env("TREASURY", deployer.address);
  const team = env("TEAM", deployer.address);
  const community = env("COMMUNITY", deployer.address);
  const liquidity = env("LIQUIDITY", deployer.address);
  const buyback = env("BUYBACK", treasury);
  const signer = env("VOUCHER_SIGNER", deployer.address);
  const stonePrice = BigInt(env("STONE_PRICE_USDC", "100000")); // $0.10
  const tokenPrice = BigInt(env("TOKEN_PRICE_USDC", "20000"));  // $0.02
  const softCap = BigInt(env("SOFT_CAP_USDC", String(250_000e6)));
  const hardCap = BigInt(env("HARD_CAP_USDC", String(2_000_000e6)));
  const maxPerWallet = BigInt(env("MAX_PER_WALLET_USDC", String(25_000e6)));
  const start = Math.floor(new Date(env("SALE_START", new Date(Date.now() + 86_400_000).toISOString())).getTime() / 1000);
  const end = start + Number(env("SALE_DAYS", 14)) * 86400;
  console.log(`network ${network.name} · deployer ${deployer.address}`);

  let usdc = env("USDC", network.name === "base" ? USDC_BASE : "");
  if (!usdc) { const m = await ethers.deployContract("MockUSDC"); await m.waitForDeployment(); usdc = await m.getAddress(); console.log("MockUSDC", usdc); }

  // Team vesting: linear over 24 months starting now.
  const vest = await ethers.deployContract("VestingWallet", [team, Math.floor(Date.now() / 1000), 730 * 86400]);
  await vest.waitForDeployment();
  console.log("VestingWallet (team)", await vest.getAddress());

  // Token: the sale allocation is minted to the deployer, then moved into the sale contract.
  const token = await ethers.deployContract("CairnToken", [community, deployer.address, await vest.getAddress(), treasury, liquidity]);
  await token.waitForDeployment();
  console.log("CairnToken", await token.getAddress());

  const sale = await ethers.deployContract("CairnSale", [await token.getAddress(), usdc, tokenPrice, softCap, hardCap, maxPerWallet, start, end, treasury, deployer.address]);
  await sale.waitForDeployment();
  const saleAlloc = (await token.TOTAL_SUPPLY()) * 2500n / 10000n;
  await (await token.transfer(await sale.getAddress(), saleAlloc)).wait();
  console.log("CairnSale", await sale.getAddress(), `· ${ethers.formatUnits(saleAlloc, 18)} CAIRN at $${Number(tokenPrice) / 1e6}`);

  const cairn = await ethers.deployContract("StoneCairn", [usdc, stonePrice, treasury, buyback, signer, deployer.address]);
  await cairn.waitForDeployment();
  console.log("StoneCairn", await cairn.getAddress());

  const out = { network: network.name, chainId: Number((await ethers.provider.getNetwork()).chainId), usdc, token: await token.getAddress(), sale: await sale.getAddress(), stoneCairn: await cairn.getAddress(), vesting: await vest.getAddress(), treasury, buyback, voucherSigner: signer, stonePrice: stonePrice.toString(), tokenPrice: tokenPrice.toString(), saleStart: start, saleEnd: end, deployedAt: new Date().toISOString() };
  fs.mkdirSync("deployments", { recursive: true });
  fs.writeFileSync(`deployments/${network.name}.json`, JSON.stringify(out, null, 2));
  console.log("wrote", `deployments/${network.name}.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
