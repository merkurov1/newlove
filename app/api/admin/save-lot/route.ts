import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/serverAuth'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! 
)

export async function POST(req: Request) {
  try {
    await requireAdminFromRequest(req)
    const body = await req.json()
    const { artist, title, link, image_url, ai_content, specs } = body

    const lotAI = ai_content?.lot || ai_content || {}
    let storedImagePath = null

    // Скачивание и сохранение картинки в Supabase Storage
    if (image_url) {
      try {
        const imageRes = await fetch(image_url)
        if (imageRes.ok) {
          const arrayBuffer = await imageRes.arrayBuffer()
          const buffer = Buffer.from(arrayBuffer)
          const fileExt = image_url.split('.').pop()?.split('?')[0] || 'jpg'
          const safeName = `${artist || lotAI.artist || 'unknown'}-${title || lotAI.title || 'untitled'}`.replace(/[^a-z0-9]/gi, '_').toLowerCase()
          const fileName = `${safeName}_${Date.now()}.${fileExt}`
          const contentType = imageRes.headers.get('content-type') || 'image/jpeg'

          const { data: uploadData, error: uploadError } = await supabase
            .storage
            .from('artifacts')
            .upload(fileName, buffer, { contentType, upsert: true })

          if (!uploadError && uploadData?.path) {
            storedImagePath = uploadData.path
          }
        }
      } catch (e) {
        console.warn('[Saver] Image download/upload skipped:', e)
      }
    }

    // Вставляем все структурированные метаданные в таблицу `lots`
    const { data, error } = await supabase
      .from('lots')
      .insert({
        artist: artist || lotAI.artist,
        title: title || lotAI.title,
        source_url: link,
        image_path: storedImagePath || image_url,
        
        medium: lotAI.medium || specs?.medium,
        dimensions: lotAI.dimensions || specs?.dimensions,
        estimate: lotAI.estimate_raw || specs?.estimate,
        year: lotAI.year || specs?.date,
        provenance: JSON.stringify(lotAI.provenance || specs?.provenance || []),
        
        // Полноценный AI-контент
        ai_content: lotAI,
        status: 'published'
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, id: data.id, lot: data })

  } catch (error: any) {
    console.error('[Saver Error]:', error)
    return NextResponse.json({ error: 'Save failed', details: error?.message }, { status: 500 })
  }
}
