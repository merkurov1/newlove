#!/usr/bin/env node
/**
 * generate_deploy_key.js
 *
 * Generates a BIP39 mnemonic + derived Ethereum private key (ethers Wallet.createRandom())
 * Prints mnemonic, private key, and address. Optionally writes a .env file with
 * DEPLOY_PRIVATE_KEY if run with --out <path> (e.g. .env.deploy.local).
 *
 * USAGE (run locally):
 *   node scripts/generate_deploy_key.js                # prints key info
 *   node scripts/generate_deploy_key.js --out .env.deploy.local
 *
 * WARNING: Do NOT commit the output file to git. Treat mnemonic and private key as secrets.
 */

import fs from 'fs';
import path from 'path';
import { Wallet } from 'ethers';

function usage() {
    console.log('Usage: node scripts/generate_deploy_key.js [--out <file>]');
    process.exit(1);
}

async function main() {
    const argv = process.argv.slice(2);
    let outPath = null;
    if (argv.length === 0) {
        // ok
    } else if (argv.length === 2 && (argv[0] === '--out' || argv[0] === '-o')) {
        outPath = argv[1];
    } else {
        usage();
    }

    const wallet = Wallet.createRandom();
    const mnemonic = wallet.mnemonic?.phrase || null;
    const privateKey = wallet.privateKey; // 0x...
    const address = wallet.address;

    console.log('\n=== DEPLOY KEY GENERATED (LOCAL) ===\n');
    if (mnemonic) console.log('MNEMONIC (seed phrase):\n', mnemonic, '\n');
    console.log('PRIVATE KEY (hex):\n', privateKey, '\n');
    console.log('ADDRESS: ', address, '\n');
    console.log('IMPORTANT:\n - Do NOT commit these values.\n - If you will use this key for deploying to mainnet, fund it with MATIC and consider using a hardware wallet or multisig for production.\n');

    if (outPath) {
        const resolved = path.resolve(process.cwd(), outPath);
        const content = `# Local deploy env (DO NOT COMMIT)\nDEPLOY_PRIVATE_KEY=${privateKey}\n`;
        fs.writeFileSync(resolved, content, { mode: 0o600 });
        console.log('Wrote env file to', resolved);
        console.log('Reminder: add this file to your .gitignore and do NOT commit it.');
    }
}

main().catch((e) => {
    console.error('Failed to generate key', e);
    process.exit(1);
});
