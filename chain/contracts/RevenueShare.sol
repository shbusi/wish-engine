// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title RevenueShare — stake CAIRN, receive the tower's revenue in stablecoins.
/// @notice Every stablecoin that reaches this contract (from StoneCairn's revenue split, or deposited by the
///         operator from off-chain revenue) is distributed pro-rata to stakers, in that same stablecoin.
///         Revenue that arrives while nobody is staked is held and distributed with the next notification.
///         Classic accumulator ("reward per share") design; rewards are claimed per token, all tokens at once.
contract RevenueShare is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant ACC = 1e36; // 6-decimal stablecoins against 18-decimal stakes need headroom

    IERC20 public immutable stakeToken; // CAIRN
    uint256 public totalStaked;
    mapping(address => uint256) public staked;

    address[] public rewardTokens;
    mapping(address => bool) public isRewardToken;
    mapping(address => uint256) public accPerShare;    // token → accumulated reward per staked unit (×ACC)
    mapping(address => uint256) public carried;        // token → revenue received while totalStaked == 0
    mapping(address => uint256) public distributed;    // token → lifetime distributed
    mapping(address => mapping(address => uint256)) public debt;    // token → user → paid-out marker
    mapping(address => mapping(address => uint256)) public pending; // token → user → settled but unclaimed

    mapping(address => bool) public notifier; // contracts allowed to notify revenue (StoneCairn)

    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event Revenue(address indexed token, uint256 amount, address indexed from);
    event Claimed(address indexed user, address indexed token, uint256 amount);
    event RewardTokenAdded(address token);
    event NotifierSet(address who, bool allowed);

    constructor(IERC20 stakeToken_, address owner_) Ownable(owner_) {
        stakeToken = stakeToken_;
    }

    // ---------------------------------------------------------------- revenue in

    /// @notice Called by an authorized source after it transferred `amount` of `token` here.
    function notify(address token, uint256 amount) external {
        require(notifier[msg.sender] || msg.sender == owner(), "not a notifier");
        _addRewardToken(token);
        _distribute(token, amount, msg.sender);
    }

    /// @notice Operator deposits revenue earned elsewhere (e.g. card payments converted to USDC).
    function deposit(address token, uint256 amount) external nonReentrant {
        _addRewardToken(token);
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        _distribute(token, amount, msg.sender);
    }

    function _distribute(address token, uint256 amount, address from) internal {
        if (amount == 0) return;
        if (totalStaked == 0) {
            carried[token] += amount;
        } else {
            uint256 total = amount + carried[token];
            carried[token] = 0;
            accPerShare[token] += total * ACC / totalStaked;
            distributed[token] += total;
        }
        emit Revenue(token, amount, from);
    }

    // ---------------------------------------------------------------- staking

    function stake(uint256 amount) external nonReentrant {
        require(amount > 0, "zero");
        _settle(msg.sender);
        stakeToken.safeTransferFrom(msg.sender, address(this), amount);
        staked[msg.sender] += amount;
        totalStaked += amount;
        _rebase(msg.sender);
        emit Staked(msg.sender, amount);
    }

    function unstake(uint256 amount) external nonReentrant {
        require(amount > 0 && staked[msg.sender] >= amount, "bad amount");
        _settle(msg.sender);
        staked[msg.sender] -= amount;
        totalStaked -= amount;
        _rebase(msg.sender);
        stakeToken.safeTransfer(msg.sender, amount);
        emit Unstaked(msg.sender, amount);
    }

    /// @notice Claim every reward token at once.
    function claim() external nonReentrant {
        _settle(msg.sender);
        _rebase(msg.sender);
        for (uint256 i = 0; i < rewardTokens.length; i++) {
            address token = rewardTokens[i];
            uint256 amount = pending[token][msg.sender];
            if (amount == 0) continue;
            pending[token][msg.sender] = 0;
            IERC20(token).safeTransfer(msg.sender, amount);
            emit Claimed(msg.sender, token, amount);
        }
    }

    /// @notice What `user` could claim right now, per reward token (same order as `rewardTokens`).
    function claimable(address user) external view returns (address[] memory tokens, uint256[] memory amounts) {
        tokens = rewardTokens;
        amounts = new uint256[](tokens.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            amounts[i] = pending[token][user] + (staked[user] * accPerShare[token] / ACC - debt[token][user]);
        }
    }

    function rewardTokenCount() external view returns (uint256) {
        return rewardTokens.length;
    }

    // move earned-but-unsettled rewards into `pending`, then reset the debt marker to the current accumulator
    function _settle(address user) internal {
        uint256 s = staked[user];
        for (uint256 i = 0; i < rewardTokens.length; i++) {
            address token = rewardTokens[i];
            uint256 earned = s * accPerShare[token] / ACC - debt[token][user];
            if (earned > 0) pending[token][user] += earned;
        }
    }

    function _rebase(address user) internal {
        uint256 s = staked[user];
        for (uint256 i = 0; i < rewardTokens.length; i++) {
            address token = rewardTokens[i];
            debt[token][user] = s * accPerShare[token] / ACC;
        }
    }

    function _addRewardToken(address token) internal {
        if (isRewardToken[token]) return;
        require(token != address(stakeToken) && token != address(0), "bad token");
        isRewardToken[token] = true;
        rewardTokens.push(token);
        emit RewardTokenAdded(token);
    }

    // ---------------------------------------------------------------- admin

    function setNotifier(address who, bool allowed) external onlyOwner {
        notifier[who] = allowed;
        emit NotifierSet(who, allowed);
    }
}
