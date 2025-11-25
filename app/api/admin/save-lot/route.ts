import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs' // Важно для скачивания файлов

// Инициализация Supabase (нужен SERVICE_ROLE_KEY для записи в Storage без авторизации юзера)
// Если работаешь локально, убедись, что SUPABASE_SERVICE_ROLE_KEY есть в .env
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! 
)

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { artist, title, link, rawText, ai_content, image_url, ...specs } = body

    let storedImagePath = null

    // 1. THE HEIST: Если есть ссылка на картинку, крадем её
    if (image_url) {
        console.log(`[Saver] Stealing image: ${image_url}`)
        
        const imageRes = await fetch(image_url)
        if (imageRes.ok) {
            const imageBuffer = await imageRes.arrayBuffer()
            const fileExt = image_url.split('.').pop()?.split('?')[0] || 'jpg'
            // Генерируем уникальное имя: artist_title_timestamp
            const safeName = `${artist}-${title}`.replace(/[^a-z0-9]/gi, '_').toLowerCase()
            const fileName = `${safeName}_${Date.now()}.${fileExt}`

            // Загружаем в Supabase Storage
            const { data: uploadData, error: uploadError } = await supabase
                .storage
                .from('artifacts')
                .upload(fileName, imageBuffer, {
                    contentType: imageRes.headers.get('content-type') || 'image/jpeg'
                })

            if (uploadError) {
                console.error('Upload failed:', uploadError)
            } else {
                storedImagePath = uploadData.path
            }
        }
    }

    // 2. THE VAULT: Сохраняем данные в таблицу
    const { data, error } = await supabase
        .from('lots')
        .insert({
            artist,
            title,
            source_url: link,
            image_path: storedImagePath,
            
            // Метаданные из specs
            medium: specs.medium,
            dimensions: specs.dimensions,
            estimate: specs.estimate,
            year: specs.date,
            provenance: specs.provenance,
            
            // AI Контент (храним JSON целиком)
            ai_content: ai_content,
            
            status: 'draft'
        })
        .select()
        .single()

    if (error) throw error

    return NextResponse.json({ success: true, id: data.id })

  } catch (error) {
    console.error('[Saver Error]:', error)
    return NextResponse.json({ error: 'Save failed' }, { status: 500 })
  }
}