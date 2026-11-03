'use client';

import React from 'react';
import { RefreshCw } from 'lucide-react';
import type {
  AttemptSummary,
  VaultFilter,
  VaultLot,
} from './types';

function statusTone(status?: string | null): string {
  if (status === 'ready') {
    return 'border-[#CFE0CC] bg-[#F2F7F1] text-[#4F6B4D]';
  }
  if (status === 'partial') {
    return 'border-[#E7CFA9] bg-[#FFF9EC] text-[#7A5A28]';
  }
  if (status === 'failed') {
    return 'border-[#E7C3BE] bg-[#FCF3F2] text-[#8B4038]';
  }
  return 'border-[#E4DCCF] bg-[#F8F5EF] text-[#6B6358]';
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function dateOf(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function imageUrl(imagePath?: string | null): string | null {
  if (!imagePath) return null;
  if (/^https?:\/\//i.test(imagePath)) return imagePath;
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  return base
    ? `${base}/storage/v1/object/public/artifacts/${imagePath}`
    : null;
}

const FILTERS: Array<{ id: VaultFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'ready', label: 'Ready' },
  { id: 'partial', label: 'Partial' },
  { id: 'failed', label: 'Failed' },
  { id: 'attention', label: 'Needs attention' },
];

export default function VaultPanel({
  lots,
  attempts,
  loading,
  error,
  filter,
  onFilterChange,
  onOpenLot,
  onOpenAttempt,
  onRefresh,
}: {
  lots: VaultLot[];
  attempts: AttemptSummary[];
  loading: boolean;
  error: string;
  filter: VaultFilter;
  onFilterChange: (filter: VaultFilter) => void;
  onOpenLot: (id: string) => void;
  onOpenAttempt: (attempt: AttemptSummary) => void;
  onRefresh: () => void;
}) {
  const filteredLots = lots.filter((lot) => {
    const status = lot.ingestion_status || '';
    if (filter === 'ready') return status === 'ready';
    if (filter === 'partial') return status === 'partial';
    if (filter === 'failed') return false;
    if (filter === 'attention') {
      return (
        status === 'partial' ||
        (lot.warnings?.length || 0) > 0 ||
        (lot.missing_fields?.length || 0) > 0
      );
    }
    return true;
  });

  const filteredAttempts = attempts.filter((attempt) => {
    if (filter === 'ready') return attempt.status === 'ready';
    if (filter === 'partial') return attempt.status === 'partial';
    if (filter === 'failed') return attempt.status === 'failed';
    if (filter === 'attention') {
      return attempt.status === 'failed' || (attempt.warnings?.length || 0) > 0;
    }
    return true;
  });

  const attentionCount =
    lots.filter(
      (lot) =>
        lot.ingestion_status === 'partial' ||
        (lot.warnings?.length || 0) > 0 ||
        (lot.missing_fields?.length || 0) > 0,
    ).length +
    attempts.filter((attempt) => attempt.status === 'failed').length;

  return (
    <div className="pb-10">
      <div className="flex flex-col gap-4 border-b border-[#E4DCCF] pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#9A9083]">
            Private workspace
          </p>
          <h2 className="mt-1 font-serif text-3xl text-[#211F1F]">Vault</h2>
          <p className="mt-1 max-w-xl font-serif text-sm leading-relaxed text-[#6B6358]">
            Every processed lot and every parser attempt. Failed attempts are kept.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#8A8175]">
            {lots.length} works · {attempts.length} attempts
            {attentionCount > 0 ? ` · ${attentionCount} need attention` : ''}
          </span>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Refresh Vault"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[#E4DCCF] bg-white text-[#625B50] transition hover:border-[#CFC3B1] hover:text-[#211F1F] disabled:opacity-40"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onFilterChange(item.id)}
            className={`rounded-full border px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] transition ${
              filter === item.id
                ? 'border-[#2B2723] bg-[#2B2723] text-[#FAF8F5]'
                : 'border-[#E4DCCF] bg-white text-[#625B50] hover:border-[#CFC3B1] hover:text-[#211F1F]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-6 rounded-2xl border border-[#E7C3BE] bg-[#FCF3F2] px-4 py-3 font-mono text-[10px] text-[#8B4038]">
          {error}
        </div>
      )}

      {loading && lots.length === 0 && attempts.length === 0 ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-64 animate-pulse rounded-2xl border border-[#E4DCCF] bg-white/70"
            />
          ))}
        </div>
      ) : (
        <>
          <section className="mt-8">
            <h3 className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#9A9083]">
              Works
            </h3>

            {filteredLots.length === 0 ? (
              <p className="mt-3 border border-dashed border-[#D9CEC0] bg-white/60 px-4 py-8 text-center font-serif text-sm text-[#8A8175]">
                No works match this filter.
              </p>
            ) : (
              <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredLots.map((lot) => {
                  const src = imageUrl(lot.image_path);
                  const status = lot.ingestion_status || 'legacy';
                  const warningCount = lot.warnings?.length || 0;

                  return (
                    <button
                      key={lot.id}
                      type="button"
                      onClick={() => onOpenLot(lot.id)}
                      className="group flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[#E4DCCF] bg-white text-left shadow-[0_2px_10px_rgba(75,62,45,0.04)] transition hover:border-[#CFC3B1] hover:shadow-[0_8px_24px_rgba(75,62,45,0.08)]"
                    >
                      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-[#FBF9F5] p-3">
                        {src ? (
                          <img
                            src={src}
                            alt={lot.title || lot.artist}
                            className="max-h-full max-w-full object-contain transition duration-500 group-hover:scale-[1.02]"
                            loading="lazy"
                          />
                        ) : (
                          <span className="font-serif text-2xl text-[#C9BDAE]">
                            {lot.artist?.slice(0, 1) || 'A'}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-1 flex-col gap-3 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span
                            className={`rounded-full border px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.14em] ${statusTone(status)}`}
                          >
                            {status}
                          </span>
                          <span className="font-mono text-[9px] text-[#8A8175]">
                            {dateOf(lot.created_at)}
                          </span>
                        </div>

                        <div className="min-w-0">
                          <p className="truncate font-serif text-lg text-[#211F1F]">
                            {lot.artist || 'Artist not extracted'}
                          </p>
                          <p className="mt-0.5 line-clamp-2 font-serif text-sm italic leading-snug text-[#6B6358]">
                            {lot.title || 'Title not extracted'}
                            {lot.year ? ` (${lot.year})` : ''}
                          </p>
                        </div>

                        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-[#F0EBE3] pt-2 font-mono text-[8px] uppercase tracking-[0.12em] text-[#8A8175]">
                          <span className="truncate">
                            {lot.auction_house || 'Auction'}
                          </span>
                          {warningCount > 0 && (
                            <span className="text-[#8A5A2B]">
                              {warningCount} warning{warningCount === 1 ? '' : 's'}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="mt-10">
            <h3 className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#9A9083]">
              Attempts
            </h3>

            {filteredAttempts.length === 0 ? (
              <p className="mt-3 border border-dashed border-[#D9CEC0] bg-white/60 px-4 py-8 text-center font-serif text-sm text-[#8A8175]">
                No attempts match this filter.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-[#ECE6DC] rounded-2xl border border-[#E4DCCF] bg-white">
                {filteredAttempts.map((attempt) => (
                  <li key={attempt.id}>
                    <button
                      type="button"
                      onClick={() => onOpenAttempt(attempt)}
                      className="flex w-full flex-col gap-2 px-4 py-3 text-left transition hover:bg-[#FBF9F5] sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <span
                          className={`mt-0.5 shrink-0 rounded-full border px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.14em] ${statusTone(attempt.status)}`}
                        >
                          {attempt.status}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-mono text-[10px] text-[#4A443D]">
                            {attempt.parsed_title || domainOf(attempt.url)}
                          </p>
                          <p className="mt-0.5 truncate font-mono text-[8px] uppercase tracking-[0.12em] text-[#9A9083]">
                            {domainOf(attempt.url)}
                            {attempt.parser ? ` · ${attempt.parser}` : ''}
                            {attempt.error_message ? ` · ${attempt.error_message}` : ''}
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 font-mono text-[9px] text-[#8A8175]">
                        {dateOf(attempt.created_at)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
