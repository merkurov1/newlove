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
  // All state declarations
  const [contractOwner, setContractOwner] = useState<string | null>(null);
  const [baseUriInput, setBaseUriInput] = useState<string>('');
  const [maxPublic, setMaxPublic] = useState<number | null>(null);
  const [priceEth, setPriceEth] = useState<string | null>(null);
  const [publicMinted, setPublicMinted] = useState<number | null>(null);
  const [hasClaimedOnChain, setHasClaimedOnChain] = useState<boolean | null>(null);
  const [requiredAmountDisplay, setRequiredAmountDisplay] = useState<string | null>(null);
  const [isCheckingBalance, setIsCheckingBalance] = useState<boolean>(false);
  const [isEligible, setIsEligible] = useState<boolean | null>(null);
  const [hasTransformed, setHasTransformed] = useState<boolean>(false);
  const [pendingVariantChoice, setPendingVariantChoice] = useState<{ variant: 'Angel' | 'Devil'; tokenId?: number } | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [onboardWallet, setOnboardWallet] = useState<any | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [mintedTokenIds, setMintedTokenIds] = useState<number[]>([]);
  const [mintedTokenImages, setMintedTokenImages] = useState<string[]>([]);
  const [mintedTokenVariants, setMintedTokenVariants] = useState<number[]>([]);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  const [debugState, setDebugState] = useState<any>({});
  const [angelCount, setAngelCount] = useState<number | null>(null);
  const [devilCount, setDevilCount] = useState<number | null>(null);
  const [isCounting, setIsCounting] = useState(false);
  const [isProcessing, setProcessing] = useState(false);

  // Handler stubs to prevent reference errors
  function handlePublicMint(amount: number) {}
  function fetchVariantCounts(opts: any) {}
  function requestVariant(variant: 'Angel' | 'Devil', id: number) {}

  // Helper function for debug panel
  function safeStringify(obj: any, maxLen: number) {
    try {
      const str = JSON.stringify(obj, null, 2);
      return str.length > maxLen ? str.slice(0, maxLen) + '... (truncated)' : str;
    } catch {
      return String(obj);
    }
  }

  // Main render
  return (
    <main>
      <div>
        {/* All content is now inside a single div for valid JSX parent */}
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
                >Mint Neutral Heart</button>
                {/* Optional debug panel: visible when URL contains ?debug=1 */}
                {typeof window !== 'undefined' && window.location.search.includes('debug=1') ? (
                  <div className="mt-6 p-4 bg-black text-white rounded">
                    <div className="flex items-center justify-between">
                      <div className="font-mono">DEBUG PANEL (debug=1)</div>
                      <div className="text-sm">
                        <button className="px-2 py-1 bg-white text-black rounded" onClick={async () => { try { await navigator.clipboard.writeText(JSON.stringify({ status, lastTxHash, debugState }, null, 2)); setStatus('Debug copied to clipboard'); setTimeout(() => setStatus(null), 1500); } catch (e) { setStatus('Failed to copy debug'); setTimeout(() => setStatus(null), 1500); } }}>Copy</button>
                      </div>
                    </div>
                    <pre className="mt-2 text-xs whitespace-pre-wrap break-words">{safeStringify({ status, lastTxHash, debugState }, 4000)}</pre>
                  </div>
                ) : null}
              </div>
              {requiredAmountDisplay ? (
                <div className="mt-2 text-sm text-yellow-700">Required: {requiredAmountDisplay}</div>
              ) : null}
              <div className="text-sm text-neutral-700 text-right">
                <div className="font-medium">
                  {angelCount !== null || devilCount !== null ? (
                    `${angelCount ?? 0} Angels, ${devilCount ?? 0} Devils`
                  ) : (
                    `Available: ${publicMinted ?? "—"} / ${maxPublic ?? "—"}`
                  )}
                </div>
                <div className="mt-2">
                  <button className="px-3 py-1 bg-gray-100 border rounded text-sm" onClick={() => fetchVariantCounts({ cap: 2000 })} disabled={isCounting || !publicMinted}>{isCounting ? 'Counting…' : 'Refresh counter'}</button>
                </div>
                <div className="mt-1 text-xs text-neutral-500">total: {priceEth ?? '—'} MATIC</div>
              </div>
            </div>
          </div>
        </div>

        {/* Share buttons */}
        <div className="mt-6 flex items-center gap-3 justify-center">
          <span className="text-sm text-neutral-600">Share:</span>
          <div className="flex items-center gap-2">
            <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent('Irreversible Choice — Neutral Heart')}&url=${encodeURIComponent('https://www.merkurov.love/heartandangel/NFT')}`} target="_blank" rel="noopener noreferrer" className="px-3 py-1 bg-blue-500 text-white rounded text-sm">Twitter</a>
            <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent('https://www.merkurov.love/heartandangel/NFT')}`} target="_blank" rel="noopener noreferrer" className="px-3 py-1 bg-blue-700 text-white rounded text-sm">Facebook</a>
            <a href={`https://t.me/share/url?url=${encodeURIComponent('https://www.merkurov.love/heartandangel/NFT')}&text=${encodeURIComponent('Irreversible Choice — Neutral Heart')}`} target="_blank" rel="noopener noreferrer" className="px-3 py-1 bg-blue-400 text-white rounded text-sm">Telegram</a>
            <button onClick={async () => { try { await navigator.clipboard?.writeText('https://www.merkurov.love/heartandangel/NFT'); setStatus('Link copied'); setTimeout(() => setStatus(null), 2000); } catch (e) { setStatus('Failed to copy link'); setTimeout(() => setStatus(null), 3000); } }} className="px-3 py-1 bg-gray-100 rounded text-sm">Copy link</button>
          </div>
        </div>

        {/* FAQ section */}
        <div className="mt-6 p-6 bg-white shadow-sm rounded border">
          <h2 className="text-2xl font-extrabold mb-4 text-center">FAQ — FREQUENTLY ASKED QUESTIONS</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">GENERAL QUESTIONS</h3>
              <div className="text-sm text-gray-700 space-y-2">
                <p><strong>What is "Irreversible Choice"?</strong> This is an NFT project where you receive a token in a neutral state and must make a single, irreversible choice — to transform it into an Angel or a Devil. It's a philosophical experiment about decision-making, consequences, and digital identity.</p>
                <p><strong>Why "irreversible"?</strong> After the transaction, your NFT's metadata will be changed at the smart contract level. The action cannot be undone or reverted — your choice is recorded on the blockchain forever.</p>
                <p><strong>How much does it cost to participate?</strong> You can get a Neutral Heart for {priceEth ? `${priceEth} MATIC` : '0.0001 MATIC'} (0.0001 MATIC shown as reserve). You only pay gas for transactions (claiming and transforming).</p>
              </div>

              <h3 className="text-lg font-semibold">MECHANICS</h3>
              <div className="text-sm text-gray-700 space-y-2">
                <p><strong>How do I get a Neutral Heart?</strong></p>
                <ol className="list-decimal list-inside ml-4 space-y-1">
                  <li>Connect a Web3 wallet (MetaMask, WalletConnect, etc.).</li>
                  <li>Go to the project website.</li>
                  <li>Click "Claim Neutral Heart".</li>
                  <li>Confirm the transaction in your wallet.</li>
                </ol>

                <p><strong>How does the transformation work?</strong> On the project website, you choose a path — the Angel address or the Devil address — and send your Neutral Heart there. After confirming the transaction, your token is burned and you receive a transformed version with new metadata and image.</p>
              </div>
              <p><strong>Can I choose later?</strong> Yes. Neutral Heart can remain in your wallet as long as you want. But until you make a choice, the NFT stays in a neutral state.</p>
              <p><strong>Can I change my decision after transformation?</strong> No — the transformation is irreversible.</p>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold">TECHNICAL QUESTIONS</h3>
              <div className="text-sm text-gray-700 space-y-2">
                <p><strong>Which blockchain does the project use?</strong> Polygon.</p>
                <p><strong>Where can I see my NFT?</strong> After claiming or transforming, your NFT will appear in your wallet and be visible on OpenSea, Rarible, and other marketplaces supporting ERC-721.</p>
                <p><strong>Can I sell or transfer the NFT?</strong> Yes — Neutral Heart and transformed versions can be sold, gifted, or transferred like any other NFT.</p>
                <p><strong>What is "burning" the Neutral Heart?</strong> Technically, your original Neutral Heart is overwritten/removed at the contract level during transformation — the result is a new record with new metadata.</p>
                <p><strong>Is the smart contract safe?</strong> The contract [has been audited/open for review — specify status]. Contract address: <code className="break-all">{CONTRACT_ADDRESS}</code>. You can check the code on the network explorer.</p>
              </div>

              <h3 className="text-lg font-semibold">PROJECT PHILOSOPHY</h3>
              <div className="text-sm text-gray-700 space-y-2">
                <p><strong>Why do this?</strong> This is an experiment about the nature of choice. In the digital world, we're used to the "undo" button. This project restores weight to decisions — as in life, where some choices change us forever.</p>
                <p><strong>Is there a "right" choice?</strong> No. Angel and Devil are archetypes, symbols of inner conflict. Your choice reflects what resonates with you at this moment.</p>
                <p><strong>What if everyone chooses one side?</strong> That's part of the experiment — imbalance is also a result and provides data on collective preferences.</p>
              </div>

              <div className="text-sm text-gray-700 space-y-2">
                <h4 className="font-semibold">Problems & Support</h4>
                <p className="mt-1"><strong>The transaction didn't go through. What should I do?</strong></p>
                <ul className="list-disc list-inside ml-4 text-sm text-gray-700">
                  <li>Check if you have enough MATIC to pay for gas.</li>
                  <li>Make sure your wallet is connected to the Polygon network.</li>
                  <li>Try increasing the gas limit or try again later.</li>
                </ul>

                <p className="mt-2"><strong>I sent the NFT to the wrong address. Can I get it back?</strong> Unfortunately, no — blockchain transactions are irreversible. Always double-check the address before sending.</p>
              </div>
            </div>
          </div>
          <p className="mt-4 text-sm text-neutral-600 italic">Remember: every heart is a choice. Every choice is a story. Your story is being written right now.</p>
        </div>
        {/* All conditional and fragment JSX is now inside the parent div */}
        {status && <div className="mt-4 p-3 bg-neutral-100 rounded">{status}</div>}
        {mintedTokenIds.length > 0 && (
          <div className="mt-4 p-4 border rounded">
            <h3 className="text-lg font-medium mb-2">Your tokens</h3>
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
                      <div className="h-36 flex items-center justify-center bg-neutral-50 text-neutral-500 rounded">No image</div>
                    )}
                    <div className="mt-2 text-sm">Token ID: {id}</div>
                    {/* If token is neutral (variant 0), show transform buttons */}
                    {mintedTokenVariants && mintedTokenVariants[idx] === 0 ? (
                      <div className="mt-2 flex gap-2 justify-center items-center">
                        <button className="px-2 py-1 bg-indigo-600 text-white rounded text-sm" onClick={() => requestVariant('Angel', id)}>Angel</button>
                        <button className="px-2 py-1 bg-red-600 text-white rounded text-sm" onClick={() => requestVariant('Devil', id)}>Devil</button>
                        {pendingVariantChoice && pendingVariantChoice.tokenId === id ? (
                          <div className="ml-2 text-sm text-yellow-800">Confirm: click again</div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {mintedTokenImages.some(i => !i) && (
              <div className="mt-3 text-sm text-yellow-700">Some metadata is not yet set on the contract (baseURI). If images are missing — make sure the owner set baseURI via setBaseURI.</div>
            )}
          </div>
        )}
        {/* End tokens section */}
        {/* Optional debug panel: visible when URL contains ?debug=1 */}
        {typeof window !== 'undefined' && window.location.search.includes('debug=1') ? (
          <div className="mt-6 p-4 bg-black text-white rounded">
            <div className="flex items-center justify-between">
              <div className="font-mono">DEBUG PANEL (debug=1)</div>
              <div className="text-sm">
                <button className="px-2 py-1 bg-white text-black rounded" onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(JSON.stringify({ status, lastTxHash, debugState }, null, 2));
                    setStatus('Debug copied to clipboard');
                    setTimeout(() => setStatus(null), 1500);
                  } catch (e) {
                    setStatus('Failed to copy debug');
                    setTimeout(() => setStatus(null), 1500);
                  }
                }}>Copy</button>
              </div>
            </div>
            <pre className="mt-2 text-xs whitespace-pre-wrap break-words">{safeStringify({ status, lastTxHash, debugState }, 4000)}</pre>
          </div>
        ) : null}
      </div>
    </main>
  );
}