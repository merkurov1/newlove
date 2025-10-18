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
    // web3-onboard has varied APIs across versions: try several possibilities
    // 1) connectWallet() -> returns array
    if (typeof ob.connectWallet === 'function') {
        try {
            const wallets = await ob.connectWallet();
            if (wallets && wallets.length > 0) return wallets[0];
        } catch (e) {
            // ignore and try next
        }
    }

    // 2) connectWallets() -> older API
    if (typeof ob.connectWallets === 'function') {
        try {
            const wallets = await ob.connectWallets();
            if (wallets && wallets.length > 0) return wallets[0];
        } catch (e) {
            // ignore
        }
    }

    // 3) connect() generic
    if (typeof ob.connect === 'function') {
        try {
            const res = await ob.connect();
            if (Array.isArray(res) && res.length > 0) return res[0];
            if (res && res.wallet) return res.wallet;
        } catch (e) {
            // ignore
        }
    }

    return null;
}
