#!/usr/bin/env node
/*
 * Derive Ethereum private key from mnemonic (BIP39) and print address/private key.
 * Usage: node scripts/getPrivateKeyFromSeed.js [index]
 *
 * The script will prompt you for your seed phrase (hidden input). The mnemonic is not stored.
 * WARNING: Run this locally on a secure machine. Do NOT paste your seed on untrusted hosts.
 */

const readline = require('readline');
const { ethers } = require('ethers');
// avoid adding bip39 dependency; use ethers to derive and validate

async function promptHidden(prompt) {
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
    rl.question(prompt, (value) => {
      rl.history = rl.history || [];
      rl.close();
      resolve(value);
    });
  });
}

async function main() {
  const idx = Number(process.argv[2] || 0);
  // allow providing mnemonic via env var or CLI arg for testing: node scripts/getPrivateKeyFromSeed.js <index> "mnemonic words..."
  const cliMnemonic = process.argv[3];
  const envMnemonic = process.env.MNEMONIC;
  try {
    let mnemonic = null;
    if (cliMnemonic) {
      mnemonic = cliMnemonic;
      console.log('Using mnemonic passed as CLI argument (be careful, this may expose secrets in your shell history)');
    } else if (envMnemonic) {
      mnemonic = envMnemonic;
      console.log('Using mnemonic from MNEMONIC env (be careful, do not store this in shared env)');
    } else {
      mnemonic = await promptHidden('Enter your seed phrase (mnemonic) (hidden): ');
    }
    if (!mnemonic || mnemonic.split(' ').length < 12) {
      console.error('\nInvalid mnemonic provided');
      process.exit(2);
    }
    // default derivation path m/44'/60'/0'/0/index
    const path = `m/44'/60'/0'/0/${idx}`;
    let address, privateKey;
    try {
      // ethers v6 compatibility: prefer Wallet.fromPhrase(path) if available
      if (ethers.Wallet && typeof ethers.Wallet.fromPhrase === 'function') {
        try {
          const w = ethers.Wallet.fromPhrase(mnemonic.trim(), path);
          address = w.address;
          privateKey = w.privateKey;
        } catch (e) {
          // fallback below
        }
      }
      // fallback: if HDNode exists
      if ((!address || !privateKey) && ethers.HDNode && typeof ethers.HDNode.fromMnemonic === 'function') {
        const hd = ethers.HDNode.fromMnemonic(mnemonic.trim()).derivePath(path);
        address = hd.address;
        privateKey = hd.privateKey;
      }
      // final fallback: try Wallet.fromMnemonic (older alias)
      if ((!address || !privateKey) && ethers.Wallet && typeof ethers.Wallet.fromMnemonic === 'function') {
        const w2 = ethers.Wallet.fromMnemonic(mnemonic.trim(), path);
        address = w2.address;
        privateKey = w2.privateKey;
      }
    } catch (e) {
      console.error('\nInvalid mnemonic or derivation failed:', e.message || e);
      process.exit(3);
    }

    if (!address || !privateKey) {
      console.error('\nUnable to derive key using available ethers APIs. Ensure your ethers version supports HD derivation.');
      process.exit(4);
    }

    console.log('\nDerived address and private key (do NOT share the private key):\n');
    console.log('DERIVATION_PATH=' + path);
    console.log('ADDRESS=' + address);
    console.log('PRIVATE_KEY=' + privateKey);
    console.log('\n');
    // Exit without writing anything
    process.exit(0);
  } catch (e) {
    console.error('Error deriving key:', e.message || e);
    process.exit(1);
  }
}

if (require.main === module) main();
