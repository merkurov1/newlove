#!/usr/bin/env node
// Simple node script that reproduces the Solidity tokenURI concatenation logic
// used in contracts/NeutralHeart.sol. Run without installing any deps.

function tokenURI(base, variant) {
    const namePart = variant === 1 ? 'angel.json' : variant === 2 ? 'devil.json' : 'neutral.json';
    if (!base || base.length === 0) return namePart;
    const last = base[base.length - 1];
    if (last === '/') return base + namePart;
    return base + '/' + namePart;
}

const examples = [
    { base: '', v: 0 },
    { base: 'ipfs://QmCID', v: 0 },
    { base: 'ipfs://QmCID/', v: 1 },
    { base: 'https://example.com/metadata', v: 2 },
    { base: 'https://example.com/metadata/', v: 2 },
];

for (const e of examples) {
    console.log('base=', e.base || '(empty)', 'variant=', e.v, '->', tokenURI(e.base, e.v));
}

// exit success
process.exit(0);
