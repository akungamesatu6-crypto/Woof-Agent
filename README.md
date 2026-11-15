# Woof Agent

**Woof Agent** — 1,111 random dog cards on BNB Chain. Meow Cards model, dog theme, plus a $WOOF token.

- **Status: PREVIEW — contracts NOT deployed yet.** The page at `push/index.html` is in preview mode (mint disabled, counters show 0). Deploy needs the owner's explicit confirmation.
- Chain: BNB Smart Chain (56), BEP-721, random deck-draw (swap-and-pop).
- Mint is agent-only: Binance Agentic Wallet + SPACE ID Agent ID (registry `0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`, `msg.sender == tx.origin`). No allowlist.
- Draw: ONE shared deck (swap-and-pop), free and paid draw the same 1–1111 range — no paid-only IDs. Free cap: first 1,000 free claims overall (1/wallet); mintFree closes automatically at 1,000, then all mints are paid.

## Spec (confirmed)

| | |
|---|---|
| Supply | 1,111 — 24 cards, 5 tiers |
| Common (12 × 55, ref 0.002 BNB) | Biscuit 1–55, Milo 56–110, Rocky 111–165, Buddy 166–220, Max 221–275, Charlie 276–330, Cooper 331–385, Duke 386–440, Teddy 441–495, Bailey 496–550, Lucky 551–605, Scout 606–660 |
| Rare (6 × 47, ref 0.005) | Shadow 661–707, Luna 708–754, Storm 755–801, Blaze 802–848, Nova 849–895, Zeus 896–942 |
| Epic (3 × 35, ref 0.012) | Phantom 943–977, Titan 978–1012, Aurora 1013–1047 |
| Legendary (2 × 25, ref 0.03) | King Bark 1048–1072, Moonfang 1073–1097 |
| Mythic (1 × 14, ref 0.1) | The Alpha 1098–1111 |
| Mint prices | #1 FREE (Agent ID) · #2–10 @ 0.00035 BNB · #11–20 @ 0.00065 BNB · max 20/wallet · max 0.00965 BNB/wallet · free cap 1,000 total claims |
| $WOOF | 10M total — 5.4M reward pool (held by token contract) / 4.6M treasury (owner). Flat 1,200 WOOF per PAID mint, free mint accrues 0, max 22,800/wallet. Pool covers 4,500 paid mints; max possible paid mints ≈ 1,055 (1,111 supply), so the pool is never the binding guard. |
| Royalty | 5% ERC-2981 → `0x36F3D56eAD5D1D6C2434F94DeFcEF732C5C3CbD2` (BAW — owner + royalty + mint revenue) |
| Marketplace | Own escrow — seller 95% / royalty 5%, list & cancel fee 0.00025 BNB, floor ≥ 80% of the card's ref price |

Language: English only. No X handle yet — do not invent one.

## Contracts (NOT deployed — CREATE2 predictions, salt 0, proxy `0x4e59b44847b379578588920cA78FbF26c0B4956C`)

| Contract | Predicted address |
|---|---|
| WOOF token | `0x7Df4B409D87129B2689A2Fb285e871a127519958` |
| Woof Agent NFT | `0xBb9bA68C8E99651450F099C431eb530a71C712bE` |
| Woof Agent Marketplace | `0x447453a9055e511Df2CcE7f33D1165085B6716b2` |

Estimated deploy cost at 0.05 gwei: ~0.0002437 BNB total (token 885,585 gas / NFT 2,662,820 / market 1,278,498 via proxy). After deploy, the owner must call: token `setMinter(NFT)`, then NFT `setMintOpen(true)` — and set the three addresses in `push/index.html` + `push/market.html` (search for `var NFT = null` / `var MARKET = null`), plus the planned baseURI below.

**Planned baseURI (UNCONFIRMED — Vercel project `woof-agent` not created yet):** `https://woof-agent.vercel.app/metadata/` — if the final Vercel name differs, call `setBaseURI` on the NFT after deploy.

## Repo layout

- `BRIEF.md` — full brief
- `push/index.html` — mint page (preview state, mint disabled)
- `push/market.html` — marketplace page (preview state, no listings)
- `push/assets/*.jpg` — 24 card artworks, 1200×1200 q82 (binary — push-files rejects them; upload via GitHub web UI or another binary-capable route)
- `metadata/` — 1,111 extensionless metadata files (pushed in batches of ≤100)
- `contracts/` — Hardhat 0.8.24, optimizer 200, cancun. Tests: `npx hardhat test` (23/23 pass). Deploy simulation: `npx hardhat run scripts/deploy_simulation.js` (never plain `node` for hre scripts).
- `gen_assets.py` — artwork compression + metadata generator (verifies ID ranges)

## Deploy checklist (owner confirmation required for mainnet txs)

1. Create Vercel project `woof-agent` (team akungamesatu6), connect this repo, turn Deployment Protection OFF.
2. Deploy token → NFT → market via BAW CREATE2 (inputdata files in `contracts/`).
3. `setMinter(NFT)` on the token; verify predicted addresses match.
4. Set the three addresses + baseURI in the page JS; push.
5. `setMintOpen(true)` to open mint; verify on-chain (`mintOpen() == true`, `totalMinted() == 0`).
