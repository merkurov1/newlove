"use client";

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
const ConnectWalletButton = dynamic(() => import('./ConnectWalletButton'), { ssr: false });
import ProfileEditLink from '@/components/profile/ProfileEditLink';

export default function ProfileOwnerControls({ wallet, viewerIsOwner }: { wallet?: string | null; viewerIsOwner?: boolean }) {
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('connected_address');
      if (stored) setConnectedAddress(stored);
    } catch (e) { }
  }, []);

  function handleConnected(addr: string) {
    setConnectedAddress(addr);
  }

  const isWalletOwner = connectedAddress && wallet && connectedAddress.toLowerCase() === (wallet || '').toLowerCase();

  return (
    <div className="flex items-center gap-4">
      <ConnectWalletButton onConnected={handleConnected} />
      {/* If the server already determined viewerIsOwner, server-side edit link will be present.
          Otherwise show the edit link client-side when connected wallet matches profile wallet. */}
      {!viewerIsOwner && isWalletOwner ? (
        <ProfileEditLink className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700" />
      ) : null}
    </div>
  );
}
