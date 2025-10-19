const hre = require('hardhat');

(async ()=>{
  const pk = process.env.DEPLOY_PRIVATE_KEY;
  if(!pk){
    console.error('DEPLOY_PRIVATE_KEY missing');
    process.exit(1);
  }
  const wallet = new hre.ethers.Wallet(pk);
  console.log('derived address:', wallet.address);
  try{
    const bal = await hre.ethers.provider.getBalance(wallet.address);
    const fmt = hre.ethers.formatEther ? hre.ethers.formatEther(bal) : hre.ethers.utils.formatEther(bal);
    console.log('balance (wei):', bal.toString());
    console.log('balance (MATIC):', fmt);
  } catch(e){
    console.error('error fetching balance:', e.message || e);
    process.exit(1);
  }
})();
