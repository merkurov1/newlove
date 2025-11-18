"use client";

import React, { useState, useEffect } from "react";
import { CONTRACT_ADDRESS, NFT_ABI } from "./contract";

// Dynamic imports for Web3 libraries to reduce initial bundle size
let ethers: any = null;
let formatEther: any = null;
let getOnboard: any = null;
let connectWithOnboard: any = null;

async function loadWeb3Dependencies() {
  if (!ethers) {
    const ethersModule = await import("ethers");
    ethers = ethersModule.ethers;
    formatEther = ethersModule.formatEther;
  }
  if (!getOnboard) {
    const onboardModule = await import("../../lib/onboardClient");
    getOnboard = onboardModule.getOnboard;
    connectWithOnboard = onboardModule.connectWithOnboard;
  }
}

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

    async function connectWallet() {
        try {
            await loadWeb3Dependencies();
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
                        setStatus('Wallet connected (fallback)');
                        return;
                    } catch (e) {
                        console.error('fallback connect failed', e);
                    }
                }
                setStatus("Failed to connect wallet");
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
            setStatus("Wallet connected");
        } catch (err: any) {
            console.error(err);
            setStatus(err?.message || "Wallet connection error");
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
    const [requiredAmountDisplay, setRequiredAmountDisplay] = useState<string | null>(null);
    const [isCheckingBalance, setIsCheckingBalance] = useState(false);

    useEffect(() => {
        async function loadOnchain() {
            try {
                await loadWeb3Dependencies();
                const eth = (window as any).ethereum;
                if (!eth) return;
                const provider = (typeof (ethers as any).BrowserProvider === 'function')
                    ? new (ethers as any).BrowserProvider(eth as any)
                    : new (ethers as any).JsonRpcProvider();
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
                if (!address) {
                    setStatus("Please connect your wallet");
                    return;
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
                const provider = (typeof (ethers as any).BrowserProvider === 'function')
                    ? new (ethers as any).BrowserProvider(eth as any)
                    : new (ethers as any).JsonRpcProvider();
                const contract = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, provider);
                const claimed = await contract.hasClaimedOnChain(address);
                setHasClaimedOnChain(Boolean(claimed));
            } catch (e) {
                // ignore
            }
        })();
    }, [address]);

    async function handlePublicMint(qty = 1) {
        if (!(window as any).ethereum) {
            setStatus("Please install and connect a wallet (e.g. MetaMask)");
            return;
        }
        setProcessing(true);
        setStatus('Initializing purchase...');
        pushDebug('handlePublicMint_start', { qty });
        try {
            await loadWeb3Dependencies();
            const eth = (window as any).ethereum;
            const providerCheck = new (ethers as any).BrowserProvider(eth as any);
            const signerCheck = await providerCheck.getSigner();
            const userAddress = await signerCheck.getAddress();
            const contractCheck = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, providerCheck);
            let alreadyHasToken = false;
            try {
                // Use the new tokensOfOwner method if available
                if (contractCheck.tokensOfOwner) {
                    const tokens = await contractCheck.tokensOfOwner(userAddress);
                    alreadyHasToken = tokens && tokens.length > 0;
                } else {
                    const balance = await contractCheck.balanceOf(userAddress);
                    alreadyHasToken = Number(balance) > 0;
                }
            } catch (e) {
                // fallback: do not block mint if check failed
            }
            if (alreadyHasToken) {
                setStatus("You already have a Neutral Heart NFT. Repeat purchase is not possible.");
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
            // Create a BrowserProvider where possible; if it fails, fall back to injected window.ethereum or JsonRpcProvider
            let provider: any = null;
            try {
                if (typeof (ethers as any).BrowserProvider === 'function') {
                    provider = new (ethers as any).BrowserProvider(rawProvider as any, 'any');
                }
            } catch (e) {
                pushDebug('browserprovider_creation_error', String(e));
                // if we tried an onboard wallet provider, retry with injected provider
                if (rawProvider !== (window as any).ethereum && (window as any).ethereum) {
                    try {
                        rawProvider = (window as any).ethereum;
                        provider = new (ethers as any).BrowserProvider(rawProvider as any, 'any');
                        pushDebug('browserprovider_retry_with_injected', true);
                    } catch (e2) {
                        pushDebug('browserprovider_retry_failed', String(e2));
                        provider = null;
                    }
                }
            }
            if (!provider) provider = new (ethers as any).JsonRpcProvider(); // main provider for mint
            try {
                const net = await provider.getNetwork();
                pushDebug('provider_network', net);
            } catch (e) {
                pushDebug('provider_network_error', String(e));
            }

            // Ensure the wallet is on Polygon (chainId 137 / 0x89) so contract calls return valid data
            try {
                const chainHex = await (async () => {
                    try { return await provider.send('eth_chainId', []); } catch { const n = await provider.getNetwork(); return '0x' + n.chainId.toString(16); }
                })();
                if (chainHex !== '0x89') {
                    // try to request switch; if it fails, inform the user
                    try {
                        await provider.send('wallet_switchEthereumChain', [{ chainId: '0x89' }]);
                        setStatus('Switching network to Polygon (MATIC)...');
                        pushDebug('switch_attempt', true);
                        // small pause for wallet to update
                        await new Promise(r => setTimeout(r, 800));
                    } catch (switchErr) {
                        setStatus('Please switch your wallet network to Polygon (MATIC) and try again.');
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
                    setStatus('Contract not found on this network. Please check your wallet network.');
                    setProcessing(false);
                    return;
                }
            } catch (e) {
                pushDebug('eth_getCode_error', String(e));
            }
            const price = await contractMint.priceWei();
            pushDebug('price_raw', String(price));
            // ethers v6 returns bigint for uint256; guard against BigNumber-like objects
            const priceBigInt = typeof price === 'bigint' ? price : BigInt(price);
            const total = priceBigInt * BigInt(qty);
            // Some providers or ethers versions expect hex string for value; send hex for maximum compatibility
            const totalHex = '0x' + total.toString(16);

            // Check wallet balance (include gas estimate) so we can show a clear message if funds are insufficient
            try {
                const balance = await provider.getBalance(userAddress).catch(() => null);
                pushDebug('balance_raw', balance ? String(balance) : null);
                // Try to estimate gas and fee to compute approximate required amount
                let gasEstimate: any = null;
                try {
                    // populate transaction data and ask provider to estimate gas
                    const populated = await (contractMint as any).populateTransaction.publicMint(qty, { value: totalHex });
                    if (populated && typeof provider.estimateGas === 'function') {
                        try {
                            gasEstimate = await provider.estimateGas({ to: populated.to, data: populated.data, value: populated.value, from: userAddress });
                            pushDebug('gasEstimate', String(gasEstimate));
                        } catch (e) {
                            pushDebug('provider_estimateGas_error', String(e));
                            gasEstimate = null;
                        }
                    }
                } catch (e) {
                    pushDebug('populate_tx_error', String(e));
                    gasEstimate = null;
                }
                const feeData = await provider.getFeeData().catch(() => ({} as any));
                const gasPrice = feeData?.gasPrice || feeData?.maxFeePerGas || null;
                pushDebug('feeData', { gasPrice: gasPrice ? String(gasPrice) : null });
                let estimatedGasCost = BigInt(0);
                if (gasEstimate && gasPrice) {
                    try {
                        estimatedGasCost = BigInt(String(gasEstimate)) * BigInt(String(gasPrice));
                    } catch (e) {
                        estimatedGasCost = BigInt(0);
                    }
                }
                // small buffer to account for fluctuations
                const buffer = BigInt('500000000000000'); // 0.0005 MATIC
                const required = total + estimatedGasCost + buffer;
                pushDebug('required_total', String(required));
                if (balance && BigInt(String(balance)) < required) {
                    const have = balance ? formatEther(balance) : '0';
                    const need = formatEther(required);
                    setStatus(`You do not have enough MATIC in your wallet for purchase and gas. Balance: ${have} MATIC, required: ${need} MATIC. Please top up your wallet and try again.`);
                    setProcessing(false);
                    return;
                }
            } catch (e) {
                pushDebug('balance_check_error', String(e));
                // continue — we'll let the provider surface the actual error when sending
            }

            try {
                pushDebug('sending_tx', { qty, totalHex });
                setStatus('Sending transaction... Check your wallet window.');
                const tx = await contractMint.publicMint(qty, { value: totalHex });
                setStatus("Transaction sent, awaiting confirmation...");
                const rec = await tx.wait();
                setStatus("Success! NFT purchased. You will now see your neutral token — choose a form separately when you are ready.");
                pushDebug('tx_receipt', rec);

                // parse Transfer events from the receipt to collect minted token IDs
                try {
                    const transferTopic = ethers.id('Transfer(address,address,uint256)');
                    const ids: number[] = [];
                    const normalizedTo = (await signerLocalMint.getAddress()).toLowerCase();
                    for (const l of (rec.logs || [])) {
                        if (!l || !l.topics) continue;
                        if (l.topics[0] !== transferTopic) continue;
                        try {
                            const topicTo = l.topics[2];
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
                // bubble up to outer catch
                throw e;
            }
        } catch (err: any) {
            console.error(err);
            setStatus(err?.message || "Minting error");
            pushDebug('mint_error', String(err));
        } finally {
            setProcessing(false);
        }
    }

    async function checkRequiredAmount(qty = 1) {
        setRequiredAmountDisplay(null);
        setIsCheckingBalance(true);
        try {
            // create provider similar to handlePublicMint
            let rawProvider: any = null;
            try {
                if (onboardWallet && onboardWallet.provider) rawProvider = onboardWallet.provider;
                else if (onboardWallet && typeof onboardWallet.getProvider === 'function') rawProvider = await onboardWallet.getProvider();
            } catch (e) { rawProvider = null; }
            if (!rawProvider) rawProvider = (window as any).ethereum;
            let provider: any = null;
            try {
                if (typeof (ethers as any).BrowserProvider === 'function') provider = new (ethers as any).BrowserProvider(rawProvider as any, 'any');
            } catch (e) { provider = new (ethers as any).JsonRpcProvider(); }

            // get price from contract via read provider
            const contractRead = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, provider);
            const price = await contractRead.priceWei();
            const priceBigInt = typeof price === 'bigint' ? price : BigInt(price);
            const total = priceBigInt * BigInt(qty);

            // get user address if available
            let userAddr: string | null = address;
            try {
                if (!userAddr) {
                    const signer = await provider.getSigner();
                    userAddr = await signer.getAddress();
                }
            } catch (e) { userAddr = userAddr || null; }

            // populate tx and estimate gas
            let estimatedGasCost = BigInt(0);
            try {
                const populated = await (contractRead as any).populateTransaction.publicMint(qty, { value: '0x' + total.toString(16) });
                if (populated && typeof provider.estimateGas === 'function') {
                    const gasEstimate = await provider.estimateGas({ to: populated.to, data: populated.data, value: populated.value, from: userAddr });
                    const feeData = await provider.getFeeData().catch(() => ({} as any));
                    const gasPrice = feeData?.gasPrice || feeData?.maxFeePerGas || null;
                    if (gasEstimate && gasPrice) {
                        estimatedGasCost = BigInt(String(gasEstimate)) * BigInt(String(gasPrice));
                    }
                }
            } catch (e) {
                pushDebug('check_required_populate_error', String(e));
            }

            const buffer = BigInt('500000000000000'); // 0.0005 MATIC
            const required = total + estimatedGasCost + buffer;
            setRequiredAmountDisplay(`${formatEther(required)} MATIC (approximate — including buffer)`);
            pushDebug('check_required_result', { total: String(total), estimatedGasCost: String(estimatedGasCost), required: String(required) });
        } catch (e) {
            pushDebug('check_required_error', String(e));
            setRequiredAmountDisplay('Failed to estimate required amount');
        } finally {
            setIsCheckingBalance(false);
        }
    }

    async function handleSubscriberClaim() {
        if (!(window as any).ethereum) {
            setStatus("Please install and connect a wallet (e.g. MetaMask)");
            return;
        }
        if (!isConnected || !address) {
            try {
                await loadWeb3Dependencies();
                const provider = new (ethers as any).BrowserProvider((window as any).ethereum);
                await provider.send('eth_requestAccounts', []);
                const signer = provider.getSigner();
                const a = await signer.getAddress();
                if (a) {
                    setAddress(a);
                    setIsConnected(true);
                }
            } catch (e) {
                setStatus("Please connect your wallet");
                return;
            }
        }
        if (hasClaimedOnChain) {
            setStatus('This address has already claimed an NFT on-chain');
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
            try { const net2 = await provider.getNetwork(); pushDebug('provider_network_claim', net2); } catch (e) { pushDebug('provider_network_claim_error', String(e)); }
            try { await provider.send("eth_requestAccounts", []); } catch (e) { pushDebug('eth_requestAccounts_error', String(e)); }
            // Ensure on Polygon
            try {
                const chainHex = await (async () => {
                    try { return await provider.send('eth_chainId', []); } catch { const n = await provider.getNetwork(); return '0x' + n.chainId.toString(16); }
                })();
                if (chainHex !== '0x89') {
                    try {
                        await provider.send('wallet_switchEthereumChain', [{ chainId: '0x89' }]);
                        setStatus('Switching network to Polygon (MATIC)...');
                        await new Promise(r => setTimeout(r, 800));
                    } catch (switchErr) {
                        setStatus('Please switch your wallet network to Polygon (MATIC) and try again.');
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
            setStatus("Transaction signed, awaiting confirmation...");
            const tx = await contract.claimForSubscriber(signature);
            const receipt = await tx.wait();

            // inform backend to mark claimed
            await fetch("/api/mark-claimed", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ wallet_address: address, tx_hash: receipt.transactionHash }),
            });

            setStatus("Congratulations! Free claim complete.");
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
        await loadWeb3Dependencies();
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
            {/* ...existing code... */}
        </main>
    );
}
