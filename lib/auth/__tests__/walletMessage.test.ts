/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import {
  normalizeWalletLoginAddress,
  parseWalletLoginMessage,
  validateWalletLoginMessage,
} from '../walletMessage';

const address = '0x1111111111111111111111111111111111111111';
const now = Date.parse('2026-11-03T12:00:00.000Z');
const nonce = 'nonce_1234567890abcdef';

function message(
  overrides: {
    host?: string;
    uri?: string;
    issuedAt?: string;
    expiration?: string;
    chainId?: string;
    nonce?: string;
  } = {}
) {
  const host = overrides.host ?? 'merkurov.love';
  return [
    `${host} wants you to sign in with your Ethereum account:`,
    address,
    '',
    'Sign in to Merkurov Private Sanctuary',
    '',
    `URI: ${overrides.uri ?? `https://${host}`}`,
    'Version: 1',
    `Chain ID: ${overrides.chainId ?? '1'}`,
    `Nonce: ${overrides.nonce ?? nonce}`,
    `Issued At: ${overrides.issuedAt ?? new Date(now).toISOString()}`,
    ...(overrides.expiration ? [`Expiration Time: ${overrides.expiration}`] : []),
  ].join('\n');
}

function validate(overrides: Parameters<typeof message>[0] = {}) {
  return validateWalletLoginMessage({
    message: message(overrides),
    address,
    host: 'merkurov.love',
    origin: 'https://merkurov.love',
    chainId: '1',
    now,
  });
}

describe('wallet login message', () => {
  it('parses and accepts a complete fresh SIWE message', () => {
    expect(parseWalletLoginMessage(message())).toMatchObject({
      domain: 'merkurov.love',
      address,
      nonce,
      chainId: '1',
    });
    expect(validate()).not.toBeNull();
  });

  it('rejects the wrong domain or URI', () => {
    expect(validate({ host: 'evil.example', uri: 'https://evil.example' })).toBeNull();
    expect(validate({ uri: 'https://evil.example' })).toBeNull();
  });

  it('rejects the wrong chain', () => {
    expect(validate({ chainId: '137' })).toBeNull();
  });

  it('rejects a stale or expired message', () => {
    expect(validate({ issuedAt: '2026-11-03T11:00:00.000Z' })).toBeNull();
    expect(validate({ expiration: '2026-11-03T11:59:00.000Z' })).toBeNull();
  });

  it('requires a valid nonce shape', () => {
    expect(validate({ nonce: 'short' })).toBeNull();
    expect(
      parseWalletLoginMessage(message().replace(/^Nonce:.*$/m, 'Nonce: bad value'))
    ).toBeNull();
  });

  it('normalizes only valid EVM addresses', () => {
    expect(normalizeWalletLoginAddress(address.toUpperCase())).toBe(address);
    expect(normalizeWalletLoginAddress('not-a-wallet')).toBeNull();
  });
});
