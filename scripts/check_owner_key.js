#!/usr/bin/env node
const fs = require('fs');
const crypto = require('crypto');

function readKey() {
    const p = '.env.owner.local';
    if (!fs.existsSync(p)) { console.error('File .env.owner.local not found'); process.exit(2); }
    const s = fs.readFileSync(p, 'utf8');
    const m = s.split('\n').find(l => l.startsWith('OWNER_PRIVATE_KEY='));
    if (!m) { console.error('OWNER_PRIVATE_KEY not found in .env.owner.local'); process.exit(3); }
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
        // try OpenSSL keccak if available
        const h = crypto.createHash('keccak256');
        h.update(buf);
        return h.digest();
    } catch (e) {
        try {
            const h = crypto.createHash('sha3-256');
            h.update(buf);
            return h.digest();
        } catch (e2) {
            console.error('No keccak256/sha3-256 available in crypto. Please run `npm ci` to install dependencies (e.g. ethers) or run this locally where keccak is available.');
            process.exit(4);
        }
    }
}

function deriveAddressFromPrivateKey(hexPrivate) {
    const priv = toBuffer(hexPrivate);
    if (priv.length !== 32) { console.error('Private key length != 32 bytes'); process.exit(5); }
    // derive public key using ECDH
    try {
        const ecdh = crypto.createECDH('secp256k1');
        ecdh.setPrivateKey(priv);
        const pub = ecdh.getPublicKey(null, 'uncompressed'); // 0x04 || X(32) || Y(32)
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
    const expected = '0x59B8cfDA8B75f268213CfB6b46555841820EA7f0'.toLowerCase();
    const pk = readKey();
    const addr = deriveAddressFromPrivateKey(pk).toLowerCase();
    console.log('Derived address:', addr);
    console.log('Matches expected:', addr === expected);
})();
