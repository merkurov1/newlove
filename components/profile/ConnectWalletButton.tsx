"use client";

import React, { useState } from 'react';

export default function ConnectWalletButton({ onConnected }: { onConnected?: (address: string) => void }) {
    const [loading, setLoading] = useState(false);
    const [address, setAddress] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function connect() {
        setError(null);
        if (!(window as any).ethereum) {
            setError('Установите и подключите Web3-кошелёк (например MetaMask)');
            return;
        }
        setLoading(true);
        try {
            const ethersMod = await import('ethers');
            const { ethers } = ethersMod as any;
            // Create provider defensively: BrowserProvider exists in modern ethers/browsers,
            // but in some bundler/runtime shapes it may be missing. Fallback to JsonRpcProvider.
            const provider = (typeof (ethers as any).BrowserProvider === 'function')
                ? new (ethers as any).BrowserProvider((window as any).ethereum)
                : new (ethers as any).JsonRpcProvider();
            await provider.send('eth_requestAccounts', []);
            const signer = await provider.getSigner();
            const a = await signer.getAddress();
            if (a) {
                setAddress(a);
                // send to server
                const res = await fetch('/api/user/connect-wallet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wallet_address: a }), credentials: 'same-origin' });
                if (!res.ok) {
                    const txt = await res.text();
                    throw new Error(txt || 'Server error');
                }
                if (onConnected) onConnected(a);
            }
        } catch (e: any) {
            console.error(e);
            setError(e?.message || String(e));
        } finally {
            setLoading(false);
        }
    }

    return (
        <div>
            <button onClick={connect} disabled={loading} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-60">
                {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : (loading ? 'Подключение...' : 'Подключить кошелёк')}
            </button>
            {error && <div className="text-sm text-red-600 mt-2">{error}</div>}
        </div>
    );
}
