import { createHash } from 'node:crypto';

import type { BrainEntityType, BrainRelationType } from './types';

export const BRAIN_ENTITY_TYPES: BrainEntityType[] = [
  'person',
  'organization',
  'publication',
  'country',
  'city',
  'technology',
  'artwork',
  'art_project',
  'event',
  'concept',
  'theme',
];

export const BRAIN_RELATION_TYPES: BrainRelationType[] = [
  'authored_by',
  'published_in',
  'mentions',
  'discusses',
  'related_to',
  'created_by',
  'part_of',
  'occurred_in',
  'contradicts',
  'develops',
  'references',
];

const ENTITY_ALIASES: Record<string, BrainEntityType> = {
  person: 'person',
  people: 'person',
  author: 'person',
  writer: 'person',
  artist: 'person',
  creator: 'person',
  organization: 'organization',
  organisation: 'organization',
  org: 'organization',
  company: 'organization',
  institution: 'organization',
  publisher: 'organization',
  publication: 'publication',
  magazine: 'publication',
  newspaper: 'publication',
  journal: 'publication',
  media: 'publication',
  country: 'country',
  nation: 'country',
  city: 'city',
  place: 'city',
  technology: 'technology',
  tech: 'technology',
  tool: 'technology',
  model: 'technology',
  software: 'technology',
  artwork: 'artwork',
  art: 'artwork',
  painting: 'artwork',
  film: 'artwork',
  book: 'artwork',
  art_project: 'art_project',
  project: 'art_project',
  initiative: 'art_project',
  event: 'event',
  exhibition: 'event',
  occurrence: 'event',
  concept: 'concept',
  idea: 'concept',
  subject: 'concept',
  topic: 'concept',
  theme: 'theme',
  motif: 'theme',
  pattern: 'theme',
};

const RELATION_ALIASES: Record<string, BrainRelationType> = {
  authored_by: 'authored_by',
  written_by: 'authored_by',
  author_of: 'authored_by',
  published_in: 'published_in',
  appeared_in: 'published_in',
  mentions: 'mentions',
  mentioned_in: 'mentions',
  discusses: 'discusses',
  discussed_in: 'discusses',
  about: 'discusses',
  related_to: 'related_to',
  related: 'related_to',
  connected_to: 'related_to',
  associated_with: 'related_to',
  created_by: 'created_by',
  creator: 'created_by',
  made_by: 'created_by',
  part_of: 'part_of',
  belongs_to: 'part_of',
  member_of: 'part_of',
  occurred_in: 'occurred_in',
  happened_in: 'occurred_in',
  took_place_in: 'occurred_in',
  contradicts: 'contradicts',
  conflicts_with: 'contradicts',
  opposes: 'contradicts',
  develops: 'develops',
  extends: 'develops',
  elaborates: 'develops',
  builds_on: 'develops',
  references: 'references',
  cites: 'references',
  cited_by: 'references',
  links_to: 'references',
};

export function normalizeEntityType(value: unknown): BrainEntityType | null {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  if (!raw) return null;

  return ENTITY_ALIASES[raw] ?? null;
}

export function normalizeRelationType(value: unknown): BrainRelationType | null {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  if (!raw) return null;

  return RELATION_ALIASES[raw] ?? null;
}

export function normalizeEntityName(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[’'`]/g, '')
    .replace(/[^\p{L}\p{N}\s&/+.-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\-+/&]+|[.\-+/&]+$/g, '')
    .trim()
    .slice(0, 300);
}

export function cleanEntityName(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.,;:!?()[\]{}"“”'‘’—–-]+|[\s.,;:!?()[\]{}"“”'‘’—–-]+$/g, '')
    .trim()
    .slice(0, 300);
}

export function entityId(type: BrainEntityType, normalizedName: string): string {
  return `ent_${createHash('sha256').update(`${type}|${normalizedName}`, 'utf8').digest('hex').slice(0, 32)}`;
}

export function relationshipId(input: {
  sourceEntityId: string;
  targetEntityId: string;
  relationType: string;
  chunkId: string;
}): string {
  return `rel_${createHash('sha256')
    .update(
      `${input.sourceEntityId}|${input.targetEntityId}|${input.relationType}|${input.chunkId}`,
      'utf8'
    )
    .digest('hex')
    .slice(0, 32)}`;
}

export function clampConfidence(value: unknown, fallback = 0.5): number {
  const number = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(number)) return fallback;

  return Math.min(1, Math.max(0, Number(number.toFixed(3))));
}

export function safeText(value: unknown, maxChars: number): string | null {
  if (typeof value !== 'string') return null;

  const text = value.replace(/\s+/g, ' ').trim();

  if (!text) return null;

  return text.slice(0, maxChars);
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length !== right.length || left.length === 0) return 0;

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }

  if (leftNorm === 0 || rightNorm === 0) return 0;

  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

export function redactQuestion(value: string): string {
  return value
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email]')
    .replace(/(?:\+?\d[\s()-]?){9,}\d/g, '[phone]')
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}
