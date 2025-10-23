const { ethers } = require("hardhat");

const CONTRACT_ADDRESS = "0x568dfF8f3E8F54258bce8c27016B713CaC21a1Ea"; // last deployed NeutralHeart
const BASE_URI = "https://bronze-main-tiger-8.mypinata.cloud/ipfs/bafybeiave6xvn2mkt2pvzwk6vjthzvexbfrnduhpqlflcrcvyetlhbgase/";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // Prepare calldata for setBaseURI(string)
  const iface = new ethers.Interface([
    "function setBaseURI(string b) external"
  ]);
  const data = iface.encodeFunctionData("setBaseURI", [BASE_URI]);

  // Send raw transaction
  const tx = await deployer.sendTransaction({
    to: CONTRACT_ADDRESS,
    data
  });
  const receipt = await tx.wait();
  console.log("Raw setBaseURI receipt.status:", receipt.status);
  console.log("tx hash:", receipt.hash);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
