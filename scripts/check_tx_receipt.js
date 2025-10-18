#!/usr/bin/env node
// Read-only script: poll for a transaction receipt and decode events using the NeutralHeart ABI
const fs = require('fs');
const { ethers } = require('ethers');

const argv = process.argv.slice(2);
const txArg = argv[0] || process.env.TX_HASH;
if (!txArg) {
    console.error('Usage: node scripts/check_tx_receipt.js <TX_HASH>');
    process.exit(1);
}
const TX = txArg;
const RPC = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com/';
const provider = new ethers.JsonRpcProvider(RPC);

async function main() {
    console.log('Checking TX', TX, 'using RPC', RPC);
    for (let i = 0; i < 24; i++) { // ~2 minutes polling (24*5s)
        try {
            const tx = await provider.getTransaction(TX);
            if (!tx) console.log('Transaction not found yet');
            const receipt = await provider.getTransactionReceipt(TX);
            if (!receipt) {
                console.log('Receipt not found yet, attempt', i + 1);
            } else {
                console.log('Receipt found:');
                console.log('  txHash:', receipt.transactionHash);
                console.log('  status:', receipt.status);
                console.log('  blockNumber:', receipt.blockNumber);
                console.log('  confirmations:', receipt.confirmations);
                console.log('  logs:', receipt.logs.length);

                // decode logs if ABI present
                const abiPath = 'artifacts/contracts/NeutralHeart.sol/NeutralHeart.json';
                if (fs.existsSync(abiPath)) {
                    const art = JSON.parse(fs.readFileSync(abiPath, 'utf8'));
                    const iface = new ethers.Interface(art.abi);
                    for (const log of receipt.logs) {
                        try {
                            const parsed = iface.parseLog(log);
                            console.log('EVENT', parsed.name, parsed.args);
                        } catch (e) {
                            // ignore
                        }
                    }
                } else {
                    console.log('ABI artifact not found at', abiPath);
                }
                return;
            }
        } catch (e) {
            console.error('Error while polling:', e.message || e);
        }
        // wait 5s
        await new Promise(r => setTimeout(r, 5000));
    }
    console.log('Timed out waiting for receipt');
}

main().catch(e => { console.error(e); process.exit(1); });
