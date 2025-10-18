#!/usr/bin/env node
import { config as dotenvConfig } from "dotenv";
dotenvConfig();
import fs from "fs";
import path from "path";

// Simple CLI parsing
const argv = process.argv.slice(2);
function getArg(name, fallback) {
    const idx = argv.findIndex(a => a === name);
    if (idx >= 0 && idx + 1 < argv.length) return argv[idx + 1];
    return fallback;
}

const mode = getArg("--mode", "ethers"); // ethers | hre | viem
const artifactPath = getArg("--artifact", "artifacts/contracts/NeutralHeart.sol/NeutralHeart.json");
const contractName = getArg("--contract", "NeutralHeart");
const network = getArg("--network", "polygon");

async function deployEthers() {
    const { ethers } = await import("ethers");
    const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL;
    const SEPOLIA_PRIVATE_KEY = process.env.SEPOLIA_PRIVATE_KEY || process.env.DEPLOY_PRIVATE_KEY;
    if (!POLYGON_RPC_URL || !SEPOLIA_PRIVATE_KEY) throw new Error("Set POLYGON_RPC_URL and SEPOLIA_PRIVATE_KEY or DEPLOY_PRIVATE_KEY in .env");

    const provider = new ethers.JsonRpcProvider(POLYGON_RPC_URL);
    const wallet = new ethers.Wallet(SEPOLIA_PRIVATE_KEY, provider);

    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
    console.log("Deploying with:", wallet.address, "using ethers.js");
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
    const name = process.env.NEUTRAL_HEART_NAME || 'Необратимый Выбор - Neutral Heart';
    const symbol = process.env.NEUTRAL_HEART_SYMBOL || 'NHRT';
    const maxPublic = process.env.MAX_PUBLIC ? Number(process.env.MAX_PUBLIC) : 1000;
    const priceMatic = process.env.PRICE_MATIC || '1.0';
    const priceWei = ethers.parseEther ? ethers.parseEther(priceMatic) : ethers.utils.parseEther(priceMatic);
    const contract = await factory.deploy(name, symbol, maxPublic, priceWei, { gasLimit: 6000000 });
    // ethers v6
    if (contract.waitForDeployment) {
        await contract.waitForDeployment();
    } else if (contract.deployed) {
        await contract.deployed();
    }
    const addr = contract.target || contract.address;
    console.log(`${contractName} deployed to: ${addr}`);
}

async function deployHre() {
    const { default: hre } = await import("hardhat");
    console.log("Deploying with Hardhat hre.ethers on network:", network);
    const [deployer] = await hre.ethers.getSigners();
    console.log("Deployer:", deployer.address);
    const Factory = await hre.ethers.getContractFactory(contractName);
    const contract = await Factory.deploy(deployer.address, { gasLimit: 6000000 });
    await contract.deployed();
    console.log(`${contractName} deployed to: ${contract.address}`);
}

async function deployViem() {
    const { default: hre } = await import("hardhat");
    const [deployer] = await hre.viem.getWalletClients();
    console.log("Deploying with viem wallet:", deployer.account.address);
    const artifact = await hre.artifacts.readArtifact(contractName);
    const hash = await deployer.deployContract({
        abi: artifact.abi,
        bytecode: artifact.bytecode,
        args: [deployer.account.address],
    });
    const receipt = await hre.viem.getPublicClient().waitForTransactionReceipt({ hash });
    console.log(`${contractName} deployed to: ${receipt.contractAddress}`);
}

async function main() {
    try {
        if (mode === "ethers") await deployEthers();
        else if (mode === "hre") await deployHre();
        else if (mode === "viem") await deployViem();
        else throw new Error(`Unknown mode: ${mode}`);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

main();
