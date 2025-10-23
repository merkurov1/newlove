const { ethers } = require('ethers');

async function main() {
    try {
        const priv = process.env.OWNER_PRIVATE_KEY;
        if (!priv) throw new Error('OWNER_PRIVATE_KEY not found');
        const rpc = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com/';
        const provider = new ethers.JsonRpcProvider(rpc);
        const wallet = new ethers.Wallet(priv, provider);

        const addr = process.env.NEUTRAL_HEART_ADDRESS || '0x6b9141E0224B893E6b6864B741DfE19Dd1d3e790';
        const abi = [
            'function priceWei() view returns (uint256)',
            'function publicMint(uint256) payable',
            'function currentId() view returns (uint256)',
            'function tokenURI(uint256) view returns (string)',
            'function transform(uint256,uint8)',
            'function tokenVariant(uint256) view returns (uint8)'
        ];

        const contract = new ethers.Contract(addr, abi, wallet);

        console.log('Using wallet', wallet.address);

        // price
        const price = await contract.priceWei();
        console.log('priceWei', price.toString());

        // mint 1 (price may be zero)
        console.log('Sending publicMint(1)...');
        const tx = await contract.publicMint(1, { value: 0 });
        console.log('mint tx hash', tx.hash);
        const rec = await tx.wait();
        console.log('mint receipt status', rec.status);

        // parse minted token id(s)
        const transferTopic = ethers.id('Transfer(address,address,uint256)');
        let mintedIds = [];
        for (const l of rec.logs || []) {
            try {
                if (l.topics && l.topics[0] === transferTopic) {
                    const toTopic = l.topics[2];
                    const toAddr = '0x' + toTopic.slice(-40).toLowerCase();
                    if (toAddr === wallet.address.toLowerCase()) {
                        const id = Number(BigInt(l.topics[3]));
                        mintedIds.push(id);
                    }
                }
            } catch (e) {
                // ignore
            }
        }
        if (mintedIds.length === 0) {
            const cur = await contract.currentId();
            mintedIds.push(Number(cur) - 1);
        }
        console.log('mintedIds', mintedIds);

        const tokenId = mintedIds[0];
        const uri = await contract.tokenURI(tokenId);
        console.log('tokenURI before transform', uri);
        if (uri && uri.startsWith('ipfs://')) console.log('token metadata (gateway):', 'https://ipfs.io/ipfs/' + uri.slice(7));

        // transform to Angel (1)
        console.log('Calling transform(', tokenId, ',1)');
        const tx2 = await contract.transform(tokenId, 1);
        console.log('transform tx hash', tx2.hash);
        const rec2 = await tx2.wait();
        console.log('transform receipt status', rec2.status);

        // parse new token id
        let newId = null;
        for (const l of rec2.logs || []) {
            try {
                if (l.topics && l.topics[0] === transferTopic) {
                    const toTopic = l.topics[2];
                    const toAddr = '0x' + toTopic.slice(-40).toLowerCase();
                    if (toAddr === wallet.address.toLowerCase()) {
                        const id = Number(BigInt(l.topics[3]));
                        if (!mintedIds.includes(id)) newId = id;
                    }
                }
            } catch (e) { }
        }
        if (!newId) {
            const cur = await contract.currentId();
            newId = Number(cur);
        }
        console.log('new token id', newId);

        const uri2 = await contract.tokenURI(newId);
        console.log('tokenURI after transform', uri2);
        if (uri2 && uri2.startsWith('ipfs://')) console.log('token metadata (gateway):', 'https://ipfs.io/ipfs/' + uri2.slice(7));

        // variant check
        try {
            const v = await contract.tokenVariant(newId);
            console.log('tokenVariant newId', v.toString());
        } catch (e) {
            console.log('cannot read tokenVariant:', String(e));
        }

        console.log('\nDONE');
    } catch (e) {
        console.error('error in script', e);
        process.exit(1);
    }
}

if (require.main === module) main();
