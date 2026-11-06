// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

interface IRevenueSink {
    function notify(address token, uint256 amount) external;
}

/// @title StoneCairn — every stone on the tower is an NFT.
/// @notice A stone can be paid for in any whitelisted stablecoin (USDC, EURC, JPYC, BRZ, …), each with its own
///         price in that token's units. Every payment is split between the treasury and the RevenueShare
///         contract, where CAIRN stakers receive it pro-rata in the same stablecoin. `stackFree` redeems a
///         voucher signed by the backend (the "one free stone a day"). Only the wish's hash is recorded on-chain.
contract StoneCairn is ERC721, EIP712, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Stone {
        bytes32 wishHash; // keccak256 of the wish text (+ salt) kept by the wisher / backend
        string name;      // engraved name, up to 32 bytes
        uint64 at;        // block timestamp
        address token;    // stablecoin paid with (zero for a free stone)
        uint256 amount;   // amount paid in that token's units
    }

    address public defaultToken;                  // used by stack()
    mapping(address => uint256) public priceOf;   // token → price in token units; 0 = not accepted
    address[] public acceptedTokens;

    address public treasury;
    address public revenueShare;   // RevenueShare contract (stakers)
    uint16 public revenueBps;      // share of every payment sent to stakers, out of 10_000
    address public charity;        // donation wallet: a pledged share of every paid stone goes here, in the same transaction
    uint16 public charityBps;      // out of 10_000; revenueBps + charityBps <= 10_000, the rest is the treasury's
    address public voucherSigner;  // backend key that signs free-stone vouchers
    string public baseURI;

    uint256 public nextId = 1;     // height in stones == nextId - 1
    mapping(uint256 => Stone) public stones;
    mapping(bytes32 => bool) public usedVoucher;

    bytes32 private constant VOUCHER_TYPEHASH = keccak256("Voucher(address to,uint256 nonce,uint256 expires)");

    event Stacked(uint256 indexed id, address indexed owner, bytes32 wishHash, string name, uint256 height, bool free, address token, uint256 amount);
    event PriceSet(address indexed token, uint256 price);
    event SplitSet(address treasury, address revenueShare, uint16 revenueBps);
    event CharitySet(address charity, uint16 charityBps);
    event SignerSet(address signer);

    constructor(address usdc_, uint256 usdcPrice_, address treasury_, address revenueShare_, uint16 revenueBps_, address signer_, address owner_)
        ERC721("Wish Cairn Stone", "STONE")
        EIP712("WishCairn", "1")
        Ownable(owner_)
    {
        require(usdc_ != address(0) && treasury_ != address(0) && revenueBps_ <= 10_000, "bad params");
        _setPrice(usdc_, usdcPrice_);
        defaultToken = usdc_;
        treasury = treasury_;
        revenueShare = revenueShare_;
        revenueBps = revenueShare_ == address(0) ? 0 : revenueBps_;
        voucherSigner = signer_;
    }

    // ---------------------------------------------------------------- stacking

    /// @notice Pay with the default stablecoin.
    function stack(bytes32 wishHash, string calldata name) external nonReentrant returns (uint256 id) {
        id = _pay(defaultToken, wishHash, name);
    }

    /// @notice Pay with any accepted stablecoin.
    function stackWith(address token, bytes32 wishHash, string calldata name) external nonReentrant returns (uint256 id) {
        id = _pay(token, wishHash, name);
    }

    function _pay(address token, bytes32 wishHash, string calldata name) internal returns (uint256 id) {
        uint256 price = priceOf[token];
        require(price > 0, "token not accepted");
        uint256 toStakers = price * revenueBps / 10_000;
        uint256 toCharity = price * charityBps / 10_000;
        if (toCharity > 0) IERC20(token).safeTransferFrom(msg.sender, charity, toCharity);
        if (price - toStakers - toCharity > 0) IERC20(token).safeTransferFrom(msg.sender, treasury, price - toStakers - toCharity);
        if (toStakers > 0) {
            IERC20(token).safeTransferFrom(msg.sender, revenueShare, toStakers);
            IRevenueSink(revenueShare).notify(token, toStakers);
        }
        id = _stack(msg.sender, wishHash, name, token, price);
    }

    /// @notice Redeem a backend-signed voucher for a free stone (one per voucher).
    function stackFree(bytes32 wishHash, string calldata name, uint256 nonce, uint256 expires, bytes calldata signature)
        external
        nonReentrant
        returns (uint256 id)
    {
        require(block.timestamp <= expires, "voucher expired");
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(VOUCHER_TYPEHASH, msg.sender, nonce, expires)));
        require(!usedVoucher[digest], "voucher used");
        require(ECDSA.recover(digest, signature) == voucherSigner, "bad voucher");
        usedVoucher[digest] = true;
        id = _stack(msg.sender, wishHash, name, address(0), 0);
    }

    function _stack(address to, bytes32 wishHash, string calldata name, address token, uint256 amount) internal returns (uint256 id) {
        require(bytes(name).length <= 32, "name too long");
        id = nextId++;
        stones[id] = Stone({wishHash: wishHash, name: name, at: uint64(block.timestamp), token: token, amount: amount});
        _mint(to, id);
        emit Stacked(id, to, wishHash, name, id, token == address(0), token, amount);
    }

    /// @notice Number of stones on the tower.
    function height() external view returns (uint256) {
        return nextId - 1;
    }

    function acceptedTokenCount() external view returns (uint256) {
        return acceptedTokens.length;
    }

    // ---------------------------------------------------------------- admin

    /// @notice Set (or, with 0, remove) the price of a stone in `token` units. Stablecoins track fiat, so this
    ///         is refreshed by the operator; it can be driven by an oracle later.
    function setPrice(address token, uint256 price) external onlyOwner {
        _setPrice(token, price);
    }

    function _setPrice(address token, uint256 price) internal {
        require(token != address(0), "zero token");
        if (priceOf[token] == 0 && price > 0) acceptedTokens.push(token);
        priceOf[token] = price;
        emit PriceSet(token, price);
    }

    function setDefaultToken(address token) external onlyOwner {
        require(priceOf[token] > 0, "token not accepted");
        defaultToken = token;
    }

    function setSplit(address treasury_, address revenueShare_, uint16 revenueBps_) external onlyOwner {
        require(treasury_ != address(0) && revenueBps_ + charityBps <= 10_000, "bad split");
        require(revenueShare_ != address(0) || revenueBps_ == 0, "no sink");
        treasury = treasury_;
        revenueShare = revenueShare_;
        revenueBps = revenueBps_;
        emit SplitSet(treasury_, revenueShare_, revenueBps_);
    }

    /// @notice The donation pledge: `charityBps_` of every paid stone goes to `charity_` (0 bps turns it off).
    function setCharity(address charity_, uint16 charityBps_) external onlyOwner {
        require(charity_ != address(0) || charityBps_ == 0, "no charity");
        require(revenueBps + charityBps_ <= 10_000, "bad split");
        charity = charity_;
        charityBps = charityBps_;
        emit CharitySet(charity_, charityBps_);
    }

    function setVoucherSigner(address signer_) external onlyOwner {
        voucherSigner = signer_;
        emit SignerSet(signer_);
    }

    function setBaseURI(string calldata uri) external onlyOwner {
        baseURI = uri;
    }

    function tokenURI(uint256 id) public view override returns (string memory) {
        _requireOwned(id);
        return bytes(baseURI).length == 0 ? "" : string.concat(baseURI, Strings.toString(id));
    }
}
