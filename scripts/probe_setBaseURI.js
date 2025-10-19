const hre = require('hardhat');
require('dotenv').config({ path: '.env.deploy.local' });

function decodeRevertReason(data) {
  if (!data || data === '0x') return null;
  // EVM revert with reason uses function selector 0x08c379a0 (Error(string))
  try {
    if (data.startsWith('0x08c379a0')) {
      // remove selector and decode string
      const reasonHex = '0x' + data.slice(10 + 64); // skip selector + offset
      // This is a simple heuristic; use ethers to decode
      const abi = ['function __revertReason() view returns (string)'];
      const iface = new hre.ethers.Interface(abi);
      // use default ABI decode: decode as string from data after selector
      const reason = hre.ethers.AbiCoder.prototype.decode.call(hre.ethers.AbiCoder.prototype, ['string'], '0x' + data.slice(10));
      return reason[0];
    }
  } catch (e) {
    // fallback
  }
  return data;
}

async function main(){
  const addr = '0x6c72A22a67FE3a2ab0092b4cC22205988Ce286b7';
  const baseUri = process.env.NEUTRAL_HEART_BASEURI || '';
  console.log('Probing setBaseURI on', addr);

  const c = await hre.ethers.getContractAt('NeutralHeart', addr);

  // 1) callStatic
  try{
    console.log('callStatic.setBaseURI -> trying...');
    await c.callStatic.setBaseURI(baseUri, { from: (await hre.ethers.getSigners())[0].address });
    console.log('callStatic: would succeed (no revert)');
  }catch(e){
    console.log('callStatic error:', e && e.message ? e.message : e);
    if (e && e.error && e.error.data) {
      console.log('error.data:', e.error.data);
      console.log('decoded reason:', decodeRevertReason(e.error.data));
    } else if (e && e.data) {
      console.log('data:', e.data);
      console.log('decoded:', decodeRevertReason(e.data));
    }
  }

  // 2) estimateGas
  try{
    const gas = await c.estimateGas.setBaseURI(baseUri);
    console.log('estimateGas.setBaseURI:', gas.toString());
  }catch(e){
    console.log('estimateGas error:', e && e.message ? e.message : e);
  }

  // 3) provider.call with raw calldata
  try{
    const iface = new hre.ethers.Interface(['function setBaseURI(string)']);
    const data = iface.encodeFunctionData('setBaseURI', [baseUri]);
    const provider = hre.ethers.provider;
    console.log('provider.call (raw) ...');
    const res = await provider.call({ to: addr, data });
    console.log('provider.call result:', res);
  }catch(e){
    console.log('provider.call error:', e && e.message ? e.message : e);
    if (e && e.error && e.error.data) console.log('error.data:', e.error.data);
    if (e && e.data) console.log('data:', e.data);
  }
}

main().catch(e=>{ console.error('probe failed:', e); process.exit(1); });
