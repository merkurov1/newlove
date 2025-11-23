import * as jwt from 'jsonwebtoken'

const SECRET: jwt.Secret = process.env.NEXT_JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'dev_secret_change_me'

export function signSession(payload: { userId: string; displayName: string }, expiresIn = '30d') {
  // Use a narrow any-cast to avoid TypeScript overload resolution issues
  return (jwt.sign as any)(payload, SECRET, { expiresIn })
}

export function verifySession(token: string) {
  try {
    return jwt.verify(token, SECRET) as { userId: string; displayName: string; iat?: number; exp?: number }
  } catch (e) {
    return null
  }
}
