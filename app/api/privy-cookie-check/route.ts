
import { NextRequest, NextResponse } from 'next/server';
import { PrivyClient } from '@privy-io/server-auth';

export async function POST(req: NextRequest) {
  const debug: any = {};
  const privyAppId = process.env.PRIVY_APP_ID;
  const privyAppSecret = process.env.PRIVY_APP_SECRET;
  if (!privyAppId || !privyAppSecret) {
    return NextResponse.json({ error: 'Missing Privy credentials in env' }, { status: 500 });
  }
  const privy = new PrivyClient(privyAppId, privyAppSecret);
  let body;
  try {
    body = await req.json();
  } catch (e) {
    return NextResponse.json({ error: 'Failed to parse body', details: String(e) }, { status: 400 });
  }
  const privyToken = typeof body?.privyToken === 'string' ? body.privyToken : null;
  const privyIdToken = typeof body?.privyIdToken === 'string' ? body.privyIdToken : null;
  debug.privyToken = privyToken;
  debug.privyIdToken = privyIdToken;
  const result: any = {};
  if (privyToken) {
    try {
      const claims = await privy.verifyAuthToken(privyToken);
      result.privyTokenClaims = claims;
    } catch (e) {
      result.privyTokenError = String(e);
    }
  }
  if (privyIdToken) {
    try {
      const claims = await privy.verifyAuthToken(privyIdToken);
      result.privyIdTokenClaims = claims;
    } catch (e) {
      result.privyIdTokenError = String(e);
    }
  }
  return NextResponse.json({ debug, result });
}
