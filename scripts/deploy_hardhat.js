const hre = require('hardhat');

async function main() {
    const maxPublic = process.env.MAX_PUBLIC ? Number(process.env.MAX_PUBLIC) : 1000;
    const priceMatic = process.env.PRICE_MATIC || '1.0';
    const name = process.env.NEUTRAL_HEART_NAME || 'Необратимый Выбор - Neutral Heart';
    const symbol = process.env.NEUTRAL_HEART_SYMBOL || 'NHRT';

    // ethers v6 exposes parseEther at the top-level on the ethers object
    const priceWei = hre.ethers.parseEther ? hre.ethers.parseEther(priceMatic) : hre.ethers.utils.parseEther(priceMatic);

    const NeutralHeart = await hre.ethers.getContractFactory('NeutralHeart');
    const nh = await NeutralHeart.deploy(name, symbol, maxPublic, priceWei);
    // ethers v6: waitForDeployment replaces deployed()
    if (typeof nh.waitForDeployment === 'function') {
        await nh.waitForDeployment();
    }
    // contract address may be available as .target (ethers v6) or .address
    const deployedAddress = nh.target || nh.address || null;
    console.log('NeutralHeart deployed to:', deployedAddress);

    const baseUri = process.env.NEUTRAL_HEART_BASEURI || '';
    if (baseUri) {
        const tx = await nh.setBaseURI(baseUri);
        await tx.wait();
        console.log('setBaseURI:', baseUri);
    }

    // If an API key for Polygonscan is provided in env, attempt automatic verification
    if (process.env.POLYGONSCAN_API_KEY) {
        try {
            console.log('POLYGONSCAN_API_KEY detected; attempting contract verification...');
            // priceWei may be a BigInt; convert to string for verification args
            const priceArg = priceWei && priceWei.toString ? priceWei.toString() : priceWei;
            await hre.run("verify:verify", {
                address: deployedAddress,
                constructorArguments: [name, symbol, maxPublic, priceArg],
            });
            console.log('Verification submitted to Polygonscan');
        } catch (verErr) {
            console.warn('Automatic verification failed:', verErr && verErr.message ? verErr.message : verErr);
        }
    }

    // Optionally set the trusted signer if provided
    if (process.env.TRUSTED_SIGNER_ADDRESS) {
        const tx2 = await nh.setTrustedSigner(process.env.TRUSTED_SIGNER_ADDRESS);
        await tx2.wait();
        console.log('setTrustedSigner:', process.env.TRUSTED_SIGNER_ADDRESS);
    }
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
