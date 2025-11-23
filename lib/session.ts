import jwt from 'jsonwebtoken'

const SECRET = process.env.NEXT_JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'dev_secret_change_me'

export function signSession(payload: { userId: string; displayName: string }, expiresIn = '30d') {
  // Cast SECRET to jwt.Secret to satisfy TypeScript definitions
  return jwt.sign(payload, SECRET as jwt.Secret, { expiresIn })
}

export function verifySession(token: string) {
  try {
    return jwt.verify(token, SECRET as jwt.Secret) as { userId: string; displayName: string; iat?: number; exp?: number }
  } catch (e) {
    return null
  }
}
