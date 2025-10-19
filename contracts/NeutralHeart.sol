// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract NeutralHeart is ERC721, ERC721Enumerable, Ownable, ReentrancyGuard, ERC2981 {
    // Returns all tokenIds owned by an address (for wallets/frontends)
    function tokensOfOwner(address owner) external view returns (uint256[] memory) {
        uint256 balance = balanceOf(owner);
        uint256[] memory tokens = new uint256[](balance);
        for (uint256 i = 0; i < balance; i++) {
            tokens[i] = tokenOfOwnerByIndex(owner, i);
        }
        return tokens;
    }

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
    event BaseURISet(string base);
    event TrustedSignerSet(address indexed signer);
    event ContractURISet(string contractURI);
    event Withdraw(address indexed to, uint256 amount);

    constructor(
        uint256 maxPublicSupply_,
        uint256 priceWei_
    ) ERC721("NeutralHeart NFT (2025)", "NHRT25") Ownable(msg.sender) {
        maxPublicSupply = maxPublicSupply_;
        priceWei = priceWei_;
        currentId = 1; // start token ids at 1
    }

    // OWNER
    function setTrustedSigner(address s) external onlyOwner {
        trustedSigner = s;
        emit TrustedSignerSet(s);
    }

    // set the base metadata URI
    function setBaseURI(string memory b) external onlyOwner {
        _baseTokenURI = b;
        emit BaseURISet(b);
    }

    // contract-level metadata (optional) used by marketplaces
    string private _contractURI;

    function setContractURI(string memory uri) external onlyOwner {
        _contractURI = uri;
        emit ContractURISet(uri);
    }

    function contractURI() external view returns (string memory) {
        return _contractURI;
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
        // Ensure base ends with a slash for correct concatenation
        bytes memory b = bytes(base);
        if (b.length == 0) {
            return string(abi.encodePacked(namePart));
        }
        bytes1 last = b[b.length - 1];
        if (last == bytes1('/')) {
            return string(abi.encodePacked(base, namePart));
        }
        return string(abi.encodePacked(base, '/', namePart));
    }

    // PUBLIC MINT (paid)
    function publicMint(uint256 qty) external payable nonReentrant {
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
    function claimForSubscriber(bytes calldata signature) external nonReentrant {
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
    function transform(uint256 tokenId, uint8 variant) external nonReentrant {
        require(variant == 1 || variant == 2, "invalid variant");
        require(ownerOf(tokenId) == msg.sender, "not owner");
        require(tokenVariant[tokenId] == 0, "only neutral tokens can be transformed");

        // burn the neutral token - this will call our overridden _burn which clears the variant
        _burn(tokenId);

        // mint new token and set variant
        uint256 newId = currentId++;
        _safeMint(msg.sender, newId);
        tokenVariant[newId] = variant;

        emit Transform(msg.sender, tokenId, newId, variant);
    }

    // Withdraw funds collected from public sale
    function withdraw(address payable to) external onlyOwner nonReentrant {
        require(to != address(0), "invalid address");
        uint256 bal = address(this).balance;
        require(bal > 0, "no funds");
        (bool ok, ) = to.call{ value: bal }("");
        require(ok, "withdraw failed");
        emit Withdraw(to, bal);
    }

    // set default royalty (ERC-2981)
    function setDefaultRoyalty(address receiver, uint96 feeNumerator) external onlyOwner {
        _setDefaultRoyalty(receiver, feeNumerator);
    }

    // The following functions are overrides required by Solidity for multiple inheritance (ERC721 + ERC721Enumerable)

    // ensure tokenVariant storage is cleared when burning
    // Provide required overrides for multiple inheritance (ERC721 + ERC721Enumerable)
    function _increaseBalance(address account, uint128 value) internal virtual override(ERC721, ERC721Enumerable) {
        super._increaseBalance(account, value);
    }

    // Intercept updates to detect burns (to == address(0)) and clear tokenVariant storage
    function _update(address to, uint256 tokenId, address auth) internal virtual override(ERC721, ERC721Enumerable) returns (address) {
        address previousOwner = super._update(to, tokenId, auth);
        if (to == address(0)) {
            // token burned — clear variant storage
            delete tokenVariant[tokenId];
        }
        return previousOwner;
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721Enumerable, ERC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
