const { ethers } = require("hardhat");

const CONTRACT_ADDRESS = "0x0E5B6b034012520Ad99EAB4285657504d9F9ad19";
const ABI = [
  "function tokenURI(uint256) view returns (string)",
  "function currentId() view returns (uint256)"
];

async function main() {
  const provider = ethers.provider;
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
  const currentId = await contract.currentId();
  console.log("currentId:", currentId.toString());
  for (let i = 1; i < currentId; i++) {
    const uri = await contract.tokenURI(i);
    console.log(`tokenId ${i} URI:`, uri);
  }
}

main().catch(console.error);
