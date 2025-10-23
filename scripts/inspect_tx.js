const hre = require('hardhat');

async function main(){
  const txHash = '0x4addf5b8f9605b7d2176f634680ee0c48071301e04af478d0b647694e2856312';
  const provider = hre.ethers.provider;
  const receipt = await provider.getTransactionReceipt(txHash);
  console.log('receipt:', receipt);
  const tx = await provider.getTransaction(txHash);
  console.log('tx:', tx);
}

main().catch(e=>{ console.error(e); process.exit(1); });
