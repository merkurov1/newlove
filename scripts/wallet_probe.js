require('dotenv').config({ path: '.env.deploy.local' });
const hre = require('hardhat');

function fmt(bn){
  try{ return hre.ethers.utils.formatEther(bn); }catch(e){ return bn.toString(); }
}

async function main(){
  const url = process.env.POLYGON_RPC_URL;
  const pk = process.env.DEPLOY_PRIVATE_KEY;
  if(!url || !pk){
    console.error('POLYGON_RPC_URL or DEPLOY_PRIVATE_KEY missing in .env.deploy.local');
    process.exit(1);
  }

  // Prefer Hardhat's provider when running via `npx hardhat run`
  let provider;
  try{
    if(hre && hre.ethers && hre.ethers.provider){
      provider = hre.ethers.provider;
    } else if (hre && hre.ethers && hre.ethers.providers && hre.ethers.providers.JsonRpcProvider){
      provider = new hre.ethers.providers.JsonRpcProvider(url);
    } else {
      // try to require ethers directly
      const ethersReq = require('ethers');
      provider = new ethersReq.providers.JsonRpcProvider(url);
    }
  }catch(err){
    console.error('Failed to construct provider:', err.message || err);
    process.exit(1);
  }

  // Create wallet bound to same provider
  let wallet;
  try{ wallet = new hre.ethers.Wallet(process.env.DEPLOY_PRIVATE_KEY, provider); }catch(e){
    // fallback to require('ethers') Wallet
    try{ const ethersReq = require('ethers'); wallet = new ethersReq.Wallet(process.env.DEPLOY_PRIVATE_KEY, provider); }catch(err){ console.error('Failed to construct wallet:', err.message || err); process.exit(1); }
  }

  const addr = await wallet.getAddress();
  const bal = await provider.getBalance(addr);
  const nonce = await provider.getTransactionCount(addr);
  const block = await provider.getBlockNumber();
  const net = await provider.getNetwork();

  console.log('provider url:', url);
  console.log('chainId:', net.chainId, 'block:', block);
  console.log('address:', addr);
  console.log('balance (wei):', bal.toString());
  console.log('balance (eth):', fmt(bal));
  console.log('nonce:', nonce);
}

main().catch(e=>{ console.error(e); process.exit(1); });
