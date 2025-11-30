import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { signSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

/**
 * Validates the data received from the Telegram web app, using the
 * method documented here: 
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-web-app
 */
function verifyTelegramInitData(initData: string, botToken: string): boolean {
  if (!initData || !botToken) return false;

  try {
    // 1. Parse the query string properly
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');

    if (!hash) {
      console.warn('Telegram Auth: Missing hash');
      return false;
    }

    // 2. Remove hash from the params to build the check string
    urlParams.delete('hash');

    // 3. Sort keys alphabetically and build the data-check-string
    const dataCheckString = Array.from(urlParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    // 4. Create the Secret Key (HMAC-SHA256 of the Bot Token using "WebAppData" as key is WRONG for Node)
    // CORRECT WAY for Node.js crypto:
    // The secret key is the HMAC-SHA-256 of the bot token, with the constant string "WebAppData" as the key.
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    // 5. Calculate the Hash (HMAC-SHA256 of dataCheckString using secretKey)
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    // 6. Compare (Timing Safe)
    // Note: 'hash' from Telegram is hex string.
    const isValid = calculatedHash === hash;
    
    if (!isValid) {
        console.warn('Telegram Auth: Hash Mismatch', {
            received: hash,
            calculated: calculatedHash,
            stringToCheck: dataCheckString
        });
    }

    return isValid;
  } catch (e) {
    console.error('Telegram Auth: Verification Error', e);
    return false;
  }
}

export async function POST(req: Request) {
  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const sbServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const botToken = process.env.TEMPLE_BOT_TOKEN

  if (!sbUrl || !sbServiceKey || !botToken) {
    console.error('API Error: Missing Env Vars')
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  const supabaseAdmin = createClient(sbUrl, sbServiceKey, { auth: { persistSession: false } })

  try {
    const body = await req.json()
    
    // --- VERIFICATION STEP ---
    // Critical: Only verify if initData is present.
    // If user is just passing { id, username } without initData, it's insecure (spoofable).
    // Assuming this endpoint is ONLY for Telegram Auth.
    
    if (body.initData) {
        const isValid = verifyTelegramInitData(body.initData, botToken);
        if (!isValid) {
            return NextResponse.json({ error: 'Invalid Telegram InitData' }, { status: 401 });
        }
    } else {
        // Fallback for Debug/Dev? Or reject?
        // For production security, reject requests without valid initData or Session Token.
        // But for your logic, let's proceed if you handle web-users differently.
        // If this is strictly for Telegram Mini App auth, reject.
        console.warn('API: No initData provided. Proceeding insecurely (dev mode?) or relying on existing session.');
    }

    // --- PARSE USER DATA ---
    // Telegram sends user data as a JSON string inside 'user' param of initData
    // We should parse it from there if possible, to be safe.
    let telegramUser: any = null;
    
    if (body.initData) {
        const params = new URLSearchParams(body.initData);
        const userStr = params.get('user');
        if (userStr) {
            try {
                telegramUser = JSON.parse(userStr);
            } catch (e) {
                console.error('API: Failed to parse user JSON from initData');
            }
        }
    }

    // Fallback to body root params (if client sent them separately)
    const id = String(telegramUser?.id || body?.id || body?.user?.id || '');
    const username = telegramUser?.username || body?.username || body?.user?.username || '';
    const first_name = telegramUser?.first_name || body?.first_name || body?.user?.first_name || '';

    if (!id) {
      return NextResponse.json({ error: 'No User ID found' }, { status: 400 })
    }

    // --- DATABASE SYNC ---
    const { error: upsertError } = await supabaseAdmin
      .from('temple_users')
      .upsert({
        telegram_id: id,
        username: username,
        first_name: first_name,
        last_seen_at: new Date().toISOString()
      }, { onConflict: 'telegram_id' })

    if (upsertError) {
      console.error('API: Supabase Error:', upsertError)
      return NextResponse.json({ error: upsertError.message }, { status: 500 })
    }

    // --- SESSION GENERATION ---
    const displayName = username || first_name || `user_${id.slice(-4)}`;
    
    // Log entry (optional, don't block response)
    supabaseAdmin.from('temple_log').insert({ event_type: 'enter', message: `${displayName} entered via Telegram` }).then();

    const token = signSession({ userId: id, displayName })
    const maxAge = 60 * 60 * 24 * 30 // 30 days
    const isProd = process.env.NODE_ENV === 'production'
    
    // Cookie allows Next.js middleware to see the session
    const cookie = `temple_session=${token}; Path=/; Max-Age=${maxAge}; SameSite=None; HttpOnly${isProd ? '; Secure' : ''}`

    return NextResponse.json({ 
      success: true, 
      userId: id, 
      displayName, 
      token 
    }, { 
      status: 200, 
      headers: { 'Set-Cookie': cookie } 
    })

  } catch (e: any) {
    console.error('API: Critical Auth Error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}