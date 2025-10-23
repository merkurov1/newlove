const hre = require('hardhat');
require('dotenv').config({ path: '.env.deploy.local' });
const fs = require('fs');

const pk = process.env.DEPLOY_PRIVATE_KEY;
const addr = '0x6c72A22a67FE3a2ab0092b4cC22205988Ce286b7';
const baseUri = process.env.NEUTRAL_HEART_BASEURI;

// Читаем полный ABI из артефакта
const artifact = JSON.parse(fs.readFileSync('./artifacts/contracts/NeutralHeart.sol/NeutralHeart.json'));
const abi = artifact.abi;

async function main() {
  const provider = hre.ethers.provider;
  const signer = new hre.ethers.Wallet(pk, provider);
  const contract = new hre.ethers.Contract(addr, abi, signer);
  console.log('Using signer:', signer.address);
  try {
    console.log('callStatic via signer...');
    await contract.callStatic.setBaseURI(baseUri);
    console.log('callStatic: OK');
  } catch (e) {
    console.log('callStatic error:', e.message);
  }
  try {
    await contract.estimateGas.setBaseURI(baseUri);
    console.log('estimateGas: OK');
  } catch (e) {
    console.log('estimateGas error:', e.message);
  }
  try {
    const iface = new hre.ethers.Interface(abi);
    const data = iface.encodeFunctionData('setBaseURI', [baseUri]);
    const result = await provider.call({
      to: addr,
      data
    });
    console.log('provider.call result:', result);
  } catch (e) {
    console.log('provider.call error:', e.message);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
