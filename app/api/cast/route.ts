import { randomUUID } from 'node:crypto';

import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createCastCaptureTokenWithMetadata } from '@/lib/cast/captureToken';
import { consumeDistributedRateLimit } from '@/lib/cast/rateLimitServer';
import { getClientIp } from '@/lib/rateLimit';
import { resolveTempleIdentity } from '@/lib/temple/identity';
import { publicTempleTraceMessage } from '@/lib/temple/publicTrace';

export const runtime = 'nodejs';

const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(sbUrl, sbKey);

/**
 * Bumped whenever the system prompt or the output contract changes. Stored with
 * every private analysis record so a reading can always be traced to the exact
 * instruction set that produced it.
 */
const CAST_PROMPT_VERSION = 'cast.system.v2';
const CAST_TEMPERATURE = 0.7;

const ANALYSIS_RATE_LIMIT = { limit: 6, windowSeconds: 15 * 60 };

const DEEPSEEK_MODELS = [process.env.DEEPSEEK_MODEL || 'deepseek-chat'];

const OPENROUTER_DEEPSEEK_MODELS = [
  'deepseek/deepseek-chat',
  'deepseek/deepseek-r1:free',
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

/**
 * Terms that turn an interpretation into a clinical verdict. If a model emits
 * one of them, the response is discarded rather than softened: a reader must
 * never receive a fabricated diagnosis from a ten-answer ritual.
 */
const CAST_CLINICAL_CLAIM =
  /(diagnos|disorder|depress|trauma|ptsd|attachment (style|disorder)|blocked grief|narciss|bipolar|psychosis|диагноз|расстройств|депресс|травм|птср|нарцисс|психоз|биполяр)/i;

/** Markers a reader may use instead of an answer. */
const NOT_APPLICABLE_ANSWER =
  /^(?:n\/?a|not applicable|none|—|–|-|не применимо|н\/п|нет ответа)$/i;

function isNotApplicable(answer: string): boolean {
  return NOT_APPLICABLE_ANSWER.test(answer.trim());
}

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

There are nine reflection answers and one ritual threshold answer.
ANSWER 10 IS NOT AN ANALYTICAL VARIABLE.
It only indicates that the subject agrees to see the result.
This is an interpretive archetype, not a clinical or medical diagnosis.

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
9. An answer such as "not applicable", "n/a", "—" or "не применимо" is a
   deliberate non-answer. Do not treat it as evasion and do not guess why.
10. This is a short, self-selected text. It cannot support certainty.

EPISTEMIC LIMITS (MANDATORY):

- Never diagnose, and never use clinical or medical vocabulary such as
  "depression", "trauma", "blocked grief", "attachment disorder", "PTSD",
  "anxiety disorder" or "narcissism".
- Never state a psychological fact about the person. Phrase every
  interpretation as a hypothesis about the text, with hedged language
  ("the answers suggest", "this may indicate", "one possible reading is").
- Never claim to know childhood, family, health, relationships or events that
  are not present in the answers.
- Do not moralize, condemn or flatter. Stay cold, precise and modest.
- Confidence must be low. If the answers are thin, say so.

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
): string | null {  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();

  if (!normalized || normalized.length > maxLength) {
    return null;
  }

  return normalized;
}

function normalizeAnalysis(parsed: unknown) {  if (!parsed || typeof parsed !== 'object') {
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

  const prose = [
    executiveSummary,
    structuralWeaknesses,
    coreAssets,
    strategicDirective,
  ].join(' ');

  // A model must not smuggle a clinical verdict into prose. Rejecting the
  // response lets the next configured model try; if every model does it, the
  // reader sees an honest failure instead of a diagnosis.
  if (CAST_CLINICAL_CLAIM.test(prose)) {
    console.error(
      '[Cast] Rejected analysis containing a clinical assertion'
    );

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

type CastActor = {
  /** UUID only. Telegram numeric ids never enter the Supabase `casts.user_id`. */
  userId: string | null;
  userEmail: string | null;
  userName: string;
  source: 'telegram' | 'supabase' | null;
};

/**
 * Cast is a public ritual, so participation does not require an account.
 * When the visitor does present a credential, it is verified server-side and
 * only that verified identity is recorded. A forged token never becomes an
 * identity and never grants anything.
 */
async function resolveCastActor(req: Request): Promise<CastActor> {
  const identity = await resolveTempleIdentity(req, supabase);

  if (!identity) {
    return {
      userId: null,
      userEmail: null,
      userName: 'Visitor',
      source: null,
    };
  }

  return {
    userId: identity.source === 'supabase' ? identity.userId : null,
    userEmail: identity.source === 'supabase' ? identity.email : null,
    userName: identity.displayName,
    source: identity.source,
  };
}

export async function POST(
  req: Request
) {
  try {
    const deepseekKey = (
      process.env.DEEPSEEK_API_KEY || ''
    ).trim();
    const openRouterKey = (
      process.env.OPENROUTER_API_KEY || ''
    ).trim();

    if (!deepseekKey && !openRouterKey) {
      return NextResponse.json(
        {
          error:
            'DeepSeek API key missing.',
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

    const showIdentity = source.show_identity === true;

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
          !isNotApplicable(answer) &&
          (answer.length < 3 ||
            answer.length >
              MAX_ANSWER_LENGTH)
      )
    ) {
      return NextResponse.json(
        {
          error:
            `Each answer must contain between 3 and ${MAX_ANSWER_LENGTH} characters, or an explicit "not applicable" marker.`,
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
    } = await resolveCastActor(req);

    /**
     * Identity is decided by the server only. `status` and `user_id` in the
     * request body are ignored; a signed-in reader is `identified`, everyone
     * else is `anonymous`.
     */
    const status: 'anonymous' | 'identified' = userId
      ? 'identified'
      : 'anonymous';

    /*
     * Raw answers are sensitive. A verified owner may keep them for their own
     * archive, but only after an explicit opt-in. Anonymous protocols never
     * keep answers, regardless of any client flag.
     */
    const retainAnswers =
      userId !== null && source.retain_answers === true;
    const storedAnswers = retainAnswers
      ? normalizedAnswers
      : [];

    const limited = await consumeDistributedRateLimit(supabase, {
      scope: 'cast:analysis',
      identifier: userId ?? `ip:${getClientIp(req)}`,
      ...ANALYSIS_RATE_LIMIT,
    });

    if (!limited.allowed) {
      return NextResponse.json(
        {
          error:
            'The Temple is receiving too many readings right now. Please wait a little and try again.',
          code: 'rate_limited',
          retryAfter: limited.retryAfterSeconds,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(limited.retryAfterSeconds),
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    const suppliedKey =
      req.headers.get('x-idempotency-key') ||
      (typeof source.idempotencyKey === 'string'
        ? source.idempotencyKey
        : '');
    const idempotencyKey =
      typeof suppliedKey === 'string' &&
      /^[A-Za-z0-9_-]{16,128}$/.test(suppliedKey.trim())
        ? suppliedKey.trim()
        : null;

    /*
     * A repeated submit with the same key must not create a second record or a
     * second paid AI request. This lookup happens before the model call.
     */
    if (idempotencyKey) {
      const { data: replay, error: replayError } = await supabase
        .from('casts')
        .select(
          'id, created_at, user_id, analysis, archetype, status, capture_consumed_at'
        )
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();

      if (
        !replayError &&
        replay &&
        typeof replay.id === 'string' &&
        typeof replay.created_at === 'string'
      ) {
        const sameOwner =
          (replay.user_id ?? null) === (userId ?? null);

        if (!sameOwner) {
          return NextResponse.json(
            {
              error: 'This reading key belongs to another session.',
              code: 'idempotency_conflict',
            },
            { status: 409 }
          );
        }

        const replayAnalysis = replay.analysis as
          | Record<string, unknown>
          | null;
        const replayArchetype =
          typeof replay.archetype === 'string'
            ? replay.archetype
            : null;

        if (replayAnalysis && replayArchetype) {
          const token = createCastCaptureTokenWithMetadata(
            replay.id,
            replay.created_at
          );

          return NextResponse.json({
            analysis: replayAnalysis,
            archetype: replayArchetype,
            agencyIndex: replayAnalysis.agency_index,
            recordId: replay.id,
            captureToken: token.token,
            captureExpiresAt: token.expiresAt,
            status,
            replayed: true,
          });
        }
      } else if (
        replayError &&
        replayError.code !== '42703' &&
        replayError.code !== 'PGRST204'
      ) {
        console.error(
          '[Cast] Idempotency lookup failed:',
          replayError
        );
      }
    }

    const attempts: Array<{
      client: OpenAI;
      model: string;
      provider: 'deepseek' | 'openrouter';
    }> = [];

    if (deepseekKey) {
      const directClient = new OpenAI({
        baseURL: (
          process.env.DEEPSEEK_BASE_URL ||
          'https://api.deepseek.com'
        ).replace(/\/+$/, ''),
        apiKey: deepseekKey,
      });

      for (const model of DEEPSEEK_MODELS) {
        attempts.push({
          client: directClient,
          model,
          provider: 'deepseek',
        });
      }
    }

    if (openRouterKey) {
      const routerClient = new OpenAI({
        baseURL:
          'https://openrouter.ai/api/v1',
        apiKey: openRouterKey,
        defaultHeaders: {
          'HTTP-Referer':
            'https://merkurov.love',
          'X-Title':
            'Digital Temple Cast Protocol',
        },
      });

      for (const model of OPENROUTER_DEEPSEEK_MODELS) {
        attempts.push({
          client: routerClient,
          model,
          provider: 'openrouter',
        });
      }
    }

    const systemPrompt =
      buildSystemPrompt(lang);

    const userText = [
      'REFLECTION ANSWERS:',
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
    let usedAttempt: (typeof attempts)[number] | null = null;
    let normalizationRejected = false;

    for (const attempt of attempts) {
      try {
        completion =
          await attempt.client.chat.completions.create(
            {
              model: attempt.model,
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
              temperature: CAST_TEMPERATURE,
              response_format: {
                type: 'json_object',
              },
            }
          );

        const candidate = completion?.choices?.[0]?.message?.content;

        if (candidate) {
          /*
           * A structurally invalid or clinically framed response is not a
           * usable reading. Try the next configured model instead of trusting
           * it, and remember that the rejection happened so the failure can be
           * logged with a safe code.
           */
          if (!normalizeAnalysis(extractJSON(candidate))) {
            normalizationRejected = true;
            completion = null;
            continue;
          }

          usedAttempt = attempt;
          break;
        }
      } catch (error: any) {
        console.warn(
          `[Cast] Model ${attempt.model} failed:`,
          error?.message || error
        );

        lastError = error;
      }
    }

    if (!completion) {
      throw (
        lastError ||
        new Error(
          normalizationRejected
            ? 'The interpretation did not meet the Temple protocol.'
            : 'DeepSeek models are currently unavailable.'
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

    /*
     * Provenance is stored privately so a reading can be audited without
     * exposing provider metadata publicly. `requestId`, token usage and cost
     * are whatever the provider returned; absent values stay null.
     */
    const usage = completion?.usage ?? null;
    const analysisMetadata = {
      provider: usedAttempt?.provider ?? null,
      model: usedAttempt?.model ?? null,
      promptVersion: CAST_PROMPT_VERSION,
      temperature: CAST_TEMPERATURE,
      requestId:
        typeof completion?.id === 'string' ? completion.id : null,
      usage: usage
        ? {
            promptTokens: usage.prompt_tokens ?? null,
            completionTokens: usage.completion_tokens ?? null,
            totalTokens: usage.total_tokens ?? null,
            cost: usage.cost ?? null,
          }
        : null,
      createdAt,
    };

    const recordInput = {
      user_id: userId,
      email: userEmail,
      status,
      // Raw answers are sensitive. Only a verified owner that explicitly opted
      // in keeps them; every other record stores no raw answers.
      answers: storedAnswers,
      retention_consent: retainAnswers,
      language: lang,
      analysis: normalized,
      archetype:
        normalized.archetype,
      analysis_metadata: analysisMetadata,
      idempotency_key: idempotencyKey,
      created_at: createdAt,
    };

    let {
      data: record,
      error: recordError,
    } = await supabase
      .from('casts')
      .insert(recordInput)
      .select('id, created_at')
      .maybeSingle();

    /*
     * The privacy/provenance migration may not be applied yet in an older
     * environment. Retry with the columns that certainly exist rather than
     * losing a completed reading; the response still tells the truth.
     */
    if (
      recordError &&
      (recordError.code === '42703' ||
        recordError.code === 'PGRST204')
    ) {
      console.warn(
        '[Cast] Cast schema is older than the application; storing the core record only.'
      );

      const legacyInput = {
        user_id: userId,
        email: userEmail,
        answers: storedAnswers,
        language: lang,
        analysis: normalized,
        archetype: normalized.archetype,
        created_at: createdAt,
      };

      ({ data: record, error: recordError } = await supabase
        .from('casts')
        .insert(legacyInput)
        .select('id, created_at')
        .maybeSingle());
    }

    if (recordError) {
      // A concurrent submit with the same idempotency key won the insert race.
      // Return that record's stored analysis instead of a duplicate error.
      if (
        idempotencyKey &&
        recordError.code === '23505'
      ) {
        const { data: existing } = await supabase
          .from('casts')
          .select('id, created_at, user_id, analysis, archetype')
          .eq('idempotency_key', idempotencyKey)
          .maybeSingle();

        if (
          existing?.id &&
          existing.created_at &&
          existing.analysis &&
          (existing.user_id ?? null) === (userId ?? null)
        ) {
          const token = createCastCaptureTokenWithMetadata(
            existing.id,
            existing.created_at
          );

          return NextResponse.json({
            analysis: existing.analysis,
            archetype: existing.archetype,
            agencyIndex: (existing.analysis as Record<string, unknown>)
              .agency_index,
            recordId: existing.id,
            captureToken: token.token,
            captureExpiresAt: token.expiresAt,
            status,
            replayed: true,
          });
        }
      }

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
      createCastCaptureTokenWithMetadata(
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
        author: showIdentity ? userName : 'Anonymous',
        event_type: 'CAST',
        message: publicTempleTraceMessage('CAST', normalized.archetype),
        is_public_identity: showIdentity,
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
      captureToken: captureToken.token,
      captureExpiresAt: captureToken.expiresAt,
      status,
    });
  } catch (error: any) {
    const correlationId = randomUUID();

    console.error('[Cast] Fatal error', {
      correlationId,
      name: error?.name || 'Error',
      code:
        typeof error?.code === 'string'
          ? error.code.slice(0, 40)
          : undefined,
    });

    const message =
      typeof error?.message === 'string' &&
      /^(DeepSeek models|The Core|The interpretation|The protocol|Analysis completed)/.test(
        error.message
      )
        ? error.message
        : 'Internal Core Error.';

    return NextResponse.json(
      {
        error: message,
        code: 'cast_failed',
        correlationId,
      },
      { status: 500 }
    );
  }
}
