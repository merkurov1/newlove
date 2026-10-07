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

const ALLOWED_ARCHETYPES = [
  'VOID',
  'NOISE',
  'STONE',
  'UNFRAMED'
] as const;

type Language = 'en' | 'ru';

function buildSystemPrompt(language: Language) {
  const langNote =
    language === 'ru'
      ? 'OUTPUT MUST BE IN RUSSIAN.'
      : 'OUTPUT MUST BE IN ENGLISH.';

  const agencyRules =
    language === 'ru'
      ? `
[ ПРИОРИТЕТНАЯ ДИРЕКТИВА: AGENCY_INDEX ]
1. Вычисли 'Индекс Агентности' (воля к действию vs фатализм).
2. Если пользователь ссылается на внешние силы (карма, судьба, 'так вышло'), авторитетов (гуру) или позицию жертвы — это НИЗКИЙ индекс.
3. ПРИ НИЗКОМ ИНДЕКСЕ: Присвой статус VOID или STONE, даже если ответы кажутся умными.
`
      : `
[ PRIORITY DIRECTIVE: AGENCY_INDEX ]
1. Calculate 'Index of Agency' (will to act vs fatalism).
2. If user refers to external forces (karma, fate, 'it happened'), authorities (gurus), or victimhood — this is LOW index.
3. IF INDEX IS LOW: Force status VOID or STONE.
`;

  return `You are THE MERKUROV ANALYZER. Tone: cold, clinical, brutally honest.
Task: Analyze 10 answers. Assign ONE archetype.

${agencyRules}

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
  "scores": {
    "VOID": 10,
    "STONE": 2,
    "NOISE": 1,
    "UNFRAMED": 0
  },
  "executive_summary": "Two sentences. Mention the Agency Index explicitly.",
  "structural_weaknesses": "Short paragraph. Brutal critique.",
  "core_assets": "Short paragraph. What can be monetized.",
  "strategic_directive": "One imperative command."
}

${langNote}
`;
}

function extractJSON(text: string) {
  const clean = text
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  const jsonMatch = clean.match(/\{[\s\S]*\}/m);

  if (!jsonMatch) {
    return null;
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('[Cast] JSON parse error:', error);
    return null;
  }
}

function normalizeArchetype(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toUpperCase();

  return ALLOWED_ARCHETYPES.includes(
    normalized as (typeof ALLOWED_ARCHETYPES)[number]
  )
    ? normalized
    : null;
}

function normalizeAnalysis(parsed: any) {
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const archetype = normalizeArchetype(parsed.archetype);

  if (!archetype) {
    return null;
  }

  return {
    archetype,
    scores:
      parsed.scores && typeof parsed.scores === 'object'
        ? parsed.scores
        : {},
    executive_summary:
      typeof parsed.executive_summary === 'string'
        ? parsed.executive_summary
        : '',
    structural_weaknesses:
      typeof parsed.structural_weaknesses === 'string'
        ? parsed.structural_weaknesses
        : '',
    core_assets:
      typeof parsed.core_assets === 'string'
        ? parsed.core_assets
        : '',
    strategic_directive:
      typeof parsed.strategic_directive === 'string'
        ? parsed.strategic_directive
        : ''
  };
}

async function resolveUser(req: Request) {
  const authHeader = req.headers.get('authorization');

  if (!authHeader) {
    return {
      userId: null as string | null,
      userEmail: null as string | null,
      userName: 'Visitor'
    };
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return {
      userId: null,
      userEmail: null,
      userName: 'Visitor'
    };
  }

  try {
    const {
      data: { user }
    } = await supabase.auth.getUser(token);

    if (!user) {
      return {
        userId: null,
        userEmail: null,
        userName: 'Visitor'
      };
    }

    let userName = 'Visitor';

    const { data: profile } = await supabase
      .from('users')
      .select('name, username')
      .eq('id', user.id)
      .maybeSingle();

    if (profile?.name) {
      userName = profile.name;
    } else if (profile?.username) {
      userName = profile.username;
    } else if (user.user_metadata?.name) {
      userName = user.user_metadata.name;
    } else if (user.email) {
      userName = user.email.split('@')[0];
    }

    return {
      userId: user.id,
      userEmail: user.email || null,
      userName
    };
  } catch (error) {
    console.warn('[Cast] Could not resolve auth user:', error);

    return {
      userId: null,
      userEmail: null,
      userName: 'Visitor'
    };
  }
}

export async function POST(req: Request) {
  try {
    const apiKey = (process.env.OPENROUTER_API_KEY || '').trim();

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API Key missing.' },
        { status: 500 }
      );
    }

    let body: any;

    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body.' },
        { status: 400 }
      );
    }

    const { answers, language } = body;

    const lang: Language = language === 'ru' ? 'ru' : 'en';

    if (!Array.isArray(answers)) {
      return NextResponse.json(
        { error: 'Answers required.' },
        { status: 400 }
      );
    }

    if (answers.length !== 10) {
      return NextResponse.json(
        { error: 'Exactly 10 answers are required.' },
        { status: 400 }
      );
    }

    const normalizedAnswers = answers.map((answer: unknown) =>
      typeof answer === 'string' ? answer.trim() : ''
    );

    if (
      normalizedAnswers.some(answer => answer.length < 3)
    ) {
      return NextResponse.json(
        { error: 'All answers must contain meaningful text.' },
        { status: 400 }
      );
    }

    const {
      userId,
      userEmail,
      userName
    } = await resolveUser(req);

    const openai = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey,
      defaultHeaders: {
        'HTTP-Referer': 'https://merkurov.love',
        'X-Title': 'Digital Temple Cast Protocol'
      }
    });

    const systemPrompt = buildSystemPrompt(lang);

    const userText = `USER ANSWERS:\n${normalizedAnswers
      .map(
        (answer: string, index: number) =>
          `${index + 1}. ${answer}`
      )
      .join('\n')}`;

    let completion: any = null;
    let lastError: unknown = null;

    for (const model of FREE_MODELS) {
      try {
        completion = await openai.chat.completions.create({
          model,
          messages: [
            {
              role: 'system',
              content: systemPrompt
            },
            {
              role: 'user',
              content: userText
            }
          ],
          temperature: 0.7,
          response_format: {
            type: 'json_object'
          }
        });

        if (
          completion?.choices?.[0]?.message?.content
        ) {
          break;
        }
      } catch (error: any) {
        console.warn(
          `[Cast] Model ${model} failed:`,
          error?.message || error
        );

        lastError = error;
      }
    }

    if (!completion) {
      throw (
        lastError ||
        new Error(
          'All free models are currently unavailable.'
        )
      );
    }

    const rawText =
      completion?.choices?.[0]?.message?.content || '';

    if (!rawText) {
      throw new Error('The Core returned an empty response.');
    }

    let parsed = extractJSON(rawText);

    if (!parsed) {
      const match = rawText.match(
        /"?ARCHETYPE"?\s*:?\s*"?(VOID|NOISE|STONE|UNFRAMED)"?/i
      );

      if (match) {
        parsed = {
          archetype: match[1],
          scores: {},
          executive_summary: '',
          structural_weaknesses: '',
          core_assets: '',
          strategic_directive: 'Retry Protocol.'
        };
      }
    }

    const normalized = normalizeAnalysis(parsed);

    if (!normalized) {
      throw new Error(
        'The Core returned an invalid analysis structure.'
      );
    }

    const archetype = normalized.archetype;

    const { data: record, error: recordError } =
      await supabase
        .from('casts')
        .insert({
          user_id: userId,
          email: userEmail,
          answers: normalizedAnswers,
          language: lang,
          analysis: normalized,
          archetype,
          created_at: new Date().toISOString()
        })
        .select('id')
        .maybeSingle();

    if (recordError) {
      console.error(
        '[Cast] Supabase casts insert error:',
        recordError
      );

      throw new Error(
        'Analysis completed, but the protocol record could not be secured.'
      );
    }

    if (record?.id) {
      const { error: templeError } = await supabase
        .from('temple_log')
        .insert({
          user_id: userId,
          author: userName,
          event_type: 'CAST',
          message: `Perceptual archetype manifested: ${archetype}`,
          created_at: new Date().toISOString()
        });

      if (templeError) {
        // The Cast itself remains successful if the public trace fails.
        console.error(
          '[Cast] Temple trace insert error:',
          templeError
        );
      }
    }

    return NextResponse.json({
      analysis: normalized,
      archetype,
      recordId: record?.id || null
    });
  } catch (error: any) {
    console.error('[Cast] Fatal error:', error);

    return NextResponse.json(
      {
        error:
          error?.message || 'Internal Core Error'
      },
      {
        status: 500
      }
    );
  }
}