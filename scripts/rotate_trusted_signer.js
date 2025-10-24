#!/usr/bin/env node
/**
 * Rotate the trusted signer on the deployed contract by calling setTrustedSigner(newAddress)
 * Requires environment variables:
 *  - OWNER_PRIVATE_KEY (hex, 0x...)
 *  - NEW_SIGNER_ADDRESS (0x...)
 *  - RPC_URL (optional; default: https://polygon-rpc.com)
 *  - CONTRACT_ADDRESS (optional; default set by env NEUTRAL_HEART_ADDRESS or NEXT_PUBLIC_NEUTRAL_HEART_ADDRESS)
 */

const { ethers } = require('ethers');

async function main() {
  const ownerKey = process.env.OWNER_PRIVATE_KEY;
  const newSigner = process.env.NEW_SIGNER_ADDRESS;
  const rpc = process.env.RPC_URL || 'https://polygon-rpc.com';
  const contractAddress = process.env.NEUTRAL_HEART_ADDRESS || process.env.NEXT_PUBLIC_NEUTRAL_HEART_ADDRESS;

  if (!ownerKey) {
    console.error('OWNER_PRIVATE_KEY not set');
    process.exit(2);
  }
  if (!newSigner) {
    console.error('NEW_SIGNER_ADDRESS not set');
    process.exit(2);
  }
  if (!contractAddress) {
    console.error('CONTRACT_ADDRESS not set (NEUTRAL_HEART_ADDRESS env)');
    process.exit(2);
  }

  const provider = new ethers.JsonRpcProvider(rpc);
  const wallet = new ethers.Wallet(ownerKey, provider);

  const abi = [
    'function owner() view returns (address)',
    'function setTrustedSigner(address) external',
  ];
  const contract = new ethers.Contract(contractAddress, abi, wallet);

  try {
    const ownerOnChain = await contract.owner();
    console.log('Contract owner (on-chain):', ownerOnChain);
    const signerAddress = await wallet.getAddress();
    console.log('Using OWNER_PRIVATE_KEY address:', signerAddress);
    if (ownerOnChain.toLowerCase() !== signerAddress.toLowerCase()) {
      console.warn('WARNING: OWNER_PRIVATE_KEY does not match contract owner. setTrustedSigner may revert.');
    }

    console.log('Calling setTrustedSigner(', newSigner, ')...');
    const tx = await contract.setTrustedSigner(newSigner);
    console.log('tx.hash', tx.hash);
    console.log('Waiting for confirmation...');
    const rec = await tx.wait();
    console.log('Transaction confirmed. status=', rec.status, 'blockNumber=', rec.blockNumber);
  } catch (e) {
    console.error('Failed to call setTrustedSigner:', e);
    process.exit(1);
  }
}

if (require.main === module) main();
