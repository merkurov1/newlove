import catalog from './krass-catalog.json';
import type { KrassCatalog, KrassItem } from './krass-types';

const data = catalog as KrassCatalog;

export const KRASS_ITEMS: KrassItem[] = [...data.items].sort((a, b) => a.order - b.order);

export const KRASS_BY_ID: Record<string, KrassItem> = Object.fromEntries(
  KRASS_ITEMS.map((item) => [item.id, item])
);

/** A strong, verified Krasnopevtsev poster used for the opening screen. */
export const KRASS_OPENING_ID = '1959-02';

export const KRASS_OPENING_ITEM =
  KRASS_BY_ID[KRASS_OPENING_ID] ?? KRASS_ITEMS.find((item) => item.confidence === 'verified')!;

export function getKrassItem(id: string): KrassItem | undefined {
  return KRASS_BY_ID[id];
}
