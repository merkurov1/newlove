const ethers = require('ethers');

const providers = [
  { name: 'POLYGON_RPC_URL (env)', url: process.env.POLYGON_RPC_URL },
  { name: 'Ankr Public', url: 'https://rpc.ankr.com/polygon' },
  { name: 'Polygon RPC (public)', url: 'https://polygon-rpc.com' }
];

async function main(){
  const pk = process.env.DEPLOY_PRIVATE_KEY;
  if(!pk){
    console.error('DEPLOY_PRIVATE_KEY missing');
    process.exit(1);
  }
  const wallet = new ethers.Wallet(pk);
  console.log('Derived address:', wallet.address);

  for(const p of providers){
    if(!p.url){
      console.log(`${p.name}: (no url)`);
      continue;
    }
    try{
      // Support ethers v5 and v6 provider constructors
      let provider;
      if (ethers.providers && ethers.providers.JsonRpcProvider) {
        provider = new ethers.providers.JsonRpcProvider(p.url);
      } else if (ethers.JsonRpcProvider) {
        provider = new ethers.JsonRpcProvider(p.url);
      } else {
        throw new Error('No JsonRpcProvider available in ethers');
      }
      const bal = await provider.getBalance(wallet.address);
      const fmt = ethers.formatEther ? ethers.formatEther(bal) : ethers.utils.formatEther(bal);
      console.log(`${p.name} (${p.url}) -> ${fmt} MATIC`);
    } catch(e){
      console.log(`${p.name} (${p.url}) -> error: ${e.message}`);
    }
  }

  // Polygonscan API (v1 may be deprecated, still try)
  const apiKey = process.env.POLYGONSCAN_API_KEY;
  if(apiKey){
    try{
      const url = `https://api.polygonscan.com/api?module=account&action=balance&address=${wallet.address}&tag=latest&apikey=${apiKey}`;
      const res = await fetch(url);
      const j = await res.json();
      console.log('Polygonscan API raw:', j);
      if(j && j.status === '1'){
        const balanceWei = j.result;
        const fmt = ethers.formatEther ? ethers.formatEther(balanceWei) : ethers.utils.formatEther(balanceWei);
        console.log(`Polygonscan API -> ${fmt} MATIC (raw wei: ${balanceWei})`);
      } else {
        console.log('Polygonscan API -> error or no data (see raw above)');
      }
    }catch(e){
      console.log('Polygonscan API -> error:', e.message);
    }
  } else {
    console.log('POLYGONSCAN_API_KEY not set; skipping Polygonscan check');
  }
}

main().catch(e=>{ console.error(e); process.exit(1); });
