import type { PierrotProject } from './types';

function normalize(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();
}

function compact(value: string): string {
  return normalize(value).replace(/[^\p{L}\p{N}]+/gu, '');
}

/**
 * Aliases are derived from the existing canonical name/slug. No alias creates
 * a new project or changes the stored slug; it only improves recognition of
 * spellings such as “heartandangel”, “Heart & Angel” and “heart-and-angel”.
 */
export function projectAliases(project: Pick<PierrotProject, 'name' | 'slug'>): string[] {
  const name = normalize(project.name);
  const slug = normalize(project.slug);
  const candidates = [
    name,
    slug,
    name.replace(/\s*&\s*/g, '&'),
    name.replace(/&/g, ' and '),
    name.replace(/&/g, ' '),
    name.replace(/&/g, ''),
    slug.replace(/-/g, ' '),
    slug.replace(/-/g, ''),
    compact(name),
    compact(slug),
  ]
    .map((value) => value.replace(/\s+/g, ' ').trim())
    .filter((value) => value.length >= 3);

  return Array.from(new Set(candidates));
}

export function projectMatchesRef(
  project: Pick<PierrotProject, 'name' | 'slug'>,
  ref: string
): boolean {
  const value = normalize(ref);
  if (!value) return false;
  return projectAliases(project).some((alias) => alias === value || compact(alias) === compact(value));
}

function matchesMention(project: PierrotProject, message: string): boolean {
  for (const alias of projectAliases(project)) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'iu').test(message)) {
      return true;
    }
  }
  return false;
}

export function matchUniqueProjectMention(
  projects: PierrotProject[],
  message: string
): PierrotProject | null {
  const matches = projects.filter((project) => matchesMention(project, message));
  return matches.length === 1 ? matches[0] : null;
}
