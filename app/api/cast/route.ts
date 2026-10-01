import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(sbUrl, sbKey);

const FREE_MODELS = [
  'openrouter/free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'deepseek/deepseek-r1:free',
  'qwen/qwen-2.5-72b-instruct:free',
  'google/gemma-2-9b-it:free'
];

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
    const apiKey = (process.env.OPENROUTER_API_KEY || "").trim();
    if (!apiKey) {
      return NextResponse.json({ error: 'API Key missing.' }, { status: 500 });
    }

    const { answers, language } = await req.json()
    const lang: 'en' | 'ru' = language === 'ru' ? 'ru' : 'en'

    if (!answers || !Array.isArray(answers)) {
      return NextResponse.json({ error: 'Answers required' }, { status: 400 })
    }

    // Извлекаем пользователя из заголовка авторизации Supabase
    const authHeader = req.headers.get('authorization')
    let userId: string | null = null
    let userEmail: string | null = null
    let userName = 'Visitor'

    if (authHeader) {
      const token = authHeader.replace('Bearer ', '')
      const { data: { user } } = await supabase.auth.getUser(token)
      if (user) {
        userId = user.id
        userEmail = user.email || null
        
        // Достаем актуальный профиль из таблицы users
        const { data: profile } = await supabase
          .from('users')
          .select('name, username')
          .eq('id', userId)
          .maybeSingle()
        
        if (profile?.name) userName = profile.name
        else if (user.user_metadata?.name) userName = user.user_metadata.name
        else if (user.email) userName = user.email.split('@')[0]
      }
    }

    const openai = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: apiKey,
      defaultHeaders: {
        'HTTP-Referer': 'https://merkurov.love',
        'X-Title': 'Digital Temple Cast Protocol',
      },
    });

    const systemPrompt = buildSystemPrompt(lang)
    const userText = `USER ANSWERS:\n${answers.map((a: string, i: number) => `${i + 1}.${a}`).join('\n')}`

    let completion = null;
    let lastError = null;

    for (const model of FREE_MODELS) {
      try {
        completion = await openai.chat.completions.create({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userText }
          ],
          temperature: 0.7,
          response_format: { type: 'json_object' }
        });
        if (completion?.choices[0]?.message?.content) {
          break;
        }
      } catch (err: any) {
        console.warn(`[Cast] Model ${model} failed:`, err?.message || err);
        lastError = err;
      }
    }

    if (!completion) {
      throw lastError || new Error('All free models are currently unavailable.');
    }

    const rawText = completion.choices[0]?.message?.content || '{}';

    let parsed = extractJSON(rawText)
    let archetype = 'VOID'
    
    if (parsed && parsed.archetype) {
      archetype = String(parsed.archetype).toUpperCase()
    } else {
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

    // Сохраняем в таблицу casts
    const { data: record, error } = await supabase
      .from('casts')
      .insert({ 
          user_id: userId,
          email: userEmail,
          answers, 
          language: lang, 
          analysis: parsed, 
          archetype,
          created_at: new Date().toISOString()
      })
      .select()
      .maybeSingle()

    if (error) console.error('Supabase DB Error:', error)

    // Дублируем событие в общую ленту храма с реальным user_id и именем автора
    await supabase.from('temple_log').insert({
      user_id: userId,
      author: userName,
      event_type: 'CAST',
      message: `Perceptual archetype manifested: ${archetype}`,
      created_at: new Date().toISOString()
    })

    return NextResponse.json({ 
        analysis: parsed, 
        archetype, 
        recordId: record?.id 
    })

  } catch (err: any) {
    console.error('Cast route fatal error:', err)
    return NextResponse.json({ error: 'Internal Core Error', details: err?.message || String(err) }, { status: 500 })
  }
}
