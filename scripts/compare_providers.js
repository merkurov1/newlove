const hre = require('hardhat');
require('dotenv').config({ path: '.env.deploy.local' });

function fmtEther(bn, ethersLib){
  try{
    if(!bn) return 'null';
    if(ethersLib && ethersLib.formatEther) return ethersLib.formatEther(bn);
    // bn might be a BigNumber-like with toString returning a decimal string in wei
    const asStr = bn.toString();
    // fallback: convert wei string to ether string
    if(asStr.length <= 18) return '0.' + asStr.padStart(18, '0');
    const intPart = asStr.slice(0, asStr.length - 18);
    const frac = asStr.slice(asStr.length - 18).replace(/0+$/, '');
    return frac.length ? `${intPart}.${frac}` : `${intPart}`;
  }catch(e){ return bn.toString(); }
}

async function main(){
  const ethersReq = (()=>{ try{ return require('ethers'); }catch(e){ return undefined; } })();
  const walletAddr = process.env.DEPLOY_ADDRESS || (process.env.DEPLOY_PRIVATE_KEY ? (ethersReq ? new ethersReq.Wallet(process.env.DEPLOY_PRIVATE_KEY).address : (()=>{ try{ return hre.ethers.Wallet ? new hre.ethers.Wallet(process.env.DEPLOY_PRIVATE_KEY).address : null }catch(e){ return null } })()) : null);
  const addr = walletAddr;
  if(!addr){ console.log('No deploy address found in env (DEPLOY_ADDRESS or DEPLOY_PRIVATE_KEY)'); process.exit(1); }
  console.log('address:', addr);

  // hardhat provider
  try{
    const hhProvider = hre.ethers.provider;
    const block = await hhProvider.getBlockNumber();
    const chainId = (await hhProvider.getNetwork()).chainId;
    const bal = await hhProvider.getBalance(addr);
    console.log('Hardhat provider -> chainId:', chainId.toString(), 'block:', block, 'balance:', fmtEther(bal, hre.ethers.utils));
  }catch(e){ console.log('Hardhat provider error:', e.message || e); }

  // direct JSON RPC (use ethers if available, otherwise try hre.ethers.providers)
  try{
    const url = process.env.POLYGON_RPC_URL;
    let provider;
    let ethersLib = ethersReq;
    if(ethersReq && ethersReq.providers && ethersReq.providers.JsonRpcProvider){
      provider = new ethersReq.providers.JsonRpcProvider(url);
    }else if(hre && hre.ethers && hre.ethers.providers && hre.ethers.providers.JsonRpcProvider){
      provider = new hre.ethers.providers.JsonRpcProvider(url);
      ethersLib = hre.ethers;
    }else{
      throw new Error('No JsonRpcProvider available from ethers or hre.ethers');
    }
    const net = await provider.getNetwork();
    const block = await provider.getBlockNumber();
    const bal = await provider.getBalance(addr);
    console.log('JsonRpcProvider -> chainId:', net.chainId, 'block:', block, 'balance:', fmtEther(bal, ethersLib && ethersLib.formatEther ? ethersLib : (ethersLib && ethersLib.utils ? ethersLib.utils : null)));
  }catch(e){ console.log('JsonRpcProvider error:', e.message || e); }
}

main().catch(e=>{ console.error(e); process.exit(1); });
