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

function getKey(): Buffer {
  const dedicated = (process.env.ANALYTICS_TOKEN_ENCRYPTION_KEY || '').trim();

  if (dedicated) {
    return crypto.createHash('sha256').update(dedicated, 'utf8').digest();
  }

  const serviceRole = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!serviceRole) {
    throw new Error(
      'Analytics token encryption is unavailable: set ANALYTICS_TOKEN_ENCRYPTION_KEY.'
    );
  }

  return crypto
    .createHash('sha256')
    .update(`pierrot-website-analytics:${serviceRole}`, 'utf8')
    .digest();
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
}): string | null {
  if (!sealed.ciphertext || !sealed.iv || !sealed.tag) return null;

  try {
    const key = getKey();
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
    return null;
  }
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
