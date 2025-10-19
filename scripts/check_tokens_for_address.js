// Simple script to list tokens owned by an address for the NeutralHeart contract
// Usage: node scripts/check_tokens_for_address.js <address> [rpcUrl]

const { ethers } = require('ethers');
const fetch = require('node-fetch');

const DEFAULT_RPC = process.env.NEXT_PUBLIC_POLYGON_RPC || 'https://polygon-rpc.com';
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_NEUTRAL_HEART_ADDRESS || '0x731799fd24B2B9ceCd513a1E2d91Cd1C4F565A62';

const ABI = [
    'function currentId() view returns (uint256)',
    'function ownerOf(uint256) view returns (address)',
    'function tokenURI(uint256) view returns (string)'
];

async function main() {
    const args = process.argv.slice(2);
    if (args.length < 1) {
        console.error('Usage: node scripts/check_tokens_for_address.js <address> [rpcUrl]');
        process.exit(2);
    }
    const address = args[0];
    const rpc = args[1] || DEFAULT_RPC;
    console.log('RPC:', rpc);
    console.log('Contract:', CONTRACT_ADDRESS);
    console.log('Querying for owner address:', address);

    const provider = new ethers.JsonRpcProvider(rpc);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

    let currentId;
    try {
        currentId = await contract.currentId();
    } catch (e) {
        console.error('Failed to read currentId from contract:', String(e));
        process.exit(3);
    }
    const maxId = Number(currentId) - 1;
    console.log('CurrentId reported by contract:', String(currentId), '=> tokens minted up to id', maxId);

    const owned = [];

    for (let id = 1; id <= maxId; id++) {
        try {
            const owner = await contract.ownerOf(id);
            if (owner && String(owner).toLowerCase() === String(address).toLowerCase()) {
                // fetch tokenURI
                let uri = '';
                try {
                    uri = await contract.tokenURI(id);
                } catch (e) {
                    uri = '';
                }
                let image = null;
                if (uri) {
                    try {
                        let fetchUrl = uri;
                        if (uri.startsWith('ipfs://')) fetchUrl = 'https://ipfs.io/ipfs/' + uri.slice(7);
                        const res = await fetch(fetchUrl, { timeout: 10000 });
                        if (res && res.ok) {
                            const j = await res.json();
                            image = j.image || j.image_url || null;
                            if (image && image.startsWith('ipfs://')) image = 'https://ipfs.io/ipfs/' + image.slice(7);
                        }
                    } catch (e) {
                        // ignore fetch errors
                    }
                }
                owned.push({ id, uri, image });
            }
        } catch (e) {
            // ownerOf may revert for non-existent tokens; ignore
        }
    }

    console.log('Found', owned.length, 'tokens owned by', address);
    for (const t of owned) {
        console.log('- id:', t.id);
        console.log('  tokenURI:', t.uri || '(empty)');
        console.log('  image:', t.image || '(none)');
    }

    if (owned.length === 0) process.exit(0);
}

main().catch(e => { console.error(e); process.exit(99); });
