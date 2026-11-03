'use client';

import React from 'react';
import type { ArtworkDetail } from './types';

function formatDate(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function lines(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function SpecRow({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  if (!value) return null;

  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-4 border-b border-[#ECE6DC] py-2.5 last:border-0">
      <dt className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#9A9083]">
        {label}
      </dt>
      <dd className="min-w-0 font-mono text-[11px] leading-relaxed text-[#4A443D]">
        {value}
      </dd>
    </div>
  );
}

export default function ArtworkDossier({ detail }: { detail: ArtworkDetail }) {
  const { lot, vault, extracted, attempts } = detail;
  const ingestion = vault.ingestion || {};
  const image =
    vault.image?.publicUrl ||
    vault.image?.originalUrl ||
    lot.image_url ||
    null;
  const status = ingestion.status || 'unknown';
  const warnings = ingestion.warnings || [];
  const missing = ingestion.missing_fields || [];
  const provenance =
    extracted.provenance.length > 0
      ? extracted.provenance
      : lines(lot.provenance);
  const isPartial = status === 'partial' || warnings.length > 0 || missing.length > 0;

  return (
    <article className="pb-10">
      {isPartial && (
        <div className="mx-auto mb-6 flex max-w-3xl items-start gap-3 rounded-2xl border border-[#E7CFA9] bg-[#FFF9EC] px-4 py-3 text-[#72552A]">
          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#C08A3E]" />
          <div className="min-w-0">
            <p className="font-mono text-[9px] uppercase tracking-[0.16em]">
              {status === 'partial' ? 'Partial extraction' : 'Review before publication'}
            </p>
            <p className="mt-1 font-serif text-sm leading-relaxed">
              {missing.length > 0
                ? `Missing fields: ${missing.join(', ')}. Nothing was guessed.`
                : 'The extraction completed with warnings. Review the record before it is used for publication.'}
            </p>
          </div>
        </div>
      )}

      <div className="bg-white">
        {image ? (
          <div className="mx-auto flex max-w-7xl items-center justify-center px-4 py-6 sm:px-8 sm:py-10">
            {/* Auction-house original only. No museum or stock substitution. */}
            <img
              src={image}
              alt={lot.title || lot.artist || 'Artwork'}
              className="max-h-[56vh] w-full object-contain sm:max-h-[70vh]"
            />
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl items-center justify-center border border-dashed border-[#D9CEC0] bg-[#FBF9F5] px-6 py-24 text-center">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#9A9083]">
                No original image
              </p>
              <p className="mt-2 font-serif text-lg text-[#625B50]">
                The auction house did not expose a usable original image.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="mx-auto max-w-3xl px-4 pt-8 text-center sm:px-6 sm:pt-12">
        <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#9A9083]">
          {lot.auction_house || ingestion.house || 'Auction house'}
          {extracted.lot_number || lot.external_id
            ? ` · Lot ${extracted.lot_number || lot.external_id}`
            : ''}
        </p>

        <h1 className="mt-3 font-serif text-[2rem] leading-tight text-black sm:text-[2.7rem]">
          {lot.artist || 'Artist not extracted'}
        </h1>

        <h2 className="mt-2 font-serif text-[1.25rem] italic leading-snug text-[#4A443D] sm:text-[1.55rem]">
          {lot.title || 'Title not extracted'}
          {lot.year ? <span className="not-italic text-[#8A8175]"> ({lot.year})</span> : null}
        </h2>
      </div>

      {extracted.description && (
        <div className="mx-auto max-w-2xl px-4 pt-8 sm:px-6 sm:pt-10">
          <p className="whitespace-pre-line font-serif text-[1rem] leading-[1.75] text-[#37332D] sm:text-[1.08rem]">
            {extracted.description}
          </p>
        </div>
      )}

      <div className="mx-auto max-w-2xl px-4 pt-8 sm:px-6 sm:pt-10">
        <div className="border-t border-[#D9CEC0] pt-4">
          <dl>
            <SpecRow label="Medium" value={lot.medium} />
            <SpecRow label="Dimensions" value={lot.dimensions} />
            <SpecRow label="Signature" value={extracted.signature} />
            <SpecRow label="Auction" value={lot.auction_house} />
            <SpecRow
              label="Auction date"
              value={formatDate(lot.auction_date || extracted.auction_date)}
            />
            <SpecRow
              label="Estimate"
              value={lot.estimate || extracted.estimate_raw}
            />
            <SpecRow
              label="Price realized"
              value={lot.price_realized || extracted.price_realized_raw}
            />
            <SpecRow label="Currency" value={lot.currency} />
          </dl>
        </div>
      </div>

      {(provenance.length > 0 ||
        extracted.exhibitions.length > 0 ||
        extracted.literature.length > 0) && (
        <div className="mx-auto max-w-2xl px-4 pt-8 sm:px-6 sm:pt-10">
          <div className="space-y-7 border-t border-[#D9CEC0] pt-6">
            {provenance.length > 0 && (
              <section>
                <h3 className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#9A9083]">
                  Provenance
                </h3>
                <ul className="mt-2 space-y-1.5 font-serif text-sm leading-relaxed text-[#4A443D]">
                  {provenance.map((item, index) => (
                    <li key={`${item}-${index}`}>{item}</li>
                  ))}
                </ul>
              </section>
            )}

            {extracted.exhibitions.length > 0 && (
              <section>
                <h3 className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#9A9083]">
                  Exhibitions
                </h3>
                <ul className="mt-2 space-y-1.5 font-serif text-sm leading-relaxed text-[#4A443D]">
                  {extracted.exhibitions.map((item, index) => (
                    <li key={`${item}-${index}`}>{item}</li>
                  ))}
                </ul>
              </section>
            )}

            {extracted.literature.length > 0 && (
              <section>
                <h3 className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#9A9083]">
                  Literature
                </h3>
                <ul className="mt-2 space-y-1.5 font-serif text-sm leading-relaxed text-[#4A443D]">
                  {extracted.literature.map((item, index) => (
                    <li key={`${item}-${index}`}>{item}</li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      )}

      <div className="mx-auto max-w-2xl px-4 pt-10 sm:px-6">
        <div className="rounded-2xl border border-[#E4DCCF] bg-[#FBF9F5] p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E4DCCF] pb-3">
            <span className="inline-flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.16em] text-[#625B50]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#8CA18A]" />
              Extraction record
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#8A8175]">
              {status}
            </span>
          </div>

          <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <dt className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#9A9083]">
                Parser
              </dt>
              <dd className="font-mono text-[10px] text-[#4A443D]">
                {ingestion.parser || '—'}
                {ingestion.parser_version ? ` v${ingestion.parser_version}` : ''}
              </dd>
            </div>
            <div>
              <dt className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#9A9083]">
                Attempt
              </dt>
              <dd className="font-mono text-[10px] text-[#4A443D]">
                {ingestion.attempt_id
                  ? String(ingestion.attempt_id).slice(0, 8)
                  : '—'}
              </dd>
            </div>
            <div>
              <dt className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#9A9083]">
                Image
              </dt>
              <dd className="font-mono text-[10px] text-[#4A443D]">
                {vault.image?.availability || 'unknown'}
                {vault.image?.width && vault.image?.height
                  ? ` · ${vault.image.width}×${vault.image.height}`
                  : ''}
              </dd>
            </div>
            <div>
              <dt className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#9A9083]">
                Image rights
              </dt>
              <dd className="font-mono text-[10px] text-[#4A443D]">
                {vault.image?.rights?.publication || 'unreviewed'}
              </dd>
            </div>
          </dl>

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-[#E4DCCF] pt-3">
            {lot.source_url && (
              <a
                href={lot.source_url}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#625B50] underline decoration-[#B9AB98] underline-offset-4 hover:text-black"
              >
                Original catalog ↗
              </a>
            )}
            {vault.image?.originalUrl && (
              <a
                href={vault.image.originalUrl}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#625B50] underline decoration-[#B9AB98] underline-offset-4 hover:text-black"
              >
                Original image ↗
              </a>
            )}
          </div>

          {warnings.length > 0 && (
            <div className="mt-4 space-y-1.5 border-t border-[#E4DCCF] pt-3">
              {warnings.map((warning, index) => (
                <p key={`${warning}-${index}`} className="font-mono text-[9px] leading-relaxed text-[#8A5A2B]">
                  ! {warning}
                </p>
              ))}
            </div>
          )}

          {missing.length > 0 && (
            <p className="mt-3 font-mono text-[9px] leading-relaxed text-[#8A8175]">
              Missing: {missing.join(', ')}
            </p>
          )}
        </div>
      </div>

      {attempts.length > 0 && (
        <div className="mx-auto max-w-2xl px-4 pt-8 sm:px-6">
          <h3 className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#9A9083]">
            Attempt history
          </h3>
          <ul className="mt-3 space-y-2">
            {attempts.slice(0, 8).map((attempt) => (
              <li
                key={attempt.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-[#ECE6DC] py-2 last:border-0"
              >
                <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#625B50]">
                  {attempt.status}
                </span>
                <span className="font-mono text-[9px] text-[#8A8175]">
                  {formatDate(attempt.created_at)}
                  {attempt.parser ? ` · ${attempt.parser}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
