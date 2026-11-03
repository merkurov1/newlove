'use client';

import React, { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import Markdown from 'markdown-to-jsx';
import type { ArtworkDetail } from './types';

function displayDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function imageUrl(detail: ArtworkDetail): string | null {
  return (
    detail.vault.image?.publicUrl ||
    detail.vault.image?.originalUrl ||
    detail.lot.image_url ||
    null
  );
}

export default function PublishPreview({
  detail,
  publishing,
  error,
  onClose,
  onConfirm,
}: {
  detail: ArtworkDetail;
  publishing: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const essay = detail.editorial?.current?.curatorial_essay || '';
  const image = imageUrl(detail);
  const isUpdate =
    detail.publication?.status === 'published' ||
    detail.publication?.status === 'update_pending';

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !publishing) onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, publishing]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/30 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Preview Selection publication"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !publishing) onClose();
      }}
    >
      <div
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl border border-[#E4DCCF] bg-[#FAF8F5] shadow-2xl sm:rounded-3xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#E4DCCF] bg-[#FAF8F5]/95 px-5 py-4 backdrop-blur">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#9A9083]">
              {isUpdate ? 'Update Selection' : 'Publish to Selection'}
            </p>
            <h2 className="mt-0.5 font-serif text-2xl text-[#211F1F]">
              Preview
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={publishing}
            aria-label="Close preview"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[#E4DCCF] bg-white text-[#625B50] transition hover:border-[#CFC3B1] hover:text-[#211F1F] disabled:opacity-40"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5 sm:px-8 sm:py-7">
          {image ? (
            <div className="flex max-h-[46vh] items-center justify-center overflow-hidden rounded-xl bg-white p-3">
              <img
                src={image}
                alt={detail.lot.title || detail.lot.artist}
                className="max-h-[42vh] w-full object-contain"
              />
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[#E7C3BE] bg-[#FCF3F2] px-4 py-6 text-center font-mono text-[10px] text-[#8B4038]">
              No original image is available. Publication is disabled.
            </div>
          )}

          <div className="text-center">
            <h3 className="font-serif text-3xl text-[#211F1F]">
              {detail.lot.artist || 'Artist not extracted'}
            </h3>
            <p className="mt-1 font-serif text-lg italic text-[#4A443D]">
              {detail.lot.title || 'Title not extracted'}
              {detail.lot.year ? ` (${detail.lot.year})` : ''}
            </p>
          </div>

          <dl className="grid grid-cols-1 gap-2 rounded-xl border border-[#E4DCCF] bg-white p-4 sm:grid-cols-2">
            {[
              ['Medium', detail.lot.medium],
              ['Dimensions', detail.lot.dimensions],
              ['Auction', detail.lot.auction_house],
              ['Date', displayDate(detail.lot.auction_date)],
              ['Estimate', detail.lot.estimate],
              ['Price realized', detail.lot.price_realized],
            ].map(([label, value]) =>
              value ? (
                <div key={label} className="min-w-0">
                  <dt className="font-mono text-[8px] uppercase tracking-[0.14em] text-[#9A9083]">
                    {label}
                  </dt>
                  <dd className="mt-0.5 font-mono text-[10px] leading-relaxed text-[#4A443D]">
                    {value}
                  </dd>
                </div>
              ) : null,
            )}
          </dl>

          {essay ? (
            <div className="rounded-xl border border-[#E4DCCF] bg-white p-4">
              <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-[#9A9083]">
                Curatorial essay · v{detail.editorial?.current?.version}
              </p>
              <div className="prose prose-sm mt-2 max-h-64 max-w-none overflow-y-auto font-serif text-sm leading-relaxed text-[#37332D]">
                <Markdown>{essay}</Markdown>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-[#E7C3BE] bg-[#FCF3F2] px-4 py-3 font-mono text-[10px] text-[#8B4038]">
              An essay is required before publishing.
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-[#E7C3BE] bg-[#FCF3F2] px-4 py-3 font-mono text-[10px] leading-relaxed text-[#8B4038]">
              {error}
            </div>
          )}

          <label className="flex items-start gap-3 rounded-xl border border-[#E7CFA9] bg-[#FFF9EC] p-3">
            <input
              type="checkbox"
              checked={rightsConfirmed}
              onChange={(event) => setRightsConfirmed(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#2B2723]"
            />
            <span className="font-mono text-[9px] leading-relaxed text-[#72552A]">
              I confirm that the original auction-house image may be used on this
              Selection page.
            </span>
          </label>

          <p className="font-mono text-[9px] leading-relaxed text-[#8A8175]">
            {isUpdate
              ? 'This will update the existing Selection article. No duplicate will be created.'
              : 'This will create one Selection article. Nothing is published until you confirm.'}
          </p>
        </div>

        <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-[#E4DCCF] bg-[#FAF8F5]/95 px-5 py-4 backdrop-blur sm:flex-row sm:justify-end sm:px-8">
          <button
            type="button"
            onClick={onClose}
            disabled={publishing}
            className="rounded-full border border-[#E4DCCF] bg-white px-5 py-2.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[#625B50] transition hover:border-[#CFC3B1] hover:text-[#211F1F] disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={publishing || !rightsConfirmed || !essay || !image}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#2B2723] px-5 py-2.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[#FAF8F5] transition hover:bg-[#171411] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {publishing && <Loader2 size={13} className="animate-spin" />}
            {isUpdate ? 'Confirm Update' : 'Confirm Publication'}
          </button>
        </div>
      </div>
    </div>
  );
}
