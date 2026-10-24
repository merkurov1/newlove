#!/usr/bin/env bun
/**
 * Build a sanitized, public presentation case from the local Telegram Research
 * artifacts. The public JSON intentionally contains only aggregates and
 * AI-derived summaries — never raw messages, message IDs, media paths or
 * Telegram credentials.
 *
 * Usage:
 *   bun run scripts/telegram-research/build-public-case.ts --handle @Vorobievaya
 */

import path from 'node:path';

import {
  ensureDir,
  readJson,
  readJsonOrThrow,
  writeJsonAtomic,
} from '../../lib/telegram-research/util';
import { chatPaths, slugifyChat } from '../../lib/telegram-research/paths';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asSeconds(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function sourceCount(value: unknown): number {
  return asArray(value).length;
}

function parseHandle(): string {
  const index = process.argv.indexOf('--handle');
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return process.env.TELEGRAM_RESEARCH_CHAT ?? '@Vorobievaya';
}

function participantSplits(
  value: unknown,
  participantKeys: Map<string, 'self' | 'peer'>
): { self: number; peer: number } {
  let self = 0;
  let peer = 0;

  for (const [key, raw] of Object.entries(asRecord(value))) {
    const who = participantKeys.get(key);
    const count = asNumber(raw);
    if (who === 'self') self = count;
    if (who === 'peer') peer = count;
  }

  return { self, peer };
}

async function publicDeepSeek(directory: string): Promise<Record<string, unknown> | null> {
  const progress = await readJson<Record<string, unknown>>(path.join(directory, 'progress.json'));
  const synthesis = await readJson<Record<string, unknown>>(path.join(directory, 'synthesis.json'));

  if (!synthesis) return null;

  const synthesisRecord = asRecord(synthesis);
  const data = asRecord(synthesisRecord.data);
  const usage = asRecord(synthesisRecord.usage ?? asRecord(progress).usage);

  const mapSource = (item: unknown) => {
    const record = asRecord(item);
    return {
      date: typeof record.date === 'string' ? record.date : null,
      summary: asString(record.summary),
      confidence: asNumber(record.confidence),
      sourceCount: sourceCount(record.sourceMessageIds ?? record.evidenceMessageIds),
    };
  };

  const mapEvent = (item: unknown) => {
    const record = asRecord(item);
    const deadline = asRecord(record.deadline);

    return {
      type: asString(record.type, 'other'),
      summary: asString(record.summary),
      date: typeof record.date === 'string' ? record.date : null,
      deadline:
        Object.keys(deadline).length === 0
          ? null
          : {
              date: typeof deadline.date === 'string' ? deadline.date : null,
              kind: asString(deadline.kind, 'unclear'),
              confidence: asNumber(deadline.confidence),
            },
      status: asString(record.status, 'uncertain'),
      participants: asArray(record.participants)
        .filter((value): value is string => typeof value === 'string')
        .slice(0, 8),
      confidence: asNumber(record.confidence),
      sourceCount: sourceCount(record.sourceMessageIds),
    };
  };

  const mapTheme = (item: unknown) => {
    const record = asRecord(item);
    return {
      label: asString(record.label),
      summary: asString(record.summary),
      confidence: asNumber(record.confidence),
      sourceCount: sourceCount(record.sourceMessageIds),
    };
  };

  const mapObservation = (item: unknown) => {
    const record = asRecord(item);
    return {
      kind:
        asString(record.kind, 'interpretation') === 'observable' ? 'observable' : 'interpretation',
      observation: asString(record.observation),
      confidence: asNumber(record.confidence),
      sourceCount: sourceCount(record.evidenceMessageIds),
      alternativeInterpretations: asArray(record.alternativeInterpretations)
        .filter((value): value is string => typeof value === 'string')
        .slice(0, 4),
    };
  };

  return {
    model: asString(synthesisRecord.model, 'deepseek-flash'),
    status: asString(asRecord(progress).status, 'unknown'),
    usage: {
      inputTokens: asNumber(usage.inputTokens),
      outputTokens: asNumber(usage.outputTokens),
      costUsd: round(asNumber(usage.costUsd), 4),
    },
    summary: asString(data.summary),
    timeline: asArray(data.timeline).map(mapSource),
    editorialEvents: asArray(data.editorialEvents).map(mapEvent),
    recurringThemes: asArray(data.recurringThemes).map(mapTheme),
    openQuestions: asArray(data.openQuestions)
      .filter((value): value is string => typeof value === 'string')
      .slice(0, 12),
    linguisticObservations: asArray(data.linguisticObservations).map(mapObservation),
    limitations: asArray(data.limitations)
      .filter((value): value is string => typeof value === 'string')
      .slice(0, 12),
    disclaimer: asString(data.disclaimer),
  };
}

async function main(): Promise<void> {
  const handle = parseHandle();
  const paths = chatPaths(slugifyChat(handle));
  const outputDirectory = path.resolve('data/telegram-research-public');
  const outputFile = path.join(outputDirectory, `${slugifyChat(handle)}.json`);

  const stats = await readJsonOrThrow<Record<string, unknown>>(paths.stats);
  const manifest = await readJsonOrThrow<Record<string, unknown>>(paths.manifest);

  const source = asRecord(stats.source);
  const chat = asRecord(source.chat);
  const corpus = asRecord(manifest.corpus);
  const exportMeta = asRecord(manifest.export);
  const completeness = asRecord(manifest.completeness);
  const counts = asRecord(manifest.counts);

  const participantsRaw = asArray(stats.participants).map(asRecord);
  const participantKeys = new Map<string, 'self' | 'peer'>();

  for (const participant of participantsRaw) {
    const key = asString(participant.key);
    if (key) participantKeys.set(key, participant.isSelf === true ? 'self' : 'peer');
  }

  const participants = participantsRaw.map((participant) => ({
    key: participant.isSelf === true ? 'self' : 'peer',
    displayName: asString(participant.displayName),
    username: asString(participant.username),
    messages: asNumber(participant.messages),
    share: asNumber(participant.share),
    characters: asNumber(participant.characters),
    words: asNumber(participant.words),
    links: asNumber(participant.links),
    media: asNumber(participant.media),
    repliesSent: asNumber(participant.repliesSent),
    directRepliesSent: asNumber(participant.directRepliesSent),
    estimatedRepliesSent: asNumber(participant.estimatedRepliesSent),
    sessionsStarted: asNumber(participant.sessionsStarted),
    medianCharacters: asNumber(participant.medianCharacters),
    medianWords: asNumber(participant.medianWords),
    medianDirectReplySeconds: asSeconds(participant.medianDirectReplySeconds),
    medianEstimatedReplySeconds: asSeconds(participant.medianEstimatedReplySeconds),
    firstMessageAt: asString(participant.firstMessageAt),
    lastMessageAt: asString(participant.lastMessageAt),
  }));

  const activity = asRecord(stats.activity);

  const byMonth = Object.entries(asRecord(activity.byMonth))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, raw]) => {
      const entry = asRecord(raw);
      const split = participantSplits(entry.byParticipant, participantKeys);
      return { month, total: asNumber(entry.total), ...split };
    });

  const byYear = Object.entries(asRecord(activity.byYear)).map(([year, raw]) => {
    const entry = asRecord(raw);
    const split = participantSplits(entry.byParticipant, participantKeys);
    return { year, total: asNumber(entry.total), ...split };
  });

  const byWeekday = asArray(activity.byWeekday).map((raw) => {
    const entry = asRecord(raw);
    const split = participantSplits(entry.byParticipant, participantKeys);
    return {
      key: asString(entry.key),
      label: asString(entry.label),
      total: asNumber(entry.total),
      ...split,
    };
  });

  const byHour = asArray(activity.byHour).map((raw) => {
    const entry = asRecord(raw);
    const split = participantSplits(entry.byParticipant, participantKeys);
    return { hour: asNumber(entry.hour), total: asNumber(entry.total), ...split };
  });

  const sessions = asRecord(stats.sessions);
  const responses = asRecord(stats.responses);
  const direct = asRecord(responses.directReplies);
  const estimated = asRecord(responses.estimatedReplies);
  const sessionRows = asArray(sessions.sessions).map(asRecord);
  const longest = sessionRows.reduce<Record<string, unknown> | null>((best, current) => {
    if (!best) return current;
    return asNumber(current.durationSeconds) > asNumber(best.durationSeconds) ? current : best;
  }, null);

  const starts = participantSplits(sessions.startsByParticipant, participantKeys);
  const resumes = participantSplits(sessions.longPauseResumesByParticipant, participantKeys);
  const directByParticipant = participantSplits(
    Object.fromEntries(
      Object.entries(asRecord(direct.byParticipant)).map(([key, raw]) => [key, asRecord(raw).count])
    ),
    participantKeys
  );
  const estimatedByParticipant = participantSplits(
    Object.fromEntries(
      Object.entries(asRecord(estimated.byParticipant)).map(([key, raw]) => [
        key,
        asRecord(raw).count,
      ])
    ),
    participantKeys
  );

  const output = {
    schemaVersion: 1,
    slug: slugifyChat(handle),
    generatedAt: new Date().toISOString(),
    privacy: {
      containsRawMessages: false,
      note: 'Только агрегированные метрики и AI-сводки. Исходные сообщения, медиа и Telegram ID не публикуются.',
    },
    chat: {
      title: asString(chat.title),
      username: asString(chat.username),
      type: asString(chat.type),
    },
    period: {
      from: asString(asRecord(corpus.dateRange).from),
      to: asString(asRecord(corpus.dateRange).to),
    },
    totals: {
      messages: asNumber(counts.total),
      withText: asNumber(counts.withText),
      withoutText: asNumber(counts.withoutText),
      media: asNumber(counts.media),
      service: asNumber(counts.service),
      edited: asNumber(counts.edited),
      forwarded: asNumber(counts.forwarded),
      replies: asNumber(counts.replies),
      outgoing: asNumber(counts.outgoing),
      participants: asNumber(counts.participants),
    },
    participants,
    activity: { byYear, byMonth, byWeekday, byHour },
    lengths: asRecord(stats.lengths),
    responses: {
      replyLinksAvailable: responses.replyLinksAvailable === true,
      replyCoverage: asNumber(responses.replyCoverage),
      crossParticipantReplies: asNumber(responses.crossParticipantReplies),
      direct: {
        count: asNumber(direct.count),
        medianSeconds: asSeconds(asRecord(direct.seconds).median),
        meanSeconds: asSeconds(asRecord(direct.seconds).mean),
        p90Seconds: asSeconds(asRecord(direct.seconds).p90),
        byParticipant: directByParticipant,
      },
      estimated: {
        count: asNumber(estimated.count),
        medianSeconds: asSeconds(asRecord(estimated.seconds).median),
        meanSeconds: asSeconds(asRecord(estimated.seconds).mean),
        byParticipant: estimatedByParticipant,
        method: asString(estimated.method),
      },
    },
    sessions: {
      thresholdSeconds: asNumber(sessions.thresholdSeconds),
      longPauseSeconds: asNumber(sessions.longPauseSeconds),
      count: asNumber(sessions.count),
      medianDurationSeconds: asNumber(sessions.medianDurationSeconds),
      meanDurationSeconds: asNumber(sessions.meanDurationSeconds),
      medianMessagesPerSession: asNumber(sessions.medianMessagesPerSession),
      starts,
      longPauseGaps: asNumber(sessions.longPauseGaps),
      longPauseResumes: resumes,
      longest: longest
        ? {
            start: asString(longest.start),
            end: asString(longest.end),
            durationSeconds: asNumber(longest.durationSeconds),
            messageCount: asNumber(longest.messageCount),
            initiatedBy: asString(longest.initiatedBy).startsWith('id:')
              ? (participantKeys.get(asString(longest.initiatedBy)) ?? null)
              : null,
          }
        : null,
    },
    dataQuality: asRecord(stats.dataQuality),
    methodology: asRecord(stats.methodology),
    completeness: {
      status: asString(completeness.status),
      checks: asRecord(completeness.checks),
      reasons: asArray(completeness.reasons),
      gaps: asArray(completeness.gaps),
    },
    export: {
      strategy: asString(exportMeta.strategy),
      pages: asNumber(exportMeta.pages),
      headPages: asNumber(exportMeta.headPages),
      duplicatesDropped: asNumber(exportMeta.duplicatesDropped),
      retries: asNumber(exportMeta.retries),
      apiCalls: asNumber(exportMeta.apiCalls),
      sourceTimezone: asString(exportMeta.sourceTimezone, 'UTC'),
    },
    deepseek: await publicDeepSeek(paths.deepseekDir),
  };

  await ensureDir(outputDirectory);
  await writeJsonAtomic(outputFile, output);

  console.error(`Публичный кейс: ${outputFile}`);
  console.error(
    `Сообщений: ${output.totals.messages}; DeepSeek: ${output.deepseek ? 'включён' : 'ещё нет'}`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
