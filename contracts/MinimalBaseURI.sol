// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract MinimalBaseURI {
    string public baseURI;
    address public owner;

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    function setBaseURI(string calldata uri) external onlyOwner {
        baseURI = uri;
    }
}
