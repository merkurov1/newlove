#!/usr/bin/env node
const fs = require('fs');
const crypto = require('crypto');

function readKey() {
    const p = '.env.deploy.local';
    if (!fs.existsSync(p)) { console.error('File .env.deploy.local not found'); process.exit(2); }
    const s = fs.readFileSync(p, 'utf8');
    const m = s.split('\n').find(l => l.startsWith('DEPLOY_PRIVATE_KEY='));
    if (!m) { console.error('DEPLOY_PRIVATE_KEY not found in .env.deploy.local'); process.exit(3); }
    let pk = m.split('=')[1].trim();
    if (pk.startsWith('0x')) pk = pk.slice(2);
    return pk;
}

function toBuffer(hex) {
    if (hex.length % 2 === 1) hex = '0' + hex;
    return Buffer.from(hex, 'hex');
}

function keccak256(buf) {
    try {
        const h = crypto.createHash('keccak256');
        h.update(buf);
        return h.digest();
    } catch (e) {
        try {
            const h = crypto.createHash('sha3-256');
            h.update(buf);
            return h.digest();
        } catch (e2) {
            console.error('No keccak256/sha3-256 available in crypto. Please run `npm ci` or run locally');
            process.exit(4);
        }
    }
}

function deriveAddressFromPrivateKey(hexPrivate) {
    const priv = toBuffer(hexPrivate);
    if (priv.length !== 32) { console.error('Private key length != 32 bytes'); process.exit(5); }
    try {
        const ecdh = crypto.createECDH('secp256k1');
        ecdh.setPrivateKey(priv);
        const pub = ecdh.getPublicKey(null, 'uncompressed');
        const pubNoPrefix = pub.slice(1);
        const hash = keccak256(pubNoPrefix);
        const addr = '0x' + hash.slice(-20).toString('hex');
        return addr;
    } catch (e) {
        console.error('Failed to derive public key from private key:', String(e));
        process.exit(6);
    }
}

(function main() {
    const known = [
        '0x6b9141E0224B893E6b6864B741DfE19Dd1d3e790'.toLowerCase(),
        '0x3e28EFbeCB29b928e8C12AaCF9995859850B70FC'.toLowerCase(),
        '0x731799fd24B2B9ceCd513a1E2d91Cd1C4F565A62'.toLowerCase(),
        '0x59B8cfDA8B75f268213CfB6b46555841820EA7f0'.toLowerCase()
    ];
    const pk = readKey();
    const addr = deriveAddressFromPrivateKey(pk).toLowerCase();
    console.log('Derived deploy address:', addr);
    for (const k of known) {
        console.log('matches', k, addr === k);
    }
})();
