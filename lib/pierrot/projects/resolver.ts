import { getPierrotProject, listPierrotProjects } from './store';
import type { PierrotProject } from './types';

const EXPLICIT =
  /(?:верн(?:и|ёмся)|работаем|работать|делаем|перейд(?:и|ём))\s+(?:к|над|на)?\s*([\p{L}0-9][\p{L}0-9 &_-]{1,80})|(?:let['’]s\s+(?:work\s+on|return\s+to))\s+([\p{L}0-9][\p{L}0-9 &_-]{1,80})/iu;

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
  if (input.conversationProject) return { project: input.conversationProject, ambiguous: false };
  const match = input.message?.match(EXPLICIT);
  if (!match) return { project: null, ambiguous: false };
  const projects = await listPierrotProjects(input.ownerUserId);
  const needle = (match[1] || match[2]).trim().toLowerCase();
  const matches = projects.filter(
    (project) => project.name.toLowerCase() === needle || project.slug === needle
  );
  return { project: matches.length === 1 ? matches[0] : null, ambiguous: matches.length > 1 };
}
