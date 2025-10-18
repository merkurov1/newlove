"use client";

import Onboard from '@web3-onboard/core';
import injectedModule from '@web3-onboard/injected-wallets';
// walletconnect is optional; only include if you have PROJECT ID configured
// import walletConnectModule from '@web3-onboard/walletconnect';

let onboard: any = null;

export function getOnboard() {
    if (onboard) return onboard;

    const injected = injectedModule();

        const chains = [
        {
            // Onboard prefers hex chain ids (0x89 == 137)
            id: '0x89',
            token: 'MATIC',
            label: 'Polygon',
            rpcUrl: process.env.NEXT_PUBLIC_POLYGON_RPC || 'https://polygon-rpc.com'
        }
    ];

    onboard = Onboard({
        wallets: [injected],
        chains,
        appMetadata: {
            name: 'NewLove NFT Lab',
            icon: '<svg></svg>',
            description: 'Connect wallet to mint Neutral Heart',
        }
    });

    return onboard;
}

export async function connectWithOnboard() {
    const ob = getOnboard();
    const connected = await ob.connectWallets();
    if (!connected || connected.length === 0) return null;
    // connected[0] has shape { label, accounts: [{ address }], provider }
    return connected[0];
}
