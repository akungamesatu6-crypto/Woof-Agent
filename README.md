# Woof Agent

**Woof Agent** — 10,000 random dog cards on BNB Chain. Meow Cards model, dog theme, plus a $WOOF token.

- **Status: PREVIEW — contracts NOT deployed yet.** The page at `push/index.html` is in preview mode (mint disabled, counters show 0). Deploy needs the owner's explicit confirmation.
- Chain: BNB Smart Chain (56), BEP-721, random deck-draw (swap-and-pop).
- Mint is agent-only: Binance Agentic Wallet + SPACE ID Agent ID (registry `0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`, `msg.sender == tx.origin`). No allowlist.

## Spec (confirmed)

| | |
|---|---|
| Supply | 10,000 — 24 cards, 5 tiers |
| Common (12 × 500, ref 0.002 BNB) | Biscuit 1–500, Milo 501–1000, Rocky 1001–1500, Buddy 1501–2000, Max 2001–2500, Charlie 2501–3000, Cooper 3001–3500, Duke 3501–4000, Teddy 4001–4500, Bailey 4501–5000, Lucky 5001–5500, Scout 5501–6000 |
| Rare (6 × 400, ref 0.005) | Shadow 6001–6400, Luna 6401–6800, Storm 6801–7200, Blaze 7201–7600, Nova 7601–8000, Zeus 8001–8400 |
| Epic (3 × 300, ref 0.012) | Phantom 8401–8700, Titan 8701–9000, Aurora 9001–9300 |
| Legendary (2 × 200, ref 0.03) | King Bark 9301–9500, Moonfang 9501–9700 |
| Mythic (1 × 300, ref 0.1) | The Alpha 9701–10000 |
| Mint prices | #1 FREE (Agent ID) · #2–10 @ 0.00035 BNB · #11–20 @ 0.00065 BNB · max 20/wallet · max 0.00965 BNB/wallet |
| $WOOF | 100M total — 54M reward pool (held by token contract) / 46M treasury (owner). Flat 12,000 WOOF per PAID mint, free mint accrues 0, max 228,000/wallet. |
| Royalty | 5% ERC-2981 → `0x36F3D56eAD5D1D6C2434F94DeFcEF732C5C3CbD2` (BAW — owner + royalty + mint revenue) |
| Marketplace | Own escrow — seller 95% / royalty 5%, list & cancel fee 0.00025 BNB, floor ≥ 80% of the card's ref price |

Language: English only. No X handle yet — do not invent one.

## Contracts (NOT deployed — CREATE2 predictions, salt 0, proxy `0x4e59b44847b379578588920cA78FbF26c0B4956C`)

| Contract | Predicted address |
|---|---|
| WOOF token | `0xa60D7957F983847c4854576b0e7096AcbDcDD8E7` |
| Woof Agent NFT | `0x47dB6Faa41c789538f46d983f4b62B4B5Fe0bFa4` |
| Woof Agent Marketplace | `0x32b9ed21906e07b5E2370D54BcB27535cf57b8Ec` |

Estimated deploy cost at 0.05 gwei: ~0.000243 BNB total (token 885,585 gas / NFT 2,646,263 / market 1,278,498 via proxy). After deploy, the owner must call: token `setMinter(NFT)`, then NFT `setMintOpen(true)` — and set the three addresses in `push/index.html` + `push/market.html` (search for `var NFT = null` / `var MARKET = null`), plus the planned baseURI below.

**Planned baseURI (UNCONFIRMED — Vercel project `woof-agent` not created yet):** `https://woof-agent.vercel.app/metadata/` — if the final Vercel name differs, call `setBaseURI` on the NFT after deploy.

## Repo layout

- `BRIEF.md` — full brief
- `push/index.html` — mint page (preview state, mint disabled)
- `push/market.html` — marketplace page (preview state, no listings)
- `push/assets/*.jpg` — 24 card artworks, 1200×1200 q82
- `metadata/` — 10,000 extensionless metadata files (pushed in batches of ≤100)
- `contracts/` — Hardhat 0.8.24, optimizer 200, cancun. Tests: `npx hardhat test` (23/23 pass). Deploy simulation: `npx hardhat run scripts/deploy_simulation.js` (never plain `node` for hre scripts).
- `gen_assets.py` — artwork compression + metadata generator (verifies ID ranges)

## Deploy checklist (owner confirmation required for mainnet txs)

1. Create Vercel project `woof-agent` (team akungamesatu6), connect this repo, turn Deployment Protection OFF.
2. Deploy token → NFT → market via BAW CREATE2 (inputdata files in `contracts/`).
3. `setMinter(NFT)` on the token; verify predicted addresses match.
4. Set the three addresses + baseURI in the page JS; push.
5. `setMintOpen(true)` to open mint; verify on-chain (`mintOpen() == true`, `totalMinted() == 0`).
