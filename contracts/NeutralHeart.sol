// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract NeutralHeart is ERC721, Ownable {

    uint256 public currentId;
    uint256 public maxPublicSupply;
    uint256 public publicMinted;
    uint256 public priceWei;

    // Signer address used by backend to sign subscriber vouchers
    address public trustedSigner;

    // Track claims on-chain as a safety net
    mapping(address => bool) public hasClaimedOnChain;

    // token variant: 0 = neutral, 1 = angel, 2 = devil
    mapping(uint256 => uint8) public tokenVariant;

    string private _baseTokenURI;

    event PublicMint(address indexed to, uint256 indexed tokenId);
    event SubscriberClaim(address indexed to, uint256 indexed tokenId);
    event Transform(address indexed owner, uint256 indexed burnedId, uint256 indexed newId, uint8 variant);

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 maxPublicSupply_,
        uint256 priceWei_
    ) ERC721(name_, symbol_) Ownable(msg.sender) {
        maxPublicSupply = maxPublicSupply_;
        priceWei = priceWei_;
        currentId = 1; // start token ids at 1
    }

    // OWNER
    function setTrustedSigner(address s) external onlyOwner {
        trustedSigner = s;
    }

    function setBaseURI(string memory b) external onlyOwner {
        _baseTokenURI = b;
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    // Override tokenURI to return one of three JSON filenames (neutral.json / angel.json / devil.json)
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        // Ensure token exists using OpenZeppelin's internal check
        _requireOwned(tokenId);
        string memory base = _baseURI();
        uint8 v = tokenVariant[tokenId];
        string memory namePart = "neutral.json";
        if (v == 1) {
            namePart = "angel.json";
        } else if (v == 2) {
            namePart = "devil.json";
        }
        return string(abi.encodePacked(base, namePart));
    }

    // PUBLIC MINT (paid)
    function publicMint(uint256 qty) external payable {
        // Restrict public mint to one token per transaction to avoid accidental multi-mints
        require(qty == 1, "only 1 token per tx");
        require(publicMinted + qty <= maxPublicSupply, "public sold out");
        require(msg.value == priceWei * qty, "incorrect payment");

        for (uint256 i = 0; i < qty; i++) {
            uint256 tokenId = currentId++;
            _safeMint(msg.sender, tokenId);
            // default variant is neutral
            tokenVariant[tokenId] = 0;
            emit PublicMint(msg.sender, tokenId);
        }
        publicMinted += qty;
    }

    // OWNER: update price (in wei)
    function setPrice(uint256 newPriceWei) external onlyOwner {
        priceWei = newPriceWei;
    }

    // Subscriber free claim using backend signature
    // signature signs the abi-encoded packed address and contract chain id
    function claimForSubscriber(bytes calldata signature) external {
        require(trustedSigner != address(0), "trusted signer not set");
        require(!hasClaimedOnChain[msg.sender], "already claimed on-chain");

    bytes32 digest = keccak256(abi.encodePacked(address(this), block.chainid, msg.sender));
    // Use MessageHashUtils to compute the prefixed digest, then recover
    bytes32 prefixed = MessageHashUtils.toEthSignedMessageHash(digest);
    address signer = ECDSA.recover(prefixed, signature);
        require(signer == trustedSigner, "invalid signature");

        hasClaimedOnChain[msg.sender] = true;
        uint256 tokenId = currentId++;
        _safeMint(msg.sender, tokenId);
        // default to neutral
        tokenVariant[tokenId] = 0;
        emit SubscriberClaim(msg.sender, tokenId);
    }

    // Transform a neutral token into a variant (1 = angel, 2 = devil)
    // Burns the neutral token and mints a new token with the variant set.
    function transform(uint256 tokenId, uint8 variant) external {
        require(variant == 1 || variant == 2, "invalid variant");
        require(ownerOf(tokenId) == msg.sender, "not owner");
        require(tokenVariant[tokenId] == 0, "only neutral tokens can be transformed");

        // burn the neutral token
        _burn(tokenId);

        // mint new token and set variant
        uint256 newId = currentId++;
        _safeMint(msg.sender, newId);
        tokenVariant[newId] = variant;

        emit Transform(msg.sender, tokenId, newId, variant);
    }

    // Withdraw funds collected from public sale
    function withdraw(address payable to) external onlyOwner {
        require(to != address(0), "invalid address");
        uint256 bal = address(this).balance;
        require(bal > 0, "no funds");
        to.transfer(bal);
    }
}
