import { GoogleGenerativeAI } from '@google/generative-ai'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const apiKey = (process.env.GOOGLE_API_KEY || "").trim()
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY! // Важно: Service Role Key для записи без авторизации

const genAI = new GoogleGenerativeAI(apiKey)
const supabase = createClient(sbUrl, sbKey)

function buildSystemPrompt(language: 'en' | 'ru') {
  const langNote = language === 'ru' ? 'OUTPUT MUST BE IN RUSSIAN.' : 'OUTPUT MUST BE IN ENGLISH.'

  return `You are THE MERKUROV ANALYZER. Tone: cold, clinical, brutally honest.
Task: Deterministically analyze the user from 10 short answers and assign ONE archetype.

CRITERIA (apply these strictly):
- VOID: short answers, apathy, mention of sleep, nothing, normal, emptiness, "I don't know", lack of detail.
- STONE: trauma, heavy past, specific painful events, nostalgia used as shelter, mentions of scars, rigidity.
- NOISE: chaotic, grandiose claims, performative social behavior, frequent use of and obsession with social metrics, rambling anxiety.
- UNFRAMED: intellectual, meta, uses distinct metaphors, willingly accepts ambiguity, reflective and unusual perspective.

PROCESS:
1) Read all answers carefully.
2) For each archetype, count how many answers match the listed indicators.
3) Choose the archetype with the highest strict-match count. In case of exact tie, prefer: STONE > VOID > NOISE > UNFRAMED.
4) Produce a JSON object ONLY (no surrounding text). Example schema:
{
  "archetype": "VOID|STONE|NOISE|UNFRAMED",
  "scores": { "VOID": 0, "STONE": 0, "NOISE": 0, "UNFRAMED": 0 },
  "executive_summary": "Two-sentence summary.",
  "structural_weaknesses": "Short paragraph.",
  "core_assets": "Short paragraph.",
  "strategic_directive": "One imperative sentence."
}

${langNote}
Respond ONLY with valid JSON according to the schema above.
`
}

function extractJSON(text: string) {
  // Try to find first JSON object in text
  const jsonMatch = text.match(/\{[\s\S]*\}/m)
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0])
    } catch (e) {
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

    // Use the official client to call the generative model (avoids hand-rolled REST payload mismatches)
    const MODEL_NAME = 'gemini-2.5-flash'
    const model = genAI.getGenerativeModel({ model: MODEL_NAME, systemInstruction: systemPrompt })

    const userText = `USER ANSWERS:\n${answers.map((a: string, i: number) => `${i + 1}. ${a}`).join('\n')}`
    const result = await model.generateContent(userText)
    const rawText = (result?.response?.text && String(result.response.text())) || JSON.stringify(result)

    // Try to parse JSON-only output
    let parsed = extractJSON(rawText)
    let archetype = 'VOID'
    let analysisText = rawText

    if (parsed && parsed.archetype) {
      archetype = String(parsed.archetype).toUpperCase()
      analysisText = JSON.stringify(parsed, null, 2)
    } else {
      // Fallback: look for bracket marker
      const match = rawText.match(/\"?ARCHETYPE\"?:?\s*\"?([A-Z]+)\"?/i) || rawText.match(/\[ARCHETYPE:\s*(.*?)\]/i)
      if (match) archetype = String(match[1] || 'VOID').toUpperCase()
    }

    // Persist to DB using service role key
    const { data: record, error } = await supabase
      .from('casts')
      .insert({ answers, language: lang, analysis: analysisText, archetype })
      .select()
      .single()

    if (error) console.error('Supabase insert error:', error)

    return NextResponse.json({ analysis: analysisText, archetype, recordId: record?.id })
  } catch (err) {
    console.error('Cast route error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}