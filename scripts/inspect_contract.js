#!/usr/bin/env node
// Inspect contract for TrustedSignerSet and OwnershipTransferred events and print contract balance
const { ethers } = require('ethers');
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_NEUTRAL_HEART_ADDRESS || process.env.NEUTRAL_HEART_ADDRESS || '0xC821AE32031b0fd56978cEdaEE31896C12e7FCe7';
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://polygon-rpc.com');

// event topics
const trustedSignerTopic = ethers.id('TrustedSignerSet(address)');
const ownershipTopic = ethers.id('OwnershipTransferred(address,address)');

async function getLogsInChunks(filter, fromBlock, toBlock, chunkSize = 200000) {
  const logs = [];
  let start = fromBlock;
  while (start <= toBlock) {
    const end = Math.min(start + chunkSize - 1, toBlock);
    try {
      const partial = await provider.getLogs({ ...filter, fromBlock: start, toBlock: end });
      logs.push(...partial);
    } catch (e) {
      console.warn(`Warning: getLogs failed for range ${start}-${end}: ${e.message || e}. Trying smaller chunk.`);
      if (chunkSize <= 1000) throw e;
      // recursive with smaller chunk
      return getLogsInChunks(filter, fromBlock, toBlock, Math.max(1000, Math.floor(chunkSize / 4)));
    }
    start = end + 1;
  }
  return logs;
}

async function main() {
  console.log('Contract:', CONTRACT_ADDRESS);
  try {
    const balance = await provider.getBalance(CONTRACT_ADDRESS);
    console.log('Contract MATIC balance:', ethers.formatEther(balance));

    const latest = await provider.getBlockNumber();
    // Scan recent history (up to latest) but chunked to avoid RPC limits
    const scanFrom = 0; // full history; will be chunked
    console.log('Scanning blocks', scanFrom, 'to', latest, 'in chunks');

    const trustedLogs = await getLogsInChunks({ address: CONTRACT_ADDRESS, topics: [trustedSignerTopic] }, scanFrom, latest);
    console.log('TrustedSignerSet events found:', trustedLogs.length);
    for (const l of trustedLogs) {
      // topic[1] contains indexed signer (32 bytes)
      const signer = l.topics[1] ? ethers.getAddress('0x' + l.topics[1].slice(26)) : null;
      console.log(`  block ${l.blockNumber} tx ${l.transactionHash} signer=${signer}`);
    }

    const ownLogs = await getLogsInChunks({ address: CONTRACT_ADDRESS, topics: [ownershipTopic] }, scanFrom, latest);
    console.log('OwnershipTransferred events found:', ownLogs.length);
    for (const l of ownLogs) {
      const prev = l.topics[1] ? ethers.getAddress('0x' + l.topics[1].slice(26)) : null;
      const next = l.topics[2] ? ethers.getAddress('0x' + l.topics[2].slice(26)) : null;
      console.log(`  block ${l.blockNumber} tx ${l.transactionHash} from=${prev} to=${next}`);
    }
  } catch (e) {
    console.error('Failed to inspect contract:', e.message || e);
    process.exit(2);
  }
}

main();
