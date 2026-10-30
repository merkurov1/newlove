/**
 * @jest-environment node
 */

import { Wallet } from 'ethers';
import {
  WALLET_PROOF_TTL_MS,
  normalizeWalletAddress,
  verifyWalletProof,
  walletProofMessage,
} from '../walletProof';

const wallet = new Wallet('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');

describe('wallet claim proof', () => {
  it('normalizes valid addresses and rejects malformed ones', () => {
    expect(normalizeWalletAddress(wallet.address)).toBe(wallet.address.toLowerCase());
    expect(normalizeWalletAddress('0x1234')).toBeNull();
    expect(normalizeWalletAddress('not-an-address')).toBeNull();
    expect(normalizeWalletAddress(null)).toBeNull();
  });

  it('accepts a fresh signature from the wallet owner', async () => {
    const issuedAt = Date.now();
    const signature = await wallet.signMessage(walletProofMessage(wallet.address, issuedAt));

    expect(
      verifyWalletProof({
        walletAddress: wallet.address,
        issuedAt,
        signature,
      })
    ).toEqual({ ok: true, address: wallet.address.toLowerCase() });
  });

  it('rejects a signature issued by another wallet', async () => {
    const issuedAt = Date.now();
    const attacker = Wallet.createRandom();
    const signature = await attacker.signMessage(walletProofMessage(wallet.address, issuedAt));

    expect(
      verifyWalletProof({
        walletAddress: wallet.address,
        issuedAt,
        signature,
      })
    ).toEqual({ ok: false, reason: 'signature' });
  });

  it('rejects expired proofs', async () => {
    const issuedAt = Date.now() - WALLET_PROOF_TTL_MS - 1;
    const signature = await wallet.signMessage(walletProofMessage(wallet.address, issuedAt));

    expect(
      verifyWalletProof({
        walletAddress: wallet.address,
        issuedAt,
        signature,
      })
    ).toEqual({ ok: false, reason: 'issued_at' });
  });

  it('rejects a proof signed for a different address', async () => {
    const issuedAt = Date.now();
    const other = '0x000000000000000000000000000000000000dEaD';
    const signature = await wallet.signMessage(walletProofMessage(other, issuedAt));

    expect(
      verifyWalletProof({
        walletAddress: wallet.address,
        issuedAt,
        signature,
      })
    ).toEqual({ ok: false, reason: 'signature' });
  });
});
