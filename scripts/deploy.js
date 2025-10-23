async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);

    const NeutralHeart = await ethers.getContractFactory("NeutralHeart");
    const maxPublic = 1000; // example
    const priceWei = ethers.utils.parseEther("0.5");

    const nh = await NeutralHeart.deploy("Необратимый Выбор - Neutral Heart", "NHRT", maxPublic, priceWei);
    await nh.deployed();
    console.log("NeutralHeart deployed to:", nh.address);

    // optionally set baseURI
    // await nh.setBaseURI("ipfs://...");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
