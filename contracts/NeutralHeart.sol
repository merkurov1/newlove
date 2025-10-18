// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract NeutralHeart is ERC721, Ownable {
    using ECDSA for bytes32;

    uint256 public currentId;
    uint256 public maxPublicSupply;
    uint256 public publicMinted;
    uint256 public priceWei;

    // Signer address used by backend to sign subscriber vouchers
    address public trustedSigner;

    // Track claims on-chain as a safety net
    mapping(address => bool) public hasClaimedOnChain;

    string private _baseTokenURI;

    event PublicMint(address indexed to, uint256 indexed tokenId);
    event SubscriberClaim(address indexed to, uint256 indexed tokenId);

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 maxPublicSupply_,
        uint256 priceWei_
    ) ERC721(name_, symbol_) {
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

    // PUBLIC MINT (paid)
    function publicMint(uint256 qty) external payable {
        require(qty > 0 && qty <= 10, "invalid qty");
        require(publicMinted + qty <= maxPublicSupply, "public sold out");
        require(msg.value == priceWei * qty, "incorrect payment");

        for (uint256 i = 0; i < qty; i++) {
            uint256 tokenId = currentId++;
            _safeMint(msg.sender, tokenId);
            emit PublicMint(msg.sender, tokenId);
        }
        publicMinted += qty;
    }

    // Subscriber free claim using backend signature
    // signature signs the abi-encoded packed address and contract chain id
    function claimForSubscriber(bytes calldata signature) external {
        require(trustedSigner != address(0), "trusted signer not set");
        require(!hasClaimedOnChain[msg.sender], "already claimed on-chain");

        bytes32 digest = keccak256(abi.encodePacked(address(this), block.chainid, msg.sender));
        address signer = digest.toEthSignedMessageHash().recover(signature);
        require(signer == trustedSigner, "invalid signature");

        hasClaimedOnChain[msg.sender] = true;
        uint256 tokenId = currentId++;
        _safeMint(msg.sender, tokenId);
        emit SubscriberClaim(msg.sender, tokenId);
    }

    // Withdraw funds collected from public sale
    function withdraw(address payable to) external onlyOwner {
        require(to != address(0), "invalid address");
        uint256 bal = address(this).balance;
        require(bal > 0, "no funds");
        to.transfer(bal);
    }
}
