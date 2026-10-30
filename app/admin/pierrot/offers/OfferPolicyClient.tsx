'use client';

import { useEffect, useState } from 'react';

type OfferPolicy = {
  offerId: string;
  enabled: boolean;
  priority: number;
  maxShowsPerConversation: number;
  cooldownTurns: number;
  cooldownSeconds: number;
  minInterestScore: number;
  requiresRepeatedEngagement: boolean;
  allowProactive: boolean;
  recommendationCopy: string | null;
};

const TITLES: Record<string, string> = {
  heart_angel_postcard: 'Heart & Angel postcard',
  unframed: 'UNFRAMED',
  journal_flow: 'Journal / Flow subscription',
  art_engine: 'Art Engine access',
  advising: 'Advising',
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : 'Request failed.');
  }

  return data as T;
}

export default function OfferPolicyClient() {
  const [offers, setOffers] = useState<OfferPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void api<{ offers: OfferPolicy[] }>('/api/admin/pierrot/offers')
      .then((data) => {
        if (!cancelled) setOffers(data.offers || []);
      })
      .catch((requestError: unknown) => {
        if (!cancelled)
          setError(requestError instanceof Error ? requestError.message : 'Load failed.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function update(offerId: string, patch: Partial<OfferPolicy>) {
    setOffers((current) =>
      current.map((offer) => (offer.offerId === offerId ? { ...offer, ...patch } : offer))
    );
  }

  async function save(offer: OfferPolicy) {
    setSaving(offer.offerId);
    setError(null);
    setMessage(null);

    try {
      const data = await api<{ offer: OfferPolicy }>('/api/admin/pierrot/offers', {
        method: 'PATCH',
        body: JSON.stringify({
          offerId: offer.offerId,
          patch: {
            enabled: offer.enabled,
            priority: offer.priority,
            maxShowsPerConversation: offer.maxShowsPerConversation,
            cooldownTurns: offer.cooldownTurns,
            cooldownSeconds: offer.cooldownSeconds,
            minInterestScore: offer.minInterestScore,
            requiresRepeatedEngagement: offer.requiresRepeatedEngagement,
            allowProactive: offer.allowProactive,
            recommendationCopy: offer.recommendationCopy,
          },
        }),
      });

      update(offer.offerId, data.offer);
      setMessage(`${TITLES[offer.offerId] || offer.offerId} saved.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Save failed.');
    } finally {
      setSaving(null);
    }
  }

  if (loading) return <p className="text-sm text-[#89827B]">Loading offer policies…</p>;

  return (
    <div className="space-y-5">
      {error && (
        <p className="border border-[#E7C9D2] bg-[#F8EAF0] px-3 py-2 text-sm text-[#8A1235]">
          {error}
        </p>
      )}
      {message && !error && (
        <p className="border border-[#E5E1DC] bg-[#F8F6F2] px-3 py-2 text-sm text-[#625D58]">
          {message}
        </p>
      )}

      {offers.map((offer) => (
        <section key={offer.offerId} className="border border-[#E5E1DC] bg-white/70 p-4 sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-[#EEE9E4] pb-3">
            <h2 className="font-serif text-xl text-[#211F1F]">
              {TITLES[offer.offerId] || offer.offerId}
            </h2>
            <label className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#625D58]">
              <input
                type="checkbox"
                checked={offer.enabled}
                onChange={(event) => update(offer.offerId, { enabled: event.target.checked })}
                className="h-3.5 w-3.5 accent-[#990F3D]"
              />
              Enabled
            </label>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ['priority', 'Priority'],
              ['maxShowsPerConversation', 'Max shows'],
              ['cooldownTurns', 'Cooldown turns'],
              ['cooldownSeconds', 'Cooldown sec'],
              ['minInterestScore', 'Min interest'],
            ].map(([key, label]) => (
              <label key={key} className="text-[11px] text-[#746D66]">
                {label}
                <input
                  type="number"
                  min={0}
                  value={String(offer[key as keyof OfferPolicy] ?? '')}
                  onChange={(event) =>
                    update(offer.offerId, {
                      [key]: Number(event.target.value),
                    } as Partial<OfferPolicy>)
                  }
                  className="mt-1 w-full border border-[#D9D3CD] bg-[#FDFCFA] px-2 py-1.5 font-mono text-xs text-[#211F1F]"
                />
              </label>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-5">
            <label className="inline-flex items-center gap-2 text-xs text-[#625D58]">
              <input
                type="checkbox"
                checked={offer.allowProactive}
                onChange={(event) =>
                  update(offer.offerId, { allowProactive: event.target.checked })
                }
                className="h-3.5 w-3.5 accent-[#990F3D]"
              />
              Allow proactive recommendation
            </label>
            <label className="inline-flex items-center gap-2 text-xs text-[#625D58]">
              <input
                type="checkbox"
                checked={offer.requiresRepeatedEngagement}
                onChange={(event) =>
                  update(offer.offerId, { requiresRepeatedEngagement: event.target.checked })
                }
                className="h-3.5 w-3.5 accent-[#990F3D]"
              />
              Require repeated engagement
            </label>
          </div>

          <label className="mt-3 block text-[11px] text-[#746D66]">
            Recommendation copy (optional, max 300 chars)
            <textarea
              value={offer.recommendationCopy || ''}
              onChange={(event) =>
                update(offer.offerId, { recommendationCopy: event.target.value || null })
              }
              rows={2}
              maxLength={300}
              className="mt-1 w-full resize-y border border-[#D9D3CD] bg-[#FDFCFA] px-2 py-1.5 text-xs text-[#211F1F]"
            />
          </label>

          <button
            type="button"
            onClick={() => void save(offer)}
            disabled={saving !== null}
            className="mt-3 border border-[#211F1F] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#211F1F] transition hover:bg-[#211F1F] hover:text-white disabled:opacity-40"
          >
            {saving === offer.offerId ? 'Saving…' : 'Save policy'}
          </button>
        </section>
      ))}
    </div>
  );
}
