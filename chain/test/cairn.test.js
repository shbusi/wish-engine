const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const USDC = (n) => ethers.parseUnits(String(n), 6);
const CAIRN = (n) => ethers.parseUnits(String(n), 18);

describe("CairnToken", () => {
  it("mints the whole supply to the five allocations and nothing else", async () => {
    const [community, sale, team, treasury, liquidity] = await ethers.getSigners();
    const token = await ethers.deployContract("CairnToken", ["Dol", "DOL", community.address, sale.address, team.address, treasury.address, liquidity.address]);
    const total = await token.TOTAL_SUPPLY();
    expect(await token.totalSupply()).to.equal(total);
    expect(await token.balanceOf(community.address)).to.equal(total * 4000n / 10000n);
    expect(await token.balanceOf(sale.address)).to.equal(total * 2500n / 10000n);
    expect(await token.balanceOf(team.address)).to.equal(total * 1500n / 10000n);
    expect(await token.balanceOf(treasury.address)).to.equal(total * 1500n / 10000n);
    expect(await token.balanceOf(liquidity.address)).to.equal(total * 500n / 10000n);
    expect(token.mint).to.equal(undefined, "no mint function");
  });
});

describe("StoneCairn + RevenueShare", () => {
  let usdc, eurc, jpyc, token, share, cairn, owner, signer, treasury, alice, bob, carol;
  const PRICE_USDC = USDC("0.10");
  const PRICE_EURC = ethers.parseUnits("0.09", 6);
  const PRICE_JPYC = ethers.parseUnits("15", 18);
  beforeEach(async () => {
    [owner, signer, treasury, alice, bob, carol] = await ethers.getSigners();
    usdc = await ethers.deployContract("MockStable", ["USD Coin", "USDC", 6]);
    eurc = await ethers.deployContract("MockStable", ["Euro Coin", "EURC", 6]);
    jpyc = await ethers.deployContract("MockStable", ["JPY Coin", "JPYC", 18]);
    token = await ethers.deployContract("CairnToken", ["Dol", "DOL", owner.address, owner.address, owner.address, treasury.address, owner.address]);
    share = await ethers.deployContract("RevenueShare", [await token.getAddress(), owner.address]);
    cairn = await ethers.deployContract("StoneCairn", [await usdc.getAddress(), PRICE_USDC, treasury.address, await share.getAddress(), 5000, signer.address, owner.address]);
    await share.setNotifier(await cairn.getAddress(), true);
    await cairn.setPrice(await eurc.getAddress(), PRICE_EURC);
    await cairn.setPrice(await jpyc.getAddress(), PRICE_JPYC);
    for (const who of [alice, bob]) {
      for (const t of [usdc, eurc, jpyc]) { await t.mint(who.address, ethers.parseUnits("1000", await t.decimals())); await t.connect(who).approve(await cairn.getAddress(), ethers.MaxUint256); }
    }
  });

  it("a paid stone splits the stablecoin between treasury and stakers, mints the NFT, raises the height", async () => {
    const hash = ethers.keccak256(ethers.toUtf8Bytes("엄마 건강|salt"));
    await expect(cairn.connect(alice).stack(hash, "민준")).to.emit(cairn, "Stacked").withArgs(1n, alice.address, hash, "민준", 1n, false, await usdc.getAddress(), PRICE_USDC);
    expect(await cairn.ownerOf(1)).to.equal(alice.address);
    expect(await cairn.height()).to.equal(1n);
    expect(await usdc.balanceOf(treasury.address)).to.equal(USDC("0.05"));
    expect(await usdc.balanceOf(await share.getAddress())).to.equal(USDC("0.05"));
    expect(await share.carried(await usdc.getAddress())).to.equal(USDC("0.05"), "nobody staked yet → carried");
    const s = await cairn.stones(1);
    expect(s.wishHash).to.equal(hash);
    expect(s.token).to.equal(await usdc.getAddress());
  });

  it("accepts several stablecoins at their own prices and rejects unknown ones", async () => {
    await cairn.connect(alice).stackWith(await eurc.getAddress(), ethers.ZeroHash, "Lucía");
    await cairn.connect(bob).stackWith(await jpyc.getAddress(), ethers.ZeroHash, "Yuki");
    expect(await eurc.balanceOf(treasury.address)).to.equal(ethers.parseUnits("0.045", 6));
    expect(await jpyc.balanceOf(treasury.address)).to.equal(ethers.parseUnits("7.5", 18));
    expect(await cairn.acceptedTokenCount()).to.equal(3n);
    const other = await ethers.deployContract("MockStable", ["X", "X", 18]);
    await expect(cairn.connect(alice).stackWith(await other.getAddress(), ethers.ZeroHash, "x")).to.be.revertedWith("token not accepted");
    await cairn.setPrice(await eurc.getAddress(), 0); // delist
    await expect(cairn.connect(alice).stackWith(await eurc.getAddress(), ethers.ZeroHash, "x")).to.be.revertedWith("token not accepted");
    await cairn.setDefaultToken(await jpyc.getAddress());
    await cairn.connect(alice).stack(ethers.ZeroHash, "default is JPYC now");
    expect((await cairn.stones(3)).token).to.equal(await jpyc.getAddress());
  });

  it("rejects a name over 32 bytes and a buyer without funds", async () => {
    await expect(cairn.connect(alice).stack(ethers.ZeroHash, "x".repeat(33))).to.be.revertedWith("name too long");
    await expect(cairn.connect(carol).stack(ethers.ZeroHash, "carol")).to.be.reverted;
  });

  async function voucher(to, nonce, expires, who = signer) {
    const domain = { name: "WishCairn", version: "1", chainId: (await ethers.provider.getNetwork()).chainId, verifyingContract: await cairn.getAddress() };
    const types = { Voucher: [{ name: "to", type: "address" }, { name: "nonce", type: "uint256" }, { name: "expires", type: "uint256" }] };
    return who.signTypedData(domain, types, { to, nonce, expires });
  }

  it("a free stone needs a valid, unexpired, unused voucher from the signer", async () => {
    const hash = ethers.keccak256(ethers.toUtf8Bytes("free"));
    const expires = (await time.latest()) + 3600;
    const sig = await voucher(carol.address, 1, expires);
    await expect(cairn.connect(carol).stackFree(hash, "", 1, expires, sig)).to.emit(cairn, "Stacked").withArgs(1n, carol.address, hash, "", 1n, true, ethers.ZeroAddress, 0n);
    expect(await usdc.balanceOf(treasury.address)).to.equal(0n);
    await expect(cairn.connect(carol).stackFree(hash, "", 1, expires, sig)).to.be.revertedWith("voucher used");
    await expect(cairn.connect(alice).stackFree(hash, "", 1, expires, sig)).to.be.revertedWith("bad voucher");
    const bad = await voucher(carol.address, 2, expires, alice);
    await expect(cairn.connect(carol).stackFree(hash, "", 2, expires, bad)).to.be.revertedWith("bad voucher");
    const old = await voucher(carol.address, 3, expires);
    await time.increase(3601);
    await expect(cairn.connect(carol).stackFree(hash, "", 3, expires, old)).to.be.revertedWith("voucher expired");
  });

  it("owner-only admin; split can route everything to the treasury", async () => {
    await expect(cairn.connect(alice).setPrice(await usdc.getAddress(), 1)).to.be.revertedWithCustomError(cairn, "OwnableUnauthorizedAccount");
    await cairn.setSplit(treasury.address, ethers.ZeroAddress, 0);
    await cairn.connect(alice).stack(ethers.ZeroHash, "a");
    expect(await usdc.balanceOf(treasury.address)).to.equal(PRICE_USDC);
    await expect(cairn.setSplit(treasury.address, ethers.ZeroAddress, 1)).to.be.revertedWith("no sink");
    await cairn.setBaseURI("https://wishcairn.app/api/stone/");
    expect(await cairn.tokenURI(1)).to.equal("https://wishcairn.app/api/stone/1");
  });

  it("revenue flows to stakers pro-rata, in each stablecoin, across stake changes", async () => {
    // alice stakes 300, bob stakes 100 → 75% / 25%
    await token.transfer(alice.address, CAIRN(300)); await token.transfer(bob.address, CAIRN(100));
    await token.connect(alice).approve(await share.getAddress(), CAIRN(300)); await token.connect(bob).approve(await share.getAddress(), CAIRN(100));
    // revenue before anyone stakes is carried, not lost
    await cairn.connect(alice).stack(ethers.ZeroHash, "early"); // 0.05 USDC carried
    await share.connect(alice).stake(CAIRN(300));
    await share.connect(bob).stake(CAIRN(100));
    // 4 USDC stones + 2 JPYC stones
    for (let i = 0; i < 4; i++) await cairn.connect(bob).stack(ethers.ZeroHash, "u");
    for (let i = 0; i < 2; i++) await cairn.connect(bob).stackWith(await jpyc.getAddress(), ethers.ZeroHash, "j");
    // stakers' pool: USDC 0.05 (carried) + 4×0.05 = 0.25 ; JPYC 2×7.5 = 15
    const [tokens, amountsA] = await share.claimable(alice.address);
    expect(tokens).to.deep.equal([await usdc.getAddress(), await jpyc.getAddress()]);
    expect(amountsA[0]).to.equal(USDC("0.1875"));
    expect(amountsA[1]).to.equal(ethers.parseUnits("11.25", 18));
    const [, amountsB] = await share.claimable(bob.address);
    expect(amountsB[0]).to.equal(USDC("0.0625"));

    // bob unstakes half, more revenue arrives → bob's share drops to 1/7
    await share.connect(bob).unstake(CAIRN(50));
    expect(await token.balanceOf(bob.address)).to.equal(CAIRN(50));
    await cairn.connect(alice).stack(ethers.ZeroHash, "later"); // +0.05 USDC: alice 300/350, bob 50/350
    const [, a2] = await share.claimable(alice.address); const [, b2] = await share.claimable(bob.address);
    expect(a2[0]).to.be.closeTo(USDC("0.1875") + USDC("0.05") * 300n / 350n, 2n);
    expect(b2[0]).to.be.closeTo(USDC("0.0625") + USDC("0.05") * 50n / 350n, 2n);

    // claim pays every token at once; a second claim pays nothing
    const u0 = await usdc.balanceOf(alice.address), j0 = await jpyc.balanceOf(alice.address);
    await share.connect(alice).claim();
    expect((await usdc.balanceOf(alice.address)) - u0).to.be.closeTo(a2[0], 2n);
    expect((await jpyc.balanceOf(alice.address)) - j0).to.equal(ethers.parseUnits("11.25", 18));
    await share.connect(alice).claim();
    expect(await usdc.balanceOf(alice.address)).to.be.closeTo(u0 + a2[0], 2n);
    expect(await share.distributed(await usdc.getAddress())).to.equal(USDC("0.30"));
  });

  it("the operator can deposit off-chain revenue for stakers; strangers cannot notify", async () => {
    await token.transfer(alice.address, CAIRN(100)); await token.connect(alice).approve(await share.getAddress(), CAIRN(100));
    await share.connect(alice).stake(CAIRN(100));
    await usdc.mint(owner.address, USDC(500)); await usdc.approve(await share.getAddress(), USDC(500));
    await expect(share.deposit(await usdc.getAddress(), USDC(500))).to.emit(share, "Revenue").withArgs(await usdc.getAddress(), USDC(500), owner.address);
    const [, amounts] = await share.claimable(alice.address);
    expect(amounts[0]).to.equal(USDC(500));
    await expect(share.connect(bob).notify(await usdc.getAddress(), 1)).to.be.revertedWith("not a notifier");
    await expect(share.connect(alice).stake(0)).to.be.revertedWith("zero");
  });
});

describe("CairnSale", () => {
  let usdc, token, sale, owner, treasury, alice, bob, start, end;
  const PRICE = USDC("0.02"); // $0.02 per CAIRN
  const SOFT = USDC(1000), HARD = USDC(5000), MAX = USDC(3000);
  beforeEach(async () => {
    [owner, treasury, alice, bob] = await ethers.getSigners();
    usdc = await ethers.deployContract("MockStable", ["USD Coin", "USDC", 6]);
    token = await ethers.deployContract("CairnToken", ["Dol", "DOL", owner.address, owner.address, owner.address, treasury.address, owner.address]);
    start = (await time.latest()) + 100; end = start + 86400;
    sale = await ethers.deployContract("CairnSale", [await token.getAddress(), await usdc.getAddress(), PRICE, SOFT, HARD, MAX, start, end, treasury.address, owner.address]);
    await token.transfer(await sale.getAddress(), CAIRN(250_000_000));
    for (const who of [alice, bob]) { await usdc.mint(who.address, USDC(10_000)); await usdc.connect(who).approve(await sale.getAddress(), USDC(10_000)); }
  });

  it("is closed before start and after end", async () => {
    await expect(sale.connect(alice).buy(USDC(100))).to.be.revertedWith("sale closed");
    await time.increaseTo(end + 1);
    await expect(sale.connect(alice).buy(USDC(100))).to.be.revertedWith("sale closed");
  });

  it("success path: buy within caps, finalize sends USDC to treasury, buyers claim tokens", async () => {
    await time.increaseTo(start);
    await expect(sale.connect(alice).buy(USDC(1000))).to.emit(sale, "Bought").withArgs(alice.address, USDC(1000), CAIRN(50_000));
    await expect(sale.connect(alice).buy(USDC(2500))).to.be.revertedWith("over wallet cap");
    await sale.connect(bob).buy(USDC(500));
    await expect(sale.finalize()).to.be.revertedWith("still open");
    await time.increaseTo(end);
    await expect(sale.finalize()).to.emit(sale, "Finalized").withArgs(true, USDC(1500));
    expect(await usdc.balanceOf(treasury.address)).to.equal(USDC(1500));
    await sale.connect(alice).claim();
    expect(await token.balanceOf(alice.address)).to.equal(CAIRN(50_000));
    await expect(sale.connect(alice).claim()).to.be.revertedWith("nothing owed");
    const before = await token.balanceOf(owner.address);
    await sale.sweepUnsold(owner.address);
    expect((await token.balanceOf(owner.address)) - before).to.equal(CAIRN(250_000_000) - CAIRN(75_000));
    await sale.connect(bob).claim();
    expect(await token.balanceOf(bob.address)).to.equal(CAIRN(25_000));
  });

  it("refund path: soft cap missed → everyone gets their USDC back, no tokens leave", async () => {
    await time.increaseTo(start);
    await sale.connect(alice).buy(USDC(300));
    await time.increaseTo(end);
    await expect(sale.finalize()).to.emit(sale, "Finalized").withArgs(false, USDC(300));
    expect(await usdc.balanceOf(treasury.address)).to.equal(0n);
    await expect(sale.connect(alice).claim()).to.be.revertedWith("not claimable");
    const before = await usdc.balanceOf(alice.address);
    await sale.connect(alice).refund();
    expect((await usdc.balanceOf(alice.address)) - before).to.equal(USDC(300));
    await sale.sweepUnsold(owner.address);
    expect(await token.balanceOf(await sale.getAddress())).to.equal(0n);
  });

  it("hard cap closes the sale early and lets anyone finalize", async () => {
    await time.increaseTo(start);
    await sale.connect(alice).buy(USDC(3000));
    await sale.connect(bob).buy(USDC(2000));
    expect(await sale.isOpen()).to.equal(false);
    await sale.connect(bob).finalize();
    expect(await usdc.balanceOf(treasury.address)).to.equal(USDC(5000));
  });
});

describe("Team vesting (OpenZeppelin VestingWallet)", () => {
  it("releases linearly over the duration", async () => {
    const [owner, team] = await ethers.getSigners();
    const start = (await time.latest()) + 10, duration = 730 * 86400;
    const vest = await ethers.deployContract("VestingWallet", [team.address, start, duration]);
    const token = await ethers.deployContract("CairnToken", ["Dol", "DOL", owner.address, owner.address, await vest.getAddress(), owner.address, owner.address]);
    const total = CAIRN(150_000_000);
    await time.increaseTo(start + duration / 2);
    await vest["release(address)"](await token.getAddress());
    expect(await token.balanceOf(team.address)).to.be.closeTo(total / 2n, CAIRN(1000));
    await time.increaseTo(start + duration + 1);
    await vest["release(address)"](await token.getAddress());
    expect(await token.balanceOf(team.address)).to.equal(total);
  });
});

describe("Two-stage launch: stones first, token later", function () {
  it("runs with all revenue to the treasury, then setSplit routes a share to a new RevenueShare", async function () {
    const [owner, treasury, signer, user] = await ethers.getSigners();
    const usdc = await ethers.deployContract("MockStable", ["USDC", "USDC", 6]);
    const cairn = await ethers.deployContract("StoneCairn", [await usdc.getAddress(), 100000n, treasury.address, ethers.ZeroAddress, 5000, signer.address, owner.address]);
    expect(await cairn.revenueBps()).to.equal(0); // no sink → no split, whatever bps was asked
    await usdc.mint(user.address, 1_000_000n); await usdc.connect(user).approve(await cairn.getAddress(), ethers.MaxUint256);
    await cairn.connect(user).stackWith(await usdc.getAddress(), ethers.ZeroHash, "first");
    expect(await usdc.balanceOf(treasury.address)).to.equal(100000n);
    // later: the token and the revenue share exist; route half of every stone to stakers
    const token = await ethers.deployContract("CairnToken", ["Dol", "DOL", owner.address, owner.address, owner.address, treasury.address, owner.address]);
    const share = await ethers.deployContract("RevenueShare", [await token.getAddress(), owner.address]);
    await cairn.setSplit(treasury.address, await share.getAddress(), 5000); await share.setNotifier(await cairn.getAddress(), true);
    await cairn.connect(user).stackWith(await usdc.getAddress(), ethers.ZeroHash, "second");
    expect(await usdc.balanceOf(treasury.address)).to.equal(150000n);
    expect(await usdc.balanceOf(await share.getAddress())).to.equal(50000n);
    expect(await token.name()).to.equal("Dol"); expect(await token.symbol()).to.equal("DOL");
  });
});
