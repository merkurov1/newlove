import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const apiKey = (process.env.GOOGLE_API_KEY || "").trim()
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY! 

const genAI = new GoogleGenerativeAI(apiKey)
const supabase = createClient(sbUrl, sbKey)

// ИСПОЛЬЗУЕМ ВАЛИДНУЮ МОДЕЛЬ ИЗ ТВОЕГО СПИСКА
const MODEL_NAME = 'gemini-2.5-flash'

function buildSystemPrompt(language: 'en' | 'ru') {
  const langNote = language === 'ru' ? 'OUTPUT MUST BE IN RUSSIAN.' : 'OUTPUT MUST BE IN ENGLISH.'

  const AGENCY_RULES = language === 'ru' ? 
  `
  [ ПРИОРИТЕТНАЯ ДИРЕКТИВА: AGENCY_INDEX ]
  1. Вычисли 'Индекс Агентности' (воля к действию vs фатализм).
  2. Если пользователь ссылается на внешние силы (карма, судьба, 'так вышло'), авторитетов (гуру) или позицию жертвы — это НИЗКИЙ индекс.
  3. ПРИ НИЗКОМ ИНДЕКСЕ: Присвой статус VOID или STONE, даже если ответы кажутся умными.
  `
  : 
  `
  [ PRIORITY DIRECTIVE: AGENCY_INDEX ]
  1. Calculate 'Index of Agency' (will to act vs fatalism).
  2. If user refers to external forces (karma, fate, 'it happened'), authorities (gurus), or victimhood — this is LOW index.
  3. IF INDEX IS LOW: Force status VOID or STONE.
  `

  return `You are THE MERKUROV ANALYZER. Tone: cold, clinical, brutally honest.
Task: Analyze 10 answers. Assign ONE archetype.

${AGENCY_RULES}

ARCHETYPE DEFINITIONS:
- VOID: Apathy, short answers, "normalcy", emptiness, lack of detail, hiding behind "I don't know".
- STONE: Heavy past, focus on trauma/scars, rigidity, nostalgia as a shield, specific painful memories.
- NOISE: Performance, chaos, obsession with social metrics/validation, grandiose claims, anxiety, rambling.
- UNFRAMED: High agency, meta-perspective, specific unusual metaphors, accepts ambiguity, intellectual structure.

PROCESS:
1. Check AGENCY_INDEX. If Fail -> VOID/STONE.
2. If Pass -> Count matches for each archetype.
3. Select winner. Tie-breaker: STONE > VOID > NOISE > UNFRAMED.

OUTPUT FORMAT (JSON ONLY):
{
  "archetype": "VOID",
  "scores": { "VOID": 10, "STONE": 2, "NOISE": 1, "UNFRAMED": 0 }, 
  "executive_summary": "Two sentences. Mention the Agency Index explicitly.",
  "structural_weaknesses": "Short paragraph. Brutal critique.",
  "core_assets": "Short paragraph. What can be monetized.",
  "strategic_directive": "One imperative command."
}

${langNote}
`
}

function extractJSON(text: string) {
  // Чистим от маркдауна, если модель его добавит
  let clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
  const jsonMatch = clean.match(/\{[\s\S]*\}/m)
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0])
    } catch (e) {
      console.error("JSON Parse Error:", e)
      return null
    }
  }
  return null
}

export async function POST(req: Request) {
  try {
    const { answers, language } = await req.json()
    const lang: 'en' | 'ru' = language === 'ru' ? 'ru' : 'en'

    const systemPrompt = buildSystemPrompt(lang)

    const model = genAI.getGenerativeModel({ 
        model: MODEL_NAME, 
        systemInstruction: systemPrompt,
        generationConfig: { responseMimeType: "application/json" } // Гарантирует JSON
    })

    const userText = `USER ANSWERS:\n${answers.map((a: string, i: number) => `${i + 1}. ${a}`).join('\n')}`
    
    const result = await model.generateContent(userText)
    const rawText = result.response.text()

    let parsed = extractJSON(rawText)
    let archetype = 'VOID'
    
    // Fallback logic
    if (parsed && parsed.archetype) {
      archetype = String(parsed.archetype).toUpperCase()
    } else {
      console.warn("Fallback parsing triggered", rawText)
      const match = rawText.match(/\"?ARCHETYPE\"?:?\s*\"?([A-Z]+)\"?/i)
      if (match) archetype = String(match[1] || 'VOID').toUpperCase()
      
      parsed = {
        archetype: archetype,
        executive_summary: "Analysis corrupted. Core reset required.",
        structural_weaknesses: "Data stream interrupted.",
        core_assets: "Unknown.",
        strategic_directive: "Retry Protocol.",
        scores: { VOID: 1, STONE: 0, NOISE: 0, UNFRAMED: 0 }
      }
    }

    // Сохраняем в Supabase
    const { data: record, error } = await supabase
      .from('casts')
      .insert({ 
          answers, 
          language: lang, 
          analysis: parsed, // Supabase сам стрингифицирует JSONB
          archetype 
      })
      .select()
      .single()

    if (error) console.error('Supabase DB Error:', error)

    return NextResponse.json({ 
        analysis: parsed, 
        archetype, 
        recordId: record?.id 
    })

  } catch (err) {
    console.error('Cast route fatal error:', err)
    return NextResponse.json({ error: 'Internal Core Error' }, { status: 500 })
  }
}