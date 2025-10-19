const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NeutralHeart - basic flows", function () {
    let NeutralHeart;
    let contract;
    let owner, alice, bob;

    beforeEach(async () => {
        [owner, alice, bob] = await ethers.getSigners();
        NeutralHeart = await ethers.getContractFactory("NeutralHeart");
        // deploy with maxPublicSupply=100 and price 0.01 ether
        const price = ethers.parseEther("0.01");
        contract = await NeutralHeart.deploy("NewLove", "NL", 100, price);
        // ethers v6: waitForDeployment if available
        if (typeof contract.waitForDeployment === "function") {
            await contract.waitForDeployment();
        }

        // set trusted signer (owner) and baseURI
        await contract.setTrustedSigner(owner.address);
        await contract.setBaseURI("ipfs://basecid/");
    });

    it("allows public mint and tokenURI/variant are neutral", async () => {
        // alice pays price to mint
        const price = await contract.priceWei();
        await contract.connect(alice).publicMint(1, { value: price });

        const cur = await contract.currentId();
        const mintedId = Number(cur) - 1;

        // ownerOf
        expect(await contract.ownerOf(mintedId)).to.equal(alice.address);

        // tokenVariant should be 0 (neutral)
        const v = await contract.tokenVariant(mintedId);
        expect(Number(v)).to.equal(0);

        // tokenURI should use neutral.json
        const uri = await contract.tokenURI(mintedId);
        expect(uri).to.equal("ipfs://basecid/neutral.json");
    });

    it("allows subscriber claim with backend signature", async () => {
        // prepare signed voucher: keccak256(abi.encodePacked(address(this), chainId, user))
        const chain = await ethers.provider.getNetwork();
        const packed = ethers.solidityPacked(["address", "uint256", "address"], [contract.target || contract.address, chain.chainId, bob.address]);
        const digest = ethers.keccak256(packed);
        // owner signs the digest bytes -> this produces an eth_sign style signature (prefixed)
        const sig = await owner.signMessage(ethers.getBytes(digest));

        await contract.connect(bob).claimForSubscriber(sig);

        const cur = await contract.currentId();
        const mintedId = Number(cur) - 1;

        expect(await contract.ownerOf(mintedId)).to.equal(bob.address);
        const uri = await contract.tokenURI(mintedId);
        expect(uri).to.equal("ipfs://basecid/neutral.json");
    });

    it("transforms neutral -> variant (burn + mint) and clears old variant", async () => {
        // mint neutral for alice
        const price = await contract.priceWei();
        await contract.connect(alice).publicMint(1, { value: price });
        const cur1 = await contract.currentId();
        const oldId = Number(cur1) - 1;

        // transform to angel (1)
        await contract.connect(alice).transform(oldId, 1);

        const cur2 = await contract.currentId();
        const newId = Number(cur2) - 1;

        // old token should not exist (ownerOf should revert)
        await expect(contract.ownerOf(oldId)).to.be.reverted;

        // new token owner and variant
        expect(await contract.ownerOf(newId)).to.equal(alice.address);
        const v = await contract.tokenVariant(newId);
        expect(Number(v)).to.equal(1);

        const uri = await contract.tokenURI(newId);
        expect(uri).to.equal("ipfs://basecid/angel.json");
    });
});
