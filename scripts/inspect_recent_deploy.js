require('dotenv').config();
const ethers = require('ethers');

(async ()=>{
  const rpc = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com';
  const provider = ethers.providers && ethers.providers.JsonRpcProvider ? new ethers.providers.JsonRpcProvider(rpc) : new ethers.JsonRpcProvider(rpc);
  const addr = '0x8e78b0018EDFB90780e5D095eB887a004E22435b';
  const txHash = '0x2c8bc6ea4faf0d91666fb3407b562cb095920be54cc79709a80a38cf59285841';
  console.log('RPC used:', rpc);
  try{
    const code = await provider.getCode(addr);
    console.log('code length:', code.length, 'starts with 0x', code.startsWith('0x'));
    console.log('code sample:', code.slice(0,120));
  } catch(e){
    console.error('getCode error:', e.message);
  }
  try{
    const receipt = await provider.getTransactionReceipt(txHash);
    console.log('receipt:', receipt);
  } catch(e){
    console.error('getReceipt error:', e.message);
  }
  try{
    const tx = await provider.getTransaction(txHash);
    console.log('tx:', tx);
  } catch(e){
    console.error('getTransaction error:', e.message);
  }
})();
