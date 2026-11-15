// Woof Agent NFT + WOOF token tests — RANDOM single-deck two-lane model.
// FREE lane: mintFree(), Agent ID ONLY, 1 per wallet, accrues 0 WOOF,
// draws from the SAME deck as paid (any tier, ids 1-10000).
// PAID lane: mintPaid(qty), Agent ID ONLY, qty 1-19 per call, price by
// PAID count: paid #1-9 @ 0.00035 BNB, paid #10-19 @ 0.00065 BNB.
// Max 19 paid / 20 total per wallet. Each paid mint accrues a FLAT
// 12,000 WOOF. Revenue forwarded to owner.
const { expect } = require("chai");
const { ethers } = require("hardhat");

const BASE_URI = "https://woof-agent.vercel.app/metadata/";
const OWNER_ADDR = "0x36F3D56eAD5D1D6C2434F94DeFcEF732C5C3CbD2"; // project wallet (mainnet)
const PRICE_LOW = ethers.parseEther("0.00035");
const PRICE_HIGH = ethers.parseEther("0.00065");
const BONUS = ethers.parseEther("12000");

// Extract Minted event ids from a mint receipt (ids are random).
async function mintedIds(nft, tx) {
  const receipt = await tx.wait();
  const ids = [];
  for (const log of receipt.logs) {
    try {
      const parsed = nft.interface.parseLog(log);
      if (parsed && parsed.name === "Minted") ids.push(Number(parsed.args.id));
    } catch {}
  }
  return ids;
}

describe("Woof Agent NFT + WOOF token (random single-deck)", function () {
  let owner, agent1, agent2, stranger, buyer;
  let registry, token, nft;
  let freeId;

  before(async function () {
    [owner, agent1, agent2, stranger, buyer] = await ethers.getSigners();

    const Mock = await ethers.getContractFactory("MockAgentID");
    registry = await Mock.deploy();
    await registry.mint(agent1.address);
    await registry.mint(agent2.address);
    // stranger + buyer hold NO Agent ID.

    const Token = await ethers.getContractFactory("WoofToken");
    token = await Token.deploy(owner.address);

    const NFT = await ethers.getContractFactory("WoofAgentNft");
    nft = await NFT.deploy(BASE_URI, owner.address, await registry.getAddress(), await token.getAddress());
    await token.connect(owner).setMinter(await nft.getAddress());
    await nft.connect(owner).setMintOpen(true);
  });

  it("constructor: name/symbol/supply/limits/prices/ref prices, mint starts CLOSED", async function () {
    expect(await nft.name()).to.equal("Woof Agent");
    expect(await nft.symbol()).to.equal("WOOF");
    expect(await nft.MAX_SUPPLY()).to.equal(10000);
    expect(await nft.MAX_PER_WALLET()).to.equal(20);
    expect(await nft.FREE_PER_WALLET()).to.equal(1);
    expect(await nft.MAX_PAID_PER_WALLET()).to.equal(19);
    expect(await nft.PRICE_PAID_LOW()).to.equal(PRICE_LOW);
    expect(await nft.PRICE_PAID_HIGH()).to.equal(PRICE_HIGH);
    expect(await nft.BONUS_PER_PAID_MINT()).to.equal(BONUS);
    expect(await nft.REF_COMMON()).to.equal(ethers.parseEther("0.002"));
    expect(await nft.REF_RARE()).to.equal(ethers.parseEther("0.005"));
    expect(await nft.REF_EPIC()).to.equal(ethers.parseEther("0.012"));
    expect(await nft.REF_LEGENDARY()).to.equal(ethers.parseEther("0.03"));
    expect(await nft.REF_MYTHIC()).to.equal(ethers.parseEther("0.1"));
    expect(await nft.totalSupply()).to.equal(0);
    expect(await nft.owner()).to.equal(owner.address);
    expect(await nft.deckRemaining()).to.equal(10000);

    const NFT = await ethers.getContractFactory("WoofAgentNft");
    const fresh = await NFT.deploy(BASE_URI, owner.address, await registry.getAddress(), await token.getAddress());
    expect(await fresh.mintOpen()).to.equal(false);
  });

  it("token: name/symbol, 100M total, 54M pool in contract, 46M treasury to owner", async function () {
    expect(await token.name()).to.equal("WOOF");
    expect(await token.symbol()).to.equal("WOOF");
    expect(await token.totalSupply()).to.equal(ethers.parseEther("100000000"));
    expect(await token.balanceOf(await token.getAddress())).to.equal(ethers.parseEther("54000000"));
    expect(await token.balanceOf(owner.address)).to.equal(ethers.parseEther("46000000"));
    expect(await token.minter()).to.equal(await nft.getAddress());
    expect(await token.BONUS_POOL()).to.equal(ethers.parseEther("54000000"));
    expect(await token.MAX_BONUS_PER_WALLET()).to.equal(ethers.parseEther("228000"));
  });

  it("rarityOf/cardNameOf/refPriceOf: all 24 card boundaries", async function () {
    const cases = [
      [1, "Common", "Biscuit", "0.002"],
      [500, "Common", "Biscuit", "0.002"],
      [501, "Common", "Milo", "0.002"],
      [1000, "Common", "Milo", "0.002"],
      [1001, "Common", "Rocky", "0.002"],
      [1500, "Common", "Rocky", "0.002"],
      [1501, "Common", "Buddy", "0.002"],
      [2000, "Common", "Buddy", "0.002"],
      [2001, "Common", "Max", "0.002"],
      [2500, "Common", "Max", "0.002"],
      [2501, "Common", "Charlie", "0.002"],
      [3000, "Common", "Charlie", "0.002"],
      [3001, "Common", "Cooper", "0.002"],
      [3500, "Common", "Cooper", "0.002"],
      [3501, "Common", "Duke", "0.002"],
      [4000, "Common", "Duke", "0.002"],
      [4001, "Common", "Teddy", "0.002"],
      [4500, "Common", "Teddy", "0.002"],
      [4501, "Common", "Bailey", "0.002"],
      [5000, "Common", "Bailey", "0.002"],
      [5001, "Common", "Lucky", "0.002"],
      [5500, "Common", "Lucky", "0.002"],
      [5501, "Common", "Scout", "0.002"],
      [6000, "Common", "Scout", "0.002"],
      [6001, "Rare", "Shadow", "0.005"],
      [6400, "Rare", "Shadow", "0.005"],
      [6401, "Rare", "Luna", "0.005"],
      [6800, "Rare", "Luna", "0.005"],
      [6801, "Rare", "Storm", "0.005"],
      [7200, "Rare", "Storm", "0.005"],
      [7201, "Rare", "Blaze", "0.005"],
      [7600, "Rare", "Blaze", "0.005"],
      [7601, "Rare", "Nova", "0.005"],
      [8000, "Rare", "Nova", "0.005"],
      [8001, "Rare", "Zeus", "0.005"],
      [8400, "Rare", "Zeus", "0.005"],
      [8401, "Epic", "Phantom", "0.012"],
      [8700, "Epic", "Phantom", "0.012"],
      [8701, "Epic", "Titan", "0.012"],
      [9000, "Epic", "Titan", "0.012"],
      [9001, "Epic", "Aurora", "0.012"],
      [9300, "Epic", "Aurora", "0.012"],
      [9301, "Legendary", "King Bark", "0.03"],
      [9500, "Legendary", "King Bark", "0.03"],
      [9501, "Legendary", "Moonfang", "0.03"],
      [9700, "Legendary", "Moonfang", "0.03"],
      [9701, "Mythic", "The Alpha", "0.1"],
      [10000, "Mythic", "The Alpha", "0.1"],
    ];
    for (const [id, rarity, card, ref] of cases) {
      expect(await nft.rarityOf(id), `rarity ${id}`).to.equal(rarity);
      expect(await nft.cardNameOf(id), `card ${id}`).to.equal(card);
      expect(await nft.tierNameOf(id), `tier ${id}`).to.equal(card);
      expect(await nft.refPriceOf(id), `ref ${id}`).to.equal(ethers.parseEther(ref));
      expect(await nft.bonusForId(id), `bonus ${id}`).to.equal(BONUS);
    }
  });

  it("priceForPaidIndex: 0-8 low, 9-18 high", async function () {
    expect(await nft.priceForPaidIndex(0)).to.equal(PRICE_LOW);
    expect(await nft.priceForPaidIndex(8)).to.equal(PRICE_LOW);
    expect(await nft.priceForPaidIndex(9)).to.equal(PRICE_HIGH);
    expect(await nft.priceForPaidIndex(18)).to.equal(PRICE_HIGH);
    expect(await nft.priceWei()).to.equal(PRICE_LOW);
  });

  it("mint reverts while closed: mintFree and mintPaid both", async function () {
    const NFT = await ethers.getContractFactory("WoofAgentNft");
    const closed = await NFT.deploy(BASE_URI, owner.address, await registry.getAddress(), await token.getAddress());
    await expect(closed.connect(agent1).mintFree()).to.be.revertedWithCustomError(closed, "MintClosed");
    await expect(closed.connect(agent1).mintPaid(1, { value: PRICE_LOW }))
      .to.be.revertedWithCustomError(closed, "MintClosed");
  });

  it("agent gates: non-agent reverts on both lanes, contract caller reverts", async function () {
    await expect(nft.connect(stranger).mintFree()).to.be.revertedWithCustomError(nft, "NotAgent");
    await expect(nft.connect(stranger).mintPaid(1, { value: PRICE_LOW }))
      .to.be.revertedWithCustomError(nft, "NotAgent");
    const Caller = await ethers.getContractFactory("MintCaller");
    const caller = await Caller.deploy();
    await expect(caller.callMintFree(await nft.getAddress())).to.be.revertedWith("call failed");
  });

  it("quotePaidFor: 1x0.00035, 9x0.00315, 10x0.0038, 19x0.00965, 20 reverts", async function () {
    expect(await nft.quotePaidFor(agent1.address, 1)).to.equal(PRICE_LOW);
    expect(await nft.quotePaidFor(agent1.address, 9)).to.equal(PRICE_LOW * 9n);
    expect(await nft.quotePaidFor(agent1.address, 10)).to.equal(PRICE_LOW * 9n + PRICE_HIGH);
    expect(await nft.quotePaidFor(agent1.address, 19)).to.equal(PRICE_LOW * 9n + PRICE_HIGH * 10n);
    await expect(nft.quotePaidFor(agent1.address, 20)).to.be.revertedWithCustomError(nft, "OverLimit");
    await expect(nft.quotePaidFor(agent1.address, 0)).to.be.revertedWithCustomError(nft, "OverLimit");
  });

  it("free mint: agent claims one id 1-10000, accrues 0 WOOF; second free reverts", async function () {
    const tx = await nft.connect(agent1).mintFree();
    const ids = await mintedIds(nft, tx);
    expect(ids.length).to.equal(1);
    freeId = ids[0];
    expect(freeId).to.be.at.least(1).and.at.most(10000);
    expect(await nft.ownerOf(freeId)).to.equal(agent1.address);
    expect(await nft.totalMinted()).to.equal(1);
    expect(await nft.freeMinted()).to.equal(1);
    expect(await nft.paidMinted()).to.equal(0);
    expect(await nft.mintedOf(agent1.address)).to.equal(1);
    expect(await nft.freeMintedOf(agent1.address)).to.equal(1);
    expect(await nft.paidMintedOf(agent1.address)).to.equal(0);
    expect(await nft.deckRemaining()).to.equal(9999);
    expect(await token.accrued(agent1.address)).to.equal(0);
    expect(await token.claimable(agent1.address)).to.equal(0);
    expect(await nft.tokenURI(freeId)).to.equal(BASE_URI + freeId);
    expect(await nft.exists(freeId)).to.equal(true);
    expect(await nft.exists(10000)).to.equal(false);
    await expect(nft.connect(agent1).mintFree()).to.be.revertedWithCustomError(nft, "FreeClaimed");
  });

  it("paid ladder: 9 singles at 0.00035, then 10th costs 0.00065; bonus flat 12,000 each", async function () {
    const ownerBefore = await ethers.provider.getBalance(owner.address);
    const allIds = [];
    for (let i = 0; i < 9; i++) {
      const tx = await nft.connect(agent1).mintPaid(1, { value: PRICE_LOW });
      const ids = await mintedIds(nft, tx);
      expect(ids.length).to.equal(1);
      expect(ids[0]).to.be.at.least(1).and.at.most(10000);
      allIds.push(ids[0]);
    }
    expect(new Set(allIds).size).to.equal(9); // all distinct
    expect(await nft.paidMinted()).to.equal(9);
    expect(await nft.paidMintedOf(agent1.address)).to.equal(9);
    expect(await nft.mintedOf(agent1.address)).to.equal(10);
    expect(await token.accrued(agent1.address)).to.equal(BONUS * 9n);
    // 10th paid mint is now priced HIGH.
    expect(await nft.quotePaidFor(agent1.address, 1)).to.equal(PRICE_HIGH);
    const tx = await nft.connect(agent1).mintPaid(1, { value: PRICE_HIGH });
    const ids = await mintedIds(nft, tx);
    expect(ids.length).to.equal(1);
    expect(await nft.paidMinted()).to.equal(10);
    expect(await token.accrued(agent1.address)).to.equal(BONUS * 10n);
    expect(await token.totalAccrued()).to.equal(BONUS * 10n);
    const ownerAfter = await ethers.provider.getBalance(owner.address);
    expect(ownerAfter - ownerBefore).to.equal(PRICE_LOW * 9n + PRICE_HIGH);
    expect(await ethers.provider.getBalance(await nft.getAddress())).to.equal(0);
  });

  it("bulk paid: agent2 mints 19 in one call at 0.00965, then caps bind", async function () {
    const cost = PRICE_LOW * 9n + PRICE_HIGH * 10n;
    const tx = await nft.connect(agent2).mintPaid(19, { value: cost });
    const ids = await mintedIds(nft, tx);
    expect(ids.length).to.equal(19);
    expect(new Set(ids).size).to.equal(19);
    for (const id of ids) {
      expect(id).to.be.at.least(1).and.at.most(10000);
      expect(await nft.ownerOf(id)).to.equal(agent2.address);
    }
    expect(await nft.mintedOf(agent2.address)).to.equal(19);
    expect(await nft.paidMintedOf(agent2.address)).to.equal(19);
    expect(await nft.paidMinted()).to.equal(29);
    expect(await nft.totalMinted()).to.equal(30);
    expect(await nft.deckRemaining()).to.equal(9970);
    expect(await token.accrued(agent2.address)).to.equal(BONUS * 19n);
    await expect(nft.connect(agent2).mintPaid(1, { value: PRICE_HIGH }))
      .to.be.revertedWithCustomError(nft, "OverLimit");
    await expect(nft.connect(agent2).mintPaid(20, { value: cost }))
      .to.be.revertedWithCustomError(nft, "OverLimit");
  });

  it("underpaid reverts with required amount (boundary-aware)", async function () {
    // agent1 has 10 paid already: next mint costs 0.00065.
    await expect(
      nft.connect(agent1).mintPaid(1, { value: PRICE_LOW })
    ).to.be.revertedWithCustomError(nft, "Underpaid");
    // agent1: 9 remaining paid slots (10 done), quote for 9 = 9 x 0.00065.
    await expect(
      nft.connect(agent1).mintPaid(9, { value: PRICE_HIGH * 8n })
    ).to.be.revertedWithCustomError(nft, "Underpaid");
  });

  it("overpay is refunded in full (mintPaid 2 with 1 BNB)", async function () {
    const before = await ethers.provider.getBalance(buyer.address);
    // buyer holds no Agent ID — give them one for this test.
    await registry.mint(buyer.address);
    const tx = await nft.connect(buyer).mintPaid(2, { value: ethers.parseEther("1") });
    const receipt = await tx.wait();
    const gas = receipt.gasUsed * receipt.gasPrice;
    const after = await ethers.provider.getBalance(buyer.address);
    expect(before - after - gas).to.equal(PRICE_LOW * 2n);
    const ids = await mintedIds(nft, tx);
    expect(ids.length).to.equal(2);
    expect(await nft.mintedOf(buyer.address)).to.equal(2);
    expect(await nft.paidMintedOf(buyer.address)).to.equal(2);
    expect(await token.accrued(buyer.address)).to.equal(BONUS * 2n);
    expect(await nft.totalMinted()).to.equal(32);
    expect(await nft.paidMinted()).to.equal(31);
    expect(await nft.freeMinted()).to.equal(1);
    await expect(nft.connect(buyer).mintPaid(0)).to.be.revertedWithCustomError(nft, "OverLimit");
  });

  it("claim: pays accrued WOOF, second claim reverts, claimFor works", async function () {
    const agent1Bonus = BONUS * 10n;
    expect(await token.claimable(agent1.address)).to.equal(agent1Bonus);
    await expect(token.connect(agent1).claim())
      .to.emit(token, "Claimed").withArgs(agent1.address, agent1Bonus);
    expect(await token.balanceOf(agent1.address)).to.equal(agent1Bonus);
    expect(await token.claimable(agent1.address)).to.equal(0);
    expect(await token.claimed(agent1.address)).to.equal(agent1Bonus);
    await expect(token.connect(agent1).claim()).to.be.revertedWithCustomError(token, "NothingToClaim");
    // claimFor: anyone can trigger a beneficiary's claim
    const agent2Bonus = BONUS * 19n;
    await expect(token.connect(buyer).claimFor(agent2.address))
      .to.emit(token, "Claimed").withArgs(agent2.address, agent2Bonus);
    expect(await token.balanceOf(agent2.address)).to.equal(agent2Bonus);
  });

  it("token caps: accrue only by minter, wallet cap 228,000 enforced", async function () {
    await expect(token.connect(stranger).accrue(agent1.address, ethers.parseEther("12000")))
      .to.be.revertedWithCustomError(token, "NotMinter");
    // fresh token with a test signer as minter to probe caps directly
    const Token = await ethers.getContractFactory("WoofToken");
    const t2 = await Token.deploy(owner.address);
    await t2.connect(owner).setMinter(stranger.address);
    await t2.connect(stranger).accrue(buyer.address, ethers.parseEther("228000"));
    await expect(t2.connect(stranger).accrue(buyer.address, 1))
      .to.be.revertedWithCustomError(t2, "OverWalletCap");
    expect(await t2.totalAccrued()).to.equal(ethers.parseEther("228000"));
  });

  it("royaltyInfo: 5% to owner", async function () {
    const [receiver, amount] = await nft.royaltyInfo(freeId, ethers.parseEther("1"));
    expect(receiver).to.equal(owner.address);
    expect(amount).to.equal(ethers.parseEther("0.05"));
    const [, amount2] = await nft.royaltyInfo(freeId, ethers.parseEther("2"));
    expect(amount2).to.equal(ethers.parseEther("0.1"));
  });

  it("owner switches: setMintOpen / setBaseURI, non-owner reverts", async function () {
    await expect(nft.connect(stranger).setMintOpen(false)).to.be.revertedWithCustomError(nft, "OwnableUnauthorizedAccount");
    await nft.connect(owner).setBaseURI("https://example.com/meta/");
    expect(await nft.tokenURI(freeId)).to.equal("https://example.com/meta/" + freeId);
    await nft.connect(owner).setBaseURI(BASE_URI);
    await expect(nft.connect(stranger).setBaseURI("x")).to.be.revertedWithCustomError(nft, "OwnableUnauthorizedAccount");
  });
});
