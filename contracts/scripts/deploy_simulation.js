// Woof Agent deploy SIMULATION ONLY — no mainnet transaction is sent by this script.
// Computes CREATE2 predicted addresses exactly as the deterministic-proxy
// route did for HakunaAgent/NEKART/LunarAgentRion/MiChan/PanduAGENT/Sakura/
// Bird and The Bees, and measures gas on the local network. Deploy order:
// WOOF token first (constructor: owner only), then the Woof Agent NFT
// (constructor: baseURI, owner, Agent ID registry, predicted WOOF address
// — the token deploys first, so its address is known), then the
// WoofAgentMarketplace (constructor: predicted NFT address).
// After deploy the owner must call token.setMinter(nft). Mint stays CLOSED
// (mintOpen=false in the constructor) until the owner calls
// setMintOpen(true) — that opening step is a separate owner call, and per
// the user's launch sequence it happens only after preparations are done.
// TWO-LANE RANDOM model, BOTH lanes agent-only (user-confirmed 2026-11-16):
// mintFree() 1 per wallet, draws from the single 10,000-id deck, accrues 0;
// mintPaid(qty) qty 1-19, price by paid count (paid #1-9 @ 0.00035 BNB,
// #10-19 @ 0.00065 BNB, max 0.00965 BNB/wallet), flat 12,000 WOOF per
// paid mint. Max 20 per wallet. Marketplace: escrow, seller 95%,
// royalty 5% to BAW, list/delist fee 0.00025 BNB, floor 80% of tier ref.
// Planned baseURI: https://woof-agent.vercel.app/metadata/ — the Vercel
// project is NOT yet created; if the final project name differs, the owner
// must call setBaseURI with the correct URL before opening mint.
// Run: npx hardhat run scripts/deploy_simulation.js
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const BASE_URI = "https://woof-agent.vercel.app/metadata/";
const OWNER = "0x36F3D56eAD5D1D6C2434F94DeFcEF732C5C3CbD2";
const AGENT_ID = "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F"; // SPACE ID Agent ID registry
const PROXY = "0x4e59b44847b379578588920cA78FbF26c0B4956C"; // deterministic deployment proxy
// Canonical deterministic-deployment-proxy creation code (deploys the proxy
// itself; used here only on the local network so the CREATE2 call can be
// gas-estimated with identical bytecode).
const PROXY_CREATION =
  "0x604580600e600039806000f350fe7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3";

function predict(artifact, argTypes, argValues) {
  const args = ethers.AbiCoder.defaultAbiCoder().encode(argTypes, argValues);
  const creation = artifact.bytecode + args.slice(2);
  const predicted = ethers.getCreate2Address(PROXY, ethers.ZeroHash, ethers.keccak256(creation));
  const inputData = "0x" + "00".repeat(32) + creation.slice(2);
  return { creation, predicted, inputData };
}

async function main() {
  const outDir = path.join(__dirname, "..");
  const [deployer, agent, bulkBuyer] = await ethers.getSigners();

  // --- WOOF token: predict first (constructor args: owner) ---
  const tokenArtifact = await hre.artifacts.readArtifact("WoofToken");
  const tokenPred = predict(tokenArtifact, ["address"], [OWNER]);

  // --- NFT: predict (constructor args: baseURI, owner, agentId, token=predicted) ---
  const nftArtifact = await hre.artifacts.readArtifact("WoofAgentNft");
  const nftPred = predict(
    nftArtifact,
    ["string", "address", "address", "address"],
    [BASE_URI, OWNER, AGENT_ID, tokenPred.predicted]
  );

  // --- Marketplace: predict (constructor args: nft=predicted) ---
  const marketFactory = await ethers.getContractFactory("WoofAgentMarketplace");
  const marketDeployTx = await marketFactory.getDeployTransaction(nftPred.predicted);
  const marketCreation = marketDeployTx.data;
  const marketPredicted = ethers.getCreate2Address(PROXY, ethers.ZeroHash, ethers.keccak256(marketCreation));
  const marketInputData = ethers.hexlify(ethers.concat([ethers.ZeroHash, marketCreation]));

  fs.writeFileSync(path.join(outDir, "token_creation.txt"), tokenPred.creation);
  fs.writeFileSync(path.join(outDir, "token_inputdata.txt"), tokenPred.inputData);
  fs.writeFileSync(path.join(outDir, "token_predicted.txt"), tokenPred.predicted);
  fs.writeFileSync(path.join(outDir, "nft_creation.txt"), nftPred.creation);
  fs.writeFileSync(path.join(outDir, "nft_inputdata.txt"), nftPred.inputData);
  fs.writeFileSync(path.join(outDir, "nft_predicted.txt"), nftPred.predicted);
  fs.writeFileSync(path.join(outDir, "market_creation.txt"), marketCreation);
  fs.writeFileSync(path.join(outDir, "market_inputdata.txt"), marketInputData);
  fs.writeFileSync(path.join(outDir, "market_predicted.txt"), marketPredicted);

  // --- Local deploy + gas measurements ---
  const Token = await ethers.getContractFactory("WoofToken");
  const token = await Token.deploy(OWNER);
  const tokenDeployReceipt = await token.deploymentTransaction().wait();

  const NFT = await ethers.getContractFactory("WoofAgentNft");
  const nft = await NFT.deploy(BASE_URI, OWNER, AGENT_ID, await token.getAddress());
  const nftDeployReceipt = await nft.deploymentTransaction().wait();

  const market = await marketFactory.deploy(await nft.getAddress());
  const marketDeployReceipt = await market.deploymentTransaction().wait();

  // Constructor must leave mint CLOSED.
  const mintOpenAtDeploy = await nft.mintOpen();
  if (mintOpenAtDeploy !== false) throw new Error("mintOpen is not false at deploy");

  // Owner wiring (deployer is NOT the owner locally, so impersonate owner).
  await hre.network.provider.request({ method: "hardhat_impersonateAccount", params: [OWNER] });
  await hre.network.provider.request({
    method: "hardhat_setBalance",
    params: [OWNER, "0x8AC7230489E80000"], // 10 ETH
  });
  const ownerSigner = await ethers.getSigner(OWNER);
  const setMinterTx = await token.connect(ownerSigner).setMinter(await nft.getAddress());
  const setMinterReceipt = await setMinterTx.wait();
  const setBaseTx = await nft.connect(ownerSigner).setBaseURI(BASE_URI);
  const setBaseReceipt = await setBaseTx.wait();
  const openTx = await nft.connect(ownerSigner).setMintOpen(true);
  const openReceipt = await openTx.wait();

  // Gas check on a live mint path (local only): 1 free + 1 single + 19 bulk + claim.
  // Uses a second token/NFT pair wired to mocks, because the first token's
  // minter is already locked to the first NFT and the first NFT points at
  // the real registry.
  const Mock = await ethers.getContractFactory("MockAgentID");
  const registry = await Mock.deploy();
  await registry.mint(agent.address);
  await registry.mint(bulkBuyer.address);
  const token2 = await Token.deploy(OWNER);
  const nft2 = await NFT.deploy(BASE_URI, OWNER, await registry.getAddress(), await token2.getAddress());
  await token2.connect(ownerSigner).setMinter(await nft2.getAddress());
  await nft2.connect(ownerSigner).setBaseURI(BASE_URI);
  await nft2.connect(ownerSigner).setMintOpen(true);
  const freeTx = await nft2.connect(agent).mintFree();
  const freeReceipt = await freeTx.wait();
  const singleTx = await nft2.connect(agent).mintPaid(1, { value: ethers.parseEther("0.00035") });
  const singleReceipt = await singleTx.wait();
  const bulkTx = await nft2.connect(bulkBuyer).mintPaid(19, { value: ethers.parseEther("0.00965") });
  const bulkReceipt = await bulkTx.wait();
  const claimTx = await token2.connect(agent).claim();
  const claimReceipt = await claimTx.wait();

  // Rarity/bonus/ref-price spot checks (pure view functions).
  const bonusAny = await nft2.bonusForId(1);
  const rarityMythic = await nft2.rarityOf(10000);
  const cardMythic = await nft2.cardNameOf(10000);
  const cardCommon = await nft2.cardNameOf(1);
  const refCommon = await nft2.refPriceOf(1);
  const refMythic = await nft2.refPriceOf(10000);
  const quote19 = await nft2.quotePaidFor(agent.address, 18); // agent has 1 paid: 8 low + 10 high

  // Marketplace gas via the local proxy (identical bytecode to mainnet route).
  const proxyDeployTx = await deployer.sendTransaction({ data: PROXY_CREATION });
  const proxyReceipt = await proxyDeployTx.wait();
  const localProxy = proxyReceipt.contractAddress;
  const gasViaProxy = await ethers.provider.estimateGas({ to: localProxy, data: marketInputData });
  const gasPriceWei = 50_000_000n; // 0.05 gwei, as measured on BSC
  const totalGas =
    tokenDeployReceipt.gasUsed + nftDeployReceipt.gasUsed + gasViaProxy + setMinterReceipt.gasUsed;
  const totalCostBnb = Number(totalGas * gasPriceWei) / 1e18;

  const result = {
    token: {
      contract: "WoofToken",
      name: "WOOF",
      symbol: "WOOF",
      totalSupply: "100000000",
      bonusPool: "54000000",
      treasury: "46000000",
      owner: OWNER,
      deterministicProxy: PROXY,
      predictedAddress: tokenPred.predicted,
      creationBytes: (tokenPred.creation.length - 2) / 2,
      inputDataBytes: (tokenPred.inputData.length - 2) / 2,
      creationCodeKeccak: ethers.keccak256(tokenPred.creation),
      gas: {
        deploy: Number(tokenDeployReceipt.gasUsed),
        setMinter: Number(setMinterReceipt.gasUsed),
        claim: Number(claimReceipt.gasUsed),
      },
      localDeployAddress: await token.getAddress(),
    },
    nft: {
      contract: "WoofAgentNft",
      name: "Woof Agent",
      symbol: "WOOF",
      baseURI: BASE_URI,
      owner: OWNER,
      agentIdRegistry: AGENT_ID,
      token: tokenPred.predicted,
      maxSupply: 10000,
      maxPerWallet: 20,
      model: "two-lane random single deck: mintFree() agent-only (1/wallet, accrues 0), mintPaid(uint256) agent-only qty 1-19, paid #1-9 @ 0.00035 BNB / #10-19 @ 0.00065 BNB, flat 12,000 WOOF per paid mint",
      priceLowBnb: "0.00035",
      priceHighBnb: "0.00065",
      maxCostPerWalletBnb: "0.00965",
      bonusPerPaidMint: "12000",
      spotCheck: {
        bonusId1: ethers.formatEther(bonusAny),
        rarity10000: rarityMythic,
        card10000: cardMythic,
        card1: cardCommon,
        refPrice1Bnb: ethers.formatEther(refCommon),
        refPrice10000Bnb: ethers.formatEther(refMythic),
        quote18ForAgentWith1PaidBnb: ethers.formatEther(quote19),
      },
      deterministicProxy: PROXY,
      predictedAddress: nftPred.predicted,
      creationBytes: (nftPred.creation.length - 2) / 2,
      inputDataBytes: (nftPred.inputData.length - 2) / 2,
      creationCodeKeccak: ethers.keccak256(nftPred.creation),
      gas: {
        deploy: Number(nftDeployReceipt.gasUsed),
        setBaseURI: Number(setBaseReceipt.gasUsed),
        setMintOpen: Number(openReceipt.gasUsed),
        freeMint: Number(freeReceipt.gasUsed),
        paidSingle: Number(singleReceipt.gasUsed),
        paidBulk19: Number(bulkReceipt.gasUsed),
      },
      mintOpenAtDeploy: mintOpenAtDeploy,
      localDeployAddress: await nft.getAddress(),
    },
    marketplace: {
      contract: "WoofAgentMarketplace",
      nft: nftPred.predicted,
      platformFee: "0%",
      royalty: "5% via royaltyInfo, fallback 5% to owner",
      listFeeBnb: "0.00025",
      floorRule: "80% of tier ref price (Common 0.002 / Rare 0.005 / Epic 0.012 / Legendary 0.03 / Mythic 0.1 BNB)",
      deterministicProxy: PROXY,
      predictedAddress: marketPredicted,
      creationBytes: (marketCreation.length - 2) / 2,
      inputDataBytes: (marketInputData.length - 2) / 2,
      creationCodeKeccak: ethers.keccak256(marketCreation),
      gas: {
        deployPlain: Number(marketDeployReceipt.gasUsed),
        deployViaProxy: gasViaProxy.toString(),
      },
      localDeployAddress: await market.getAddress(),
    },
    totalDeployGas: totalGas.toString(),
    totalDeployCostBnbAt0_05gwei: totalCostBnb,
    note: "SIMULATION ONLY — no mainnet transaction was sent. Predicted addresses are CREATE2 addresses via the deterministic deployment proxy with salt 0 (same route as Archon/Sonofluidic/HATCHIEggy/NEKART/LunarAgentRion/HakunaAgent/MiChan/PanduAGENT/Sakura/Bird and The Bees, whose predictions matched on-chain exactly). Mint stays CLOSED after deploy (mintOpen=false in the constructor); opening requires a separate owner setMintOpen(true) call, and token.setMinter(nft) must be called by the owner after the NFT deploys. baseURI assumes the Vercel project will be named woof-agent — if the created project name differs, the owner must call setBaseURI before opening mint.",
  };
  fs.writeFileSync(path.join(outDir, "deploy_simulation.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
