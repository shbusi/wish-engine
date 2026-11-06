// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Team allocation is held by OpenZeppelin's audited VestingWallet (linear release). Importing it here
// makes Hardhat compile the artifact so scripts and tests can deploy it by name.
import {VestingWallet} from "@openzeppelin/contracts/finance/VestingWallet.sol";
