"use client";

import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import { formatEther } from "ethers";
import { CONTRACT_ADDRESS, NFT_ABI } from "./contract";
import { getOnboard, connectWithOnboard } from "../../lib/onboardClient";

export default function NFTLabPageClient() {
    // wagmi provider is not guaranteed to be present in this app.
    // Use local wallet detection using window.ethereum so the page
    // can render even when there's no global WagmiProvider.
    const [address, setAddress] = useState<string | null>(null);
    const [isConnected, setIsConnected] = useState(false);

    // Local connect helper (use injected provider directly)
    async function connectWallet() {
        try {
            const onboard = getOnboard();
            const selected = await connectWithOnboard();
            if (!selected) {
                setStatus("Не удалось подключить кошелёк");
                return;
            }
            const account = selected.accounts && selected.accounts[0];
            if (account && account.address) {
                setAddress(account.address);
                setIsConnected(true);
            }
            setStatus("Кошелёк подключён");
        } catch (err: any) {
            console.error(err);
            setStatus(err?.message || "Ошибка подключения кошелька");
        }
    }

    const [status, setStatus] = useState<string | null>(null);
    const [isProcessing, setProcessing] = useState(false);
    const [priceEth, setPriceEth] = useState<string | null>(null);
    const [maxPublic, setMaxPublic] = useState<number | null>(null);
    const [publicMinted, setPublicMinted] = useState<number | null>(null);
    const [chainId, setChainId] = useState<number | null>(null);
    const [currentId, setCurrentId] = useState<number | null>(null);
    const [hasClaimedOnChain, setHasClaimedOnChain] = useState<boolean | null>(null);
    const [isEligible, setIsEligible] = useState<boolean | null>(null);

    useEffect(() => {
        // Read on-chain metadata (price, supply)
        async function loadOnchain() {
            try {
                const eth = (window as any).ethereum;
                if (!eth) return;
                const provider = new (ethers as any).BrowserProvider(eth as any);
                const contract = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, provider);
                const price = await contract.priceWei();
                const max = await contract.maxPublicSupply();
                const minted = await contract.publicMinted();
                const cid = await provider.getNetwork();
                const cur = await contract.currentId();
                setChainId(cid.chainId);
                setCurrentId(Number(cur));
                if (address) {
                    const claimed = await contract.hasClaimedOnChain(address);
                    setHasClaimedOnChain(Boolean(claimed));
                }
                setPriceEth(formatEther(price));
                setMaxPublic(Number(max));
                setPublicMinted(Number(minted));
                // try to set address if unlocked
                try {
                    const signer = provider.getSigner();
                    const a = await signer.getAddress();
                    if (a) {
                        setAddress(a);
                        setIsConnected(true);
                    }
                } catch (e) {
                    // ignore — wallet not connected
                }
            } catch (err) {
                // ignore
            }
        }
        loadOnchain();
    }, []);

    // when address changes, re-check eligibility and on-chain claimed flag
    useEffect(() => {
        if (!address) return;
        checkEligibility();
        // also check claimed on chain using provider
        (async () => {
            try {
                const eth = (window as any).ethereum;
                if (!eth) return;
                const provider = new (ethers as any).BrowserProvider(eth as any);
                const contract = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, provider);
                const claimed = await contract.hasClaimedOnChain(address);
                setHasClaimedOnChain(Boolean(claimed));
            } catch (e) {
                // ignore
            }
        })();
    }, [address]);

    async function handlePublicMint(qty = 1) {
        if (!isConnected) {
            setStatus("Пожалуйста, подключите кошелёк");
            return;
        }
        if (!(window as any).ethereum) {
            setStatus("Пожалуйста, установите и подключите кошелёк (например MetaMask)");
            return;
        }

        setProcessing(true);
        setStatus(null);
        try {
            const provider = new (ethers as any).BrowserProvider((window as any).ethereum);
            await provider.send("eth_requestAccounts", []);
            const signerLocal = provider.getSigner();
            const contract = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, signerLocal);
            const price = await contract.priceWei();
            const total = price.mul(qty);
            const tx = await contract.publicMint(qty, { value: total });
            setStatus("Транзакция отправлена, ожидаю подтверждения...");
            await tx.wait();
            setStatus("Успех! NFT куплен.");
            // optionally refresh on-chain state
            setTimeout(() => window.location.reload(), 1200);
        } catch (err: any) {
            console.error(err);
            setStatus(err?.message || "Ошибка при минте");
        } finally {
            setProcessing(false);
        }
    }

    async function handleSubscriberClaim() {
        if (!isConnected || !address) {
            setStatus("Пожалуйста, подключите кошелёк");
            return;
        }
        if (hasClaimedOnChain) {
            setStatus('Этот адрес уже отметился on-chain как получивший NFT');
            return;
        }
        setProcessing(true);
        setStatus(null);

        try {
            // ask backend for signature voucher
            const res = await fetch("/api/generate-signature", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ wallet_address: address }),
            });
            if (!res.ok) {
                const txt = await res.text();
                throw new Error(`Backend error: ${txt}`);
            }
            const { signature } = await res.json();
            if (!signature) throw new Error("No signature returned (not eligible or server error)");

            // use signer to call contract.claimForSubscriber(signature)
            const provider = new (ethers as any).BrowserProvider((window as any).ethereum);
            await provider.send("eth_requestAccounts", []);
            const signerLocal = provider.getSigner();
            const contract = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, signerLocal);
            setStatus("Транзакция подписана, ожидаю подтверждения...");
            const tx = await contract.claimForSubscriber(signature);
            const receipt = await tx.wait();

            // inform backend to mark claimed
            await fetch("/api/mark-claimed", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ wallet_address: address, tx_hash: receipt.transactionHash }),
            });

            setStatus("Поздравляем! Free claim выполнен.");
            setTimeout(() => window.location.reload(), 1200);
        } catch (err: any) {
            console.error(err);
            setStatus(err?.message || "Ошибка при получении подписи / минте");
        } finally {
            setProcessing(false);
        }
    }

    async function checkEligibility() {
        if (!address) {
            setIsEligible(null);
            return;
        }
        try {
            const res = await fetch('/api/check-eligibility', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ wallet_address: address }),
            });
            if (res.ok) {
                const j = await res.json();
                setIsEligible(Boolean(j.eligible));
            } else {
                setIsEligible(null);
            }
        } catch (e) {
            setIsEligible(null);
        }
    }

    return (
        <main className="mx-auto max-w-prose py-12 px-4">
            <h1 className="text-3xl font-bold">Необратимый Выбор — получить Neutral Heart</h1>

            <div className="mt-4 p-4 bg-yellow-50 border-l-4 border-yellow-400">
                <h3 className="font-semibold">Недостающая информация (пожалуйста, предоставьте позже)</h3>
                <ul className="mt-2 list-disc pl-5 text-sm text-neutral-700">
                    <li>Run DB migrations: migrations/2025-10-18_add_letter_comments.sql and migrations/2025-10-18_create_subscribers_table.sql (run in Supabase SQL Editor)</li>
                    <li>Apply RLS policies for comments and subscribers (use DROP POLICY IF EXISTS; CREATE POLICY ...)</li>
                    <li>Set Vercel env vars: SIGNER_PRIVATE_KEY (server-only), SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_NEUTRAL_HEART_ADDRESS, NEXT_PUBLIC_CHAIN_ID, POLYGON_RPC_URL, POLYGONSCAN_API_KEY, NOREPLY_EMAIL</li>
                    <li>Deploy contract: run scripts/deploy.js with Hardhat and set NEXT_PUBLIC_NEUTRAL_HEART_ADDRESS</li>
                    <li>Set trusted signer on-chain: call setTrustedSigner(&lt;address derived from SIGNER_PRIVATE_KEY&gt;) as contract owner</li>
                    <li>Seed subscribers table with eligible wallet addresses (has_claimed=false)</li>
                    <li>Upload token assets and set baseURI via setBaseURI()</li>
                    <li>Install frontend web3 deps (wagmi, viem, @supabase/supabase-js) and wire providers at app root</li>
                    <li>End-to-end testing: public paid mint and subscriber-claim flow on testnet; verify DB and on-chain states</li>
                    <li>Optional hardening: add expiry/nonce to vouchers and on-chain verification in /api/mark-claimed</li>
                </ul>
            </div>

            <div className="mt-6 space-y-4">
                <div>
                    <strong>Адрес контракта:</strong> <code>{CONTRACT_ADDRESS}</code>
                </div>

                <div className="p-4 border rounded flex gap-4">
                    <div className="w-36 flex-shrink-0">
                        <img src="/scripts/neutral_heart_preview.png" alt="Neutral Heart preview" className="rounded shadow" />
                    </div>
                    <div className="flex-1">
                        <h2 className="text-xl font-semibold">Публичная продажа</h2>
                        <p className="mt-2">Купить за <strong>{priceEth ?? "—"} MATIC</strong></p>
                        <div className="mt-4 flex gap-3">
                            <button
                                className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
                                onClick={() => handlePublicMint(1)}
                                disabled={isProcessing || (maxPublic !== null && publicMinted !== null && publicMinted >= maxPublic)}
                            >
                                Купить за {priceEth ?? "—"} MATIC
                            </button>
                            <button
                                className="px-4 py-2 bg-gray-200 rounded"
                                onClick={() => connectWallet()}
                            >
                                {isConnected ? (address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Кошелёк подключён') : 'Подключить кошелёк'}
                            </button>
                        </div>
                        <div className="mt-2 text-sm text-neutral-500">Доступно: {publicMinted ?? "—"} / {maxPublic ?? "—"}</div>
                    </div>
                </div>

                <div className="p-4 border rounded">
                    <h2 className="text-xl font-semibold">Бесплатный клейм для подписчиков</h2>
                    <p className="mt-2">Для подписчиков — бесплатно (платите только газ)</p>
                    <div className="mt-3 text-sm">
                        {isEligible === null ? (
                            <span className="text-neutral-500">Неизвестно, проверяю право...</span>
                        ) : isEligible ? (
                            <span className="text-green-600">Вы в списке подписчиков — можете получить NFT</span>
                        ) : (
                            <span className="text-red-600">Вы не в списке подписчиков</span>
                        )}
                        {hasClaimedOnChain ? <div className="mt-1 text-sm text-red-600">Этот адрес уже получил NFT on-chain</div> : null}
                    </div>
                    <div className="mt-4">
                        <button
                            className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
                            onClick={handleSubscriberClaim}
                            disabled={isProcessing || isEligible === false || hasClaimedOnChain === true}
                        >
                            Получить бесплатно (для подписчиков)
                        </button>
                    </div>
                </div>

                {status && <div className="mt-4 p-3 bg-neutral-100 rounded">{status}</div>}
            </div>
        </main>
    );
}

