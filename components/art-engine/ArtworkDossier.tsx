'use client';

import React from 'react';
import { ArrowUpRight, Loader2 } from 'lucide-react';
import Markdown from 'markdown-to-jsx';
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

function stageTone(
  state: 'done' | 'active' | 'pending' | 'error',
): string {
  if (state === 'done') return 'border-[#CFE0CC] bg-[#F2F7F1] text-[#4F6B4D]';
  if (state === 'active') return 'border-[#D8C8AF] bg-[#FFF9EC] text-[#7A5A28]';
  if (state === 'error') return 'border-[#E7C3BE] bg-[#FCF3F2] text-[#8B4038]';
  return 'border-[#E4DCCF] bg-[#F8F5EF] text-[#8A8175]';
}

function Stage({
  label,
  value,
  state,
}: {
  label: string;
  value: string;
  state: 'done' | 'active' | 'pending' | 'error';
}) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#9A9083]">
        {label}
      </p>
      <p
        className={`mt-1 inline-flex max-w-full truncate rounded-full border px-2 py-1 font-mono text-[8px] uppercase tracking-[0.12em] ${stageTone(state)}`}
      >
        {value}
      </p>
    </div>
  );
}

export default function ArtworkDossier({
  detail,
  action,
  onFindWikipedia,
  onGenerateEssay,
  onRegenerateEssay,
  onPublish,
}: {
  detail: ArtworkDetail;
  action: string | null;
  onFindWikipedia: () => void;
  onGenerateEssay: () => void;
  onRegenerateEssay: () => void;
  onPublish: () => void;
}) {
  const { lot, vault, extracted, attempts, wikipedia, editorial, publication } =
    detail;
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
  const essay = editorial?.current || null;
  const isPublished =
    publication?.status === 'published' ||
    publication?.status === 'update_pending';
  const publishLabel = isPublished ? 'Update Publication' : 'Publish to Selection';
  const canPublish = Boolean(
    essay?.curatorial_essay &&
      image &&
      lot.artist &&
      lot.title,
  );
  const researchLabel =
    wikipedia?.status === 'found'
      ? wikipedia.title || 'Wikipedia found'
      : wikipedia?.status === 'ambiguous'
        ? 'Ambiguous'
        : wikipedia?.status === 'unavailable'
          ? 'Unavailable'
          : wikipedia?.status === 'not_found'
            ? 'Not found'
            : wikipedia?.status === 'skipped'
              ? 'Skipped'
              : 'Not run';

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

      <section className="mb-6 rounded-2xl border border-[#E4DCCF] bg-[#FBF9F5] p-4 sm:p-5">
        <div className="flex flex-col gap-4 border-b border-[#E4DCCF] pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-5">
            <Stage
              label="Parsing"
              value={status === 'ready' ? 'Ready' : status === 'partial' ? 'Partial' : status}
              state={status === 'ready' ? 'done' : status === 'failed' ? 'error' : 'active'}
            />
            <Stage
              label="Research"
              value={researchLabel}
              state={
                wikipedia?.status === 'found'
                  ? 'done'
                  : wikipedia?.status === 'ambiguous' ||
                      wikipedia?.status === 'unavailable'
                    ? 'error'
                    : wikipedia?.status === 'not_found'
                      ? 'active'
                      : 'pending'
              }
            />
            <Stage
              label="Essay"
              value={essay ? `v${essay.version} draft` : editorial?.last_error ? 'Failed' : 'Not generated'}
              state={essay ? 'done' : editorial?.last_error ? 'error' : 'pending'}
            />
            <Stage
              label="Vault"
              value={`Saved${ingestion.extracted_at ? ` · ${formatDate(ingestion.extracted_at)}` : ''}`}
              state="done"
            />
            <Stage
              label="Selection"
              value={
                publication?.status === 'update_pending'
                  ? 'Update pending'
                  : publication?.status === 'published'
                    ? 'Published'
                    : 'Unpublished'
              }
              state={
                publication?.status === 'published'
                  ? 'done'
                  : publication?.status === 'update_pending'
                    ? 'active'
                    : 'pending'
              }
            />
          </div>
        </div>

        <p className="mt-3 font-mono text-[8px] leading-relaxed text-[#8A8175]">
          Parsing, Wikipedia and essay drafts are saved to Vault automatically.
          Nothing is published until you confirm.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onFindWikipedia}
            disabled={action !== null || !lot.artist}
            className="rounded-full border border-[#D8C8AF] bg-white px-3.5 py-2 font-mono text-[9px] uppercase tracking-[0.12em] text-[#625B50] transition hover:border-[#B9AB98] hover:text-[#211F1F] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {action === 'wikipedia' ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 size={12} className="animate-spin" /> Researching
              </span>
            ) : wikipedia?.status === 'found' ? (
              'Refresh Wikipedia'
            ) : (
              'Find Wikipedia'
            )}
          </button>

          {essay ? (
            <button
              type="button"
              onClick={onRegenerateEssay}
              disabled={action !== null || !lot.artist || !lot.title}
              className="rounded-full border border-[#D8C8AF] bg-white px-3.5 py-2 font-mono text-[9px] uppercase tracking-[0.12em] text-[#625B50] transition hover:border-[#B9AB98] hover:text-[#211F1F] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {action === 'regenerate' ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 size={12} className="animate-spin" /> Regenerating
                </span>
              ) : (
                'Regenerate Essay'
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={onGenerateEssay}
              disabled={action !== null || !lot.artist || !lot.title}
              className="rounded-full bg-[#2B2723] px-3.5 py-2 font-mono text-[9px] uppercase tracking-[0.12em] text-[#FAF8F5] transition hover:bg-[#171411] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {action === 'essay' ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 size={12} className="animate-spin" /> Writing
                </span>
              ) : (
                'Generate Essay'
              )}
            </button>
          )}

          <button
            type="button"
            onClick={onPublish}
            disabled={action !== null || !canPublish}
            title={
              canPublish
                ? undefined
                : 'An essay and an original image are required before publication.'
            }
            className="rounded-full bg-[#2B2723] px-3.5 py-2 font-mono text-[9px] uppercase tracking-[0.12em] text-[#FAF8F5] transition hover:bg-[#171411] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {action === 'publish' ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 size={12} className="animate-spin" /> Publishing
              </span>
            ) : (
              publishLabel
            )}
          </button>

          {publication?.slug &&
            (publication.status === 'published' ||
              publication.status === 'update_pending') && (
            <a
              href={`/${publication.slug}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-[#CFE0CC] bg-[#F2F7F1] px-3 py-2 font-mono text-[9px] uppercase tracking-[0.12em] text-[#4F6B4D] hover:border-[#8CA18A]"
            >
              View Selection <ArrowUpRight size={11} />
            </a>
          )}

          {wikipedia?.status === 'found' && wikipedia.url && (
            <a
              href={wikipedia.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-[#E4DCCF] bg-white px-3 py-2 font-mono text-[9px] uppercase tracking-[0.12em] text-[#625B50] hover:border-[#CFC3B1] hover:text-[#211F1F]"
            >
              Wikipedia <ArrowUpRight size={11} />
            </a>
          )}

          {editorial?.last_error && (
            <span className="font-mono text-[9px] leading-relaxed text-[#8B4038]">
              Essay error: {editorial.last_error}
            </span>
          )}
        </div>

        {wikipedia && wikipedia.status !== 'found' && wikipedia.warnings.length > 0 && (
          <div className="mt-3 space-y-1 border-t border-[#E4DCCF] pt-3">
            {wikipedia.warnings.map((warning, index) => (
              <p key={`${warning}-${index}`} className="font-mono text-[9px] leading-relaxed text-[#8A5A2B]">
                ! {warning}
              </p>
            ))}
          </div>
        )}

        {wikipedia?.status === 'ambiguous' && wikipedia.candidates?.length ? (
          <div className="mt-3 border-t border-[#E4DCCF] pt-3">
            <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-[#9A9083]">
              Possible Wikipedia matches — not attached
            </p>
            <ul className="mt-1.5 space-y-1">
              {wikipedia.candidates.slice(0, 3).map((candidate) => (
                <li key={candidate.title} className="font-mono text-[9px] text-[#625B50]">
                  {candidate.url ? (
                    <a
                      href={candidate.url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline decoration-[#B9AB98] underline-offset-2"
                    >
                      {candidate.title}
                    </a>
                  ) : (
                    candidate.title
                  )}
                  {candidate.description ? ` — ${candidate.description}` : ''}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

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

        {(detail.extraction.artistDates || extracted.artist_dates) && (
          <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-[#8A8175]">
            {detail.extraction.artistDates || extracted.artist_dates}
          </p>
        )}

        <h2 className="mt-2 font-serif text-[1.25rem] italic leading-snug text-[#4A443D] sm:text-[1.55rem]">
          {lot.title || 'Title not extracted'}
          {lot.year ? <span className="not-italic text-[#8A8175]"> ({lot.year})</span> : null}
        </h2>
      </div>

      {essay?.curatorial_essay && (
        <div className="mx-auto max-w-2xl px-4 pt-8 sm:px-6 sm:pt-10">
          <div className="border-t border-[#D9CEC0] pt-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#9A9083]">
                Curatorial essay
              </h3>
              <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-[#8A8175]">
                v{essay.version}
                {essay.model ? ` · ${essay.model}` : ''}
              </span>
            </div>
            <div className="prose prose-sm mt-4 max-w-none font-serif text-[1rem] leading-[1.8] text-[#37332D] sm:prose-base sm:text-[1.08rem]">
              <Markdown>{essay.curatorial_essay}</Markdown>
            </div>
            {essay.sources_used.length > 0 && (
              <div className="mt-5 border-t border-[#ECE6DC] pt-3">
                <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-[#9A9083]">
                  Sources used
                </p>
                <ul className="mt-1.5 space-y-1">
                  {essay.sources_used.map((source) => (
                    <li key={source} className="break-all font-mono text-[9px] text-[#625B50]">
                      {source}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {wikipedia?.status === 'found' && wikipedia.extract && (
        <div className="mx-auto max-w-2xl px-4 pt-8 sm:px-6 sm:pt-10">
          <details className="group rounded-xl border border-[#E4DCCF] bg-[#FBF9F5] p-4">
            <summary className="cursor-pointer list-none font-mono text-[9px] uppercase tracking-[0.16em] text-[#625B50] marker:hidden">
              Artist context · Wikipedia
              <span className="ml-2 text-[#9A9083] group-open:hidden">+</span>
              <span className="ml-2 hidden text-[#9A9083] group-open:inline">−</span>
            </summary>
            <p className="mt-3 max-h-64 overflow-y-auto whitespace-pre-line font-serif text-sm leading-relaxed text-[#4A443D]">
              {wikipedia.extract}
            </p>
            {wikipedia.url && (
              <a
                href={wikipedia.url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block font-mono text-[9px] uppercase tracking-[0.12em] text-[#625B50] underline decoration-[#B9AB98] underline-offset-2"
              >
                Wikipedia article ↗
              </a>
            )}
          </details>
        </div>
      )}

      {extracted.description && (
        <div className="mx-auto max-w-2xl px-4 pt-8 sm:px-6 sm:pt-10">
          <h3 className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#9A9083]">
            Auction house description
          </h3>
          <p className="mt-3 whitespace-pre-line font-serif text-[1rem] leading-[1.75] text-[#37332D] sm:text-[1.08rem]">
            {extracted.description}
          </p>
        </div>
      )}

      {extracted.lot_essay && (
        <div className="mx-auto max-w-2xl px-4 pt-8 sm:px-6 sm:pt-10">
          <h3 className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#9A9083]">
            Lot essay
          </h3>
          <p className="mt-3 whitespace-pre-line font-serif text-[1rem] leading-[1.75] text-[#37332D] sm:text-[1.08rem]">
            {extracted.lot_essay}
          </p>
        </div>
      )}

      {extracted.catalogue_note && (
        <div className="mx-auto max-w-2xl px-4 pt-8 sm:px-6 sm:pt-10">
          <h3 className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#9A9083]">
            Catalogue note
          </h3>
          <p className="mt-3 whitespace-pre-line font-serif text-[1rem] leading-[1.75] text-[#37332D] sm:text-[1.08rem]">
            {extracted.catalogue_note}
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

      {(extracted.condition_report ||
        extracted.condition_report_status === 'login-required') && (
        <div className="mx-auto max-w-2xl px-4 pt-8 sm:px-6 sm:pt-10">
          <div className="border-t border-[#D9CEC0] pt-6">
            <h3 className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#9A9083]">
              Condition
            </h3>
            {extracted.condition_report ? (
              <p className="mt-2 whitespace-pre-line font-serif text-sm leading-relaxed text-[#4A443D]">
                {extracted.condition_report}
              </p>
            ) : (
              <p className="mt-2 font-serif text-sm italic leading-relaxed text-[#625B50]">
                The auction house provides the condition report on request / behind login.
              </p>
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
