const hre = require('hardhat');

async function main(){
  // address can be passed via DEPLOY_ADDR env var; default to last observed
  const address = process.env.DEPLOY_ADDR || '0xc7A057ae14082a306dCe7e96EFA78fC9278e5fda';
  console.log('Checking address:', address);
  const code = await hre.ethers.provider.getCode(address);
  console.log('code length:', code ? code.length : '(no code)');
  if(!code || code === '0x'){
    console.log('No code at address; deploy likely failed.');
    return;
  }

  const NeutralHeart = await hre.ethers.getContractAt('NeutralHeart', address);
  try{
    const owner = await NeutralHeart.owner();
    console.log('owner:', owner);
  }catch(e){
    console.log('owner() call failed:', e.message || e);
  }

  try{
    const contractURI = await NeutralHeart.contractURI();
    console.log('contractURI():', contractURI);
  }catch(e){
    console.log('contractURI() failed or empty:', e.message || e);
  }

  try{
    // attempt to read base via tokenURI for token 1 if exists
    const exists = await NeutralHeart.totalSupply ? await NeutralHeart.totalSupply() : null;
    console.log('totalSupply (if available):', exists ? exists.toString() : 'n/a');
  }catch(e){
    // ignore
  }
}

main().catch(e=>{ console.error(e); process.exit(1); });
