import crypto from 'node:crypto';

import { assertServerOnly } from '@/lib/serverOnly';

assertServerOnly('lib/analytics/website/tokenCrypto');

/**
 * Server-side sealing for Google refresh tokens.
 *
 * AES-256-GCM with a random 12-byte IV per value. The key is a dedicated
 * ANALYTICS_TOKEN_ENCRYPTION_KEY when present; otherwise a domain-separated
 * key is derived from the service-role secret so the integration can run
 * without adding a new secret. The derived mode is reported in the admin UI.
 */

export type SealedSecret = {
  ciphertext: string;
  iv: string;
  tag: string;
  keyVersion: string;
};

const KEY_VERSION_DEDICATED = 'v1:dedicated';
const KEY_VERSION_DERIVED = 'v1:derived-service-role';

export function analyticsEncryptionKeySource(): 'dedicated' | 'derived' {
  return (process.env.ANALYTICS_TOKEN_ENCRYPTION_KEY || '').trim()
    ? 'dedicated'
    : 'derived';
}

function dedicatedKey(): Buffer | null {
  const dedicated = (process.env.ANALYTICS_TOKEN_ENCRYPTION_KEY || '').trim();
  return dedicated ? crypto.createHash('sha256').update(dedicated, 'utf8').digest() : null;
}

function derivedKey(): Buffer | null {
  const serviceRole = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  return serviceRole
    ? crypto
        .createHash('sha256')
        .update(`pierrot-website-analytics:${serviceRole}`, 'utf8')
        .digest()
    : null;
}

function previousKey(): Buffer | null {
  const previous = (process.env.ANALYTICS_TOKEN_ENCRYPTION_KEY_PREVIOUS || '').trim();
  return previous ? crypto.createHash('sha256').update(previous, 'utf8').digest() : null;
}

function getKey(): Buffer {
  const key = dedicatedKey() ?? derivedKey();

  if (!key) {
    throw new Error(
      'Analytics token encryption is unavailable: set ANALYTICS_TOKEN_ENCRYPTION_KEY.'
    );
  }

  return key;
}

/**
 * Candidate keys for opening an existing token. The stored `key_version` lets
 * the integration keep working while moving from the derived key to a
 * dedicated secret (or from one dedicated secret to the next) without forcing
 * every owner to re-consent at once.
 */
function openKeyCandidates(keyVersion?: string | null): Buffer[] {
  const candidates: Buffer[] = [getKey()];
  const previous = previousKey();
  if (previous) candidates.push(previous);

  if (!keyVersion) {
    // Legacy rows may predate key versioning; accept either known key source.
    const derived = derivedKey();
    if (derived) candidates.push(derived);
    const dedicated = dedicatedKey();
    if (dedicated) candidates.push(dedicated);
  } else if (keyVersion === KEY_VERSION_DERIVED) {
    const derived = derivedKey();
    if (derived) candidates.push(derived);
  } else if (keyVersion === KEY_VERSION_DEDICATED) {
    const dedicated = dedicatedKey();
    if (dedicated) candidates.push(dedicated);
  }

  return candidates.filter(
    (key, index) => candidates.findIndex((candidate) => candidate.equals(key)) === index
  );
}

export function sealSecret(plaintext: string): SealedSecret {
  if (!plaintext) throw new Error('Cannot seal an empty secret.');

  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    keyVersion:
      analyticsEncryptionKeySource() === 'dedicated'
        ? KEY_VERSION_DEDICATED
        : KEY_VERSION_DERIVED,
  };
}

export function openSecret(sealed: {
  ciphertext?: string | null;
  iv?: string | null;
  tag?: string | null;
  keyVersion?: string | null;
}): string | null {
  if (!sealed.ciphertext || !sealed.iv || !sealed.tag) return null;

  let candidates: Buffer[];
  try {
    candidates = openKeyCandidates(sealed.keyVersion);
  } catch {
    // Missing key configuration is reported as an unreadable token, matching
    // the previous behavior of returning null instead of throwing.
    return null;
  }

  for (const key of candidates) {
    try {
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        key,
        Buffer.from(sealed.iv, 'base64')
      );
      decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(sealed.ciphertext, 'base64')),
        decipher.final(),
      ]);

      return plaintext.toString('utf8');
    } catch {
      // Try the next candidate key; a failed auth tag must never surface.
    }
  }

  return null;
}

export function signState(payload: Record<string, unknown>, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64url');

  return `${body}.${signature}`;
}

export function verifyState<T extends Record<string, unknown>>(
  value: string,
  secret: string
): T | null {
  const [body, signature] = value.split('.');

  if (!body || !signature) return null;

  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

export function shortHash(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 32);
}

export function fullHash(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}
