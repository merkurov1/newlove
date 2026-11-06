import { getPierrotProject, listPierrotProjects } from './store';
import { matchUniqueProjectMention } from './matching';
import type { PierrotProject } from './types';
export { matchUniqueProjectMention } from './matching';

const EXPLICIT =
  /(?:верн(?:и|ёмся)|работаем|работать|делаем|перейд(?:и|ём)|продолж(?:им|аем))\s+(?:к|над|на|с)?\s*([\p{L}0-9][\p{L}0-9 &_-]{1,80})|(?:let['’]s\s+(?:work\s+on|return\s+to|continue))\s+([\p{L}0-9][\p{L}0-9 &_-]{1,80})/iu;

const CORRECTION =
  /^(?:нет|не\s+то|это\s+не|я\s+(?:имел|имела|имею)\s+в\s+виду|это\s+касается|относится\s+к|это\s+про|нет[,!]?\s+это)/i;

export async function resolvePierrotProject(input: {
  ownerUserId: string;
  explicitProjectId?: string | null;
  conversationProject?: PierrotProject | null;
  message?: string;
}): Promise<{ project: PierrotProject | null; ambiguous: boolean }> {
  if (input.explicitProjectId)
    return {
      project: await getPierrotProject(input.ownerUserId, input.explicitProjectId),
      ambiguous: false,
    };

  const message = input.message || '';
  const correction = CORRECTION.test(message.trim());
  // A correction like «Нет, это Art Engine, а не Heart & Angel» must win over
  // the previous conversation project. Otherwise the owner cannot repair a
  // wrong classification.
  if (input.conversationProject && !correction) {
    return { project: input.conversationProject, ambiguous: false };
  }

  const projects = await listPierrotProjects(input.ownerUserId);

  if (correction) {
    const mentioned = matchUniqueProjectMention(projects, message);
    if (mentioned) return { project: mentioned, ambiguous: false };
    // Prefer the first project named after an explicit correction marker over
    // ending up with no context at all.
    const afterMarker = message.replace(CORRECTION, ' ').trim();
    const first = projects
      .filter((project) => new RegExp(escapeProjectName(project.name), 'iu').test(afterMarker))
      .sort((a, b) => afterMarker.indexOf(a.name) - afterMarker.indexOf(b.name))[0];
    if (first) return { project: first, ambiguous: false };
  }

  const mentioned = matchUniqueProjectMention(projects, message);
  if (mentioned) return { project: mentioned, ambiguous: false };

  const match = message.match(EXPLICIT);
  if (!match) return { project: null, ambiguous: false };

  const needle = (match[1] || match[2]).trim().toLowerCase();
  const matches = projects.filter(
    (project) => project.name.toLowerCase() === needle || project.slug === needle
  );
  return { project: matches.length === 1 ? matches[0] : null, ambiguous: matches.length > 1 };
}

function escapeProjectName(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
