import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(sbUrl, sbKey)

export async function POST(req: Request) {
  try {
    const { recordId, email } = await req.json()
    
    if (!recordId || !email) return NextResponse.json({ error: 'Missing data' }, { status: 400 })

    const { error } = await supabase
        .from('casts')
        .update({ 
            email: email,
            status: 'identified'
        })
        .eq('id', recordId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'DB Error' }, { status: 500 })
  }
}