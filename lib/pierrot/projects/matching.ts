import type { PierrotProject } from './types';

export function matchUniqueProjectMention(
  projects: PierrotProject[],
  message: string
): PierrotProject | null {
  const normalized = message.trim().toLocaleLowerCase();
  const matches = projects.filter((project) => {
    const candidates = [project.name, project.slug].filter((value) => value.length >= 3);
    return candidates.some((candidate) => {
      const value = candidate.toLocaleLowerCase();
      if (normalized === value) return true;

      // Match the complete project name/slug, not an arbitrary substring.
      const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'iu').test(message);
    });
  });
  return matches.length === 1 ? matches[0] : null;
}
