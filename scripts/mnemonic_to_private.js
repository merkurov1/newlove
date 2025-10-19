#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const process = require('process');
let Wallet;
try {
    ({ Wallet } = require('ethers'));
} catch (e) {
    console.error('Required module "ethers" is not installed. Run `npm ci` in the project root to install dependencies.');
    process.exit(2);
}

function usage() {
    console.log('Usage: node scripts/mnemonic_to_private.js [--out <file>] [--mnemonic "seed phrase"]');
    console.log('You can also set MNEMONIC env var. The script will not transmit data anywhere.');
    process.exit(1);
}

function parseArgs() {
    const argv = process.argv.slice(2);
    const outIndex = argv.indexOf('--out');
    let outPath = null;
    if (outIndex !== -1) {
        outPath = argv[outIndex + 1];
        // remove these two
        argv.splice(outIndex, 2);
    }

    const mnIndex = argv.indexOf('--mnemonic');
    let phrase = null;
    if (mnIndex !== -1) {
        phrase = argv[mnIndex + 1];
        argv.splice(mnIndex, 2);
    }

    // If a remaining positional argument exists, treat it as the phrase
    if (!phrase && argv.length >= 1) {
        phrase = argv.join(' ');
    }

    // Environment fallback
    if (!phrase && process.env.MNEMONIC) phrase = process.env.MNEMONIC;

    return { outPath, phrase };
}

function writeEnv(outPath, privateKey) {
    const resolved = path.resolve(process.cwd(), outPath);
    const content = `# Local deploy env (DO NOT COMMIT)\nDEPLOY_PRIVATE_KEY=${privateKey}\n`;
    fs.writeFileSync(resolved, content, { mode: 0o600 });
    console.log('Wrote env file to', resolved);
}

function main() {
    const { outPath, phrase } = parseArgs();
    if (!phrase) {
        console.error('No mnemonic provided. Use --mnemonic "seed phrase" or set MNEMONIC env var.');
        usage();
    }

    try {
        const wallet = Wallet.fromPhrase(phrase.trim());
        const privateKey = wallet.privateKey;
        const address = wallet.address;

        console.log('\n=== DERIVED KEY INFO ===\n');
        console.log('Address:', address);
        console.log('Private key (hex):', privateKey);
        console.log('\nIMPORTANT: Do NOT share your seed phrase or private key. If you write to a file, do not commit it.\n');

        if (outPath) writeEnv(outPath, privateKey);
    } catch (e) {
        console.error('Failed to derive wallet from mnemonic:', e.message || e);
        process.exit(2);
    }
}

main();
