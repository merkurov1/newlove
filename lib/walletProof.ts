import { getAddress, verifyMessage } from 'ethers';

/**
 * Proof that the caller controls a wallet.
 *
 * The current mint flow used to trust an arbitrary `wallet_address` in the
 * request body, which allowed any signed-in account to request a voucher for
 * another subscriber's wallet. Every wallet-specific action now requires a
 * short-lived signed message.
 */

export const WALLET_PROOF_TTL_MS = 10 * 60 * 1000;

export type WalletProofInput = {
  walletAddress?: unknown;
  issuedAt?: unknown;
  signature?: unknown;
};

export type WalletProofResult =
  { ok: true; address: string } | { ok: false; reason: 'address' | 'issued_at' | 'signature' };

/** EIP-55 normalisation, returned in lower case for comparisons and storage. */
export function normalizeWalletAddress(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();

  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) return null;

  try {
    return getAddress(trimmed).toLowerCase();
  } catch {
    return null;
  }
}

export function walletProofMessage(address: string, issuedAt: number): string {
  return [
    'merkurov.love wallet verification',
    `wallet: ${address.toLowerCase()}`,
    `issued_at: ${issuedAt}`,
  ].join('\n');
}

export function verifyWalletProof(
  input: WalletProofInput,
  now: number = Date.now()
): WalletProofResult {
  const address = normalizeWalletAddress(input.walletAddress);

  if (!address) return { ok: false, reason: 'address' };

  const issuedAt = Number(input.issuedAt);

  if (!Number.isSafeInteger(issuedAt) || Math.abs(now - issuedAt) > WALLET_PROOF_TTL_MS) {
    return { ok: false, reason: 'issued_at' };
  }

  if (typeof input.signature !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(input.signature.trim())) {
    return { ok: false, reason: 'signature' };
  }

  try {
    const recovered = verifyMessage(
      walletProofMessage(address, issuedAt),
      input.signature.trim()
    ).toLowerCase();

    return recovered === address ? { ok: true, address } : { ok: false, reason: 'signature' };
  } catch {
    return { ok: false, reason: 'signature' };
  }
}
