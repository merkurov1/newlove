const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // Deploy MinimalBaseURI
  const MinimalBaseURI = await ethers.getContractFactory("MinimalBaseURI");
  const contract = await MinimalBaseURI.deploy();
  await contract.waitForDeployment();
  console.log("MinimalBaseURI deployed to:", await contract.getAddress());

  // Try setBaseURI
  const tx = await contract.setBaseURI("https://test-uri/");
  const receipt = await tx.wait();
  console.log("setBaseURI receipt.status:", receipt.status);
  console.log("baseURI:", await contract.baseURI());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
