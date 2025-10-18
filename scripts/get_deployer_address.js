#!/usr/bin/env node
/* Print the address corresponding to DEPLOY_PRIVATE_KEY in env
   Does not print the key itself. */
const { Wallet } = require('ethers');
const key = process.env.DEPLOY_PRIVATE_KEY || process.env.SEPOLIA_PRIVATE_KEY;
if (!key) {
    console.error('MISSING_DEPLOY_KEY');
    process.exit(2);
}
try {
    const w = new Wallet(key);
    console.log(w.address);
} catch (e) {
    console.error('INVALID_KEY', e.message);
    process.exit(3);
}
