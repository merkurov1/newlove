"use client";

import { useState } from 'react';

export default function WalletLoginButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // TODO: Integrate Web3-Onboard for wallet login
  const handleWalletLogin = async () => {
    setLoading(true);
    setError(null);
    // Placeholder: call onboard wallet connect here
    setTimeout(() => {
      setLoading(false);
      setError('Web3 wallet login not yet implemented.');
    }, 1000);
  };

  return (
    <div>
      <button onClick={handleWalletLogin} disabled={loading}>
        {loading ? 'Connecting...' : 'Login with Wallet'}
      </button>
      {error && <div style={{ color: 'red' }}>{error}</div>}
    </div>
  );
}
