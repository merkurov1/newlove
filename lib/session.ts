import * as jwt from 'jsonwebtoken'

/**
 * Session signing secret.
 *
 * Never fall back to the Supabase service-role key or a hard-coded value:
 * a weak or missing secret turns temple/vigil session cookies into
 * attacker-controlled identities. Deployments must set NEXT_JWT_SECRET
 * (NEXTAUTH_SECRET is accepted as a migration fallback).
 */
function sessionSecret(): jwt.Secret {
  const secret = process.env.NEXT_JWT_SECRET || process.env.NEXTAUTH_SECRET

  if (!secret || secret.length < 32) {
    throw new Error('NEXT_JWT_SECRET (or NEXTAUTH_SECRET) must be set to a strong value')
  }

  return secret
}

export function signSession(payload: { userId: string; displayName: string }, expiresIn = '30d') {
  const options: jwt.SignOptions = { expiresIn: expiresIn as jwt.SignOptions['expiresIn'] };
  return jwt.sign(payload, sessionSecret(), options);
}

export function verifySession(token: string) {
  try {
    return jwt.verify(token, sessionSecret()) as { userId: string; displayName: string; iat?: number; exp?: number };
  } catch {
    return null;
  }
}
