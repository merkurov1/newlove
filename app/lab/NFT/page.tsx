"use client";

import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import { formatEther } from "ethers/lib/utils";
import { useAccount, useSigner, useConnect } from "wagmi";
import { InjectedConnector } from "wagmi/connectors/injected";
import { CONTRACT_ADDRESS, NFT_ABI } from "./contract";

export default function NFTLabPageClient() {
  const { address, isConnected } = useAccount();
  const { data: signer } = useSigner();
  const { connect } = useConnect({ connector: new InjectedConnector() });

  const [status, setStatus] = useState<string | null>(null);
  const [isProcessing, setProcessing] = useState(false);
  const [priceEth, setPriceEth] = useState<string | null>(null);
  const [maxPublic, setMaxPublic] = useState<number | null>(null);
  const [publicMinted, setPublicMinted] = useState<number | null>(null);

  useEffect(() => {
    // Read on-chain metadata (price, supply)
    async function loadOnchain() {
      try {
        if (!signer) return;
        const provider = signer.provider || (signer as any).getProvider?.();
        if (!provider) return;
        const contract = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, provider);
  const price = await contract.priceWei();
        const max = await contract.maxPublicSupply();
        const minted = await contract.publicMinted();
  setPriceEth(formatEther(price));
        setMaxPublic(Number(max));
        setPublicMinted(Number(minted));
      } catch (err) {
        // ignore
      }
    }
    loadOnchain();
  }, [signer]);

  async function handlePublicMint(qty = 1) {
    if (!isConnected) {
      setStatus("Пожалуйста, подключите кошелёк");
      return;
    }
    if (!signer) {
      setStatus("Подпись недоступна");
      return;
    }

    setProcessing(true);
    setStatus(null);
    try {
      const contract = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, signer);
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
      if (!signer) throw new Error("Signer unavailable");
      const contract = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, signer);
      const tx = await contract.claimForSubscriber(signature);
      setStatus("Транзакция подписана, ожидаю подтверждения...");
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

  return (
    <main className="mx-auto max-w-prose py-12 px-4">
      <h1 className="text-3xl font-bold">Необратимый Выбор — получить Neutral Heart</h1>

      <div className="mt-4 p-4 bg-yellow-50 border-l-4 border-yellow-400">
        <h3 className="font-semibold">Недостающая информация (пожалуйста, предоставьте позже)</h3>
        <ul className="mt-2 list-disc pl-5 text-sm text-neutral-700">
          <li>Адрес контракта (если уже задеплоен) — установите в NEXT_PUBLIC_NEUTRAL_HEART_ADDRESS</li>
          <li>Приватный ключ сервера для подписи ваучеров (ENV: SIGNER_PRIVATE_KEY)</li>
          <li>POLYGON RPC URL (ENV: POLYGON_RPC_URL) и POLYGONSCAN API KEY (для верификации/деплоя)</li>
          <li>Список изображений/медиаконтента для токенов (IPFS/URL) — baseURI или CID</li>
          <li>Таблица Supabase `subscribers` с полями: wallet_address (text), has_claimed (boolean)</li>
          <li>Адреса админ-кошельков (для withdraw и trustedSigner), если есть</li>
        </ul>
      </div>

      <div className="mt-6 space-y-4">
        <div>
          <strong>Адрес контракта:</strong> <code>{CONTRACT_ADDRESS}</code>
        </div>

        <div className="p-4 border rounded">
          <h2 className="text-xl font-semibold">Публичная продажа</h2>
          <p className="mt-2">Купить за {priceEth ?? "—"} MATIC</p>
          <div className="mt-4 flex gap-3">
            <button
              className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
              onClick={() => handlePublicMint(1)}
              disabled={isProcessing}
            >
              Купить за {priceEth ?? "—"} MATIC
            </button>
            <button
              className="px-4 py-2 bg-gray-200 rounded"
              onClick={() => connect()}
            >
              Подключить кошелёк
            </button>
          </div>
          <div className="mt-2 text-sm text-neutral-500">Доступно: {publicMinted ?? "—"} / {maxPublic ?? "—"}</div>
        </div>

        <div className="p-4 border rounded">
          <h2 className="text-xl font-semibold">Бесплатный клейм для подписчиков</h2>
          <p className="mt-2">Для подписчиков — бесплатно (платите только газ)</p>
          <div className="mt-4">
            <button
              className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
              onClick={handleSubscriberClaim}
              disabled={isProcessing}
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

