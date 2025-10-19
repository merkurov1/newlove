const hre = require('hardhat');
const { ethers } = require('ethers');

async function main() {
    const address = process.env.NEUTRAL_HEART_ADDRESS;
    const baseUri = process.env.BASE_URI || process.argv[2];
    const pk = process.env.OWNER_PRIVATE_KEY;

    if (!address) throw new Error('NEUTRAL_HEART_ADDRESS env required');
    if (!baseUri) throw new Error('BASE_URI env or arg required');
    if (!pk) throw new Error('OWNER_PRIVATE_KEY env required');

    console.log('Using contract:', address);
    console.log('Setting baseUri:', baseUri);

    const rpcUrl = hre.network && hre.network.config && hre.network.config.url ? hre.network.config.url : (process.env.POLYGON_RPC || 'https://polygon-rpc.com');

    // Prefer Hardhat's provider if available (recommended when running via `npx hardhat run`)
    let provider;
    if (hre && hre.ethers && hre.ethers.provider) {
        provider = hre.ethers.provider;
    } else {
        // Try ethers v6 provider
        try {
            provider = new ethers.providers.JsonRpcProvider(rpcUrl);
        } catch (err) {
            // Fallback to Hardhat's ethers.providers if present
            if (hre && hre.ethers && hre.ethers.providers && hre.ethers.providers.JsonRpcProvider) {
                provider = new hre.ethers.providers.JsonRpcProvider(rpcUrl);
            } else {
                throw new Error('Failed to create JSON RPC provider');
            }
        }
    }

    const wallet = new ethers.Wallet(pk, provider);
    const abi = ['function setBaseURI(string)'];
    const contract = new ethers.Contract(address, abi, wallet);
    const tx = await contract.setBaseURI(baseUri);
    console.log('Tx sent:', tx.hash);
    const receipt = await tx.wait();
    console.log('Tx confirmed:', receipt.transactionHash);
}

main().catch(e => { console.error(e); process.exit(1); });
