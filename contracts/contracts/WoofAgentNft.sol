// SPDX-License-Identifier: MIT
// Woof Agent — BSC BEP-721, 24 dog cards, agent-only random mint.
// Spec (user-confirmed 2026-11-16, main chat):
//   Supply 1,111, RANDOM token ids (swap-and-pop single deck, NOT VRF).
//   Rarity by token id (in metadata — 24 artworks):
//   Common 1-660 (12 cards x 55): Biscuit 1-55, Milo 56-110,
//   Rocky 111-165, Buddy 166-220, Max 221-275, Charlie 276-330,
//   Cooper 331-385, Duke 386-440, Teddy 441-495, Bailey 496-550,
//   Lucky 551-605, Scout 606-660. Ref price 0.002 BNB.
//   Rare 661-942 (6 cards x 47): Shadow 661-707, Luna 708-754,
//   Storm 755-801, Blaze 802-848, Nova 849-895, Zeus 896-942.
//   Ref price 0.005 BNB.
//   Epic 943-1047 (3 cards x 35): Phantom 943-977, Titan 978-1012,
//   Aurora 1013-1047. Ref price 0.012 BNB.
//   Legendary 1048-1097 (2 cards x 25): King Bark 1048-1072,
//   Moonfang 1073-1097. Ref price 0.03 BNB.
//   Mythic 1098-1111 (1 card x 14): The Alpha 1098-1111.
//   Ref price 0.1 BNB.
//   TWO LANES, BOTH agent-only (msg.sender == tx.origin + SPACE ID
//   Agent ID registry balance > 0):
//   - FREE lane: mintFree(), 1 free per wallet, price 0, accrues 0 WOOF.
//     Free and paid draw from the SAME deck (any tier can be drawn).
//   - PAID lane: mintPaid(qty), qty 1-19 per call, price by PAID count:
//     paid #1-9 @ 0.00035 BNB each, paid #10-19 @ 0.00065 BNB each
//     (so a wallet's 19 paid mints cost 9 x 0.00035 + 10 x 0.00065
//     = 0.00965 BNB max). Each PAID mint accrues a FLAT 1,200 WOOF.
//     Free mints accrue nothing. Max 22,800 WOOF per wallet.
//   Total cap 20 per wallet (1 free + 19 paid). Free and paid can be
//   claimed in any order.
//   Mint money: forwarded to the owner (project wallet) in the same tx;
//   the contract does not hold mint revenue.
//   Royalty 5% (ERC-2981). Owner can ONLY: open/close mint, set base URI,
//   withdraw stuck funds. Prices, supply and limits are immutable after
//   deploy.
//   baseURI: https://woof-agent.vercel.app/metadata/ (planned Vercel
//   project name — NOT yet created; update with setBaseURI if the final
//   project name differs).
//   Language: English only. Official X: TBD (no link on the page).
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IAgentID {
    function balanceOf(address) external view returns (uint256);
}

interface IWoofToken {
    function accrue(address wallet, uint256 amount) external;
}

/// @title Woof Agent
contract WoofAgentNft is ERC721, ERC2981, Ownable, ReentrancyGuard {
    IAgentID public immutable AGENT_ID;
    IWoofToken public immutable TOKEN;

    uint256 public constant MAX_SUPPLY = 1111;
    uint256 public constant MAX_PER_WALLET = 20;
    uint256 public constant FREE_PER_WALLET = 1;
    uint256 public constant MAX_PAID_PER_WALLET = 19;
    uint256 public constant PRICE_PAID_LOW = 0.00035 ether; // paid #1-9
    uint256 public constant PRICE_PAID_HIGH = 0.00065 ether; // paid #10-19
    uint256 public constant BONUS_PER_PAID_MINT = 1_200 ether; // flat 1,200 WOOF

    // Tier ref prices (marketplace floor = 80% of these).
    uint256 public constant REF_COMMON = 0.002 ether;
    uint256 public constant REF_RARE = 0.005 ether;
    uint256 public constant REF_EPIC = 0.012 ether;
    uint256 public constant REF_LEGENDARY = 0.03 ether;
    uint256 public constant REF_MYTHIC = 0.1 ether;

    uint256 public totalMinted;
    uint256 public paidMinted;
    uint256 public freeMinted;
    bool public mintOpen;
    string private _base;

    // Single deck: ids 1-1111, swap-and-pop lazy identity mapping.
    uint256 private _deckRemaining = MAX_SUPPLY;
    mapping(uint256 => uint256) private _deckAtIndex; // 0 = identity (id = index + 1)

    mapping(address => uint256) public mintedOf;
    mapping(address => uint256) public freeMintedOf;
    mapping(address => uint256) public paidMintedOf;

    event Minted(address indexed minter, uint256 indexed id, bool paid, uint256 priceWei);

    error NotAgent();
    error MintClosed();
    error SoldOut();
    error OverLimit();
    error Underpaid(uint256 required);
    error FreeClaimed();

    constructor(
        string memory baseURI_,
        address owner_,
        address agentId_,
        address token_
    ) ERC721("Woof Agent", "WOOF") Ownable(owner_) {
        _base = baseURI_;
        AGENT_ID = IAgentID(agentId_);
        TOKEN = IWoofToken(token_);
        mintOpen = false; // mint starts CLOSED until owner opens it
        _setDefaultRoyalty(owner_, 500); // 5%
    }

    modifier onlyAgent() {
        if (msg.sender != tx.origin || AGENT_ID.balanceOf(msg.sender) == 0) revert NotAgent();
        if (!mintOpen) revert MintClosed();
        _;
    }

    /// @notice WOOF bonus for a token id — flat 1,200 for every paid mint.
    function bonusForId(uint256) public pure returns (uint256) {
        return BONUS_PER_PAID_MINT;
    }

    /// @notice Rarity tier name for a token id.
    function rarityOf(uint256 id) public pure returns (string memory) {
        if (id <= 660) return "Common";
        if (id <= 942) return "Rare";
        if (id <= 1047) return "Epic";
        if (id <= 1097) return "Legendary";
        return "Mythic";
    }

    /// @notice Dog card name for a token id.
    function cardNameOf(uint256 id) public pure returns (string memory) {
        if (id <= 55) return "Biscuit";
        if (id <= 110) return "Milo";
        if (id <= 165) return "Rocky";
        if (id <= 220) return "Buddy";
        if (id <= 275) return "Max";
        if (id <= 330) return "Charlie";
        if (id <= 385) return "Cooper";
        if (id <= 440) return "Duke";
        if (id <= 495) return "Teddy";
        if (id <= 550) return "Bailey";
        if (id <= 605) return "Lucky";
        if (id <= 660) return "Scout";
        if (id <= 707) return "Shadow";
        if (id <= 754) return "Luna";
        if (id <= 801) return "Storm";
        if (id <= 848) return "Blaze";
        if (id <= 895) return "Nova";
        if (id <= 942) return "Zeus";
        if (id <= 977) return "Phantom";
        if (id <= 1012) return "Titan";
        if (id <= 1047) return "Aurora";
        if (id <= 1072) return "King Bark";
        if (id <= 1097) return "Moonfang";
        return "The Alpha";
    }

    /// @notice Tier character name for a token id (alias of cardNameOf).
    function tierNameOf(uint256 id) public pure returns (string memory) {
        return cardNameOf(id);
    }

    /// @notice Marketplace ref price for a token id (by tier).
    function refPriceOf(uint256 id) public pure returns (uint256) {
        if (id <= 660) return REF_COMMON;
        if (id <= 942) return REF_RARE;
        if (id <= 1047) return REF_EPIC;
        if (id <= 1097) return REF_LEGENDARY;
        return REF_MYTHIC;
    }

    /// @notice Price of one paid mint at a given 0-based paid index
    /// (paid #1-9 = 0.00035 BNB, paid #10-19 = 0.00065 BNB).
    function priceForPaidIndex(uint256 paidIndex) public pure returns (uint256) {
        return paidIndex < 9 ? PRICE_PAID_LOW : PRICE_PAID_HIGH;
    }

    /// @notice BNB cost for `qty` further PAID mints by `wallet`,
    /// priced by that wallet's current paid count.
    function quotePaidFor(address wallet, uint256 qty) public view returns (uint256) {
        uint256 already = paidMintedOf[wallet];
        if (qty == 0 || already + qty > MAX_PAID_PER_WALLET) revert OverLimit();
        if (_deckRemaining < qty) revert SoldOut();
        uint256 cost;
        for (uint256 i; i < qty; i++) {
            cost += priceForPaidIndex(already + i);
        }
        return cost;
    }

    /// @notice Live BNB cost of the cheapest paid mint (0.00035 BNB).
    function priceWei() public pure returns (uint256) {
        return PRICE_PAID_LOW;
    }

    function totalSupply() external view returns (uint256) {
        return totalMinted;
    }

    function exists(uint256 id) external view returns (bool) {
        return _ownerOf(id) != address(0);
    }

    function deckRemaining() external view returns (uint256) {
        return _deckRemaining;
    }

    /// @notice Draw one token id from the deck (swap-and-pop, Hakuna pattern).
    function _draw(uint256 seed) internal returns (uint256) {
        uint256 index = seed % _deckRemaining;
        uint256 tokenId = _deckAtIndex[index] == 0 ? index + 1 : _deckAtIndex[index];
        uint256 lastIndex = _deckRemaining - 1;
        uint256 lastTokenId = _deckAtIndex[lastIndex] == 0 ? lastIndex + 1 : _deckAtIndex[lastIndex];
        _deckAtIndex[index] = lastTokenId;
        _deckRemaining -= 1;
        return tokenId;
    }

    /// @notice FREE lane: mint the wallet's one free dog card.
    /// Agent ID ONLY. No payment, accrues 0 WOOF. Draws from the same
    /// deck as paid mints — any tier can be drawn.
    function mintFree() external nonReentrant onlyAgent {
        if (freeMintedOf[msg.sender] >= FREE_PER_WALLET) revert FreeClaimed();
        if (totalMinted + 1 > MAX_SUPPLY) revert SoldOut();
        uint256 seed = uint256(
            keccak256(abi.encodePacked(blockhash(block.number - 1), block.timestamp, msg.sender, totalMinted, uint256(0)))
        );
        uint256 id = _draw(seed);
        totalMinted++;
        freeMinted++;
        freeMintedOf[msg.sender]++;
        mintedOf[msg.sender]++;
        _safeMint(msg.sender, id);
        emit Minted(msg.sender, id, false, 0);
    }

    /// @notice PAID lane: mint `qty` dog cards. Agent ID ONLY.
    /// qty 1-19 per call, price by the wallet's paid count
    /// (paid #1-9 @ 0.00035 BNB, #10-19 @ 0.00065 BNB).
    /// Each paid mint accrues a flat 1,200 WOOF.
    function mintPaid(uint256 qty) external payable nonReentrant onlyAgent {
        if (qty == 0 || qty > MAX_PAID_PER_WALLET) revert OverLimit();
        if (paidMintedOf[msg.sender] + qty > MAX_PAID_PER_WALLET) revert OverLimit();
        if (mintedOf[msg.sender] + qty > MAX_PER_WALLET) revert OverLimit();
        if (totalMinted + qty > MAX_SUPPLY) revert SoldOut();
        if (_deckRemaining < qty) revert SoldOut();
        uint256 cost = quotePaidFor(msg.sender, qty);
        if (msg.value < cost) revert Underpaid(cost);

        uint256 totalBonus = BONUS_PER_PAID_MINT * qty;
        for (uint256 i; i < qty; i++) {
            uint256 seed = uint256(
                keccak256(abi.encodePacked(blockhash(block.number - 1), block.timestamp, msg.sender, totalMinted, i))
            );
            uint256 id = _draw(seed);
            totalMinted++;
            paidMinted++;
            _safeMint(msg.sender, id);
            emit Minted(msg.sender, id, true, priceForPaidIndex(paidMintedOf[msg.sender] + i));
        }
        paidMintedOf[msg.sender] += qty;
        mintedOf[msg.sender] += qty;

        TOKEN.accrue(msg.sender, totalBonus);

        // Mint money goes straight to the project wallet.
        if (cost > 0) {
            (bool ok, ) = owner().call{value: cost}("");
            require(ok, "forward");
        }
        if (msg.value > cost) {
            (bool ok, ) = msg.sender.call{value: msg.value - cost}("");
            require(ok, "refund");
        }
    }

    /// @notice tokenURI returns the metadata file immediately, from mint time.
    function tokenURI(uint256 id) public view override returns (string memory) {
        _requireOwned(id);
        return string.concat(_base, Strings.toString(id));
    }

    // ── owner: only these switches exist ──
    function setMintOpen(bool v) external onlyOwner {
        mintOpen = v;
    }

    function setBaseURI(string calldata b) external onlyOwner {
        _base = b;
    }

    function withdraw() external onlyOwner nonReentrant {
        (bool ok, ) = owner().call{value: address(this).balance}("");
        require(ok, "withdraw");
    }

    function supportsInterface(bytes4 i) public view override(ERC721, ERC2981) returns (bool) {
        return super.supportsInterface(i);
    }
}
