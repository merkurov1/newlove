#!/usr/bin/env node
/*
 * Secure signer key generator.
 * Usage: node scripts/generate_signer_key_secure.js
 *
 * This script generates a new random 32-byte private key, prints the
 * hex private key prefixed with 0x and the derived Ethereum address.
 * IMPORTANT: Do NOT commit the private key to git. Use a secure secret store.
 */

const crypto = require('crypto');
const { ethers } = require('ethers');

function genPriv() {
  const buf = crypto.randomBytes(32);
  // ensure valid private key (not zero and less than curve order) — rely on ethers to validate
  return '0x' + buf.toString('hex');
}

function main() {
  const priv = genPriv();
  let wallet;
  try {
    wallet = new ethers.Wallet(priv);
  } catch (e) {
    console.error('Failed to derive wallet from private key:', e);
    process.exit(2);
  }
  console.log('----- NEW SIGNER KEY -----');
  console.log('PRIVATE_KEY=' + priv);
  console.log('ADDRESS=' + wallet.address);
  console.log('--------------------------');
  console.log('\nStore the PRIVATE_KEY securely (secret manager, env) and rotate the contract trusted signer to ADDRESS.');
}

if (require.main === module) main();
