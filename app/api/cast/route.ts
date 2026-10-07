import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createHmac } from 'node:crypto';

export const runtime = 'nodejs';

const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(sbUrl, sbKey);

const FREE_MODELS = [
  'openrouter/free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'deepseek/deepseek-r1:free',
  'qwen/qwen-2.5-72b-instruct:free',
  'google/gemma-2-9b-it:free',
];

const ALLOWED_ARCHETYPES = [
  'VOID',
  'NOISE',
  'STONE',
  'UNFRAMED',
] as const;

const SCORE_KEYS = [
  'VOID',
  'STONE',
  'NOISE',
  'UNFRAMED',
] as const;

type Language = 'en' | 'ru';
type Archetype = (typeof ALLOWED_ARCHETYPES)[number];

const MAX_ANSWER_LENGTH = 4000;
const MAX_TOTAL_ANSWER_LENGTH = 24000;

function buildSystemPrompt(language: Language) {
  const langNote =
    language === 'ru'
      ? 'OUTPUT MUST BE IN RUSSIAN.'
      : 'OUTPUT MUST BE IN ENGLISH.';

  const agencyRules =
    language === 'ru'
      ? `
[ ПРИОРИТЕТНАЯ ДИРЕКТИВА: AGENCY_INDEX ]

1. Вычисли "agency_index" от 0 до 100.
2. Это показатель способности субъекта воспринимать себя как действующего
   субъекта, принимать решения и создавать собственные следующие шаги,
   а не передавать причинность внешним силам.
3. Если пользователь систематически ссылается на судьбу, карму,
   "так вышло", авторитетов или исключительно на позицию жертвы,
   agency_index должен быть низким.
4. При низком agency_index архетип должен быть только VOID или STONE.
5. Не путай интеллектуальность, богатство, образование или красноречие
   с высокой агентностью.
`
      : `
[ PRIORITY DIRECTIVE: AGENCY_INDEX ]

1. Calculate "agency_index" from 0 to 100.
2. It measures the subject's capacity to perceive themselves as an agent,
   make decisions and create their own next steps rather than assigning
   causality to external forces.
3. If the user systematically invokes fate, karma, "it just happened",
   authorities or a purely victim position, agency_index must be low.
4. With a low agency_index the archetype may only be VOID or STONE.
5. Do not confuse intelligence, wealth, education or eloquence with agency.
`;

  return `You are THE MERKUROV ANALYZER.
Tone: cold, clinical, precise and brutally honest.

You analyze a psychological self-reflection protocol.

There are nine diagnostic answers and one ritual threshold answer.
ANSWER 10 IS NOT A DIAGNOSTIC VARIABLE.
It only indicates that the subject agrees to see the result.

${agencyRules}

ARCHETYPE DEFINITIONS:

- VOID:
  Apathy, emptiness, short or evasive answers, lack of agency,
  hiding behind "I don't know", emotional absence.

- STONE:
  Heavy past, rigidity, scars, nostalgia as a shield,
  painful memories becoming structural identity.

- NOISE:
  Performance, chaos, social validation, metrics, grandiosity,
  anxiety, rambling and excessive external signalling.

- UNFRAMED:
  High agency, meta-perspective, unusual specificity,
  tolerance of ambiguity, intellectual structure,
  ability to act without requiring external permission.

PROCESS:

1. Analyze answers 1–9.
2. Treat answer 10 only as a ritual threshold.
3. Calculate agency_index from 0 to 100.
4. Determine archetype.
5. Produce scores for all four archetypes from 0 to 100.
6. The scores are comparative indicators, not mathematical probabilities.
7. If agency_index is low, archetype MUST be VOID or STONE.
8. Do not invent biographical facts not present in the answers.

OUTPUT JSON ONLY:

{
  "agency_index": 0,
  "archetype": "VOID",
  "scores": {
    "VOID": 0,
    "STONE": 0,
    "NOISE": 0,
    "UNFRAMED": 0
  },
  "executive_summary": "Two or three concise sentences. Mention the Agency Index.",
  "structural_weaknesses": "Short paragraph.",
  "core_assets": "Short paragraph.",
  "strategic_directive": "One imperative command."
}

REQUIREMENTS:

- agency_index MUST be an integer from 0 to 100.
- scores MUST contain exactly VOID, STONE, NOISE and UNFRAMED.
- every score MUST be an integer from 0 to 100.
- archetype MUST be one of VOID, STONE, NOISE, UNFRAMED.
- all five text fields MUST be strings.
- Do not wrap JSON in markdown.
- Do not add commentary outside JSON.

${langNote}
`;
}

function extractJSON(text: string): unknown {
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

function normalizeArchetype(value: unknown): Archetype | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toUpperCase();

  return ALLOWED_ARCHETYPES.includes(
    normalized as Archetype
  )
    ? (normalized as Archetype)
    : null;
}

function normalizeIntegerScore(value: unknown): number | null {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 100
  ) {
    return null;
  }

  return value;
}

function normalizeText(
  value: unknown,
  maxLength = 3000
): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();

  if (!normalized || normalized.length > maxLength) {
    return null;
  }

  return normalized;
}

function normalizeAnalysis(parsed: unknown) {
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const source = parsed as Record<string, unknown>;

  const archetype = normalizeArchetype(
    source.archetype
  );

  const agencyIndex = normalizeIntegerScore(
    source.agency_index
  );

  if (!archetype || agencyIndex === null) {
    return null;
  }

  if (
    !source.scores ||
    typeof source.scores !== 'object' ||
    Array.isArray(source.scores)
  ) {
    return null;
  }

  const rawScores =
    source.scores as Record<string, unknown>;

  const scores: Record<Archetype, number> = {} as Record<
    Archetype,
    number
  >;

  for (const key of SCORE_KEYS) {
    const value = normalizeIntegerScore(
      rawScores[key]
    );

    if (value === null) {
      return null;
    }

    scores[key] = value;
  }

  const executiveSummary = normalizeText(
    source.executive_summary
  );

  const structuralWeaknesses = normalizeText(
    source.structural_weaknesses
  );

  const coreAssets = normalizeText(
    source.core_assets
  );

  const strategicDirective = normalizeText(
    source.strategic_directive,
    1000
  );

  if (
    !executiveSummary ||
    !structuralWeaknesses ||
    !coreAssets ||
    !strategicDirective
  ) {
    return null;
  }

  if (
    agencyIndex < 35 &&
    archetype !== 'VOID' &&
    archetype !== 'STONE'
  ) {
    return null;
  }

  return {
    agency_index: agencyIndex,
    archetype,
    scores,
    executive_summary: executiveSummary,
    structural_weaknesses: structuralWeaknesses,
    core_assets: coreAssets,
    strategic_directive: strategicDirective,
  };
}

function createCaptureToken(
  recordId: string,
  createdAt: string
) {
  const secret =
    process.env.CAST_CAPTURE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret) {
    throw new Error(
      'Cast capture secret is not configured.'
    );
  }

  return createHmac(
    'sha256',
    secret
  )
    .update(`${recordId}:${createdAt}`)
    .digest('hex');
}

async function resolveUser(req: Request) {
  const authHeader =
    req.headers.get('authorization');

  if (!authHeader) {
    return {
      userId: null as string | null,
      userEmail: null as string | null,
      userName: 'Visitor',
    };
  }

  if (
    !/^Bearer\s+/i.test(authHeader)
  ) {
    return {
      userId: null,
      userEmail: null,
      userName: 'Visitor',
    };
  }

  const token = authHeader
    .replace(/^Bearer\s+/i, '')
    .trim();

  if (!token) {
    return {
      userId: null,
      userEmail: null,
      userName: 'Visitor',
    };
  }

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser(
      token
    );

    if (!user) {
      return {
        userId: null,
        userEmail: null,
        userName: 'Visitor',
      };
    }

    let userName = 'Visitor';

    const { data: profile } =
      await supabase
        .from('users')
        .select('name, username')
        .eq('id', user.id)
        .maybeSingle();

    if (profile?.name) {
      userName = profile.name;
    } else if (profile?.username) {
      userName = profile.username;
    } else if (
      user.user_metadata?.name
    ) {
      userName =
        user.user_metadata.name;
    } else if (user.email) {
      userName =
        user.email.split('@')[0];
    }

    return {
      userId: user.id,
      userEmail: user.email || null,
      userName,
    };
  } catch (error) {
    console.warn(
      '[Cast] Could not resolve auth user:',
      error
    );

    return {
      userId: null,
      userEmail: null,
      userName: 'Visitor',
    };
  }
}

export async function POST(
  req: Request
) {
  try {
    const apiKey = (
      process.env.OPENROUTER_API_KEY || ''
    ).trim();

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            'API Key missing.',
        },
        { status: 500 }
      );
    }

    let body: unknown;

    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        {
          error:
            'Invalid request body.',
        },
        { status: 400 }
      );
    }

    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body)
    ) {
      return NextResponse.json(
        {
          error:
            'Invalid request body.',
        },
        { status: 400 }
      );
    }

    const source =
      body as Record<string, unknown>;

    const { answers, language } =
      source;

    if (
      language !== 'en' &&
      language !== 'ru'
    ) {
      return NextResponse.json(
        {
          error:
            'Language must be "en" or "ru".',
        },
        { status: 400 }
      );
    }

    const lang =
      language as Language;

    if (!Array.isArray(answers)) {
      return NextResponse.json(
        {
          error:
            'Answers are required.',
        },
        { status: 400 }
      );
    }

    if (answers.length !== 10) {
      return NextResponse.json(
        {
          error:
            'Exactly 10 answers are required.',
        },
        { status: 400 }
      );
    }

    const normalizedAnswers =
      answers.map(
        (answer: unknown) =>
          typeof answer === 'string'
            ? answer.trim()
            : ''
      );

    if (
      normalizedAnswers.some(
        answer =>
          answer.length < 3 ||
          answer.length >
            MAX_ANSWER_LENGTH
      )
    ) {
      return NextResponse.json(
        {
          error:
            `Each answer must contain between 3 and ${MAX_ANSWER_LENGTH} characters.`,
        },
        { status: 400 }
      );
    }

    const totalLength =
      normalizedAnswers.reduce(
        (sum, answer) =>
          sum + answer.length,
        0
      );

    if (
      totalLength >
      MAX_TOTAL_ANSWER_LENGTH
    ) {
      return NextResponse.json(
        {
          error:
            'The total Cast payload is too large.',
        },
        { status: 400 }
      );
    }

    const diagnosticAnswers =
      normalizedAnswers.slice(0, 9);

    const thresholdAnswer =
      normalizedAnswers[9];

    const {
      userId,
      userEmail,
      userName,
    } = await resolveUser(req);

    const openai = new OpenAI({
      baseURL:
        'https://openrouter.ai/api/v1',
      apiKey,
      defaultHeaders: {
        'HTTP-Referer':
          'https://merkurov.love',
        'X-Title':
          'Digital Temple Cast Protocol',
      },
    });

    const systemPrompt =
      buildSystemPrompt(lang);

    const userText = [
      'DIAGNOSTIC ANSWERS:',
      ...diagnosticAnswers.map(
        (
          answer: string,
          index: number
        ) =>
          `${index + 1}. ${answer}`
      ),
      '',
      'RITUAL THRESHOLD:',
      thresholdAnswer,
    ].join('\n');

    let completion: any = null;
    let lastError: unknown = null;

    for (const model of FREE_MODELS) {
      try {
        completion =
          await openai.chat.completions.create(
            {
              model,
              messages: [
                {
                  role: 'system',
                  content:
                    systemPrompt,
                },
                {
                  role: 'user',
                  content:
                    userText,
                },
              ],
              temperature: 0.7,
              response_format: {
                type: 'json_object',
              },
            }
          );

        if (
          completion?.choices?.[0]
            ?.message?.content
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
      completion?.choices?.[0]
        ?.message?.content || '';

    if (!rawText) {
      throw new Error(
        'The Core returned an empty response.'
      );
    }

    const parsed =
      extractJSON(rawText);

    const normalized =
      normalizeAnalysis(parsed);

    if (!normalized) {
      throw new Error(
        'The Core returned an invalid analysis structure.'
      );
    }

    const createdAt =
      new Date().toISOString();

    const {
      data: record,
      error: recordError,
    } = await supabase
      .from('casts')
      .insert({
        user_id: userId,
        email: userEmail,
        answers: normalizedAnswers,
        language: lang,
        analysis: normalized,
        archetype:
          normalized.archetype,
        created_at: createdAt,
      })
      .select('id, created_at')
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

    if (!record?.id) {
      throw new Error(
        'The protocol record was not created.'
      );
    }

    const captureToken =
      createCaptureToken(
        record.id,
        record.created_at ||
          createdAt
      );

    const {
      error: templeError,
    } = await supabase
      .from('temple_log')
      .insert({
        user_id: userId,
        author: userName,
        event_type: 'CAST',
        message:
          `Perceptual archetype manifested: ${normalized.archetype}`,
        created_at: createdAt,
      });

    if (templeError) {
      console.error(
        '[Cast] Temple trace insert error:',
        templeError
      );
    }

    return NextResponse.json({
      analysis: normalized,
      archetype:
        normalized.archetype,
      agencyIndex:
        normalized.agency_index,
      recordId: record.id,
      captureToken,
    });
  } catch (error: any) {
    console.error(
      '[Cast] Fatal error:',
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          'Internal Core Error.',
      },
      { status: 500 }
    );
  }
}