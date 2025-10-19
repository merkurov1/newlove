const { ethers } = require('ethers');

async function main() {
    try {
        const priv = process.env.OWNER_PRIVATE_KEY;
        if (!priv) {
            console.error('OWNER_PRIVATE_KEY not found in environment');
            process.exit(2);
        }

        const rpc = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com/';
        const provider = new ethers.JsonRpcProvider(rpc);
        const wallet = new ethers.Wallet(priv, provider);

        const abi = ['function setPrice(uint256)', 'function owner() view returns (address)'];
        const addr = process.env.NEUTRAL_HEART_ADDRESS || '0x3e28EFbeCB29b928e8C12AaCF9995859850B70FC';

        const contract = new ethers.Contract(addr, abi, wallet);
        const own = await contract.owner();
        console.log('owner', own);

        // set price to zero (wei)
        const tx = await contract.setPrice(0);
        console.log('setPrice tx', tx.hash);
        const receipt = await tx.wait();
        console.log('receipt status', receipt.status);
        process.exit(0);
    } catch (e) {
        console.error('error', e);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}
