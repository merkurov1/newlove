import React from 'react';
import Image from 'next/image';

/**
 * Server-only fallback for the auction slider.
 * This component intentionally does NOT import the client `AuctionSlider` to avoid
 * bundling client-only code into server-side render bundles. The client enhancement
 * is already mounted on the page via a dynamic import (`ssr:false`).
 */
export default function AuctionSliderServer({ articles, tagDebugInfo }: { articles?: any[], tagDebugInfo?: any }) {
  if (!articles || articles.length === 0) return null;

  // Render a simple responsive grid preview for non-hydrated clients.
  return (
    <div className="server-auction-fallback">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(articles || []).slice(0, 6).map((a: any) => (
          <a key={a.id || a.slug || Math.random()} href={`/${a.slug || ''}`} className="block rounded-lg overflow-hidden shadow-sm bg-white dark:bg-neutral-900">
            {a.previewImage ? (
              <div className="h-40 w-full bg-gray-100 dark:bg-neutral-800 relative">
                <Image src={String(a.previewImage)} alt={a.title || ''} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover" priority draggable={false} />
              </div>
            ) : (
              <div className="h-40 w-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">No image</div>
            )}
            <div className="p-3">
              <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">{a.title}</h3>
              {a.description ? <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{a.description}</p> : null}
            </div>
          </a>
        ))}
      </div>
      {tagDebugInfo && (
        <div className="mt-4 text-sm text-gray-700">
          <strong>DEBUG:</strong>
          <pre className="whitespace-pre-wrap">{JSON.stringify(tagDebugInfo, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
