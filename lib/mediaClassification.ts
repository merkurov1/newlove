import type { MediaRecord, PublicMediaRelation } from '@/data/media';

const REPRINT_RELATION_TYPES = new Set(['reprint', 'syndication']);

/**
 * A directional relation stores the original as `source` and the reprint as
 * `target`. The public mapper exposes the other record with a role, so a
 * reprint record points at its original with role="original".
 */
export function originalMediaRelation(record: MediaRecord): PublicMediaRelation | undefined {
  return (record.related || []).find(
    (relation) =>
      REPRINT_RELATION_TYPES.has(relation.relationType) && relation.role === 'original'
  );
}

export function reprintMediaRelations(record: MediaRecord): PublicMediaRelation[] {
  return (record.related || []).filter(
    (relation) => REPRINT_RELATION_TYPES.has(relation.relationType) && relation.role === 'reprint'
  );
}

export function isMediaReprint(record: MediaRecord): boolean {
  return Boolean(originalMediaRelation(record));
}
