#!/usr/bin/env node
// Read the trustedSigner() from the deployed NeutralHeart contract
// Usage: node scripts/read_trusted_signer.js [RPC_URL]

const { ethers } = require('ethers');
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_NEUTRAL_HEART_ADDRESS || process.env.NEUTRAL_HEART_ADDRESS || '0xC821AE32031b0fd56978cEdaEE31896C12e7FCe7';
const ABI = [
  'function trustedSigner() view returns (address)',
  'function owner() view returns (address)'
];

async function main() {
  const rpc = process.argv[2] || process.env.RPC_URL || 'https://polygon-rpc.com';
  console.log('Using RPC:', rpc);
  console.log('Contract:', CONTRACT_ADDRESS);
  try {
    const provider = new ethers.JsonRpcProvider(rpc);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
    const signer = await contract.trustedSigner();
    const owner = await contract.owner();
    console.log('trustedSigner:', signer);
    console.log('owner:', owner);
  } catch (e) {
    console.error('Failed to read contract:', e.message || e);
    process.exit(2);
  }
}

main();
