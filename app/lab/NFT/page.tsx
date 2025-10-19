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
    const [lastTxHash, setLastTxHash] = useState<string | null>(null);
    const [contractOwner, setContractOwner] = useState<string | null>(null);
    const [baseUriInput, setBaseUriInput] = useState<string>('');

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
                    const testPrice = (process && (process.env as any) && (process.env.NEXT_PUBLIC_TEST_PRICE_MATIC)) || (globalThis as any)?.NEXT_PUBLIC_TEST_PRICE_MATIC;
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
            const signerLocal = await provider.getSigner();
            try {
                const a = await signerLocal.getAddress();
                if (a) {
                    setAddress(a);
                    setIsConnected(true);
                    pushDebug('signer_address', a);
                }
            } catch (e) {
                pushDebug('signer_error', String(e));
            }
            const contract = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, signerLocal);
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
            const price = await contract.priceWei();
            // ethers v6 returns bigint for uint256; guard against BigNumber-like objects
            const priceBigInt = typeof price === 'bigint' ? price : BigInt(price);
            const total = priceBigInt * BigInt(qty);
            // Some providers or ethers versions expect hex string for value; send hex for maximum compatibility
            const totalHex = '0x' + total.toString(16);
            const tx = await contract.publicMint(qty, { value: totalHex });
            setStatus("Транзакция отправлена, ожидаю подтверждения...");
            await tx.wait();
            setStatus("Успех! NFT куплен. Теперь вы можете выбрать образ — Ангел или Демон.");
            // show chooser by setting a transient flag (we'll use currentId/mintedTokenId to infer)
            // attempt to determine minted tokenId from receipt events, or fallback to currentId
            try {
                // parse Transfer event (ERC-721) from receipt logs if present
                const transferEventTopic = ethers.id("Transfer(address,address,uint256)");
                let tokenIdFromReceipt: number | null = null;
                try {
                    const logs = await tx.wait().then((r: any) => r.logs || []);
                    for (const l of logs) {
                        if (!l || !l.topics) continue;
                        if (l.topics[0] === transferEventTopic) {
                            // tokenId is in topics[3]
                            try { tokenIdFromReceipt = Number(BigInt(l.topics[3])); break; } catch (e) { }
                        }
                    }
                } catch (e) {
                    // already awaited above; ignore
                }

                if (!tokenIdFromReceipt) {
                    try {
                        const eth = (window as any).ethereum;
                        if (eth) {
                            const provider = new (ethers as any).BrowserProvider(eth as any);
                            const contractRead = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, provider);
                            const cur = await contractRead.currentId();
                            tokenIdFromReceipt = Number(cur) - 1;
                        }
                    } catch (e) { }
                }

                if (tokenIdFromReceipt) {
                    // If multiple Transfer events were emitted, tokenIdFromReceipt may be the first one.
                    // We should parse ALL Transfer events from the receipt and collect token ids.
                    try {
                        const rec = await tx.wait();
                        const transferTopic = ethers.id("Transfer(address,address,uint256)");
                        const ids: number[] = [];
                        for (const l of (rec.logs || [])) {
                            if (!l || !l.topics) continue;
                            if (l.topics[0] === transferTopic) {
                                try {
                                    const id = Number(BigInt(l.topics[3]));
                                    if (!Number.isNaN(id)) ids.push(id);
                                } catch (e) { /* ignore parse errors */ }
                            }
                        }
                        // fallback: if no transfer logs found but we have tokenIdFromReceipt, include it
                        if (ids.length === 0) ids.push(tokenIdFromReceipt);
                        setMintedTokenIds(ids);
                        // set currentId to the last minted token so chooser UI appears
                        setCurrentId(ids[ids.length - 1]);
                        setLastTxHash(tx && tx.hash ? tx.hash : null);

                        // fetch metadata images for each token id
                        const eth = (window as any).ethereum;
                        const provider = eth ? new (ethers as any).BrowserProvider(eth as any) : new (ethers as any).JsonRpcProvider();
                        const contractRead = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, provider);
                        const imgs: string[] = [];
                        for (const id of ids) {
                            try {
                                const uri = await contractRead.tokenURI(id);
                                if (!uri) { imgs.push(''); continue; }
                                let fetchUrl = uri;
                                if (uri.startsWith('ipfs://')) fetchUrl = 'https://ipfs.io/ipfs/' + uri.slice(7);
                                const meta = await fetch(fetchUrl).then(r => r.json()).catch(() => null);
                                const image = meta?.image || meta?.image_url || '';
                                let imageUrl = image || '';
                                if (imageUrl && imageUrl.startsWith('ipfs://')) imageUrl = 'https://ipfs.io/ipfs/' + imageUrl.slice(7);
                                // if no imageUrl, push canonical neutral fallback so UI shows image
                                imgs.push(imageUrl || FALLBACK_NEUTRAL);
                            } catch (e) {
                                imgs.push(FALLBACK_NEUTRAL);
                                pushDebug('mint_image_error_for_id_' + id, String(e));
                            }
                        }
                        setMintedTokenImages(imgs.filter((i, idx) => true));
                    } catch (e) {
                        pushDebug('mint_tokenid_detect_error', String(e));
                    }
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

    async function requestVariant(variant: 'Angel' | 'Devil') {
        // allow caller to pass explicit token id via closure (we'll check currentId as fallback)
        const tokenIdToUse = (arguments.length > 1 && (arguments as any)[1]) || currentId;
        if (!isConnected || !address || !tokenIdToUse) {
            setStatus('Сначала подключите кошелёк и убедитесь что у вас есть токен');
            return;
        }
        if (hasTransformed || hasClaimedOnChain) {
            setStatus('Этот адрес уже совершил выбор или уже получил токен. Изменение невозможно.');
            return;
        }
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
                                    return copy;
                                }
                            }
                            // otherwise, replace last
                            copy[copy.length - 1] = imgs[0] || copy[copy.length - 1];
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

                {/* Owner controls: set baseURI so wallets can show images */}
                {contractOwner && address && contractOwner.toLowerCase() === address.toLowerCase() ? (
                    <div className="mt-3 p-3 border rounded bg-neutral-50">
                        <div className="text-sm font-medium">Owner controls</div>
                        <div className="mt-2">
                            <input className="px-2 py-1 border rounded w-full" value={baseUriInput} onChange={(e) => setBaseUriInput(e.target.value)} placeholder="Введите baseURI, например ipfs://<cid>/ или https://.../metadata/" />
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
            {/* Debug panel - visible in-page to help debug Onboard-only flows */}
            <details className="mt-6 p-4 bg-black/5 rounded">
                <summary className="cursor-pointer text-sm font-medium">Debug panel (для разработчика)</summary>
                <div className="mt-3 text-xs font-mono text-neutral-700 space-y-2">
                    <div><strong>onboardWallet</strong>: <pre className="whitespace-pre-wrap">{safeStringify(debugState.onboard_wallet || onboardWallet)}</pre></div>
                    <div><strong>onboardInitialized</strong>: {String(debugState.onboard_initialized ?? Boolean(onboardWallet))}</div>
                    <div><strong>providerNetwork</strong>: <pre className="whitespace-pre-wrap">{safeStringify(debugState.provider_network || debugState.provider_network_claim || null)}</pre></div>
                    <div><strong>signer</strong>: {debugState.signer_address || debugState.claim_signer_address || '—'}</div>
                    <div><strong>contractCode</strong>: <pre className="whitespace-pre-wrap">{String(debugState.contract_code || debugState.contractCode || 'not_checked')}</pre></div>
                    <div><strong>errors</strong>:
                        <pre className="whitespace-pre-wrap">{safeStringify(Object.fromEntries(Object.entries(debugState).filter(([k]) => k.toLowerCase().includes('error') || k.toLowerCase().includes('failed') || k.toLowerCase().includes('mint_error') || k.toLowerCase().includes('claim_error'))))}</pre>
                    </div>
                </div>
            </details>
        </main>
    );
}

