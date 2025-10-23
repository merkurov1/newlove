// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract SoulChoiceGenesis is ERC721, ERC721Enumerable, Ownable {
    string public baseURI;
    uint256 public constant MAX_SUPPLY = 1000;
    uint256 public priceWei = 1 ether;

    constructor() ERC721("SoulChoice Genesis 2025", "SOULCG25") Ownable(msg.sender) {}

    function setBaseURI(string memory uri) external onlyOwner {
        baseURI = uri;
    }

    function _baseURI() internal view override returns (string memory) {
        return baseURI;
    }

    function mint() external payable {
        require(totalSupply() < MAX_SUPPLY, "Sold out");
        require(msg.value == priceWei, "Incorrect payment");
        _safeMint(msg.sender, totalSupply() + 1);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        // Проверка существования токена через ownerOf
        try this.ownerOf(tokenId) returns (address) {
            // ok
        } catch {
            revert("Not minted");
        }
        return string(abi.encodePacked(baseURI, "/", _toString(tokenId), ".json"));
    }

    // Требуемые override для множественного наследования
    function _increaseBalance(address account, uint128 value) internal virtual override(ERC721, ERC721Enumerable) {
        super._increaseBalance(account, value);
    }

    function _update(address to, uint256 tokenId, address auth) internal virtual override(ERC721, ERC721Enumerable) returns (address) {
        return super._update(to, tokenId, auth);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721Enumerable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
