
const SENSITIVE_KEY =
  /password|passwd|secret|token|authorization|cookie|session|api[_-]?key|private[_-]?key|access[_-]?key|refresh[_-]?token|email|phone|mobile|telegram[_-]?id|ip[_-]?address|recipient|subscriber/i;

const EXCLUDED_TABLE =
  /^(sessions|session|verificationtokens|subscriber_tokens|accounts|messages|newsletter_logs|revalidation_audit|subscribers_backup_.*|user_roles|roles|access_requests|bot_sessions|temple_users)$/i;

export function shouldExcludeTable(tableName: string): boolean {
  return EXCLUDED_TABLE.test(tableName.replace(/^public\./i, ''));
}

export function sanitizeForModel(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeForModel);

  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};

    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(key)) continue;
      output[key] = sanitizeForModel(child);
    }

    return output;
  }

  if (typeof value === 'string') {
    return value
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
      .replace(/\b(?:\+?\d[\d ()-]{7,}\d)\b/g, '[phone]')
      .replace(/\b(?:sk|pk|api|rk|sbp)[-_][A-Za-z0-9_-]{16,}\b/gi, '[secret]')
      .replace(/\bBearer\s+[A-Za-z0-9._-]{16,}/gi, 'Bearer [secret]')
      .slice(0, 12_000);
  }

  return value;
}

export function getTextFromRow(row: Record<string, unknown>): string {
  return JSON.stringify(sanitizeForModel(row), null, 2).slice(0, 12_000);
}

export function isTextFile(path: string, mimeType?: string | null): boolean {
  const extension = path.split('.').pop()?.toLowerCase() || '';

  const textExtensions = new Set([
    'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'jsonl',
    'xml', 'html', 'htm', 'yaml', 'yml', 'log', 'sql', 'rtf',
  ]);

  if (textExtensions.has(extension)) return true;

  return Boolean(
    mimeType &&
    (/^text\//i.test(mimeType) || /json|xml|yaml|javascript/i.test(mimeType)),
  );
}
