const hre = require('hardhat');
require('dotenv').config({ path: '.env.deploy.local' });

async function main() {
  console.log('Starting deploy_and_check (network:', hre.network.name, ')');

  const maxPublic = process.env.MAX_PUBLIC ? Number(process.env.MAX_PUBLIC) : 1000;
  const priceMatic = process.env.PRICE_MATIC || '1.0';
  const name = process.env.NEUTRAL_HEART_NAME || 'Необратимый Выбор - Neutral Heart';
  const symbol = process.env.NEUTRAL_HEART_SYMBOL || 'NHRT';

  const priceWei = hre.ethers.parseEther ? hre.ethers.parseEther(priceMatic) : hre.ethers.utils.parseEther(priceMatic);

  console.log('Deploying NeutralHeart with args:', { name, symbol, maxPublic, priceMatic });

  const NeutralHeart = await hre.ethers.getContractFactory('NeutralHeart');
  const nh = await NeutralHeart.deploy(name, symbol, maxPublic, priceWei);
  if (typeof nh.waitForDeployment === 'function') {
    await nh.waitForDeployment();
  }
  const deployedAddress = nh.target || nh.address || (typeof nh.getAddress === 'function' ? await nh.getAddress() : null);
  console.log('NeutralHeart deployed to:', deployedAddress);

  try {
    const code = await hre.ethers.provider.getCode(deployedAddress);
    console.log('on-chain bytecode length:', code ? code.length : 0);
  } catch (e) {
    console.warn('Could not fetch code:', e.message || e);
  }

  // owner()
  try {
    const owner = await nh.owner();
    console.log('owner:', owner);
  } catch (e) {
    console.warn('owner() call failed:', e.message || e);
  }

  // attempt to set baseURI if provided
  const baseUri = process.env.NEUTRAL_HEART_BASEURI || 'https://bronze-main-tiger-8.mypinata.cloud/ipfs/bafybeiave6xvn2mkt2pvzwk6vjthzvexbfrnduhpqlflcrcvyetlhbgase/';
  if (baseUri) {
    console.log('Attempting setBaseURI ->', baseUri);
    try {
      const tx = await nh.setBaseURI(baseUri);
      const receipt = await tx.wait();
      console.log('setBaseURI tx hash:', receipt.hash);
      console.log('setBaseURI status:', receipt.status);
    } catch (err) {
      console.error('setBaseURI error:', err && err.message ? err.message : err);
      if (err && err.receipt) {
        console.error('receipt:', err.receipt);
      }
    }
  }

  // contractURI if available
  try {
    const contractURI = await nh.contractURI();
    console.log('contractURI():', contractURI);
  } catch (e) {
    // ignore
  }

  console.log('Done deploy_and_check');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('deploy_and_check failed:', err && err.message ? err.message : err);
    process.exit(1);
  });
