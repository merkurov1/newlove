import { createHash } from 'crypto';

export function projectSlugBase(value: string): string {
  const normalized = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const ascii = normalized
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  if (ascii) return ascii;
  return `project-${createHash('sha256').update(value).digest('hex').slice(0, 10)}`;
}

export function uniqueProjectSlug(name: string, existingSlugs: Iterable<string>): string {
  const base = projectSlugBase(name);
  const used = new Set(existingSlugs);
  if (!used.has(base)) return base;
  for (let index = 2; index < 10_000; index += 1) {
    const suffix = `-${index}`;
    const candidate = `${base.slice(0, 80 - suffix.length)}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error('PROJECT_SLUG_UNAVAILABLE');
}
