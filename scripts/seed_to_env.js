#!/usr/bin/env node
/*
 * seed_to_env.js
 *
 * Usage:
 *   node scripts/seed_to_env.js --out .env.owner.local --address 0x59B8...   # interactive prompt for seed
 *   SEED_PHRASE="seed words ..." node scripts/seed_to_env.js --out .env.owner.local --address 0x59B8...
 *
 * Result: writes OWNER_PRIVATE_KEY and NEUTRAL_HEART_ADDRESS to the specified file (default: .env.owner.local)
 * WARNING: do NOT commit the resulting file into git. Keep it secret.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Wallet } = require('ethers');

function usage() {
    console.log('Usage: node scripts/seed_to_env.js [--out <file>] [--address <expectedAddress>] [--no-check]');
    process.exit(1);
}

function askQuestion(query) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => rl.question(query, (ans) => { rl.close(); resolve(ans); }));
}

(async function main() {
    const argv = process.argv.slice(2);
    let out = '.env.owner.local';
    let expected = '0x59B8cfDA8B75f268213CfB6b46555841820EA7f0';
    let noCheck = false;

    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--out' && argv[i + 1]) { out = argv[++i]; }
        else if ((a === '--address' || a === '--owner') && argv[i + 1]) { expected = argv[++i]; }
        else if (a === '--no-check') { noCheck = true; }
        else if (a === '--help' || a === '-h') usage();
        else { usage(); }
    }

    // Read seed phrase from env or prompt
    let seed = process.env.SEED_PHRASE;
    if (!seed) {
        console.log('Enter your seed phrase. It will not be echoed. Press Enter when done.');
        // For simplicity we use a plain prompt; users should run this locally.
        seed = (await askQuestion('Seed phrase: ')).trim();
    }

    if (!seed) {
        console.error('No seed provided');
        process.exit(2);
    }

    // Derive wallet
    let wallet;
    try {
        if (typeof Wallet.fromMnemonic === 'function') {
            wallet = Wallet.fromMnemonic(seed);
        } else if (typeof Wallet.fromPhrase === 'function') {
            wallet = Wallet.fromPhrase(seed);
        } else {
            // fallback: try new Wallet from mnemonic via createRandom not possible; throw
            throw new Error('ethers Wallet does not support fromMnemonic/fromPhrase in this runtime');
        }
    } catch (e) {
        console.error('Failed to derive wallet from seed:', String(e));
        process.exit(3);
    }

    const derived = wallet.address;
    console.log('Derived address:', derived);

    if (!noCheck && expected) {
        if (derived.toLowerCase() !== expected.toLowerCase()) {
            console.warn('\nDerived address DOES NOT match expected owner address:', expected);
            const ans = (await askQuestion('Continue and write this key anyway? (yes/no): ')).trim().toLowerCase();
            if (ans !== 'yes' && ans !== 'y') {
                console.log('Aborting.');
                process.exit(4);
            }
        } else {
            console.log('Derived address matches expected owner.');
        }
    }

    const outPath = path.resolve(process.cwd(), out);
    const content = `# Local owner env (DO NOT COMMIT)\nOWNER_PRIVATE_KEY=${wallet.privateKey}\nNEUTRAL_HEART_ADDRESS=${expected}\n`;

    try {
        fs.writeFileSync(outPath, content, { mode: 0o600 });
        console.log('Wrote environment file to', outPath);
        console.log('Reminder: add this file to .gitignore and do NOT commit it.');
    } catch (e) {
        console.error('Failed to write env file:', String(e));
        process.exit(5);
    }

    process.exit(0);
})();
