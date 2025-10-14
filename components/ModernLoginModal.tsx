"use client";
import { useState } from "react";
import useSupabaseSession from '@/hooks/useSupabaseSession';
import Onboard from '@web3-onboard/core';
import injectedModule from '@web3-onboard/injected-wallets';
import walletConnectModule from '@web3-onboard/walletconnect';
import { ethers } from 'ethers';
import { createClient as createBrowserClient } from '@/lib/supabase-browser';

const supabase = createBrowserClient();

export default function ModernLoginModal() {
  const { status, error } = useSupabaseSession() as any;
  const [loading, setLoading] = useState(false);
  const [web3Error, setWeb3Error] = useState('');

  if (status === 'authenticated') return null;



  const handleOnboardWeb3Login = async () => {
    setLoading(true);
    setWeb3Error('');
    try {
      const walletConnect = walletConnectModule({
        projectId: '0083c29479d8ea22af3a3a44a447c439',
        requiredChains: [1],
      });
      const injected = injectedModule();
      const onboard = Onboard({
        wallets: [injected, walletConnect],
        chains: [
          {
            id: '0x1',
            token: 'ETH',
            label: 'Ethereum Mainnet',
            rpcUrl: 'https://mainnet.infura.io/v3/0083c29479d8ea22af3a3a44a447c439',
          },
        ],
        appMetadata: {
          name: 'newlove DApp',
          icon: '<svg></svg>',
          description: 'Авторизация через крипто-кошелек',
        },
      });
      const wallets = await onboard.connectWallet();
      if (!wallets[0]) {
        setWeb3Error('Кошелек не подключен');
        setLoading(false);
        return;
      }
      const wallet = wallets[0];
      const address = wallet.accounts[0].address;
      const ethersProvider = new ethers.BrowserProvider(wallet.provider, 'any');
      const signer = await ethersProvider.getSigner();
      const domain = window.location.host;
      const uri = "https://www.merkurov.love";
      const version = '1';
      const chainId = '1';
      const nonce = Math.floor(Math.random() * 1e16).toString();
      const issuedAt = new Date().toISOString();
      const statement = 'Sign in with Ethereum to the app.';
      const message = `${domain} wants you to sign in with your Ethereum account:\n${address}\n\n${statement}\n\nURI: ${uri}\nVersion: ${version}\nChain ID: ${chainId}\nNonce: ${nonce}\nIssued At: ${issuedAt}`;
      const signature = await signer.signMessage(message);
      const { data, error } = await supabase.auth.signInWithWeb3({
        chain: 'ethereum',
        message,
        signature: signature as any,
      });
      if (error) setWeb3Error(error.message);
    } catch (e: any) {
      setWeb3Error(e.message || String(e));
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({ provider: "google" });
      if (error) setWeb3Error(error.message);
    } catch (e: any) {
      setWeb3Error(e.message || String(e));
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl p-10 w-full max-w-md flex flex-col gap-6 items-center justify-center mx-auto" style={{ minHeight: 320 }}>
        <h2 className="text-3xl font-bold mb-4 text-center">Вход</h2>
        <button
          onClick={handleGoogle}
          className="w-full max-w-xs bg-red-600 text-white rounded-lg px-6 py-3 font-semibold text-lg hover:bg-red-700 transition mb-2 shadow"
          disabled={loading}
        >
          {loading ? 'Входим через Google...' : 'Войти через Google'}
        </button>
        <button
          onClick={handleOnboardWeb3Login}
          className="w-full max-w-xs bg-black text-white rounded-lg px-6 py-3 font-semibold text-lg hover:bg-gray-900 transition shadow"
          disabled={loading}
        >
          {loading ? 'Входим через Web3...' : 'Войти через Web3'}
        </button>
        {(error || web3Error) && <div className="text-red-600 text-sm text-center mt-2">{error || web3Error}</div>}
      </div>
    </div>
  );
}
