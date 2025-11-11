import React from 'react'
import { getServerSupabaseClient } from '@/lib/serverAuth'
import tagHelpers from '@/lib/tagHelpers'
import GuessEstimateQuiz from '@/components/GuessEstimateQuiz'

// Server page: fetch Auction-tag articles, extract numeric estimates from content,
// pick up to 10 random items that contain a parseable estimate and render the client quiz.

function parseEstimateFromContent(content: any): number | null {
  if (!content) return null

  // Normalize: if content is JSON-like (Editor.js), extract text/html fields
  let text = ''
  if (typeof content === 'string') {
    text = content
  } else {
    try {
      text = JSON.stringify(content)
    } catch (e) {
      try {
        text = String(content)
      } catch (e2) {
        text = ''
      }
    }
  }
  if (!text) return null

  // If content looks like HTML (server-side rendered), strip tags to get plain text
  function stripHtml(html: string) {
    // remove tags
    let s = html.replace(/<[^>]+>/g, ' ')
    // decode a few common HTML entities
    s = s.replace(/&nbsp;|\u00A0/g, ' ')
    s = s.replace(/&amp;/g, '&')
    s = s.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    // collapse whitespace
    s = s.replace(/\s+/g, ' ').trim()
    return s
  }

  // If text contains angle brackets, treat as HTML and strip
  if (text.indexOf('<') !== -1 && text.indexOf('>') !== -1) {
    try {
      text = stripHtml(text)
    } catch (e) {
      // fallback: leave original text
    }
  }

  // Helper: parse a numeric string like "1 000", "1,000", "1.000" or "1.2k" / "1k" / "1 тыс"
  function parseNumberToken(token: string): number | null {
    if (!token) return null
    let s = String(token).trim()
    // handle k / тыс / т
    let multiplier = 1
    const kMatch = s.match(/(\d[\d\s,\.]*)\s*(k|K|тыс|тыс\.|т\.|тыс)$/i)
    if (kMatch) {
      s = kMatch[1]
      multiplier = 1000
    }
    // remove non-digit except dot and comma
    s = s.replace(/[^0-9.,]/g, '')
    // if contains both comma and dot, assume comma thousands, dot decimal -> remove commas
    if (s.indexOf(',') !== -1 && s.indexOf('.') !== -1) {
      s = s.replace(/,/g, '')
    } else {
      // prefer remove spaces and commas as thousand separators
      s = s.replace(/[\s,]/g, '')
    }
    // Replace comma as decimal separator (e.g., 1,5 -> 1.5)
    if (s.indexOf('.') === -1 && s.indexOf(',') !== -1) s = s.replace(',', '.')
    const n = Number(s)
    if (!Number.isNaN(n) && Number.isFinite(n)) return Math.round(n * multiplier)
    return null
  }

  try {
    // 1) Ranges like "1,000 - 2,000" or "1000–2000" or "from 1 000 to 2 000" -> take midpoint
    const rangeRe = /([0-9][0-9\s,\.]*)\s*(?:-|–|—|to|до|−)\s*([0-9][0-9\s,\.]*)/i
    const rangeMatch = text.match(rangeRe)
    if (rangeMatch && rangeMatch[1] && rangeMatch[2]) {
      const a = parseNumberToken(rangeMatch[1])
      const b = parseNumberToken(rangeMatch[2])
      if (a !== null && b !== null) return Math.round((a + b) / 2)
    }

    // 2) Look for labels + currency/number combos (Estimate, Estimated, Price, Стоимость, Оценка, Цена)
    // allow an optional emoji prefix (💸) and capture up to a generous window after the label
    const labelRe = /(?:💸\s*)?(?:Estimate|Estimated|Est\.?|Price|Стоимость|Оценка|Цена)[:\-–—\s]*([^\n]{0,120})/i
    const labelMatch = text.match(labelRe)
    if (labelMatch && labelMatch[1]) {
      // try to extract first numeric token from the capture
      const tokenRe = /([0-9][0-9\s,\.]*\s*(?:k|K|тыс\.?|т\.?))|(?:\$|€|£|₽|USD|EUR|RUB)\s*([0-9][0-9\s,\.]*)/i
      const tmatch = labelMatch[1].match(tokenRe)
      if (tmatch) {
        const token = (tmatch[1] || tmatch[2] || '').trim()
        const parsed = parseNumberToken(token)
        if (parsed !== null) return parsed
      }
    }

    // 3) Currency symbol before/after number anywhere
    const currencyRe = /(?:\$|€|£|₽)\s*([0-9][0-9\s,\.]*)|([0-9][0-9\s,\.]*)\s*(?:₽|rub|RUB|usd|USD|eur|EUR|USD\b|EUR\b|RUB\b)/i
    const cMatch = text.match(currencyRe)
    if (cMatch) {
      const token = (cMatch[1] || cMatch[2] || '').trim()
      const p = parseNumberToken(token)
      if (p !== null) return p
    }

    // 4) Any standalone large number (>= 3 digits) probably an estimate
    const anyNumRe = /(?:\b|\D)([0-9]{3}[0-9\s,\.]*)(?:\b|\D)/
    const anyMatch = text.match(anyNumRe)
    if (anyMatch && anyMatch[1]) {
      const p = parseNumberToken(anyMatch[1])
      if (p !== null) return p
    }
  } catch (e) {
    // ignore parsing errors
  }
  return null
}

export default async function Page() {
  const supabase = await getServerSupabaseClient({ useServiceRole: true } as any)

  // Fetch a reasonably large pool so we can sample 10 with parseable estimates
  const pool = await tagHelpers.getArticlesByTag(supabase, 'Auction', 200).catch(() => [])

  // Attach parsed estimates
  const withEstimates = [] as any[]
  for (const a of (pool || [])) {
    try {
      const est = parseEstimateFromContent(a.content || '')
      if (est !== null) {
        withEstimates.push({ id: a.id, title: a.title, slug: a.slug, previewImage: a.previewImage, estimate: est })
      }
    } catch (e) {
      continue
    }
  }

  // If very few matches found, run a direct keyword search fallback across articles
  // to find pages that explicitly include 'Estimate', '💸', 'Оценка', 'Цена' in content or title.
  if (withEstimates.length < 5) {
    try {
      const keywords = ['Estimate', '💸', 'Оценка', 'Цена', 'Estimate:']
      // build or-clause for supabase .or() expects comma-separated conditions
      const clauses: string[] = []
      for (const k of keywords) {
        // search in content and title
        clauses.push(`content.ilike.%${k}%`)
        clauses.push(`title.ilike.%${k}%`)
      }
      const orExpr = clauses.join(',')
      const q = supabase.from('articles').select('id,title,slug,content,preview_image,previewImage').or(orExpr).limit(200)
      const resp = await q
      const docs = Array.isArray(resp) ? resp : (resp && resp.data ? resp.data : [])
      if (Array.isArray(docs) && docs.length > 0) {
        for (const d of docs) {
          try {
            const id = d.id || d._id || d.article_id || d.articleId || null
            // avoid duplicates
            if (withEstimates.find(x => String(x.id) === String(id))) continue
            const est = parseEstimateFromContent(d.content || d)
            if (est !== null) {
              withEstimates.push({ id: id, title: d.title || '', slug: d.slug || '/', previewImage: d.previewImage || d.preview_image || null, estimate: est })
            }
          } catch (e) {
            continue
          }
        }
      }
    } catch (e) {
      // ignore fallback errors
    }
  }

  // Shuffle and pick up to 10
  for (let i = withEstimates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = withEstimates[i]
    withEstimates[i] = withEstimates[j]
    withEstimates[j] = tmp
  }

  const selected = withEstimates.slice(0, 10)

  return (
    <div className="py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-4">Угадай эстимейт — Guess the Estimate</h1>
        <p className="text-sm text-gray-600 mb-6">You will see up to {selected.length} auction works. Enter your numeric guess for each item's estimate. A correct guess (within ±10%) gives 1 point. Reach 10 points to win.</p>
        {selected.length === 0 ? (
          <div className="p-6 bg-yellow-50 border border-yellow-200 rounded">Нет доступных работ с распознанным эстимейтом. Попробуйте позже.</div>
        ) : (
          // @ts-ignore server -> client prop
          <GuessEstimateQuiz items={selected} tolerance={0.1} goal={10} />
        )}
      </div>
    </div>
  )
}
