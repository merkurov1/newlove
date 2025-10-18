#!/usr/bin/env node
/*
Simple Pinata JSON uploader.
Usage:
  PINATA_JWT=... node scripts/pinata-upload.js --metadata metadata.json
  or
  PINATA_API_KEY=... PINATA_API_SECRET=... node scripts/pinata-upload.js --metadata metadata.json

metadata.json can be either a single JSON object (metadata for one token)
or an array of metadata objects. Each metadata object should follow ERC-721/1155
metadata shape (name, description, image, attributes, etc.).

The script will call pinJSONToIPFS and print returned IpfsHash and gateway URL.
*/

import fs from 'fs';
import path from 'path';
import process from 'process';

async function pinJSON(metadata) {
    const PINATA_JWT = process.env.PINATA_JWT;
    const PINATA_API_KEY = process.env.PINATA_API_KEY;
    const PINATA_API_SECRET = process.env.PINATA_API_SECRET;

    const url = 'https://api.pinata.cloud/pinning/pinJSONToIPFS';
    const headers = {
        'Content-Type': 'application/json',
    };

    if (PINATA_JWT) {
        headers['Authorization'] = `Bearer ${PINATA_JWT}`;
    } else if (PINATA_API_KEY && PINATA_API_SECRET) {
        headers['pinata_api_key'] = PINATA_API_KEY;
        headers['pinata_secret_api_key'] = PINATA_API_SECRET;
    } else {
        throw new Error('No Pinata credentials found in env (PINATA_JWT or PINATA_API_KEY+PINATA_API_SECRET)');
    }

    const body = JSON.stringify({ pinataContent: metadata });
    const res = await fetch(url, { method: 'POST', headers, body });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Pinata API error ${res.status}: ${txt}`);
    }
    return await res.json();
}

function usageAndExit() {
    console.log('Usage: PINATA_JWT=... node scripts/pinata-upload.js --metadata metadata.json');
    process.exit(1);
}

async function main() {
    const argv = process.argv.slice(2);
    if (argv.length < 2 || argv[0] !== '--metadata') usageAndExit();
    const metadataPath = argv[1];
    if (!fs.existsSync(metadataPath)) {
        console.error('Metadata file not found:', metadataPath);
        process.exit(2);
    }
    const raw = fs.readFileSync(metadataPath, 'utf8');
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (e) {
        console.error('Failed to parse metadata JSON:', e.message);
        process.exit(2);
    }

    const items = Array.isArray(parsed) ? parsed : [parsed];
    for (let i = 0; i < items.length; i++) {
        const meta = items[i];
        console.log(`Pinning item ${i + 1}/${items.length} ...`);
        try {
            const result = await pinJSON(meta);
            // Pinata returns IpfsHash
            const ipfsHash = result.IpfsHash || result.ipfsHash || result.IpfsPinHash;
            console.log('OK:', { ipfsHash, gateway: `https://ipfs.io/ipfs/${ipfsHash}` });
        } catch (e) {
            console.error('Pin failed for item', i + 1, e.message || e);
        }
    }
}

main().catch((e) => {
    console.error('Fatal:', e.message || e);
    process.exit(1);
});
