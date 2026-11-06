const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const USDC = (n) => ethers.parseUnits(String(n), 6);
const CAIRN = (n) => ethers.parseUnits(String(n), 18);

describe("CairnToken", () => {
  it("mints the whole supply to the five allocations and nothing else", async () => {
    const [community, sale, team, treasury, liquidity] = await ethers.getSigners();
    const token = await ethers.deployContract("CairnToken", [community.address, sale.address, team.address, treasury.address, liquidity.address]);
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

describe("StoneCairn", () => {
  let usdc, cairn, owner, signer, treasury, buyback, alice, bob;
  const PRICE = USDC("0.10");
  beforeEach(async () => {
    [owner, signer, treasury, buyback, alice, bob] = await ethers.getSigners();
    usdc = await ethers.deployContract("MockUSDC");
    cairn = await ethers.deployContract("StoneCairn", [await usdc.getAddress(), PRICE, treasury.address, buyback.address, signer.address, owner.address]);
    await usdc.mint(alice.address, USDC(10));
    await usdc.connect(alice).approve(await cairn.getAddress(), USDC(10));
  });

  it("a paid stone splits USDC 50/50, mints the NFT and raises the height", async () => {
    const hash = ethers.keccak256(ethers.toUtf8Bytes("엄마 건강|salt"));
    await expect(cairn.connect(alice).stack(hash, "민준")).to.emit(cairn, "Stacked").withArgs(1n, alice.address, hash, "민준", 1n, false);
    expect(await cairn.ownerOf(1)).to.equal(alice.address);
    expect(await cairn.height()).to.equal(1n);
    expect(await usdc.balanceOf(treasury.address)).to.equal(USDC("0.05"));
    expect(await usdc.balanceOf(buyback.address)).to.equal(USDC("0.05"));
    const s = await cairn.stones(1);
    expect(s.wishHash).to.equal(hash);
    expect(s.name).to.equal("민준");
    expect(s.free).to.equal(false);
  });

  it("rejects a name over 32 bytes and a buyer without USDC", async () => {
    const hash = ethers.ZeroHash;
    await expect(cairn.connect(alice).stack(hash, "x".repeat(33))).to.be.revertedWith("name too long");
    await expect(cairn.connect(bob).stack(hash, "bob")).to.be.reverted; // no allowance / balance
  });

  async function voucher(to, nonce, expires, who = signer) {
    const domain = { name: "WishCairn", version: "1", chainId: (await ethers.provider.getNetwork()).chainId, verifyingContract: await cairn.getAddress() };
    const types = { Voucher: [{ name: "to", type: "address" }, { name: "nonce", type: "uint256" }, { name: "expires", type: "uint256" }] };
    return who.signTypedData(domain, types, { to, nonce, expires });
  }

  it("a free stone needs a valid, unexpired, unused voucher from the signer", async () => {
    const hash = ethers.keccak256(ethers.toUtf8Bytes("free"));
    const expires = (await time.latest()) + 3600;
    const sig = await voucher(bob.address, 1, expires);
    await expect(cairn.connect(bob).stackFree(hash, "", 1, expires, sig)).to.emit(cairn, "Stacked").withArgs(1n, bob.address, hash, "", 1n, true);
    expect(await usdc.balanceOf(treasury.address)).to.equal(0n);
    // replay
    await expect(cairn.connect(bob).stackFree(hash, "", 1, expires, sig)).to.be.revertedWith("voucher used");
    // someone else using bob's voucher
    await expect(cairn.connect(alice).stackFree(hash, "", 1, expires, sig)).to.be.revertedWith("bad voucher");
    // wrong signer
    const bad = await voucher(bob.address, 2, expires, alice);
    await expect(cairn.connect(bob).stackFree(hash, "", 2, expires, bad)).to.be.revertedWith("bad voucher");
    // expired
    const old = await voucher(bob.address, 3, expires);
    await time.increase(3601);
    await expect(cairn.connect(bob).stackFree(hash, "", 3, expires, old)).to.be.revertedWith("voucher expired");
  });

  it("owner can change price, split and signer; others cannot", async () => {
    await cairn.setPrice(USDC("0.20"));
    await cairn.setSplit(treasury.address, buyback.address, 2000);
    await cairn.connect(alice).stack(ethers.ZeroHash, "a");
    expect(await usdc.balanceOf(buyback.address)).to.equal(USDC("0.04"));
    expect(await usdc.balanceOf(treasury.address)).to.equal(USDC("0.16"));
    await expect(cairn.connect(alice).setPrice(1)).to.be.revertedWithCustomError(cairn, "OwnableUnauthorizedAccount");
    await cairn.setBaseURI("https://wishcairn.app/api/stone/");
    expect(await cairn.tokenURI(1)).to.equal("https://wishcairn.app/api/stone/1");
  });
});

describe("CairnSale", () => {
  let usdc, token, sale, owner, treasury, alice, bob, start, end;
  const PRICE = USDC("0.02"); // $0.02 per CAIRN
  const SOFT = USDC(1000), HARD = USDC(5000), MAX = USDC(3000);
  beforeEach(async () => {
    [owner, treasury, alice, bob] = await ethers.getSigners();
    usdc = await ethers.deployContract("MockUSDC");
    token = await ethers.deployContract("CairnToken", [owner.address, owner.address, owner.address, treasury.address, owner.address]);
    start = (await time.latest()) + 100; end = start + 86400;
    sale = await ethers.deployContract("CairnSale", [await token.getAddress(), await usdc.getAddress(), PRICE, SOFT, HARD, MAX, start, end, treasury.address, owner.address]);
    await token.transfer(await sale.getAddress(), CAIRN(250_000_000)); // the 25% sale allocation
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
    expect(await sale.raised()).to.equal(USDC(1500));
    await expect(sale.finalize()).to.be.revertedWith("still open");
    await expect(sale.connect(alice).claim()).to.be.revertedWith("not claimable");
    await time.increaseTo(end);
    await expect(sale.finalize()).to.emit(sale, "Finalized").withArgs(true, USDC(1500));
    expect(await usdc.balanceOf(treasury.address)).to.equal(USDC(1500));
    await sale.connect(alice).claim();
    expect(await token.balanceOf(alice.address)).to.equal(CAIRN(50_000));
    await expect(sale.connect(alice).claim()).to.be.revertedWith("nothing owed");
    await expect(sale.connect(alice).refund()).to.be.revertedWith("no refunds");
    // unsold goes back to owner, bob's claim is still covered
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
    await expect(sale.connect(alice).refund()).to.be.revertedWith("nothing paid");
    await sale.sweepUnsold(owner.address);
    expect(await token.balanceOf(await sale.getAddress())).to.equal(0n);
  });

  it("hard cap closes the sale early and lets anyone finalize", async () => {
    await time.increaseTo(start);
    await sale.connect(alice).buy(USDC(3000));
    await sale.connect(bob).buy(USDC(2000));
    expect(await sale.isOpen()).to.equal(false);
    await expect(sale.connect(bob).buy(USDC(1))).to.be.revertedWith("sale closed");
    await sale.connect(bob).finalize();
    expect(await usdc.balanceOf(treasury.address)).to.equal(USDC(5000));
  });
});

describe("Team vesting (OpenZeppelin VestingWallet)", () => {
  it("releases linearly over the duration", async () => {
    const [owner, team] = await ethers.getSigners();
    const start = (await time.latest()) + 10, duration = 730 * 86400;
    const vest = await ethers.deployContract("VestingWallet", [team.address, start, duration]);
    const token = await ethers.deployContract("CairnToken", [owner.address, owner.address, await vest.getAddress(), owner.address, owner.address]);
    const total = CAIRN(150_000_000);
    expect(await token.balanceOf(await vest.getAddress())).to.equal(total);
    await time.increaseTo(start + duration / 2);
    await vest["release(address)"](await token.getAddress());
    const got = await token.balanceOf(team.address);
    expect(got).to.be.closeTo(total / 2n, CAIRN(1000));
    await time.increaseTo(start + duration + 1);
    await vest["release(address)"](await token.getAddress());
    expect(await token.balanceOf(team.address)).to.equal(total);
  });
});
