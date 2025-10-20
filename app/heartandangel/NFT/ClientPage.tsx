"use client";

import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import { formatEther } from "ethers";
import { CONTRACT_ADDRESS, NFT_ABI } from "./contract";
import { getOnboard, connectWithOnboard } from "../../lib/onboardClient";

// Fallback / canonical images (provided by user)
const FALLBACK_NEUTRAL = "https://bronze-main-tiger-8.mypinata.cloud/ipfs/bafybeihnx7kaue4ehbigi4koydoei43ojjykp2mhhh7xwx4qg3tntm5e5e";
const ANGEL_IMAGE = "https://bronze-main-tiger-8.mypinata.cloud/ipfs/bafkreid35oonhrww7kdtdsq353av62cwv4fe2yh2npnyqdqr7r7bfwukjy";
const DEVIL_IMAGE = "https://bronze-main-tiger-8.mypinata.cloud/ipfs/bafkreicag47zt2us4hcq7dzs2unt4sm4jibno7qwuqggh6udmcfij3yhty";

export default function NFTLabPageClient() {
    // wagmi provider is not guaranteed to be present in this app.
    // Use local wallet detection using window.ethereum so the page
    // can render even when there's no global WagmiProvider.
    const [address, setAddress] = useState<string | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [onboardWallet, setOnboardWallet] = useState<any | null>(null);

    // Debug state exposed in UI for Onboard-only flows
    const [debugState, setDebugState] = useState<Record<string, any>>({});
    const pushDebug = (k: string, v: any) => setDebugState((s) => ({ ...s, [k]: v }));
    const safeStringify = (obj: any, maxLen = 2000) => {
        try {
            const seen = new WeakSet();
            const s = JSON.stringify(obj, function (k, v) {
                if (v && typeof v === 'object') {
                    if (seen.has(v)) return '[Circular]';
                    seen.add(v);
                }
                if (typeof v === 'bigint') return String(v);
                return v;
            }, 2);
            if (s.length > maxLen) return s.slice(0, maxLen) + '...';
            return s;
        } catch (e) {
            try {
                // Fallback: try extracting common fields
                if (obj && typeof obj === 'object') {
                    const out: any = {};
                    if ('label' in obj) out.label = obj.label;
                    if ('accounts' in obj) out.accounts = (obj.accounts || []).map((a: any) => a && a.address ? a.address : a);
                    if ('provider' in obj) out.provider = typeof obj.provider;
                    return JSON.stringify(out, null, 2);
                }
                return String(obj);
            } catch (e2) {
                return String(obj);
            }
        }
    };

    // Local connect helper (use injected provider directly)
    async function connectWallet() {
        try {
            const onboard = await getOnboard();
            pushDebug('onboard_initialized', Boolean(onboard));
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
                        try { localStorage.setItem('connected_address', a); } catch (e) { }
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
                try { localStorage.setItem('connected_address', account.address); } catch (e) { }
            }
            setOnboardWallet(selected || null);
            pushDebug('onboard_wallet', selected || null);
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
    const [mintedTokenIds, setMintedTokenIds] = useState<number[]>([]);
    const [mintedTokenImages, setMintedTokenImages] = useState<string[]>([]);
    const [mintedTokenVariants, setMintedTokenVariants] = useState<number[]>([]);
    const [angelCount, setAngelCount] = useState<number | null>(null);
    const [devilCount, setDevilCount] = useState<number | null>(null);
    const [isCounting, setIsCounting] = useState<boolean>(false);
    const [countProgress, setCountProgress] = useState<{ done: number; total: number } | null>(null);
    const [lastTxHash, setLastTxHash] = useState<string | null>(null);
    const [contractOwner, setContractOwner] = useState<string | null>(null);
    const [baseUriInput, setBaseUriInput] = useState<string>('');
    const [pendingVariantChoice, setPendingVariantChoice] = useState<{ variant: 'Angel' | 'Devil'; tokenId?: number } | null>(null);

    useEffect(() => {
        // Read on-chain metadata (price, supply)
        async function loadOnchain() {
            try {
                const eth = (window as any).ethereum;
                if (!eth) return;
                const provider = new (ethers as any).BrowserProvider(eth as any);
                try { console.debug('[NFT] loadOnchain raw provider:', eth); } catch (e) { }
                try { console.debug('[NFT] loadOnchain provider network:', await provider.getNetwork()); } catch (e) { }
                const contract = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, provider);
                let price = await contract.priceWei();
                // Optional test override: if NEXT_PUBLIC_TEST_PRICE_MATIC is set (e.g. "0.01"), use that instead
                try {
                    const testPrice = (globalThis as any)?.NEXT_PUBLIC_TEST_PRICE_MATIC;
                    if (testPrice) {
                        try {
                            // ethers v6: parseEther returns bigint
                            const parsed = (ethers as any).parseEther(testPrice);
                            price = parsed;
                            pushDebug('price_override_matic', testPrice);
                        } catch (e) {
                            pushDebug('price_override_parse_error', String(e));
                        }
                    }
                } catch (e) {
                    // ignore
                }
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
                try {
                    const ownerAddr = await contract.owner();
                    setContractOwner(ownerAddr);
                } catch (e) { /* ignore */ }
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
        // Attempt to reuse previously connected address from localStorage for UX
        try {
            const stored = localStorage.getItem('connected_address');
            if (stored) setAddress(stored);
        } catch (e) { }
        loadOnchain();
    }, []);

    // Count variants across minted tokens (on-chain). This is best-effort: we read tokenVariant(id)
    // for ids 1..publicMinted but cap to a reasonable limit so browsers don't hang.
    async function fetchVariantCounts(opts?: { cap?: number }) {
        try {
            if (!publicMinted || publicMinted <= 0) return;
            const cap = opts?.cap ?? 2000; // safety cap
            const totalToCheck = Math.min(publicMinted, cap);
            setIsCounting(true);
            setCountProgress({ done: 0, total: totalToCheck });
            setAngelCount(null);
            setDevilCount(null);

            const eth = (window as any).ethereum;
            const provider = eth ? new (ethers as any).BrowserProvider(eth as any) : new (ethers as any).JsonRpcProvider();
            const contractRead = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, provider);

            let angels = 0;
            let devils = 0;

            // batch requests to avoid flooding the provider
            const batchSize = 50;
            for (let start = 1; start <= totalToCheck; start += batchSize) {
                const end = Math.min(totalToCheck, start + batchSize - 1);
                const promises: Promise<number | null>[] = [];
                for (let id = start; id <= end; id++) {
                    promises.push((async (i: number) => {
                        try {
                            const v = await contractRead.tokenVariant(i);
                            return Number(v || 0);
                        } catch (e) {
                            // If the call fails (token doesn't exist / reverted), treat as null
                            return null;
                        }
                    })(id));
                }
                const results = await Promise.all(promises);
                for (const r of results) {
                    if (r === 1) angels += 1;
                    else if (r === 2) devils += 1;
                    // neutrals (0) and nulls ignored for the Angel/Devil counters
                }
                setCountProgress({ done: Math.min(end, totalToCheck), total: totalToCheck });
                // small pause to yield to browser
                await new Promise((r) => setTimeout(r, 80));
            }

            setAngelCount(angels);
            setDevilCount(devils);
            setIsCounting(false);
            setCountProgress(null);
        } catch (e) {
            console.error('fetchVariantCounts error', e);
            setIsCounting(false);
            setCountProgress(null);
        }
    }

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
            // Проверка наличия токена у пользователя
            const eth = (window as any).ethereum;
            const providerCheck = new (ethers as any).BrowserProvider(eth as any);
            const signerCheck = await providerCheck.getSigner();
            const userAddress = await signerCheck.getAddress();
            const contractCheck = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, providerCheck);
            let alreadyHasToken = false;
            try {
                // Используем новый метод tokensOfOwner, если доступен
                if (contractCheck.tokensOfOwner) {
                    const tokens = await contractCheck.tokensOfOwner(userAddress);
                    alreadyHasToken = tokens && tokens.length > 0;
                } else {
                    const balance = await contractCheck.balanceOf(userAddress);
                    alreadyHasToken = Number(balance) > 0;
                }
            } catch (e) {
                // fallback: не блокируем mint, если не удалось проверить
            }
            if (alreadyHasToken) {
                setStatus("У вас уже есть Neutral Heart NFT. Повторная покупка невозможна.");
                setProcessing(false);
                return;
            }
            // choose provider: prefer onboard wallet.provider, fall back to getProvider(), then injected window.ethereum
            let rawProvider: any = null;
            try {
                if (onboardWallet && onboardWallet.provider) rawProvider = onboardWallet.provider;
                else if (onboardWallet && typeof onboardWallet.getProvider === 'function') rawProvider = await onboardWallet.getProvider();
            } catch (e) {
                rawProvider = null;
            }
            if (!rawProvider) rawProvider = (window as any).ethereum;
            const provider = new (ethers as any).BrowserProvider(rawProvider as any, 'any'); // main provider for mint
            try { console.debug('[NFT] handlePublicMint rawProvider:', rawProvider); } catch (e) { }
            try { const net = await provider.getNetwork(); console.debug('[NFT] handlePublicMint provider network:', net); pushDebug('provider_network', net); } catch (e) { pushDebug('provider_network_error', String(e)); }

            // Ensure the wallet is on Polygon (chainId 137 / 0x89) so contract calls return valid data
            try {
                const chainHex = await (async () => {
                    try { return await provider.send('eth_chainId', []); } catch { const n = await provider.getNetwork(); return '0x' + n.chainId.toString(16); }
                })();
                if (chainHex !== '0x89') {
                    // try to request switch; if it fails, inform the user
                    try {
                        await provider.send('wallet_switchEthereumChain', [{ chainId: '0x89' }]);
                        setStatus('Переключаю сеть на Polygon (MATIC)...');
                        pushDebug('switch_attempt', true);
                        // small pause for wallet to update
                        await new Promise(r => setTimeout(r, 800));
                    } catch (switchErr) {
                        setStatus('Пожалуйста, переключите сеть в кошельке на Polygon (MATIC) и повторите действие.');
                        pushDebug('switch_failed', String(switchErr));
                        setProcessing(false);
                        return;
                    }
                }
            } catch (e) {
                // non-fatal - continue and let subsequent calls surface clear errors
            }
            // request accounts (will be a no-op if already connected/approved)
            try { await provider.send("eth_requestAccounts", []); } catch (e) { }
            const signerLocalMint = await provider.getSigner();
            try {
                const a = await signerLocalMint.getAddress();
                if (a) {
                    setAddress(a);
                    setIsConnected(true);
                    pushDebug('signer_address', a);
                }
            } catch (e) {
                pushDebug('signer_error', String(e));
            }
            const contractMint = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, signerLocalMint);
            // check contract code presence
            try {
                const code = await provider.send('eth_getCode', [CONTRACT_ADDRESS, 'latest']);
                pushDebug('contract_code', code && code.length > 10 ? code.slice(0, 200) + '...' : code);
                pushDebug('contract_code', code && code.length > 10 ? code.slice(0, 200) + '...' : code);
                if (!code || code === '0x' || code === '0x0') {
                    setStatus('Контракт не найден на этой сети. Проверьте сеть в кошельке.');
                    setProcessing(false);
                    return;
                }
            } catch (e) {
                pushDebug('eth_getCode_error', String(e));
            }
            const price = await contractMint.priceWei();
            // ethers v6 returns bigint for uint256; guard against BigNumber-like objects
            const priceBigInt = typeof price === 'bigint' ? price : BigInt(price);
            const total = priceBigInt * BigInt(qty);
            // Some providers or ethers versions expect hex string for value; send hex for maximum compatibility
            const totalHex = '0x' + total.toString(16);
            const tx = await contractMint.publicMint(qty, { value: totalHex });
            setStatus("Транзакция отправлена, ожидаю подтверждения...");
            const rec = await tx.wait();
            setStatus("Успех! NFT куплен. Теперь вы увидите ваш нейтральный токен — выберите образ отдельно, когда будете готовы.");
            // show chooser by setting a transient flag (we'll use currentId/mintedTokenId to infer)
            // attempt to determine minted tokenId from receipt events, or fallback to currentId
            try {
                // parse Transfer events from the single receipt to collect all minted token IDs
                try {
                    const transferTopic = ethers.id('Transfer(address,address,uint256)');
                    const ids: number[] = [];
                    const normalizedTo = (await signerLocalMint.getAddress()).toLowerCase();
                    for (const l of (rec.logs || [])) {
                        if (!l || !l.topics) continue;
                        if (l.topics[0] !== transferTopic) continue;
                        try {
                            // topics[2] is 'to' (indexed)
                            const topicTo = l.topics[2];
                            // topicTo is 32-byte hex; compare lowercased last 40 chars
                            if (!topicTo) continue;
                            const toAddr = '0x' + topicTo.slice(-40).toLowerCase();
                            if (toAddr !== normalizedTo) continue;
                            const id = Number(BigInt(l.topics[3]));
                            if (!Number.isNaN(id)) ids.push(id);
                        } catch (e) { /* ignore parse errors */ }
                    }
                    // fallback: if no ids found, try currentId - 1
                    if (ids.length === 0) {
                        try {
                            const eth = (window as any).ethereum;
                            if (eth) {
                                const provider = new (ethers as any).BrowserProvider(eth as any);
                                const contractRead = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, provider);
                                const cur = await contractRead.currentId();
                                ids.push(Number(cur) - 1);
                            }
                        } catch (e) { }
                    }
                    // dedupe and set
                    const unique = Array.from(new Set(ids));
                    if (unique.length > 0) {
                        setMintedTokenIds(unique);
                        setCurrentId(unique[unique.length - 1]);
                        setLastTxHash(tx && tx.hash ? tx.hash : null);

                        // fetch metadata images for each token id
                        const eth = (window as any).ethereum;
                        const provider = eth ? new (ethers as any).BrowserProvider(eth as any) : new (ethers as any).JsonRpcProvider();
                        const contractRead = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, provider);
                        const imgs: string[] = [];
                        for (const id of unique) {
                            try {
                                let uri = await contractRead.tokenURI(id);
                                if (!uri) { imgs.push(FALLBACK_NEUTRAL); continue; }
                                if (typeof uri === 'string' && uri.startsWith('ipfs://')) uri = 'https://ipfs.io/ipfs/' + uri.slice(7);
                                const meta = uri ? await fetch(uri).then(r => r.json()).catch(() => null) : null;
                                let image = meta?.image || meta?.image_url || '';
                                if (image && image.startsWith('ipfs://')) image = 'https://ipfs.io/ipfs/' + image.slice(7);
                                imgs.push(image || FALLBACK_NEUTRAL);
                            } catch (e) {
                                imgs.push(FALLBACK_NEUTRAL);
                                pushDebug('mint_image_error_for_id_' + id, String(e));
                            }
                        }
                        setMintedTokenImages(imgs);
                        // fetch token variants for each id
                        try {
                            const variants: number[] = [];
                            for (const id of unique) {
                                try {
                                    const v = await contractRead.tokenVariant(id);
                                    variants.push(Number(v));
                                } catch (e) { variants.push(0); }
                            }
                            setMintedTokenVariants(variants);
                        } catch (e) {
                            pushDebug('fetch_variants_error', String(e));
                        }
                    }
                } catch (e) {
                    pushDebug('mint_tokenid_detect_error', String(e));
                }
            } catch (e) {
                pushDebug('mint_tokenid_detect_error', String(e));
            }
        } catch (err: any) {
            console.error(err);
            setStatus(err?.message || "Ошибка при минте");
            pushDebug('mint_error', String(err));
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
            try { console.debug('[NFT] handleSubscriberClaim rawProvider:', rawProvider2); } catch (e) { }
            try { const net2 = await provider.getNetwork(); console.debug('[NFT] handleSubscriberClaim provider network:', net2); pushDebug('provider_network_claim', net2); } catch (e) { pushDebug('provider_network_claim_error', String(e)); }
            try { await provider.send("eth_requestAccounts", []); } catch (e) { pushDebug('eth_requestAccounts_error', String(e)); }
            // Ensure on Polygon
            try {
                const chainHex = await (async () => {
                    try { return await provider.send('eth_chainId', []); } catch { const n = await provider.getNetwork(); return '0x' + n.chainId.toString(16); }
                })();
                if (chainHex !== '0x89') {
                    try {
                        await provider.send('wallet_switchEthereumChain', [{ chainId: '0x89' }]);
                        setStatus('Переключаю сеть на Polygon (MATIC)...');
                        await new Promise(r => setTimeout(r, 800));
                    } catch (switchErr) {
                        setStatus('Пожалуйста, переключите сеть в кошельке на Polygon (MATIC) и повторите действие.');
                        pushDebug('claim_switch_failed', String(switchErr));
                        setProcessing(false);
                        return;
                    }
                }
            } catch (e) {
                // ignore
            }
            const signerLocal = await provider.getSigner();
            try { const sa = await signerLocal.getAddress(); pushDebug('claim_signer_address', sa); } catch (e) { pushDebug('claim_signer_error', String(e)); }
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
            pushDebug('claim_error', String(err));
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

    async function requestVariant(variant: 'Angel' | 'Devil', tokenIdParam?: number) {
        // prefer explicit tokenId param, fallback to currentId
        const tokenIdToUse = tokenIdParam || currentId;
        if (!isConnected || !address || !tokenIdToUse) {
            setStatus('Сначала подключите кошелёк и убедитесь что у вас есть токен');
            return;
        }
        if (hasTransformed || hasClaimedOnChain) {
            setStatus('Этот адрес уже совершил выбор или уже получил токен. Изменение невозможно.');
            return;
        }
        // If a pending choice hasn't been confirmed yet, set it and render inline confirmation UI
        if (!pendingVariantChoice || pendingVariantChoice.variant !== variant || pendingVariantChoice.tokenId !== tokenIdToUse) {
            setPendingVariantChoice({ variant, tokenId: tokenIdToUse });
            setStatus('Подтвердите действие: трансформация необратима — нажмите ещё раз для подтверждения.');
            // Allow user to cancel after 6 seconds
            setTimeout(() => {
                setPendingVariantChoice((p) => (p && p.variant === variant && p.tokenId === tokenIdToUse ? null : p));
            }, 6000);
            return;
        }
        // Clear pending choice now that the user confirmed
        setPendingVariantChoice(null);
        setProcessing(true);
        setStatus('Подключаюсь к кошельку и выполняю трансформацию на цепочке...');
        try {
            // prefer onboard wallet provider, fall back to injected
            let rawProvider2: any = null;
            try {
                if (onboardWallet && onboardWallet.provider) rawProvider2 = onboardWallet.provider;
                else if (onboardWallet && typeof onboardWallet.getProvider === 'function') rawProvider2 = await onboardWallet.getProvider();
            } catch (e) { rawProvider2 = null; }
            if (!rawProvider2) rawProvider2 = (window as any).ethereum;
            if (!rawProvider2) throw new Error('Не найден провайдер кошелька');
            const provider = new (ethers as any).BrowserProvider(rawProvider2 as any, 'any');
            try { await provider.send('eth_requestAccounts', []); } catch (e) { /* ignore */ }
            const signerLocal = await provider.getSigner();
            const contract = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, signerLocal);

            // map variant string to numeric variant used on-chain: 1 = Angel, 2 = Devil
            const variantNum = variant === 'Angel' ? 1 : 2;
            setStatus('Подтвердите транзакцию в кошельке...');
            const tx = await contract.transform(Number(tokenIdToUse), variantNum);
            setStatus('Транзакция отправлена, ожидаю подтверждения...');
            const receipt = await tx.wait();
            if (!receipt || receipt.status === 0) {
                setStatus('Транзакция отклонена или не подтверждена.');
                setProcessing(false);
                return;
            }
            // mark as transformed
            setHasTransformed(true);
            setStatus('Трансформация выполнена! Обновляю метаданные...');

            // refresh tokenURI for the token(s) we own (the transform might burn old token and mint a new one)
            try {
                const providerRead = new (ethers as any).BrowserProvider((window as any).ethereum);
                const contractRead = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, providerRead);
                // If contract emits new Transfer with new token id, try to extract it
                let newTokenId: number | null = null;
                try {
                    const transferTopic = ethers.id('Transfer(address,address,uint256)');
                    for (const l of (receipt.logs || [])) {
                        if (!l || !l.topics) continue;
                        if (l.topics[0] === transferTopic) {
                            try {
                                const id = Number(BigInt(l.topics[3]));
                                if (!Number.isNaN(id)) newTokenId = id;
                            } catch (e) { /* ignore */ }
                        }
                    }
                } catch (e) { /* ignore parse errors */ }

                // if newTokenId not found, fall back to reading currentId and assume last minted
                if (!newTokenId) {
                    try {
                        const cur = await contractRead.currentId();
                        newTokenId = Number(cur);
                    } catch (e) { /* ignore */ }
                }

                // fetch metadata image for the new token id (or refresh older id)
                const idsToCheck = newTokenId ? [newTokenId] : (mintedTokenIds.length > 0 ? mintedTokenIds : [Number(tokenIdToUse)]);
                const imgs: string[] = [];
                for (const id of idsToCheck) {
                    try {
                        let uri = await contractRead.tokenURI(id);
                        if (uri && typeof uri === 'string' && uri.startsWith('ipfs://')) uri = 'https://ipfs.io/ipfs/' + uri.slice(7);
                        const meta = uri ? await fetch(uri).then(r => r.json()).catch(() => null) : null;
                        let image = meta?.image || meta?.image_url || '';
                        if (image && image.startsWith('ipfs://')) image = 'https://ipfs.io/ipfs/' + image.slice(7);
                        imgs.push(image || (variant === 'Angel' ? ANGEL_IMAGE : DEVIL_IMAGE));
                    } catch (e) {
                        imgs.push(variant === 'Angel' ? ANGEL_IMAGE : DEVIL_IMAGE);
                    }
                }
                // Update mintedTokenImages: replace matching token slot or append
                setMintedTokenImages((prev) => {
                    try {
                        const copy = [...prev];
                        if (mintedTokenIds && mintedTokenIds.length > 0) {
                            // try to match id slot
                            for (let i = 0; i < mintedTokenIds.length; i++) {
                                const id = mintedTokenIds[i];
                                if (idsToCheck.includes(id)) {
                                    copy[i] = imgs[0];
                                    // update the variant slot as well
                                    setMintedTokenVariants((pv) => {
                                        try {
                                            const cp = pv ? [...pv] : [];
                                            cp[i] = variant === 'Angel' ? 1 : 2;
                                            return cp;
                                        } catch (e) { return pv || []; }
                                    });
                                    return copy;
                                }
                            }
                            // otherwise, replace last
                            copy[copy.length - 1] = imgs[0] || copy[copy.length - 1];
                            // also update last variant slot
                            setMintedTokenVariants((pv) => {
                                try {
                                    const cp = pv ? [...pv] : [];
                                    const idx = cp.length - 1;
                                    if (idx >= 0) cp[idx] = variant === 'Angel' ? 1 : 2;
                                    return cp;
                                } catch (e) { return pv || []; }
                            });
                            return copy;
                        }
                        return imgs;
                    } catch (e) { return prev; }
                });
            } catch (e) {
                pushDebug('transform_refresh_error', String(e));
            }

            setStatus('Готово — образ обновлён.');
        } catch (e: any) {
            console.error(e);
            setStatus(e?.message || 'Ошибка при выполнении трансформации');
            pushDebug('transform_error', String(e));
        } finally {
            setProcessing(false);
        }
    }

    return (
    <main className="mx-auto max-w-4xl py-12 px-6">
            <section className="mt-6 p-6 rounded bg-gradient-to-r from-neutral-50 to-neutral-100">
                <div className="max-w-6xl mx-auto">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                        {/* Russian column */}
                        <div className="bg-white shadow-sm rounded p-6">
                            <h2 className="text-2xl font-extrabold text-neutral-900">НЕОБРАТИМЫЙ ВЫБОР</h2>
                            <p className="mt-2 text-pink-700 font-semibold">NFT, КОТОРЫЙ ТРЕБУЕТ ДУШИ</p>
                            <p className="mt-4 text-gray-700">Это не просто коллекция. Это экзистенциальный эксперимент на блокчейне, где каждое решение записывается навечно. Готовы ли вы принять выбор, который определит вашу цифровую сущность?</p>

                            <h3 className="mt-6 mb-2 text-sm font-semibold uppercase tracking-wider text-neutral-600">КАК ЭТО РАБОТАЕТ:</h3>
                            <div className="space-y-3 text-sm text-gray-700">
                                <div>
                                    <strong>ТОЧКА ОТСЧЁТА: “НЕЙТРАЛЬНОЕ СЕРДЦЕ”</strong>
                                    <div className="mt-1">Вы получаете NFT в состоянии чистого потенциала — символ нерешённой судьбы, застывший между светом и тьмой.</div>
                                </div>
                                <div>
                                    <strong>МОМЕНТ ИСТИНЫ: ОДИН КЛИК НАВСЕГДА</strong>
                                    <div className="mt-1">Подключите кошелёк. Перед вами два пути:<br />→ <em>ПЕРЕДАТЬ АНГЕЛУ</em><br />→ <em>ОТДАТЬ ДЕМОНУ</em></div>
                                </div>
                                <div>
                                    <strong>НЕОБРАТИМАЯ ТРАНСФОРМАЦИЯ</strong>
                                    <div className="mt-1">После подтверждения транзакции ваше “Нейтральное Сердце” сгорает, перерождаясь в “Ангела с Сердцем” или “Демона с Сердцем”. Метаданные меняются навсегда. Пути назад нет.</div>
                                </div>
                                <div className="mt-2 text-sm text-neutral-600">Ваш выбор станет частью истории. Какую сторону вы усилите?</div>
                            </div>
                        </div>

                        {/* English column */}
                        <div className="bg-white shadow-sm rounded p-6">
                            <h2 className="text-2xl font-extrabold text-neutral-900">THE IRREVERSIBLE CHOICE</h2>
                            <p className="mt-2 text-indigo-700 font-semibold">AN NFT THAT DEMANDS YOUR SOUL</p>
                            <p className="mt-4 text-gray-700">This is not just a collection. This is an existential experiment on the blockchain, where every decision is written in stone forever. Are you ready to make a choice that will define your digital essence?</p>

                            <h3 className="mt-6 mb-2 text-sm font-semibold uppercase tracking-wider text-neutral-600">HOW IT WORKS:</h3>
                            <div className="space-y-3 text-sm text-gray-700">
                                <div>
                                    <strong>THE STARTING POINT: “NEUTRAL HEART”</strong>
                                    <div className="mt-1">You receive an NFT in a state of pure potential — a symbol of unresolved fate, frozen between light and darkness.</div>
                                </div>
                                <div>
                                    <strong>THE MOMENT OF TRUTH: ONE CLICK, NO RETURN</strong>
                                    <div className="mt-1">Connect your wallet. Two paths lie before you:<br />→ <em>GIVE TO THE ANGEL</em><br />→ <em>SURRENDER TO THE DEMON</em></div>
                                </div>
                                <div>
                                    <strong>IRREVERSIBLE TRANSFORMATION</strong>
                                    <div className="mt-1">Once the transaction is confirmed, your “Neutral Heart” burns away, reborn as either “Angel with Heart” or “Demon with Heart”. The metadata changes forever. There is no going back.</div>
                                </div>
                                <div className="mt-2 text-sm text-neutral-600">Your choice becomes part of history. Which side will you empower?</div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
            <h1 className="text-3xl font-bold mt-8 text-center">Необратимый Выбор / THE IRREVERSIBLE CHOICE</h1>


            <div className="mt-6 space-y-4">
                {/* Variant chooser area - appears when we have a recent token */}
                {currentId ? (
                    <div className="p-4 border rounded">
                        <h2 className="text-lg font-semibold">Выбрать образ для токена #{currentId}</h2>
                        <p className="mt-2 text-sm">Выберите ангела или демона. Также можно указать адрес получателя (оставьте пустым — оставим токен себе).</p>
                        <div className="mt-3 flex gap-3">
                            <div className="flex items-center gap-2">
                                <button className="px-3 py-2 bg-indigo-600 text-white rounded" onClick={() => requestVariant('Angel')}>Сделать Ангелом</button>
                                <button className="px-3 py-2 bg-red-600 text-white rounded" onClick={() => requestVariant('Devil')}>Сделать Демоном</button>
                                {pendingVariantChoice && pendingVariantChoice.tokenId === currentId ? (
                                    <div className="ml-3 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">Подтвердите выбор: нажмите ту же кнопку ещё раз</div>
                                ) : null}
                            </div>
                        </div>
                        <div className="mt-2 text-sm text-neutral-500">Если сервер не настроен, вы увидите подсказку, как вручную перевести токен.</div>
                    </div>
                ) : null}
                <div className="flex justify-center items-center gap-2">
                    <strong>Адрес контракта:</strong>
                    <code className="font-mono px-2 py-1 bg-neutral-100 rounded text-sm break-all">{CONTRACT_ADDRESS}</code>
                    <a href={`https://polygonscan.com/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noopener noreferrer" className="ml-2 text-sm text-neutral-500 hover:text-neutral-800 inline-flex items-center gap-1" title="Открыть в Polygonscan">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                            <path d="M12 2L2 7l10 5 10-5-10-5zm0 7.2L4.2 7 12 4.8 19.8 7 12 9.2zM2 17l10 5 10-5v-2l-10 5-10-5v2z" />
                        </svg>
                        <span className="sr-only">Open in Polygonscan</span>
                    </a>
                </div>

                {/* Owner controls: set baseURI so wallets can show images */}
                {contractOwner && address && contractOwner.toLowerCase() === address.toLowerCase() ? (
                    <div className="mt-3 p-3 border rounded bg-neutral-50">
                        <div className="text-sm font-medium">Owner controls</div>
                        <div className="mt-2">
                            <input className="px-2 py-1 border rounded w-full" value={baseUriInput} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBaseUriInput(e.target.value)} placeholder="Введите baseURI, например ipfs://<cid>/ или https://.../metadata/" />
                        </div>
                        <div className="mt-2 flex gap-2">
                            <button className="px-3 py-2 bg-indigo-600 text-white rounded" onClick={async () => {
                                if (!baseUriInput) { setStatus('Введите baseURI'); return; }
                                setProcessing(true);
                                setStatus('Отправляю setBaseURI транзакцию...');
                                try {
                                    const provider = new (ethers as any).BrowserProvider((window as any).ethereum);
                                    await provider.send('eth_requestAccounts', []);
                                    const signer = await provider.getSigner();
                                    const contract = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, signer);
                                    const tx = await contract.setBaseURI(baseUriInput);
                                    await tx.wait();
                                    setStatus('BaseURI установлен. Обновляю метаданные...');
                                    // refresh images for currently minted tokens
                                    if (mintedTokenIds && mintedTokenIds.length > 0) {
                                        const imgs: string[] = [];
                                        const contractRead = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, provider);
                                        for (const id of mintedTokenIds) {
                                            try {
                                                let uri = await contractRead.tokenURI(id);
                                                if (uri && uri.startsWith('ipfs://')) uri = 'https://ipfs.io/ipfs/' + uri.slice(7);
                                                const meta = uri ? await fetch(uri).then(r => r.json()).catch(() => null) : null;
                                                let image = meta?.image || meta?.image_url || '';
                                                if (image && image.startsWith('ipfs://')) image = 'https://ipfs.io/ipfs/' + image.slice(7);
                                                imgs.push(image || FALLBACK_NEUTRAL);
                                            } catch (e) { imgs.push(FALLBACK_NEUTRAL); }
                                        }
                                        setMintedTokenImages(imgs);
                                    }
                                    setProcessing(false);
                                } catch (e: any) {
                                    console.error(e);
                                    setStatus(String(e?.message || e));
                                    setProcessing(false);
                                }
                            }}>Установить baseURI</button>
                        </div>
                    </div>
                ) : null}

                <div className="p-6 rounded-xl shadow-lg bg-white border border-neutral-100 flex flex-col md:flex-row md:items-center gap-6">
                    <div className="w-40 flex-shrink-0">
                        <img src={(mintedTokenImages && mintedTokenImages[0]) ? mintedTokenImages[0] : FALLBACK_NEUTRAL} alt="Neutral Heart preview" className="rounded shadow w-full h-28 object-cover" />
                    </div>
                    <div className="flex-1">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                            <div className="flex flex-col sm:flex-row items-center gap-3">
                                    <button
                                        className="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white rounded-full text-lg font-semibold shadow-lg disabled:opacity-50"
                                        onClick={() => handlePublicMint(1)}
                                        disabled={isProcessing || (maxPublic !== null && publicMinted !== null && publicMinted >= maxPublic)}
                                    >
                                        Купить — 0,0001 MATIC
                                    </button>
                                    <button
                                        className="w-full sm:w-auto px-4 py-2 bg-gray-200 rounded"
                                        onClick={() => connectWallet()}
                                    >
                                        {isConnected ? (address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Кошелёк подключён') : 'Подключить кошелёк'}
                                    </button>
                                </div>
                            <div className="text-sm text-neutral-700 text-right">
                                <div className="font-medium">
                                    {angelCount !== null || devilCount !== null ? (
                                        `${angelCount ?? 0} - Ангелов, ${devilCount ?? 0} - Демонов`
                                    ) : (
                                        `Доступно: ${publicMinted ?? "—"} / ${maxPublic ?? "—"}`
                                    )}
                                </div>
                                <div className="mt-2">
                                    <button className="px-3 py-1 bg-gray-100 border rounded text-sm" onClick={() => fetchVariantCounts({ cap: 2000 })} disabled={isCounting || !publicMinted}>{isCounting ? 'Считаю...' : 'Обновить счётчик'}</button>
                                </div>
                                <div className="mt-1 text-xs text-neutral-500">итого: {priceEth ?? '—'} MATIC</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Share buttons */}
                <div className="mt-6 flex items-center gap-3 justify-center">
                    <span className="text-sm text-neutral-600">Поделиться:</span>
                    <div className="flex items-center gap-2">
                        <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent('Необратимый Выбор — Neutral Heart')}&url=${encodeURIComponent('https://www.merkurov.love/heartandangel/NFT')}`} target="_blank" rel="noopener noreferrer" className="px-3 py-1 bg-blue-500 text-white rounded text-sm">Twitter</a>
                        <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent('https://www.merkurov.love/heartandangel/NFT')}`} target="_blank" rel="noopener noreferrer" className="px-3 py-1 bg-blue-700 text-white rounded text-sm">Facebook</a>
                        <a href={`https://t.me/share/url?url=${encodeURIComponent('https://www.merkurov.love/heartandangel/NFT')}&text=${encodeURIComponent('Необратимый Выбор — Neutral Heart')}`} target="_blank" rel="noopener noreferrer" className="px-3 py-1 bg-blue-400 text-white rounded text-sm">Telegram</a>
                        <button onClick={async () => { try { await navigator.clipboard?.writeText('https://www.merkurov.love/heartandangel/NFT'); setStatus('Ссылка скопирована'); setTimeout(() => setStatus(null), 2000); } catch (e) { setStatus('Не удалось скопировать ссылку'); setTimeout(() => setStatus(null), 3000); } }} className="px-3 py-1 bg-gray-100 rounded text-sm">Скопировать ссылку</button>
                    </div>
                </div>

                {/* FAQ section */}
                <div className="mt-6 p-6 bg-white shadow-sm rounded border">
                    <h2 className="text-2xl font-extrabold mb-4 text-center">FAQ — ОТВЕТЫ НА ЧАСТЫЕ ВОПРОСЫ</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold">ОБЩИЕ ВОПРОСЫ</h3>
                            <div className="text-sm text-gray-700 space-y-2">
                                <p><strong>Что такое “Необратимый Выбор”?</strong> Это NFT‑проект, где вы получаете токен в нейтральном состоянии и должны сделать единственный, необратимый выбор — трансформировать его в Ангела или Демона. Это философский эксперимент о принятии решений, последствиях и цифровой идентичности.</p>
                                <p><strong>Почему “необратимый”?</strong> После транзакции метаданные вашего NFT изменятся на уровне смарт‑контракта. Действие нельзя отменить или вернуть назад — ваш выбор записывается в блокчейн навсегда.</p>
                                <p><strong>Сколько стоит участие?</strong> Neutral Heart можно получить за {priceEth ? `${priceEth} MATIC` : '0,0001 MATIC'} (0,0001 MATIC показано как резерв). Вы платите только газ за транзакции (получение и трансформацию).</p>
                            </div>

                            <h3 className="text-lg font-semibold">МЕХАНИКА</h3>
                            <div className="text-sm text-gray-700 space-y-2">
                                <p><strong>Как получить Neutral Heart?</strong></p>
                                <ol className="list-decimal list-inside ml-4 space-y-1">
                                    <li>Подключите Web3‑кошелёк (MetaMask, WalletConnect и др.).</li>
                                    <li>Перейдите на сайт проекта.</li>
                                    <li>Нажмите «Claim Neutral Heart».</li>
                                    <li>Подтвердите транзакцию в кошельке.</li>
                                </ol>

                                <p><strong>Как происходит трансформация?</strong> На сайте проекта вы выбираете путь — адрес Ангела или адрес Демона — и отправляете туда ваш Neutral Heart. После подтверждения транзакции ваш токен сгорает и вы получаете трансформированную версию с новыми метаданными и изображением.</p>

                                <p><strong>Могу ли я выбрать позже?</strong> Да. Neutral Heart может оставаться в вашем кошелке сколько угодно. Но пока вы не сделаете выбор, NFT остаётся в нейтральном состоянии.</p>

                                <p><strong>Можно ли изменить решение после трансформации?</strong> Нет — трансформация необратима.</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold">ТЕХНИЧЕСКИЕ ВОПРОСЫ</h3>
                            <div className="text-sm text-gray-700 space-y-2">
                                <p><strong>На каком блокчейне работает проект?</strong> Polygon.</p>
                                <p><strong>Где я могу увидеть свой NFT?</strong> После получения или трансформации ваш NFT появится в кошельке и будет виден на OpenSea, Rarible и других маркетплейсах, поддерживающих ERC‑721.</p>
                                <p><strong>Можно ли продать или передать NFT?</strong> Да — Neutral Heart и трансформированные версии можно продавать, дарить или передавать, как любой другой NFT.</p>
                                <p><strong>Что такое “сжигание” (burn) Neutral Heart?</strong> Технически ваш оригинальный Neutral Heart перезаписывается/удаляется на уровне контракта при трансформации — результатом является новая запись с новыми метаданными.</p>
                                <p><strong>Безопасен ли смарт‑контракт?</strong> Контракт [прошёл аудит/открыт для проверки — укажите статус]. Адрес контракта: <code className="break-all">{CONTRACT_ADDRESS}</code>. Вы можете проверить код на обозревателе сети.</p>
                            </div>

                            <h3 className="text-lg font-semibold">ФИЛОСОФИЯ ПРОЕКТА</h3>
                            <div className="text-sm text-gray-700 space-y-2">
                                <p><strong>Зачем это нужно?</strong> Это эксперимент о природе выбора. В цифровом мире мы привыкли к кнопке «отменить». Проект возвращает вес решениям — как в жизни, где некоторые выборы изменяют нас навсегда.</p>
                                <p><strong>Есть ли “правильный” выбор?</strong> Нет. Ангел и Демон — архетипы, символы внутреннего конфликта. Ваш выбор отражает то, что резонирует с вами в этот момент.</p>
                                <p><strong>Что если все выберут одну сторону?</strong> Это часть эксперимента — дисбаланс тоже результат и даёт данные о коллективных предпочтениях.</p>
                            </div>

                            <div className="text-sm text-gray-700 space-y-2">
                                <h4 className="font-semibold">Проблемы и поддержка</h4>
                                <p className="mt-1"><strong>Транзакция не проходит. Что делать?</strong></p>
                                <ul className="list-disc list-inside ml-4 text-sm text-gray-700">
                                    <li>Проверьте, достаточно ли MATIC для оплаты газа.</li>
                                    <li>Убедитесь, что кошелёк подключён к сети Polygon.</li>
                                    <li>Попробуйте увеличить gas limit или повторить позднее.</li>
                                </ul>

                                <p className="mt-2"><strong>Я отправил NFT не на тот адрес. Можно вернуть?</strong> К сожалению, нет — транзакции в блокчейне необратимы. Всегда проверяйте адрес перед отправкой.</p>
                            </div>
                        </div>
                    </div>
                    <p className="mt-4 text-sm text-neutral-600 italic">Помни: каждое сердце — это выбор. Каждый выбор — это история. Твоя история пишется прямо сейчас.</p>
                </div>
                {status && <div className="mt-4 p-3 bg-neutral-100 rounded">{status}</div>}
                {mintedTokenIds.length > 0 && (
                    <div className="mt-4 p-4 border rounded">
                        <h3 className="text-lg font-medium mb-2">Ваши токены</h3>
                        <div className="text-sm text-neutral-600 mb-2">Tx: {lastTxHash ?? '—'}</div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {mintedTokenIds.map((id, idx) => {
                                // If metadata image is missing, fall back to a bundled preview image so user sees something immediately
                                const img = (mintedTokenImages && mintedTokenImages[idx]) ? mintedTokenImages[idx] : `/scripts/neutral_heart_preview.png`;
                                return (
                                    <div key={id} className="text-center p-2 border rounded">
                                        {img ? (
                                            <img src={img} alt={`Token ${id}`} className="mx-auto rounded max-w-full" />
                                        ) : (
                                            <div className="h-36 flex items-center justify-center bg-neutral-50 text-neutral-500 rounded">Нет изображения</div>
                                        )}
                                        <div className="mt-2 text-sm">Token ID: {id}</div>
                                        {/* If token is neutral (variant 0), show transform buttons */}
                                        {mintedTokenVariants && mintedTokenVariants[idx] === 0 ? (
                                            <div className="mt-2 flex gap-2 justify-center items-center">
                                                <button className="px-2 py-1 bg-indigo-600 text-white rounded text-sm" onClick={() => requestVariant('Angel', id)}>Ангел</button>
                                                <button className="px-2 py-1 bg-red-600 text-white rounded text-sm" onClick={() => requestVariant('Devil', id)}>Демон</button>
                                                {pendingVariantChoice && pendingVariantChoice.tokenId === id ? (
                                                    <div className="ml-2 text-sm text-yellow-800">Подтвердите: нажмите ещё раз</div>
                                                ) : null}
                                            </div>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
                        {mintedTokenImages.some(i => !i) && (
                            <div className="mt-3 text-sm text-yellow-700">Часть метаданных пока не настроена на контракте (baseURI). Если изображения пустые — убедитесь, что владелец установил baseURI через setBaseURI.</div>
                        )}
                    </div>
                )}
            </div>
            {/* debug panel removed per request */}
        </main>
    );
}
