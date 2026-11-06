// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title CairnSale — fixed-price public sale of CAIRN for USDC.
/// @notice Buyers pay USDC during the window. If the soft cap is reached the raise goes to the treasury
///         and buyers claim their tokens; if it is not, every buyer gets a full refund. Nothing moves to
///         the treasury before finalization, so the money is never in anyone's hands while the sale is open.
contract CairnSale is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;      // CAIRN (18 decimals)
    IERC20 public immutable usdc;       // 6 decimals
    uint256 public immutable price;     // USDC per whole token, e.g. 20_000 = $0.02
    uint256 public immutable softCap;   // USDC
    uint256 public immutable hardCap;   // USDC
    uint256 public immutable maxPerWallet; // USDC
    uint64 public immutable start;
    uint64 public immutable end;
    address public immutable treasury;

    uint256 public raised;
    uint256 public totalOwed;
    bool public finalized;
    bool public refunding;
    mapping(address => uint256) public paid;
    mapping(address => uint256) public owed;

    event Bought(address indexed buyer, uint256 usdcAmount, uint256 tokens);
    event Finalized(bool success, uint256 raised);
    event Claimed(address indexed buyer, uint256 tokens);
    event Refunded(address indexed buyer, uint256 usdcAmount);

    constructor(
        IERC20 token_,
        IERC20 usdc_,
        uint256 price_,
        uint256 softCap_,
        uint256 hardCap_,
        uint256 maxPerWallet_,
        uint64 start_,
        uint64 end_,
        address treasury_,
        address owner_
    ) Ownable(owner_) {
        require(price_ > 0 && softCap_ <= hardCap_ && start_ < end_ && treasury_ != address(0), "bad params");
        token = token_;
        usdc = usdc_;
        price = price_;
        softCap = softCap_;
        hardCap = hardCap_;
        maxPerWallet = maxPerWallet_;
        start = start_;
        end = end_;
        treasury = treasury_;
    }

    function isOpen() public view returns (bool) {
        return block.timestamp >= start && block.timestamp < end && !finalized && raised < hardCap;
    }

    /// @notice Tokens a buyer would receive for `usdcAmount`.
    function quote(uint256 usdcAmount) public view returns (uint256) {
        return usdcAmount * 1e18 / price;
    }

    function buy(uint256 usdcAmount) external nonReentrant {
        require(isOpen(), "sale closed");
        require(usdcAmount > 0 && raised + usdcAmount <= hardCap, "over hard cap");
        require(paid[msg.sender] + usdcAmount <= maxPerWallet, "over wallet cap");
        uint256 tokens = quote(usdcAmount);
        require(token.balanceOf(address(this)) >= totalOwed + tokens, "sold out");
        usdc.safeTransferFrom(msg.sender, address(this), usdcAmount);
        paid[msg.sender] += usdcAmount;
        owed[msg.sender] += tokens;
        raised += usdcAmount;
        totalOwed += tokens;
        emit Bought(msg.sender, usdcAmount, tokens);
    }

    /// @notice Anyone can finalize once the window closed or the hard cap is hit.
    function finalize() external nonReentrant {
        require(!finalized, "done");
        require(block.timestamp >= end || raised >= hardCap, "still open");
        finalized = true;
        if (raised >= softCap) {
            usdc.safeTransfer(treasury, raised);
            emit Finalized(true, raised);
        } else {
            refunding = true;
            emit Finalized(false, raised);
        }
    }

    function claim() external nonReentrant {
        require(finalized && !refunding, "not claimable");
        uint256 amount = owed[msg.sender];
        require(amount > 0, "nothing owed");
        owed[msg.sender] = 0;
        totalOwed -= amount;
        token.safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, amount);
    }

    function refund() external nonReentrant {
        require(refunding, "no refunds");
        uint256 amount = paid[msg.sender];
        require(amount > 0, "nothing paid");
        paid[msg.sender] = 0;
        owed[msg.sender] = 0;
        usdc.safeTransfer(msg.sender, amount);
        emit Refunded(msg.sender, amount);
    }

    /// @notice After finalization, unsold tokens (or all tokens, if refunding) go back to the owner.
    function sweepUnsold(address to) external onlyOwner {
        require(finalized, "not finalized");
        uint256 keep = refunding ? 0 : totalOwed;
        uint256 spare = token.balanceOf(address(this)) - keep;
        token.safeTransfer(to, spare);
    }
}
