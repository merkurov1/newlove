const { ethers } = require("hardhat");

const CONTRACT_ADDRESS = "0x0E5B6b034012520Ad99EAB4285657504d9F9ad19";
const ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function tokenOfOwnerByIndex(address,uint256) view returns (uint256)",
  "function tokenURI(uint256) view returns (string)",
  "function tokenVariant(uint256) view returns (uint8)"
];
const OWNER = "0x51F4F4462Eb7A7be7628c8Ed0Bd0702470f42331";

async function main() {
  const provider = ethers.provider;
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
  const balance = await contract.balanceOf(OWNER);
  console.log("balance:", balance.toString());
  for (let i = 0; i < balance; i++) {
    const tokenId = await contract.tokenOfOwnerByIndex(OWNER, i);
    const uri = await contract.tokenURI(tokenId);
    const variant = await contract.tokenVariant(tokenId);
    console.log(`tokenId ${tokenId} URI:`, uri, "variant:", variant);
  }
}

main().catch(console.error);
