#!/usr/bin/env node
import { config as dotenvConfig } from "dotenv";
dotenvConfig();
import fs from "fs";

// CLI parsing
const argv = process.argv.slice(2);
function getArg(name, fallback) {
    const idx = argv.findIndex(a => a === name);
    if (idx >= 0 && idx + 1 < argv.length) return argv[idx + 1];
    return fallback;
}

const mode = getArg("--mode", "ethers"); // ethers | hre
const artifactPath = getArg("--artifact", "artifacts/contracts/NeutralHeart.sol/NeutralHeart.json");
const contractName = getArg("--contract", "NeutralHeart");
const network = getArg("--network", "polygon");
const contractAddress = getArg("--address", process.env.NEUTRAL_HEART_ADDRESS || "");
const targetAddress = getArg("--target", process.env.TARGET_ADDRESS || "");

async function mintWithEthers() {
    const { ethers } = await import("ethers");
    const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL;
    const PRIV = process.env.DEPLOY_PRIVATE_KEY || process.env.SEPOLIA_PRIVATE_KEY;
    if (!POLYGON_RPC_URL) throw new Error("Set POLYGON_RPC_URL in env");
    if (!PRIV) throw new Error("Set DEPLOY_PRIVATE_KEY or SEPOLIA_PRIVATE_KEY in env");
    if (!contractAddress) throw new Error("NEUTRAL_HEART_ADDRESS not provided");
    if (!targetAddress) throw new Error("TARGET_ADDRESS not provided");

    const provider = new ethers.JsonRpcProvider(POLYGON_RPC_URL);
    const wallet = new ethers.Wallet(PRIV, provider);

    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    const nh = new ethers.Contract(contractAddress, artifact.abi, wallet);

    console.log('Using signer', wallet.address);
    const price = await nh.priceWei();
    console.log('PriceWei:', price.toString());

    console.log('Calling publicMint(1) and paying price...');
    const tx = await nh.publicMint(1, { value: price });
    console.log('Mint tx sent:', tx.hash);
    const receipt = await tx.wait();
    console.log('Mint tx mined:', receipt.transactionHash);

    // try to read event PublicMint(address indexed to, uint256 indexed tokenId)
    let tokenId = null;
    for (const ev of receipt.events || []) {
        if (ev.event === 'PublicMint') {
            tokenId = ev.args && ev.args[1] ? ev.args[1].toString() : null;
            break;
        }
    }
    if (!tokenId) {
        const currentId = await nh.currentId();
        tokenId = (Number(currentId.toString()) - 1).toString();
        console.log('Fallback tokenId:', tokenId);
    }

    console.log('Transferring token', tokenId, 'to', targetAddress);
    const tx2 = await nh['safeTransferFrom(address,address,uint256)'](wallet.address, targetAddress, tokenId);
    const r2 = await tx2.wait();
    console.log('Transfer tx:', r2.transactionHash);
}

async function mintWithHre() {
    const { default: hre } = await import("hardhat");
    console.log('Using Hardhat hre on network', network);
    if (!contractAddress) throw new Error('NEUTRAL_HEART_ADDRESS not provided');
    if (!targetAddress) throw new Error('TARGET_ADDRESS not provided');
    const signer = (await hre.ethers.getSigners())[0];
    console.log('Using signer', signer.address);
    const nh = await hre.ethers.getContractAt(contractName, contractAddress, signer);
    const price = await nh.priceWei();
    console.log('PriceWei:', price.toString());
    const tx = await nh.publicMint(1, { value: price });
    const receipt = await tx.wait();
    console.log('Mint tx:', receipt.transactionHash);
    let tokenId = null;
    for (const ev of receipt.events || []) {
        if (ev.event === 'PublicMint') {
            tokenId = ev.args && ev.args[1] ? ev.args[1].toString() : null;
            break;
        }
    }
    if (!tokenId) {
        const currentId = await nh.currentId();
        tokenId = (Number(currentId.toString()) - 1).toString();
        console.log('Fallback tokenId:', tokenId);
    }
    const tx2 = await nh['safeTransferFrom(address,address,uint256)'](signer.address, targetAddress, tokenId);
    const r2 = await tx2.wait();
    console.log('Transfer tx:', r2.transactionHash);
}

async function main() {
    try {
        if (mode === 'ethers') await mintWithEthers();
        else if (mode === 'hre') await mintWithHre();
        else throw new Error('Unsupported mode: ' + mode);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

main();
