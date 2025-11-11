import React from 'react'
import { getServerSupabaseClient } from '@/lib/serverAuth'
import tagHelpers from '@/lib/tagHelpers'
import GuessEstimateQuiz from '@/components/GuessEstimateQuiz'

// Server page: fetch Auction-tag articles, extract numeric estimates from content,
// pick up to 10 random items that contain a parseable estimate and render the client quiz.

function parseEstimateFromContent(content: any): number | null {
  if (!content || typeof content !== 'string') return null
  try {
    // Look for common patterns like "Estimate: 1,000", "Estimate — $1,000", "Estimate — 1000 ₽"
    const re = /(?:Estimate|Estimated|Est\.?|Price|Стоимость)[:\-–—\s]*\$?\s*([0-9\s,\.]+)(?:\s*(₽|rub|RUB|USD|EUR|€|£)?)?/i
    const m = content.match(re)
    if (m && m[1]) {
      const raw = m[1].replace(/[\s,]/g, '')
      const n = Number(raw)
      if (!Number.isNaN(n) && Number.isFinite(n)) return n
    }
    // fallback: any standalone number like "Estimate 1000"
    const m2 = content.match(/(?:Estimate|Est\.?|Стоимость)[:\-–—\s]*([0-9]{3,}(?:[0-9,\s]*))/i)
    if (m2 && m2[1]) {
      const raw2 = m2[1].replace(/[\s,]/g, '')
      const n2 = Number(raw2)
      if (!Number.isNaN(n2) && Number.isFinite(n2)) return n2
    }
  } catch (e) {
    // ignore
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
