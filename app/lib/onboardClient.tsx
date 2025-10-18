"use client";

import Onboard from '@web3-onboard/core';
import injectedModule from '@web3-onboard/injected-wallets';
// walletconnect optional: include when NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is set
// walletConnectModule is imported lazily inside getOnboard() when configured to avoid
// bundling/init-time side effects that can hang the client when WalletConnect is not used.

let onboard: any = null;

export async function getOnboard() {
    if (onboard) return onboard;

    const injected = injectedModule();

    // Optionally enable WalletConnect (project id must be supplied via env)
    const wallets: any[] = [injected];
    try {
        const wcProject = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || (globalThis as any)?.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
        if (wcProject) {
            try {
                // dynamic import to avoid bundling or init-time side-effects
                const module = await import('@web3-onboard/walletconnect');
                const walletConnectModule = module && (module.default || module);
                if (typeof walletConnectModule === 'function') {
                    const walletConnect = walletConnectModule({ projectId: wcProject, requiredChains: [137] });
                    wallets.push(walletConnect);
                }
            } catch (e) {
                // if dynamic import fails, just skip WalletConnect
                // this avoids hard failures in environments where the package
                // cannot be initialized (or when server-side rendering occurs)
                // console.debug('WalletConnect module not available, skipping', e);
            }
        }
    } catch (e) {
        // ignore if not available / server-side
    }

    const chains = [
        {
            // Onboard prefers hex chain ids (0x89 == 137)
            id: '0x89',
            token: 'MATIC',
            label: 'Polygon',
            rpcUrl: process.env.NEXT_PUBLIC_POLYGON_RPC || 'https://polygon-rpc.com'
        },
        {
            // Also include Ethereum mainnet so users on ETH can connect and then switch chains if needed
            id: '0x1',
            token: 'ETH',
            label: 'Ethereum Mainnet',
            rpcUrl: process.env.NEXT_PUBLIC_ETHEREUM_RPC || 'https://mainnet.infura.io/v3/0083c29479d8ea22af3a3a44a447c439'
        }
    ];

    onboard = Onboard({
        wallets,
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
    const ob = await getOnboard();
    // web3-onboard has varied APIs across versions: try several possibilities
    // 1) connectWallet() -> returns array
    if (ob && typeof ob.connectWallet === 'function') {
        try {
            const wallets = await ob.connectWallet();
            if (wallets && wallets.length > 0) return wallets[0];
        } catch (e) {
            // ignore and try next
        }
    }

    // 2) connectWallets() -> older API
    if (ob && typeof ob.connectWallets === 'function') {
        try {
            const wallets = await ob.connectWallets();
            if (wallets && wallets.length > 0) return wallets[0];
        } catch (e) {
            // ignore
        }
    }

    // 3) connect() generic
    if (ob && typeof ob.connect === 'function') {
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
