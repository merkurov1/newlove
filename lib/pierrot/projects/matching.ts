import type { PierrotProject } from './types';

export function matchUniqueProjectMention(
  projects: PierrotProject[],
  message: string
): PierrotProject | null {
  const normalized = message.toLocaleLowerCase();
  const matches = projects.filter((project) => {
    const candidates = [project.name, project.slug].filter((value) => value.length >= 3);
    return candidates.some((candidate) => {
      const value = candidate.toLocaleLowerCase();
      return normalized === value || normalized.includes(value);
    });
  });
  return matches.length === 1 ? matches[0] : null;
}
