// SPDX-License-Identifier: MIT
// WOOF — BEP-20 bonus token for Woof Agent paid mints.
// Economics (user-confirmed 2026-11-16):
//   Total supply 100,000,000 WOOF (18 decimals), fixed at deploy —
//   NO further minting ever. Bonus pool 54,000,000 WOOF is held by this
//   token contract itself; the remaining 46,000,000 WOOF is minted to the
//   owner at deploy (treasury — owner-controlled, not part of the bonus
//   pool). Every PAID Woof Agent mint accrues a FLAT 12,000 WOOF for the
//   minter's wallet, recorded by the NFT contract via accrue() (only the
//   NFT contract — set by the owner with setMinter() after the NFT
//   deploys — can accrue). Free mints accrue 0.
//   Max 228,000 WOOF per wallet (19 paid x 12,000); accrue() enforces
//   both the per-wallet cap and the pool cap (total accrued can never
//   exceed 54,000,000). Worst case the whole paid pool (at most 9,500
//   paid mints if every wallet also claims its free mint) pays out
//   9,500 x 12,000 = 114,000,000 — MORE than the 54,000,000 pool, so the
//   pool cap is the binding guard: once 54,000,000 has accrued, further
//   accrue() calls revert (OverPoolCap) and paid mints would revert too.
//   In practice paid mints are a small share of supply (across the
//   user's 30+ live collections, paid mints are ~2-3% of minted), so the
//   pool covers ~4,500 paid mints — far above realistic demand. The cap
//   is documented here so it is never a surprise.
//   Claims are retroactive: claim() pays the caller's claimable balance;
//   claimFor(address) pays a beneficiary's claimable balance and can be
//   called by any wallet (e.g. an agent claiming for its user).
//   claimable(address) shows what is waiting. No staking, no tax, no
//   pausing, no blacklist — plain ERC-20 + accrual ledger.
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title WOOF
contract WoofToken is ERC20, Ownable {
    uint256 public constant BONUS_POOL = 54_000_000 ether; // held by this contract
    uint256 public constant MAX_BONUS_PER_WALLET = 228_000 ether; // 19 paid x 12,000

    address public minter; // the Woof Agent NFT contract; set by owner after NFT deploy
    uint256 public totalAccrued; // sum of all accrue() amounts; never exceeds BONUS_POOL

    mapping(address => uint256) public accrued; // lifetime bonus earned
    mapping(address => uint256) public claimed; // lifetime bonus claimed

    event Accrued(address indexed wallet, uint256 amount, uint256 totalAccruedForWallet);
    event Claimed(address indexed wallet, uint256 amount);
    event MinterSet(address indexed minter);

    error NotMinter();
    error NothingToClaim();
    error OverPoolCap();
    error OverWalletCap();

    constructor(address owner_) ERC20("WOOF", "WOOF") Ownable(owner_) {
        // Pool stays in this contract for claims; remainder goes to the owner.
        _mint(address(this), BONUS_POOL);
        _mint(owner_, 46_000_000 ether);
    }

    /// @notice Claimable WOOF for a wallet (accrued minus already claimed).
    function claimable(address wallet) public view returns (uint256) {
        return accrued[wallet] - claimed[wallet];
    }

    /// @notice Record a bonus for a wallet. Only the NFT contract can call this.
    function accrue(address wallet, uint256 amount) external {
        if (msg.sender != minter) revert NotMinter();
        if (totalAccrued + amount > BONUS_POOL) revert OverPoolCap();
        if (accrued[wallet] + amount > MAX_BONUS_PER_WALLET) revert OverWalletCap();
        accrued[wallet] += amount;
        totalAccrued += amount;
        emit Accrued(wallet, amount, accrued[wallet]);
    }

    /// @notice Claim your own waiting WOOF.
    function claim() external {
        _claim(msg.sender);
    }

    /// @notice Claim a beneficiary's waiting WOOF to that beneficiary. Callable by anyone.
    function claimFor(address beneficiary) external {
        _claim(beneficiary);
    }

    function _claim(address wallet) internal {
        uint256 amount = claimable(wallet);
        if (amount == 0) revert NothingToClaim();
        claimed[wallet] += amount;
        _transfer(address(this), wallet, amount);
        emit Claimed(wallet, amount);
    }

    /// @notice Point accrual at the Woof Agent NFT contract (called once, by owner, after NFT deploy).
    function setMinter(address minter_) external onlyOwner {
        minter = minter_;
        emit MinterSet(minter_);
    }
}
