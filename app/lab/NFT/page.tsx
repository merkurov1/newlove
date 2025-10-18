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
    const [onboardWallet, setOnboardWallet] = useState<any | null>(null);

    // Local connect helper (use injected provider directly)
    async function connectWallet() {
        try {
            const onboard = getOnboard();
            const selected = await connectWithOnboard();
            if (!selected) {
                // fallback: try injected provider directly
                const eth = (window as any).ethereum;
                if (eth && eth.request) {
                    try {
                        await eth.request({ method: 'eth_requestAccounts' });
                        const provider = new (ethers as any).BrowserProvider(eth as any);
                        const signer = provider.getSigner();
                        const a = await signer.getAddress();
                        setAddress(a);
                        setIsConnected(true);
                        setStatus('Кошелёк подключён (fallback)');
                        return;
                    } catch (e) {
                        console.error('fallback connect failed', e);
                    }
                }
                setStatus("Не удалось подключить кошелёк");
                return;
            }
            const account = selected?.accounts && selected.accounts[0];
            if (account && account.address) {
                setAddress(account.address);
                setIsConnected(true);
            }
            setOnboardWallet(selected || null);
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
    const [hasTransformed, setHasTransformed] = useState<boolean>(false);

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
        // If user isn't flagged as connected, try to request accounts from injected provider.
        if (!(window as any).ethereum) {
            setStatus("Пожалуйста, установите и подключите кошелёк (например MetaMask)");
            return;
        }

        setProcessing(true);
        setStatus(null);
        try {
            // choose provider: prefer onboard wallet.provider, fall back to getProvider(), then injected window.ethereum
            let rawProvider: any = null;
            try {
                if (onboardWallet && onboardWallet.provider) rawProvider = onboardWallet.provider;
                else if (onboardWallet && typeof onboardWallet.getProvider === 'function') rawProvider = await onboardWallet.getProvider();
            } catch (e) {
                rawProvider = null;
            }
            if (!rawProvider) rawProvider = (window as any).ethereum;
            const provider = new (ethers as any).BrowserProvider(rawProvider as any, 'any');
            // request accounts (will be a no-op if already connected/approved)
            try { await provider.send("eth_requestAccounts", []); } catch (e) { }
            const signerLocal = await provider.getSigner();
            try {
                const a = await signerLocal.getAddress();
                if (a) {
                    setAddress(a);
                    setIsConnected(true);
                }
            } catch (e) {
                // signer not available
            }
            const contract = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, signerLocal);
            const price = await contract.priceWei();
            const total = price.mul(qty);
            const tx = await contract.publicMint(qty, { value: total });
            setStatus("Транзакция отправлена, ожидаю подтверждения...");
            await tx.wait();
            setStatus("Успех! NFT куплен. Теперь вы можете выбрать образ — Ангел или Демон.");
            // show chooser by setting a transient flag (we'll use currentId to infer)
            setTimeout(() => {
                try {
                    // attempt to set currentId from chain
                    const eth = (window as any).ethereum;
                    if (!eth) return;
                    const provider = new (ethers as any).BrowserProvider(eth as any);
                    const contract = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, provider);
                    contract.currentId().then((v: any) => setCurrentId(Number(v) - 1)).catch(() => { });
                } catch (e) { }
            }, 2500);
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
        // Ensure we have accounts available; try to request if needed
        if (!(window as any).ethereum) {
            setStatus("Пожалуйста, установите и подключите кошелёк (например MetaMask)");
            return;
        }
        if (!isConnected || !address) {
            try {
                const provider = new (ethers as any).BrowserProvider((window as any).ethereum);
                await provider.send('eth_requestAccounts', []);
                const signer = provider.getSigner();
                const a = await signer.getAddress();
                if (a) {
                    setAddress(a);
                    setIsConnected(true);
                }
            } catch (e) {
                setStatus("Пожалуйста, подключите кошелёк");
                return;
            }
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
            // choose provider: prefer onboard wallet.provider, fall back to getProvider(), then injected window.ethereum
            let rawProvider2: any = null;
            try {
                if (onboardWallet && onboardWallet.provider) rawProvider2 = onboardWallet.provider;
                else if (onboardWallet && typeof onboardWallet.getProvider === 'function') rawProvider2 = await onboardWallet.getProvider();
            } catch (e) {
                rawProvider2 = null;
            }
            if (!rawProvider2) rawProvider2 = (window as any).ethereum;
            const provider = new (ethers as any).BrowserProvider(rawProvider2 as any, 'any');
            try { await provider.send("eth_requestAccounts", []); } catch (e) { }
            const signerLocal = await provider.getSigner();
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

    async function requestVariant(variant: 'Angel' | 'Devil') {
        if (!isConnected || !address || !currentId) {
            setStatus('Сначала подключите кошелёк и убедитесь что у вас есть токен');
            return;
        }
        if (hasTransformed || hasClaimedOnChain) {
            setStatus('Этот адрес уже совершил выбор или уже получил токен. Изменение невозможно.');
            return;
        }
        setProcessing(true);
        setStatus('Запрашиваю желаемый образ у сервера...');
        try {
            const res = await fetch('/api/request-variant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ wallet_address: address, variant, tx_hash: null, token_id: currentId }),
            });
            const j = await res.json();
            if (!res.ok) {
                if (j.reason === 'server_not_configured') {
                    setStatus('Сервер не настроен: мы не можем зарезервировать вариант автоматически. Вы можете вручную перевести токен на нужный адрес после получения.');
                } else {
                    setStatus(j.error || 'Сервер вернул ошибку при резерве');
                }
                return;
            }
            // success stub
            setHasTransformed(true);
            setStatus(`Вариант ${variant} зарезервирован (заглушка). ВНИМАНИЕ: выбор необратим.`);
        } catch (e: any) {
            console.error(e);
            setStatus(e?.message || 'Ошибка при запросе варианта');
        } finally {
            setProcessing(false);
        }
    }

    return (
        <main className="mx-auto max-w-prose py-12 px-4">
            <div className="mt-6 p-6 bg-gradient-to-r from-neutral-900 to-neutral-700 text-white rounded">
                <h2 className="text-2xl font-bold">НЕОБРАТИМЫЙ ВЫБОР</h2>
                <p className="mt-3 font-semibold">NFT, КОТОРЫЙ ТРЕБУЕТ ДУШИ.</p>
                <p className="mt-2">Это не просто коллекция. Это экзистенциальный эксперимент на блокчейне. Готовы ли вы принять решение, которое определит вашу цифровую сущность навсегда?</p>
                <div className="mt-4">
                    <p className="font-medium">МЕХАНИКА, КОТОРАЯ СТАНОВИТСЯ ИСТОРИЕЙ:</p>
                    <ol className="mt-2 list-decimal pl-5 text-sm">
                        <li><strong>ТОЧКА ОТСЧЁТА: "НЕЙТРАЛЬНОЕ СЕРДЦЕ"</strong><br />Ваш путь начинается с NFT "Нейтральное Сердце" — символа чистого, нерешенного потенциала. Оно ждёт вашего решающего шага.</li>
                        <li className="mt-2"><strong>МОМЕНТ ИСТИНЫ: ОДИН КЛИК, НЕТ ПУТИ НАЗАД</strong><br />Подключите кошелёк. Перед вами два пути: <em>ПЕРЕДАТЬ АНГЕЛУ</em> или <em>ОТДАТЬ ДЕМОНУ</em>.</li>
                        <li className="mt-2"><strong>НЕОБРАТИМАЯ ТРАНСФОРМАЦИЯ</strong><br />После подтверждения транзакции ваше "Нейтральное Сердце" исчезает, чтобы навсегда превратиться в "Ангела с Сердцем" или "Демона с Сердцем". Это действие необратимо — метаданные меняются навсегда.</li>
                    </ol>
                </div>
            </div>
            <h1 className="text-3xl font-bold">Необратимый Выбор — получить Neutral Heart</h1>



            <div className="mt-6 space-y-4">
                {/* Variant chooser area - appears when we have a recent token */}
                {currentId ? (
                    <div className="p-4 border rounded">
                        <h2 className="text-lg font-semibold">Выбрать образ для токена #{currentId}</h2>
                        <p className="mt-2 text-sm">Выберите ангела или демона. Также можно указать адрес получателя (оставьте пустым — оставим токен себе).</p>
                        <div className="mt-3 flex gap-3">
                            <button className="px-3 py-2 bg-indigo-600 text-white rounded" onClick={() => requestVariant('Angel')}>Сделать Ангелом</button>
                            <button className="px-3 py-2 bg-red-600 text-white rounded" onClick={() => requestVariant('Devil')}>Сделать Демоном</button>
                        </div>
                        <div className="mt-2 text-sm text-neutral-500">Если сервер не настроен, вы увидите подсказку, как вручную перевести токен.</div>
                    </div>
                ) : null}
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

