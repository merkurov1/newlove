const hre = require('hardhat');

async function main(){
  const address = '0x4d287DFE62853e53D41980947bBd0f98f7eD6600'; // deployed from last run
  const NeutralHeart = await hre.ethers.getContractAt('NeutralHeart', address);
  const owner = await NeutralHeart.owner();
  const base = await NeutralHeart.contractURI ? await NeutralHeart.contractURI() : '';
  console.log('contract:', address);
  console.log('owner:', owner);
  try{
    const baseURI = await NeutralHeart._baseURI ? await NeutralHeart._baseURI() : '';
    console.log('baseURI (internal _baseURI):', baseURI);
  } catch(e){ /* ignore */ }
  try{
    const publicBase = await NeutralHeart.contractURI();
    console.log('contractURI:', publicBase);
  } catch(e){ /* ignore */ }
  try{
    const tokenBase = await NeutralHeart.callStatic._baseURI();
    console.log('callStatic _baseURI:', tokenBase);
  } catch(e){}
}

main().catch((e)=>{ console.error(e); process.exit(1); });
