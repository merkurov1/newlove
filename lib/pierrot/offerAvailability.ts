import type { PierrotOfferId } from '@/lib/pierrot/offers';
import { createPierrotStore } from '@/lib/pierrot/serverStore';

export type PierrotOfferRuntime = {
  offerId: PierrotOfferId;
  available: boolean | null;
  priceMinorUnits: number | null;
  currency: 'GBP';
  subscribed: boolean | null;
  source: 'postcards' | 'subscription' | 'unverified';
};

function emptyRuntime(offerId: PierrotOfferId): PierrotOfferRuntime {
  return {
    offerId,
    available: null,
    priceMinorUnits: null,
    currency: 'GBP',
    subscribed: null,
    source: 'unverified',
  };
}

/**
 * Reads only the facts that have an existing authoritative source. Failures
 * degrade to `null` and must be described as unverified, never as available.
 */
export async function loadPierrotOfferRuntime({
  offerId,
  userId,
}: {
  offerId: PierrotOfferId;
  userId?: string | null;
}): Promise<PierrotOfferRuntime> {
  const store = createPierrotStore();

  if (!store) return emptyRuntime(offerId);

  if (offerId === 'heart_angel_postcard') {
    try {
      const { data, error } = await store
        .from('postcards')
        .select('id, price, available, featured')
        .order('featured', { ascending: false });

      if (error) throw error;

      const rows = Array.isArray(data) ? data : [];
      const selected =
        rows.find((row) => row.id === 'postcard_1' && row.available === true) ||
        rows.find((row) => row.featured === true && row.available === true) ||
        rows.find((row) => row.available === true) ||
        null;

      return {
        offerId,
        available: selected ? true : rows.length > 0 ? false : null,
        priceMinorUnits:
          selected && Number.isInteger(selected.price) ? Number(selected.price) : null,
        currency: 'GBP',
        subscribed: null,
        source: 'postcards',
      };
    } catch {
      return emptyRuntime(offerId);
    }
  }

  if (offerId === 'journal_flow') {
    if (!userId) {
      return {
        ...emptyRuntime(offerId),
        source: 'subscription',
      };
    }

    try {
      const { data, error } = await store
        .from('subscribers')
        .select('id')
        .eq('userId', userId)
        .eq('isActive', true)
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      return {
        offerId,
        available: true,
        priceMinorUnits: null,
        currency: 'GBP',
        subscribed: Boolean(data),
        source: 'subscription',
      };
    } catch {
      return {
        ...emptyRuntime(offerId),
        source: 'subscription',
      };
    }
  }

  return emptyRuntime(offerId);
}
