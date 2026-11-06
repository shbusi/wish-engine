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

/// @title StoneCairn — every stone on the tower is an NFT.
/// @notice `stack` pays the stone price in USDC, split between the treasury and the CAIRN buyback pool.
///         `stackFree` redeems a voucher signed by the backend (the "one free stone a day"), so the
///         web2 economy and the chain agree on who gets a free stone. The wish text itself stays off-chain;
///         only its hash is recorded, so a wish can be proven later without being published.
contract StoneCairn is ERC721, EIP712, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Stone {
        bytes32 wishHash; // keccak256 of the wish text (+ salt) kept by the wisher / backend
        string name;      // engraved name, up to 32 bytes
        uint64 at;        // block timestamp
        bool free;        // redeemed with a voucher
    }

    IERC20 public immutable usdc;
    uint256 public price;          // USDC (6 decimals) per stone, e.g. 100_000 = $0.10
    address public treasury;
    address public buyback;        // receives buybackBps of every paid stone; buys and burns CAIRN
    uint16 public buybackBps;      // out of 10_000
    address public voucherSigner;  // backend key that signs free-stone vouchers
    string public baseURI;

    uint256 public nextId = 1;     // height in stones == nextId - 1
    mapping(uint256 => Stone) public stones;
    mapping(bytes32 => bool) public usedVoucher;

    bytes32 private constant VOUCHER_TYPEHASH = keccak256("Voucher(address to,uint256 nonce,uint256 expires)");

    event Stacked(uint256 indexed id, address indexed owner, bytes32 wishHash, string name, uint256 height, bool free);
    event PriceSet(uint256 price);
    event SplitSet(address treasury, address buyback, uint16 buybackBps);
    event SignerSet(address signer);

    constructor(IERC20 usdc_, uint256 price_, address treasury_, address buyback_, address signer_, address owner_)
        ERC721("Wish Cairn Stone", "STONE")
        EIP712("WishCairn", "1")
        Ownable(owner_)
    {
        require(address(usdc_) != address(0) && treasury_ != address(0) && buyback_ != address(0), "zero address");
        usdc = usdc_;
        price = price_;
        treasury = treasury_;
        buyback = buyback_;
        buybackBps = 5000;
        voucherSigner = signer_;
    }

    // ---------------------------------------------------------------- stacking

    /// @notice Pay `price` USDC and put a stone on the tower.
    function stack(bytes32 wishHash, string calldata name) external nonReentrant returns (uint256 id) {
        uint256 toBuyback = price * buybackBps / 10_000;
        if (price - toBuyback > 0) usdc.safeTransferFrom(msg.sender, treasury, price - toBuyback);
        if (toBuyback > 0) usdc.safeTransferFrom(msg.sender, buyback, toBuyback);
        id = _stack(msg.sender, wishHash, name, false);
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
        id = _stack(msg.sender, wishHash, name, true);
    }

    function _stack(address to, bytes32 wishHash, string calldata name, bool free) internal returns (uint256 id) {
        require(bytes(name).length <= 32, "name too long");
        id = nextId++;
        stones[id] = Stone({wishHash: wishHash, name: name, at: uint64(block.timestamp), free: free});
        _mint(to, id);
        emit Stacked(id, to, wishHash, name, id, free);
    }

    /// @notice Number of stones on the tower.
    function height() external view returns (uint256) {
        return nextId - 1;
    }

    // ---------------------------------------------------------------- admin

    function setPrice(uint256 price_) external onlyOwner {
        price = price_;
        emit PriceSet(price_);
    }

    function setSplit(address treasury_, address buyback_, uint16 buybackBps_) external onlyOwner {
        require(treasury_ != address(0) && buyback_ != address(0) && buybackBps_ <= 10_000, "bad split");
        treasury = treasury_;
        buyback = buyback_;
        buybackBps = buybackBps_;
        emit SplitSet(treasury_, buyback_, buybackBps_);
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
