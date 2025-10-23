const hre = require('hardhat');

async function main() {
    const deployed = process.env.NEUTRAL_HEART_ADDRESS;
    const target = process.env.TARGET_ADDRESS;
    if (!deployed) throw new Error('NEUTRAL_HEART_ADDRESS env required');
    if (!target) throw new Error('TARGET_ADDRESS env required');

    const signer = (await hre.ethers.getSigners())[0];
    console.log('Using signer', signer.address);

    const nh = await hre.ethers.getContractAt('NeutralHeart', deployed, signer);
    const price = await nh.priceWei();
    console.log('PriceWei:', price.toString());

    console.log('Calling publicMint(1) and paying price...');
    const tx = await nh.publicMint(1, { value: price });
    const receipt = await tx.wait();
    console.log('Mint tx:', receipt.transactionHash);

    // try to read event PublicMint(address indexed to, uint256 indexed tokenId)
    let tokenId = null;
    for (const ev of receipt.events || []) {
        if (ev.event === 'PublicMint') {
            tokenId = ev.args && ev.args[1] ? ev.args[1].toString() : null;
            break;
        }
    }

    if (!tokenId) {
        // fallback: try to find latest token by tracking currentId - 1
        const currentId = await nh.currentId();
        tokenId = (Number(currentId.toString()) - 1).toString();
        console.log('Fallback tokenId:', tokenId);
    }

    console.log('Transferring token', tokenId, 'to', target);
    const tx2 = await nh['safeTransferFrom(address,address,uint256)'](signer.address, target, tokenId);
    const r2 = await tx2.wait();
    console.log('Transfer tx:', r2.transactionHash);
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
