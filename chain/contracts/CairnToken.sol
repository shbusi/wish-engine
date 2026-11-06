// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @title CAIRN — the Wish Cairn token.
/// @notice Fixed supply, minted once at deployment to the allocation wallets. No owner, no minting, no pausing.
///         Burnable so the buyback pool can retire tokens bought with stone revenue.
contract CairnToken is ERC20, ERC20Burnable, ERC20Permit {
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000e18;

    uint16 public constant COMMUNITY_BPS = 4000; // 40% — stacking rewards, milestone events, airdrops to wishers
    uint16 public constant SALE_BPS = 2500;      // 25% — public sale (CairnSale)
    uint16 public constant TEAM_BPS = 1500;      // 15% — team, linear vesting (VestingWallet)
    uint16 public constant TREASURY_BPS = 1500;  // 15% — treasury
    uint16 public constant LIQUIDITY_BPS = 500;  // 5%  — DEX liquidity

    constructor(address community, address sale, address team, address treasury, address liquidity)
        ERC20("Cairn", "CAIRN")
        ERC20Permit("Cairn")
    {
        require(community != address(0) && sale != address(0) && team != address(0) && treasury != address(0) && liquidity != address(0), "zero address");
        _mint(community, TOTAL_SUPPLY * COMMUNITY_BPS / 10_000);
        _mint(sale, TOTAL_SUPPLY * SALE_BPS / 10_000);
        _mint(team, TOTAL_SUPPLY * TEAM_BPS / 10_000);
        _mint(treasury, TOTAL_SUPPLY * TREASURY_BPS / 10_000);
        _mint(liquidity, TOTAL_SUPPLY * LIQUIDITY_BPS / 10_000);
    }
}
