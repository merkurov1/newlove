#!/usr/bin/env node
/*
Verify signer private key and print derived address.
Usage:
  SIGNER_PRIVATE_KEY=... node scripts/verify_signer.js
or
  node scripts/verify_signer.js 0xabc...

This outputs the derived Ethereum address and public key info.
*/

import process from 'process';
import { Wallet } from 'ethers';

function hexNormalize(k) {
    if (!k) return null;
    if (k.startsWith('0x')) return k;
    return '0x' + k;
}

async function main() {
    const arg = process.argv[2];
    const envKey = process.env.SIGNER_PRIVATE_KEY || process.env.SIGNER_KEY;
    const raw = hexNormalize(arg || envKey || '');
    if (!raw) {
        console.error('Provide private key as env SIGNER_PRIVATE_KEY or as first arg');
        process.exit(2);
    }
    try {
        const w = new Wallet(raw);
        console.log('Private key (hex):', raw);
        console.log('Address:', w.address);
        console.log('Public key:', w.publicKey);
    } catch (e) {
        console.error('Invalid private key:', e.message || e);
        process.exit(3);
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
