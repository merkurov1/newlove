'use client';

import { normalizeFlowItem } from '@/lib/flow/content';
import { composeTelegramPublication } from '@/lib/flow/telegramComposition';

type TelegramPreviewItem = {
  id: string;
  title: string;
  slug?: string | null;
  lang: string;
  type: string;
  body_md: string;
  source_url?: string | null;
  metadata?: Record<string, unknown> | null;
};

function MessageLabel({ index }: { index: number }) {
  return (
    <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.18em] text-stone-400">
      Сообщение {index + 1}
    </div>
  );
}

export default function TelegramPreview({ item }: { item: TelegramPreviewItem }) {
  const content = normalizeFlowItem({
    id: item.id,
    title: item.title,
    slug: item.slug ?? null,
    lang: item.lang,
    type: item.type,
    body_md: item.body_md,
    source_url: item.source_url ?? null,
    metadata: item.metadata ?? {},
  });
  const composition = composeTelegramPublication(content);

  return (
    <section className="rounded-xl border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Telegram preview</h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-stone-400">
          {composition.presentationMode} · {composition.language} ·{' '}
          {composition.messageParts.length} сообщ.
        </span>
      </div>

      <p className="mt-1 text-xs text-stone-500">
        Тот же детерминированный текст и порядок медиа, которые будут отправлены.
      </p>

      {composition.validation.errors.length > 0 && (
        <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          {composition.validation.errors.join(' ')}
        </div>
      )}

      {composition.validation.warnings.length > 0 && (
        <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {composition.validation.warnings.join(' ')}
        </div>
      )}

      <div className="mt-3 space-y-3">
        {composition.messageParts.map((part, index) => (
          <article
            key={`${part.kind}-${index}`}
            className="overflow-hidden rounded-xl border border-stone-200 bg-stone-50/50"
          >
            <div className="border-b border-stone-200/70 px-3 py-2">
              <MessageLabel index={index} />
            </div>

            {part.kind === 'media' ? (
              <div className="p-3">
                {part.caption && part.showCaptionAboveMedia && (
                  <div
                    className="mb-2 text-[13px] leading-6 text-stone-800 [&_a]:underline"
                    dangerouslySetInnerHTML={{ __html: part.caption }}
                  />
                )}

                <div
                  className={`grid gap-2 ${
                    part.items.length > 1 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1'
                  }`}
                >
                  {part.items.map((media) => (
                    <figure key={media.url} className="min-w-0">
                      <img
                        src={media.deliveryUrl}
                        alt={media.alt ?? ''}
                        className="max-h-56 w-full rounded-lg object-cover"
                        loading="lazy"
                      />
                      <figcaption className="mt-1 truncate font-mono text-[9px] uppercase tracking-[0.1em] text-stone-400">
                        {media.kind === 'video'
                          ? 'video'
                          : media.kind === 'video_thumbnail'
                            ? 'video thumbnail'
                            : 'photo'}
                      </figcaption>
                    </figure>
                  ))}
                </div>

                {part.caption && !part.showCaptionAboveMedia && (
                  <div
                    className="mt-2 text-[13px] leading-6 text-stone-800 [&_a]:underline"
                    dangerouslySetInnerHTML={{ __html: part.caption }}
                  />
                )}
              </div>
            ) : (
              <div
                className="p-3 text-[13px] leading-6 text-stone-800 [&_a]:underline [&_blockquote]:border-l [&_blockquote]:border-stone-300 [&_blockquote]:pl-3 [&_code]:bg-stone-100 [&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:bg-stone-100 [&_pre]:p-2"
                dangerouslySetInnerHTML={{ __html: part.html }}
              />
            )}
          </article>
        ))}
      </div>

      <div className="mt-3 grid gap-1 text-[11px] text-stone-500">
        <div>
          Flow:{' '}
          <a
            href={composition.flowUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-[#990F3D] hover:underline"
          >
            {composition.flowLabel}
          </a>
        </div>
        {composition.sourceUrl && (
          <div>
            {composition.sourceLabel}:{' '}
            <a
              href={composition.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-[#990F3D] hover:underline"
            >
              {composition.sourceUrl}
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
