import crypto from 'node:crypto';

import { assertServerOnly } from '@/lib/serverOnly';

assertServerOnly('lib/telegram/instantViewSessionCrypto');

/**
 * Server-only sealing for the Telegram Instant View Editor session.
 *
 * The editor session is a browser cookie that grants access to
 * instantview.telegram.org/my/. It must survive worker/serverless restarts, so
 * it is stored encrypted in the existing private ops_runtime_settings table.
 *
 * AES-256-GCM with a random 12-byte IV per value. A dedicated
 * TELEGRAM_INSTANT_VIEW_SESSION_KEY is preferred; when it is absent the key is
 * derived from the service-role secret, which is also server-only. The stored
 * key version lets the integration rotate keys without losing the session
 * immediately.
 */

export type SealedInstantViewSecret = {
  ciphertext: string;
  iv: string;
  tag: string;
  keyVersion: string;
};

const KEY_VERSION_DEDICATED = 'v1:dedicated';
const KEY_VERSION_DERIVED = 'v1:derived-service-role';

export function instantViewSessionKeySource(): 'dedicated' | 'derived' | 'unavailable' {
  if ((process.env.TELEGRAM_INSTANT_VIEW_SESSION_KEY || '').trim()) return 'dedicated';
  if ((process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()) return 'derived';
  return 'unavailable';
}

function dedicatedKey(): Buffer | null {
  const value = (process.env.TELEGRAM_INSTANT_VIEW_SESSION_KEY || '').trim();
  return value ? crypto.createHash('sha256').update(value, 'utf8').digest() : null;
}

function previousKey(): Buffer | null {
  const value = (process.env.TELEGRAM_INSTANT_VIEW_SESSION_KEY_PREVIOUS || '').trim();
  return value ? crypto.createHash('sha256').update(value, 'utf8').digest() : null;
}

function derivedKey(): Buffer | null {
  const serviceRole = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  return serviceRole
    ? crypto
        .createHash('sha256')
        .update(`telegram-instant-view-session:${serviceRole}`, 'utf8')
        .digest()
    : null;
}

function getKey(): Buffer {
  const key = dedicatedKey() ?? derivedKey();

  if (!key) {
    throw new Error(
      'Telegram Instant View session encryption is unavailable: set TELEGRAM_INSTANT_VIEW_SESSION_KEY or SUPABASE_SERVICE_ROLE_KEY.'
    );
  }

  return key;
}

function openKeyCandidates(keyVersion?: string | null): Buffer[] {
  const candidates: Buffer[] = [];

  try {
    candidates.push(getKey());
  } catch {
    // An unreadable configuration is handled by the caller.
  }

  const previous = previousKey();
  if (previous) candidates.push(previous);

  if (keyVersion === KEY_VERSION_DEDICATED) {
    const dedicated = dedicatedKey();
    if (dedicated) candidates.push(dedicated);
  } else if (keyVersion === KEY_VERSION_DERIVED) {
    const derived = derivedKey();
    if (derived) candidates.push(derived);
  } else if (!keyVersion) {
    const derived = derivedKey();
    const dedicated = dedicatedKey();
    if (derived) candidates.push(derived);
    if (dedicated) candidates.push(dedicated);
  }

  return candidates.filter(
    (key, index) => candidates.findIndex((candidate) => candidate.equals(key)) === index
  );
}

export function sealInstantViewSecret(plaintext: string): SealedInstantViewSecret {
  if (!plaintext) throw new Error('Cannot seal an empty Instant View session value.');

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
      instantViewSessionKeySource() === 'dedicated' ? KEY_VERSION_DEDICATED : KEY_VERSION_DERIVED,
  };
}

export function openInstantViewSecret(sealed: {
  ciphertext?: string | null;
  iv?: string | null;
  tag?: string | null;
  keyVersion?: string | null;
}): string | null {
  if (!sealed.ciphertext || !sealed.iv || !sealed.tag) return null;

  const candidates = openKeyCandidates(sealed.keyVersion);

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
      // Wrong key or tampered value. Try the next candidate, never surface the
      // authentication failure to a client.
    }
  }

  return null;
}

export function instantViewFingerprint(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 12);
}
