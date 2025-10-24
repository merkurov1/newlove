#!/usr/bin/env node
/**
 * Interactive rotate and optional local env write.
 * Prompts (hidden) for OWNER_PRIVATE_KEY and optionally SIGNER_PRIVATE_KEY.
 * Calls setTrustedSigner(newSignerAddress) on the contract and shows tx.hash/status.
 * Optionally writes SIGNER_PRIVATE_KEY to .env.local (INSECURE: use with caution).
 */

const readline = require('readline');
const fs = require('fs');
const { ethers } = require('ethers');

function prompt(promptText) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(promptText, (ans) => { rl.close(); resolve(ans); }));
}

function promptHidden(promptText) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const stdin = process.openStdin();
    process.stdin.on('data', (char) => {
      char = char + '';
      switch (char) {
        case '\n':
        case '\r':
        case '\u0004':
          rl.output.write('\n');
          break;
        default:
          rl.output.write('*');
          break;
      }
    });
    rl.question(promptText, (value) => {
      rl.history = rl.history || [];
      rl.close();
      resolve(value);
    });
  });
}

async function main() {
  try {
    console.log('\nInteractive trusted-signer rotation.');
    console.log('NOTE: Do NOT paste secrets into chat. Run this only on a secure machine.');

    const ownerKey = (process.env.OWNER_PRIVATE_KEY) ? process.env.OWNER_PRIVATE_KEY : await promptHidden('Enter OWNER_PRIVATE_KEY (hidden): ');
    if (!ownerKey) { console.error('Owner key required'); process.exit(2); }

    const defaultNewSigner = process.env.NEW_SIGNER_ADDRESS || '0x541feb1F78347E08E36ebcDF27A23baC223f92B1';
    const newSigner = await prompt(`New signer address [${defaultNewSigner}]: `) || defaultNewSigner;

    const rpc = (process.env.RPC_URL) ? process.env.RPC_URL : (await prompt(`RPC URL [https://polygon-rpc.com]: `)) || 'https://polygon-rpc.com';
    const contractAddress = process.env.NEUTRAL_HEART_ADDRESS || process.env.NEXT_PUBLIC_NEUTRAL_HEART_ADDRESS || (await prompt('Contract address (leave empty to use env NEUTRAL_HEART_ADDRESS): '));
    if (!contractAddress) {
      console.error('Contract address not provided in env or input');
      process.exit(2);
    }

    const provider = new ethers.JsonRpcProvider(rpc);
    const wallet = new ethers.Wallet(ownerKey, provider);
    const contractAbi = ['function owner() view returns (address)', 'function setTrustedSigner(address) external'];
    const contract = new ethers.Contract(contractAddress, contractAbi, wallet);

    const ownerOnChain = await contract.owner();
    console.log('Contract owner (on-chain):', ownerOnChain);
    const ownerAddr = await wallet.getAddress();
    console.log('Using OWNER_PRIVATE_KEY address:', ownerAddr);
    if (ownerOnChain.toLowerCase() !== ownerAddr.toLowerCase()) {
      console.warn('WARNING: Provided owner key does not match contract owner; transaction may revert.');
      const cont = (await prompt('Continue anyway? (y/N): ')).toLowerCase();
      if (cont !== 'y') { console.log('Aborting.'); process.exit(0); }
    }

    console.log(`Calling setTrustedSigner(${newSigner})...`);
    const tx = await contract.setTrustedSigner(newSigner);
    console.log('tx.hash', tx.hash);
    console.log('Waiting for confirmation...');
    const rec = await tx.wait();
    console.log('Transaction confirmed. status=', rec.status, 'blockNumber=', rec.blockNumber);

    const save = (await prompt('Do you want to save SIGNER_PRIVATE_KEY to local .env.local? (Y/n): ')) || 'y';
    if (save.toLowerCase() === 'y' || save === '') {
      const signerPriv = (process.env.SIGNER_PRIVATE_KEY) ? process.env.SIGNER_PRIVATE_KEY : await promptHidden('Enter SIGNER_PRIVATE_KEY to save (hidden): ');
      if (!signerPriv) { console.log('No signer private key provided; skipping write.'); process.exit(0); }
      const envFile = '.env.local';
      let existing = '';
      try { existing = fs.readFileSync(envFile, 'utf8'); } catch (e) { existing = ''; }
      const lines = existing.split(/\r?\n/).filter(Boolean).filter(l => !l.startsWith('SIGNER_PRIVATE_KEY='));
      lines.push(`SIGNER_PRIVATE_KEY=${signerPriv}`);
      fs.writeFileSync(envFile, lines.join('\n') + '\n', { mode: 0o600 });
      console.log(`Wrote SIGNER_PRIVATE_KEY to ${envFile} (file permissions set to 600).`);
    } else {
      console.log('Skipped writing .env.local. Remember to update your deployment secrets (Vercel, etc.).');
    }

    console.log('Done.');
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
}

if (require.main === module) main();
