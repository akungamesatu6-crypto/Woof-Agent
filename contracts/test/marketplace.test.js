// Woof Agent marketplace tests — escrow, 95/5 split, list/delist fee,
// 80% floor rule vs tier ref prices, ERC-2981 fallback path.
const { expect } = require("chai");
const { ethers } = require("hardhat");

const BASE_URI = "https://woof-agent.vercel.app/metadata/";
const LIST_FEE = ethers.parseEther("0.00025");
const BAW = "0x36F3D56eAD5D1D6C2434F94DeFcEF732C5C3CbD2"; // hardcoded fee/royalty receiver

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

describe("WoofAgentMarketplace", function () {
  let owner, agent1, agent2, stranger;
  let registry, token, nft, market;
  let cardId; // an id owned by agent1
  let cardRef; // its ref price

  before(async function () {
    [owner, agent1, agent2, stranger] = await ethers.getSigners();

    const Mock = await ethers.getContractFactory("MockAgentID");
    registry = await Mock.deploy();
    await registry.mint(agent1.address);
    await registry.mint(agent2.address);

    const Token = await ethers.getContractFactory("WoofToken");
    token = await Token.deploy(owner.address);

    const NFT = await ethers.getContractFactory("WoofAgentNft");
    nft = await NFT.deploy(BASE_URI, owner.address, await registry.getAddress(), await token.getAddress());
    await token.connect(owner).setMinter(await nft.getAddress());
    await nft.connect(owner).setMintOpen(true);

    const Market = await ethers.getContractFactory("WoofAgentMarketplace");
    market = await Market.deploy(await nft.getAddress());

    const tx = await nft.connect(agent1).mintFree();
    [cardId] = await mintedIds(nft, tx);
    cardRef = await nft.refPriceOf(cardId);
    await nft.connect(agent1).setApprovalForAll(await market.getAddress(), true);
  });

  it("constructor: nft address, list fee, floor bps", async function () {
    expect(await market.nft()).to.equal(await nft.getAddress());
    expect(await market.LIST_FEE()).to.equal(LIST_FEE);
    expect(await market.FLOOR_BPS()).to.equal(8000);
    expect(await market.floorPriceOf(cardId)).to.equal((cardRef * 8000n) / 10000n);
  });

  it("list: wrong fee reverts, below-floor reverts, correct list works", async function () {
    const floor = await market.floorPriceOf(cardId);
    await expect(
      market.connect(agent1).list(cardId, floor, { value: 0 })
    ).to.be.revertedWithCustomError(market, "WrongFee");
    await expect(
      market.connect(agent1).list(cardId, floor - 1n, { value: LIST_FEE })
    ).to.be.revertedWithCustomError(market, "BelowFloor");
    await expect(
      market.connect(agent1).list(cardId, floor, { value: LIST_FEE })
    ).to.emit(market, "Listed").withArgs(cardId, agent1.address, floor);
    expect(await nft.ownerOf(cardId)).to.equal(await market.getAddress());
    const [seller, price, active] = await market.getListing(cardId);
    expect(seller).to.equal(agent1.address);
    expect(price).to.equal(floor);
    expect(active).to.equal(true);
    expect(await market.getListedIds()).to.deep.equal([cardId]);
    // second list of the same id reverts
    await expect(
      market.connect(agent1).list(cardId, floor, { value: LIST_FEE })
    ).to.be.revertedWith("already listed");
  });

  it("updatePrice: below floor reverts, at/above floor works, non-seller reverts", async function () {
    const floor = await market.floorPriceOf(cardId);
    await expect(
      market.connect(agent1).updatePrice(cardId, floor - 1n)
    ).to.be.revertedWithCustomError(market, "BelowFloor");
    await expect(
      market.connect(agent2).updatePrice(cardId, floor)
    ).to.be.revertedWith("not seller");
    const newPrice = floor * 2n;
    await expect(market.connect(agent1).updatePrice(cardId, newPrice))
      .to.emit(market, "PriceUpdated").withArgs(cardId, newPrice);
    const [, price] = await market.getListing(cardId);
    expect(price).to.equal(newPrice);
  });

  it("buy: seller gets 95%, royalty 5% to owner, buyer gets the NFT", async function () {
    const [, price] = await market.getListing(cardId);
    const royalty = (price * 500n) / 10000n;
    const sellerAmount = price - royalty;
    const ownerBefore = await ethers.provider.getBalance(owner.address);
    const sellerBefore = await ethers.provider.getBalance(agent1.address);
    await expect(market.connect(agent2).buy(cardId, { value: price }))
      .to.emit(market, "Sale").withArgs(cardId, agent1.address, agent2.address, price, royalty);
    expect(await nft.ownerOf(cardId)).to.equal(agent2.address);
    const [, , active] = await market.getListing(cardId);
    expect(active).to.equal(false);
    expect(await market.getListedIds()).to.deep.equal([]);
    expect((await ethers.provider.getBalance(owner.address)) - ownerBefore).to.equal(royalty);
    expect((await ethers.provider.getBalance(agent1.address)) - sellerBefore).to.equal(sellerAmount);
  });

  it("buy guards: not listed reverts, seller cannot buy own listing, exact price required", async function () {
    // agent2 now owns cardId; list it again at its floor.
    await nft.connect(agent2).setApprovalForAll(await market.getAddress(), true);
    const floor = await market.floorPriceOf(cardId);
    await market.connect(agent2).list(cardId, floor, { value: LIST_FEE });
    await expect(market.connect(agent1).buy(cardId, { value: floor - 1n }))
      .to.be.revertedWith("exact price required");
    await expect(market.connect(agent2).buy(cardId, { value: floor }))
      .to.be.revertedWith("seller cannot buy");
    await expect(market.connect(agent1).buy(9999, { value: floor }))
      .to.be.revertedWith("not listed");
  });

  it("cancel: wrong fee reverts, non-seller reverts, correct cancel returns NFT + fee to owner", async function () {
    // List/delist fees go to the hardcoded BAW wallet, not the test owner signer.
    const bawBefore = await ethers.provider.getBalance(BAW);
    await expect(market.connect(agent2).cancel(cardId, { value: 0 }))
      .to.be.revertedWithCustomError(market, "WrongFee");
    await expect(market.connect(agent1).cancel(cardId, { value: LIST_FEE }))
      .to.be.revertedWith("not seller");
    await expect(market.connect(agent2).cancel(cardId, { value: LIST_FEE }))
      .to.emit(market, "Cancelled").withArgs(cardId, agent2.address);
    expect(await nft.ownerOf(cardId)).to.equal(agent2.address);
    expect((await ethers.provider.getBalance(BAW)) - bawBefore).to.equal(LIST_FEE);
    expect(await market.getListedIds()).to.deep.equal([]);
  });

  it("royalty fallback: mock NFT without royalty support still pays 5% to owner", async function () {
    const Mock721 = await ethers.getContractFactory("MockERC721NoRoyalty");
    const mockNft = await Mock721.deploy();
    await mockNft.mint(agent1.address, 42);

    const Market = await ethers.getContractFactory("WoofAgentMarketplace");
    const mockMarket = await Market.deploy(await mockNft.getAddress());
    await mockNft.connect(agent1).setApprovalForAll(await mockMarket.getAddress(), true);
    // No refPriceOf on the mock -> floor is 0, any price lists.
    expect(await mockMarket.floorPriceOf(42)).to.equal(0);
    const price = ethers.parseEther("0.01");
    await mockMarket.connect(agent1).list(42, price, { value: LIST_FEE });
    const bawBefore = await ethers.provider.getBalance(BAW);
    const sellerBefore = await ethers.provider.getBalance(agent1.address);
    await mockMarket.connect(agent2).buy(42, { value: price });
    expect(await mockNft.ownerOf(42)).to.equal(agent2.address);
    expect((await ethers.provider.getBalance(BAW)) - bawBefore).to.equal(price / 20n);
    expect((await ethers.provider.getBalance(agent1.address)) - sellerBefore).to.equal((price * 19n) / 20n);
  });
});
