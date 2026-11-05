import { createHash, randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { getClientIp } from '@/lib/rateLimit';
import { checkPierrotRateLimit } from '@/lib/pierrot/rateLimit';
import {
  callDevModel,
  DevPartialCompletionError,
  DevProviderError,
  isDevModelConfigured,
} from '@/lib/pierrot/dev/llm';
import { getDevRepositoryConfigs, resolveDevRepository } from '@/lib/pierrot/dev/repositories';
import { appendDevMessage, ensureDevConversation, loadDevHistory } from '@/lib/pierrot/dev/store';
import { beginDevRequest, completeDevRequest, failDevRequest } from '@/lib/pierrot/dev/requests';
import type { DevModelResult, DevToolEvent } from '@/lib/pierrot/dev/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MAX_DEV_MESSAGE = 8_000;
const ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

function safeId(value: unknown): string | null {
  return typeof value === 'string' && ID_PATTERN.test(value) ? value : null;
}

function deterministicMessageId(
  kind: 'user' | 'assistant',
  conversationId: string,
  idempotencyKey: string
): string {
  const digest = createHash('sha256')
    .update(`${kind}:${conversationId}:${idempotencyKey}`, 'utf8')
    .digest('base64url')
    .slice(0, 40);
  return `${kind === 'user' ? 'u' : 'a'}_${digest}`;
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code) return code;
  }
  if (error instanceof Error && error.message === 'DEV_MIGRATION_REQUIRED') {
    return 'DEV_MIGRATION_REQUIRED';
  }
  return 'DEV_REQUEST_FAILED';
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof DevPartialCompletionError) return error.message;
  if (error instanceof Error) return error.message.slice(0, 500);
  return 'Dev request failed.';
}

function statusFromResult(result: DevModelResult): 'completed' | 'partially_completed' {
  return result.status === 'partially_completed' ? 'partially_completed' : 'completed';
}

type Emit = (event: Record<string, unknown>) => void;

function sseResponse(
  run: (emit: Emit) => Promise<Record<string, unknown>>,
  conversationId: string
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const emit: Emit = (event) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // Client already disconnected.
        }
      };

      void run(emit)
        .then((payload) => {
          emit({ type: 'final', payload });
          close();
        })
        .catch((error) => {
          const record =
            error && typeof error === 'object'
              ? (error as {
                  toolTrace?: unknown;
                  events?: unknown;
                  diagnosis?: unknown;
                })
              : {};
          emit({
            type: 'final',
            payload: {
              error: safeErrorMessage(error),
              code: errorCode(error),
              status: 'failed',
              toolTrace: Array.isArray(record.toolTrace) ? record.toolTrace : [],
              events: Array.isArray(record.events) ? record.events : [],
              diagnosis: record.diagnosis || null,
            },
          });
          close();
        });
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Conversation-Id': conversationId,
    },
  });
}

export async function POST(req: Request) {
  let admin: Awaited<ReturnType<typeof requireAdminFromRequest>>;

  try {
    admin = await requireAdminFromRequest(req);
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }

  const limited = await checkPierrotRateLimit({
    identifier: `dev:${admin.id || getClientIp(req)}`,
    intervalMs: 60 * 1000,
    maxRequests: 30,
    keyPrefix: 'pierrot-dev',
  });

  if (limited) return limited;

  if (!isDevModelConfigured()) {
    return json(
      {
        error: 'No dev model provider is configured.',
        code: 'DEV_NOT_CONFIGURED',
        status: 'failed',
      },
      503
    );
  }

  const body = await req.json().catch(() => ({}));
  const message = body && typeof body.message === 'string' ? body.message.trim() : '';
  const conversationId =
    body && typeof body.conversationId === 'string' ? body.conversationId : null;
  const requestId =
    safeId(body?.requestId) || safeId(req.headers.get('x-idempotency-key')) || randomUUID();
  const idempotencyKey =
    safeId(body?.idempotencyKey) || safeId(req.headers.get('x-idempotency-key')) || requestId;
  const wantsStream =
    body?.stream === true || (req.headers.get('accept') || '').includes('text/event-stream');
  const repositoryHint = typeof body?.repository === 'string' ? body.repository.slice(0, 80) : null;
  const baseRef = typeof body?.baseRef === 'string' ? body.baseRef.slice(0, 200) : null;

  if (!message) {
    return json({ error: 'Message is required.', status: 'failed' }, 400);
  }

  if (message.length > MAX_DEV_MESSAGE) {
    return json({ error: 'Message is too long.', status: 'failed' }, 413);
  }

  if (conversationId && !ID_PATTERN.test(conversationId)) {
    return json({ error: 'Invalid conversation id.', status: 'failed' }, 400);
  }

  const repositoryConfigs = getDevRepositoryConfigs();
  let activeRepository = repositoryConfigs[0];

  try {
    activeRepository = resolveDevRepository(repositoryHint || undefined);
  } catch {
    return json(
      {
        error: 'Unknown repository. Choose newlove or pierrot.',
        code: 'DEV_REPO_INVALID',
        status: 'failed',
      },
      400
    );
  }

  if (!activeRepository.configured) {
    return json(
      {
        error:
          'GitHub access is not configured. Dev Mode cannot inspect the repository until GITHUB_TOKEN is available.',
        code: 'DEV_GITHUB_UNAVAILABLE',
        status: 'failed',
        repository: activeRepository.key,
      },
      503
    );
  }

  let conversation: Awaited<ReturnType<typeof ensureDevConversation>>;

  try {
    conversation = await ensureDevConversation({
      ownerUserId: admin.id,
      conversationId,
    });
  } catch (error) {
    const code = errorCode(error);
    if (code === 'DEV_MIGRATION_REQUIRED') {
      return json(
        {
          error:
            'Dev mode requires the additive Supabase migration 2026-11-17_pierrot_dev_mode.sql.',
          code,
          status: 'failed',
        },
        503
      );
    }
    console.error('[Pierrot Dev] conversation setup failed', { code });
    return json({ error: 'Dev request failed.', code, status: 'failed' }, 500);
  }

  const begin = await beginDevRequest({
    requestId,
    conversationId: conversation.id,
    userId: admin.id,
    idempotencyKey,
    message,
    repository: repositoryHint,
    baseRef,
  });

  if (begin.duplicate && begin.request) {
    if (begin.request.status === 'completed' && begin.request.responseText) {
      return json({
        reply: begin.request.responseText,
        conversationId: conversation.id,
        provider: begin.request.provider,
        model: begin.request.model,
        toolTrace: begin.request.toolTrace,
        events: begin.request.events,
        usage: begin.request.usage,
        requestId,
        status: 'completed',
        latencyMs: begin.request.latencyMs,
        diagnosis: begin.request.diagnosis,
        cached: true,
      });
    }

    if (begin.request.status === 'pending' || begin.request.status === 'running') {
      return json(
        {
          error: 'This request is already running.',
          code: 'DEV_REQUEST_IN_PROGRESS',
          requestId,
          status: begin.request.status,
        },
        409
      );
    }

    return json(
      {
        error:
          begin.request.errorMessage ||
          'This idempotent request previously failed. Start a new request.',
        code: begin.request.errorCode || 'DEV_REQUEST_FAILED',
        requestId,
        status: begin.request.status,
      },
      begin.request.status === 'partially_completed' ? 207 : 500
    );
  }

  const warnings: string[] = [];
  if (!begin.available) {
    warnings.push(
      begin.reason === 'migration_required'
        ? 'Request traces are not persisted: apply migration 2026-11-18_pierrot_dev_engineering.sql.'
        : 'Request trace storage is unavailable.'
    );
  }

  const userMessageId = deterministicMessageId('user', conversation.id, idempotencyKey);
  try {
    await appendDevMessage({
      conversationId: conversation.id,
      role: 'user',
      content: message,
      messageId: userMessageId,
    });
  } catch (error) {
    const code = errorCode(error);
    await failDevRequest({
      requestId,
      status: 'failed',
      errorCode: code,
      errorMessage: safeErrorMessage(error),
      latencyMs: 0,
    });
    return json(
      {
        error: 'Unable to persist the Dev message.',
        code,
        requestId,
        status: 'failed',
      },
      500
    );
  }

  const execute = async (emit: Emit): Promise<Record<string, unknown>> => {
    const startedAt = Date.now();
    let result: DevModelResult;
    const events: DevToolEvent[] = [];

    try {
      emit({
        type: 'status',
        phase: 'connecting',
        label: `Подключаюсь к ${activeRepository.fullName}`,
      });

      result = await callDevModel({
        history: await loadDevHistory(conversation.id, 30),
        requestId,
        signal: req.signal,
        repository: activeRepository.key,
        onEvent: (event) => {
          events.push(event);
          emit(event);
        },
      });
    } catch (caught) {
      const latencyMs = Date.now() - startedAt;
      const code = errorCode(caught);

      if (caught instanceof DevPartialCompletionError) {
        const partial = caught.result;
        const assistantMessageId = deterministicMessageId(
          'assistant',
          conversation.id,
          idempotencyKey
        );
        try {
          await appendDevMessage({
            conversationId: conversation.id,
            role: 'assistant',
            content: partial.reply,
            provider: partial.provider,
            messageId: assistantMessageId,
          });
        } catch {
          // The error state is still recorded below.
        }

        await completeDevRequest({
          requestId,
          status: 'partially_completed',
          provider: partial.provider,
          model: partial.model,
          reply: partial.reply,
          latencyMs: partial.latencyMs,
          usage: partial.usage,
          toolTrace: partial.toolTrace,
          events: partial.events,
          sideEffects: partial.sideEffects,
          responseMessageId: assistantMessageId,
          diagnosis: partial.diagnosis,
        });

        return {
          reply: partial.reply,
          conversationId: conversation.id,
          provider: partial.provider,
          model: partial.model,
          toolTrace: partial.toolTrace,
          events: partial.events,
          usage: partial.usage,
          requestId,
          status: 'partially_completed',
          latencyMs: partial.latencyMs,
          diagnosis: partial.diagnosis,
          warnings,
        };
      }

      const caughtRecord =
        caught && typeof caught === 'object'
          ? (caught as { toolTrace?: unknown; events?: unknown })
          : {};
      const trace =
        caught instanceof DevProviderError
          ? caught.toolTrace
          : Array.isArray(caughtRecord.toolTrace)
            ? (caughtRecord.toolTrace as DevModelResult['toolTrace'])
            : [];
      const errorEvents =
        caught instanceof DevProviderError
          ? caught.events
          : Array.isArray(caughtRecord.events)
            ? (caughtRecord.events as DevToolEvent[])
            : events;

      await failDevRequest({
        requestId,
        status: 'failed',
        errorCode: code,
        errorMessage: safeErrorMessage(caught),
        latencyMs,
        toolTrace: trace,
        events: errorEvents,
      });

      // Keep the transcript in a defined state after a failed assistant turn.
      const detail = safeErrorMessage(caught).slice(0, 240);
      const traceNote =
        trace.length > 0 ? ` Собранные шаги сохранены в trace (${trace.length}).` : '';
      const notice =
        code === 'DEV_REQUEST_ABORTED'
          ? `Запрос прерван. Сообщение сохранено; можно повторить с новым requestId.${traceNote}`
          : code === 'DEV_REQUEST_DEADLINE_EXCEEDED'
            ? `Запрос превысил допустимое время. Сообщение сохранено; можно продолжить с нового запроса.${traceNote}`
            : `Ответ не получен (${code})${detail ? `: ${detail}` : ''}. Сообщение сохранено; можно повторить с новым requestId.${traceNote}`;

      const assistantMessageId = deterministicMessageId(
        'assistant',
        conversation.id,
        idempotencyKey
      );
      try {
        await appendDevMessage({
          conversationId: conversation.id,
          role: 'assistant',
          content: notice,
          messageId: assistantMessageId,
        });
      } catch {
        // The request row is authoritative for the failure status.
      }

      // Carry the partial trace and the explicit code to both the streaming
      // final payload and the non-streaming JSON response.
      throw Object.assign(new Error(safeErrorMessage(caught)), {
        code,
        status: 'failed',
        toolTrace: trace,
        events: errorEvents,
        diagnosis: null,
      });
    }

    const assistantMessageId = deterministicMessageId('assistant', conversation.id, idempotencyKey);

    let assistantPersisted = true;
    try {
      await appendDevMessage({
        conversationId: conversation.id,
        role: 'assistant',
        content: result.reply,
        provider: result.provider,
        messageId: assistantMessageId,
      });
    } catch (error) {
      assistantPersisted = false;
      warnings.push(`Assistant reply could not be persisted: ${safeErrorMessage(error)}`);
    }

    const finalStatus = assistantPersisted ? statusFromResult(result) : 'partially_completed';
    await completeDevRequest({
      requestId,
      status: finalStatus,
      provider: result.provider,
      model: result.model,
      reply: result.reply,
      latencyMs: result.latencyMs,
      usage: result.usage,
      toolTrace: result.toolTrace,
      events: result.events,
      sideEffects: result.sideEffects,
      responseMessageId: assistantPersisted ? assistantMessageId : null,
      diagnosis: result.diagnosis,
    });

    return {
      reply: result.reply,
      conversationId: conversation.id,
      provider: result.provider,
      model: result.model,
      toolTrace: result.toolTrace,
      events: result.events,
      usage: result.usage,
      requestId,
      status: finalStatus,
      latencyMs: result.latencyMs,
      diagnosis: result.diagnosis,
      warnings,
    };
  };

  if (wantsStream) {
    return sseResponse(execute, conversation.id);
  }

  try {
    const payload = await execute(() => {
      // Non-streaming requests do not emit intermediate events.
    });
    return json(payload, payload.status === 'partially_completed' ? 207 : 200);
  } catch (error) {
    const code = errorCode(error);
    const record =
      error && typeof error === 'object'
        ? (error as { toolTrace?: unknown; events?: unknown; diagnosis?: unknown })
        : {};
    return json(
      {
        error: safeErrorMessage(error),
        code,
        requestId,
        status: 'failed',
        toolTrace: Array.isArray(record.toolTrace) ? record.toolTrace : [],
        events: Array.isArray(record.events) ? record.events : [],
        diagnosis: record.diagnosis || null,
      },
      code === 'DEV_REQUEST_ABORTED' ? 499 : 500
    );
  }
}
