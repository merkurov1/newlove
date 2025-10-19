const hre = require('hardhat');
require('dotenv').config({ path: '.env.deploy.local' });

async function main(){
  const addr = process.env.DEPLOY_ADDR || '0x1C571843467Ee809dD307Ce4BdE769Bc3CAf2074';
  const pk = process.env.DEPLOY_PRIVATE_KEY;
  const baseUri = process.env.NEUTRAL_HEART_BASEURI || '';
  if(!pk){ console.error('no DEPLOY_PRIVATE_KEY'); process.exit(1); }

  const provider = hre.ethers.provider;
  const signer = new hre.ethers.Wallet(pk, provider);
  console.log('Using signer:', signer.address);

  const c = await hre.ethers.getContractAt('NeutralHeart', addr);
  console.log('Sending setBaseURI tx (gasLimit 500k) ...');
  try{
    const tx = await c.connect(signer).setBaseURI(baseUri, { gasLimit: 500000 });
    console.log('tx hash:', tx.hash);
    const receipt = await tx.wait();
    console.log('receipt status:', receipt.status, 'gasUsed:', receipt.gasUsed.toString());
  }catch(e){
    console.error('tx error:', e && e.message ? e.message : e);
    if(e && e.receipt) console.error('receipt:', e.receipt);
    if(e && e.error && e.error.data) console.error('error.data:', e.error.data);
    if(e && e.data) console.error('data:', e.data);
  }
}

main().catch(e=>{ console.error(e); process.exit(1); });
