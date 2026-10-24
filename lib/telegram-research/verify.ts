import { readFile } from 'node:fs/promises';

import type { Manifest, NormalizedMessage } from './types';
import { messageKey, parseJsonLines, sortMessages } from './normalize';
import { readJsonOrThrow, sha256 } from './util';

export interface VerifyCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface VerifyReport {
  ok: boolean;
  checks: VerifyCheck[];
  manifest: Manifest;
  messages: number;
}

export async function verifyCorpus(
  corpusFile: string,
  manifestFile: string
): Promise<VerifyReport> {
  const manifest = await readJsonOrThrow<Manifest>(manifestFile);
  let raw: string;
  try {
    raw = await readFile(corpusFile, 'utf8');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      checks: [{ name: 'corpus readable', ok: false, detail }],
      manifest,
      messages: 0,
    };
  }

  const checks: VerifyCheck[] = [];
  let parsed: NormalizedMessage[] = [];
  try {
    parsed = parseJsonLines(raw);
    checks.push({ name: 'JSONL parsed', ok: true, detail: `${parsed.length} строк` });
  } catch (error) {
    checks.push({
      name: 'JSONL parsed',
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  const sorted = sortMessages(parsed);
  const keys = new Set(parsed.map(messageKey));
  const hash = sha256(raw);

  checks.push({
    name: 'manifest message count',
    ok: parsed.length === manifest.corpus.messageCount,
    detail: `corpus=${parsed.length}, manifest=${manifest.corpus.messageCount}`,
  });
  checks.push({
    name: 'corpus sha256',
    ok: hash === manifest.corpus.sha256,
    detail:
      hash === manifest.corpus.sha256
        ? 'совпадает'
        : `corpus=${hash}, manifest=${manifest.corpus.sha256}`,
  });
  checks.push({
    name: 'unique message ids',
    ok: keys.size === parsed.length,
    detail: `unique=${keys.size}, total=${parsed.length}`,
  });
  checks.push({
    name: 'chronological order',
    ok: JSON.stringify(sorted.map(messageKey)) === JSON.stringify(parsed.map(messageKey)),
    detail: 'сортировка по date, затем message id',
  });

  const first = parsed[0] ?? null;
  const last = parsed[parsed.length - 1] ?? null;
  checks.push({
    name: 'manifest first message',
    ok:
      (first?.id ?? null) === (manifest.corpus.firstMessage?.id ?? null) &&
      (first?.date ?? null) === (manifest.corpus.firstMessage?.date ?? null),
    detail: `${first?.id ?? '—'} @ ${first?.date ?? '—'}`,
  });
  checks.push({
    name: 'manifest last message',
    ok:
      (last?.id ?? null) === (manifest.corpus.lastMessage?.id ?? null) &&
      (last?.date ?? null) === (manifest.corpus.lastMessage?.date ?? null),
    detail: `${last?.id ?? '—'} @ ${last?.date ?? '—'}`,
  });

  const unresolved = manifest.completeness.checks.noUnresolvedErrors;
  checks.push({
    name: 'export completeness',
    ok: manifest.completeness.status === 'complete',
    detail: `status=${manifest.completeness.status}; ${manifest.completeness.reasons.join(' ') || 'причин не указано'}`,
  });
  checks.push({
    name: 'no unresolved export errors',
    ok: unresolved,
    detail: unresolved ? 'нет' : 'см. export-state.json',
  });

  return {
    ok: checks.every((check) => check.ok),
    checks,
    manifest,
    messages: parsed.length,
  };
}
