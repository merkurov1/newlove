const { ethers } = require("hardhat");

const CONTRACT_ADDRESS = "0x6b9141E0224B893E6b6864B741DfE19Dd1d3e790";
const ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function tokenOfOwnerByIndex(address,uint256) view returns (uint256)",
  "function tokenURI(uint256) view returns (string)",
  "function publicMinted() view returns (uint256)",
  "function currentId() view returns (uint256)"
];
const OWNER = "0x51F4F4462Eb7A7be7628c8Ed0Bd0702470f42331";

async function main() {
  const provider = ethers.provider;
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
  const minted = await contract.publicMinted();
  const currentId = await contract.currentId();
  const balance = await contract.balanceOf(OWNER);
  console.log("publicMinted:", minted.toString());
  console.log("currentId:", currentId.toString());
  console.log("balance:", balance.toString());
  for (let i = 0; i < balance; i++) {
    const tokenId = await contract.tokenOfOwnerByIndex(OWNER, i);
    const uri = await contract.tokenURI(tokenId);
    console.log(`tokenId ${tokenId} URI:`, uri);
  }
}

main().catch(console.error);
