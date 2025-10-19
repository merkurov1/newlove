#!/usr/bin/env node
/*
 * Pure-Node script to derive ETH private key from BIP39 mnemonic (no external deps).
 * Supports path (default m/44'/60'/0'/0/0) and optional passphrase.
 * Usage:
 *   node scripts/mnemonic_to_private_pure.js --mnemonic "seed words..." --out .env.deploy.local
 */

const fs = require('fs');
const crypto = require('crypto');

function usage() {
    console.log('Usage: node scripts/mnemonic_to_private_pure.js --mnemonic "seed words..." [--passphrase "..."] [--path "m/44\'/60\'/0\'/0/0"] [--out file]');
    process.exit(1);
}

function parseArgs() {
    const argv = process.argv.slice(2);
    const outIdx = argv.indexOf('--out');
    const pathIdx = argv.indexOf('--path');
    const mnemonicIdx = argv.indexOf('--mnemonic');
    const passIdx = argv.indexOf('--passphrase');
    return {
        out: outIdx >= 0 ? argv[outIdx + 1] : null,
        path: pathIdx >= 0 ? argv[pathIdx + 1] : "m/44'/60'/0'/0/0",
        mnemonic: mnemonicIdx >= 0 ? argv[mnemonicIdx + 1] : null,
        passphrase: passIdx >= 0 ? argv[passIdx + 1] : ''
    };
}

function mnemonicToSeed(mnemonic, passphrase) {
    // PBKDF2-HMAC-SHA512 with 2048 iterations, salt = "mnemonic" + passphrase
    const salt = Buffer.from('mnemonic' + (passphrase || ''), 'utf8');
    return crypto.pbkdf2Sync(Buffer.from(mnemonic.normalize('NFKD'), 'utf8'), salt, 2048, 64, 'sha512');
}

function hmacSHA512(key, data) {
    return crypto.createHmac('sha512', key).update(data).digest();
}

const CURVE_N = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');

function ser32(i) {
    const buf = Buffer.alloc(4);
    buf.writeUInt32BE(i >>> 0, 0);
    return buf;
}

function toBigInt(buf) {
    let hex = buf.toString('hex');
    if (!hex) return BigInt(0);
    return BigInt('0x' + hex);
}

function toBuffer32(bi) {
    let hex = bi.toString(16);
    if (hex.length % 2) hex = '0' + hex;
    while (hex.length < 64) hex = '0' + hex;
    return Buffer.from(hex, 'hex');
}

function pointFromPrivate(privBuf) {
    // derive uncompressed public key via createECDH
    const ecdh = crypto.createECDH('secp256k1');
    ecdh.setPrivateKey(privBuf);
    const pub = ecdh.getPublicKey(null, 'uncompressed'); // 0x04 || X || Y
    return pub; // Buffer
}

function compressPublic(pubUncompressed) {
    // pubUncompressed: 65 bytes, [0]==0x04
    const x = pubUncompressed.slice(1, 33);
    const y = pubUncompressed.slice(33, 65);
    const parity = (y[y.length - 1] & 1) ? 0x03 : 0x02;
    return Buffer.concat([Buffer.from([parity]), x]);
}

function CKDPriv({ k, c }, index) {
    // k: Buffer(32) private key, c: Buffer(32) chain code
    const hardened = index >= 0x80000000;
    let data;
    if (hardened) {
        data = Buffer.concat([Buffer.from([0x00]), k, ser32(index)]);
    } else {
        const pub = pointFromPrivate(k);
        const pubComp = compressPublic(pub);
        data = Buffer.concat([pubComp, ser32(index)]);
    }
    const I = hmacSHA512(c, data);
    const IL = I.slice(0, 32);
    const IR = I.slice(32);
    const ilInt = toBigInt(IL);
    const kInt = toBigInt(k);
    const childInt = (ilInt + kInt) % CURVE_N;
    if (childInt === BigInt(0)) throw new Error('Derived invalid key (zero)');
    return { k: toBuffer32(childInt), c: IR };
}

function derivePath(seed, path) {
    // master
    const I = hmacSHA512(Buffer.from('Bitcoin seed', 'utf8'), seed);
    let k = I.slice(0, 32);
    let c = I.slice(32);
    const nodes = path.split('/').slice(1); // drop leading m
    for (const node of nodes) {
        if (node.length === 0) continue;
        let hardened = node.endsWith("'");
        let idx = parseInt(hardened ? node.slice(0, -1) : node, 10);
        if (Number.isNaN(idx)) throw new Error('Invalid path element ' + node);
        if (hardened) idx += 0x80000000;
        const res = CKDPriv({ k, c }, idx);
        k = res.k; c = res.c;
    }
    return k; // Buffer(32)
}

function writeEnv(outPath, privateKey) {
    const resolved = require('path').resolve(process.cwd(), outPath);
    const content = `# Local deploy env (DO NOT COMMIT)\nDEPLOY_PRIVATE_KEY=${privateKey}\n`;
    fs.writeFileSync(resolved, content, { mode: 0o600 });
    console.log('Wrote env file to', resolved);
}

(function main() {
    const args = parseArgs();
    const mnemonic = args.mnemonic || process.env.MNEMONIC;
    if (!mnemonic) usage();
    const seed = mnemonicToSeed(mnemonic, args.passphrase || '');
    const path = args.path;
    const priv = derivePath(seed, path);
    const privHex = '0x' + priv.toString('hex');
    console.log('Derived private key (hex):', privHex);
    try { const ecdh = crypto.createECDH('secp256k1'); ecdh.setPrivateKey(priv); const pub = ecdh.getPublicKey(null, 'uncompressed'); const hash = crypto.createHash('keccak256').update(pub.slice(1)).digest('hex'); const address = '0x' + hash.slice(-40); console.log('Derived address:', address); } catch (e) { try { const pub = crypto.createECDH('secp256k1').setPrivateKey(priv) } catch (e2) { /* ignore */ } }
    if (args.out) writeEnv(args.out, privHex);
})();
