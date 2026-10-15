'use client';

import React, { useState } from 'react';
import { Share2, Check, Copy } from 'lucide-react';

interface FlowShareBarProps {
  url: string;
  title: string;
  description?: string;
  className?: string;
}

export default function FlowShareBar({
  url,
  title,
  description,
  className = '',
}: FlowShareBarProps) {
  const [copied, setCopied] = useState(false);

  const shareText = title || 'Flow — Anton Merkurov';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Fallback
    }
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: shareText,
          text: description || shareText,
          url,
        });
        return;
      } catch {
        // Fallback to copy or ignore user cancel
      }
    }
    await handleCopy();
  };

  // Bluesky Web Share Compose URL
  const bskyUrl = `https://bsky.app/intent/compose?text=${encodeURIComponent(`${shareText}\n\n${url}`)}`;

  // Telegram Share URL
  const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(shareText)}`;

  // X / Twitter Share URL
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}`;

  return (
    <div
      className={`inline-flex items-center gap-1.5 p-1 rounded-full bg-stone-100/90 border border-stone-200/80 shadow-2xs ${className}`}
    >
      {/* Bluesky Button */}
      <a
        href={bskyUrl}
        target="_blank"
        rel="noopener noreferrer"
        title="Share to Bluesky"
        aria-label="Share to Bluesky"
        className="px-2.5 py-1.5 rounded-full text-stone-600 hover:text-sky-600 hover:bg-white text-xs font-mono uppercase tracking-wider flex items-center gap-1.5 transition-colors"
      >
        <span className="text-sm leading-none">🦋</span>
        <span className="hidden sm:inline">Bluesky</span>
      </a>

      {/* Telegram Button */}
      <a
        href={tgUrl}
        target="_blank"
        rel="noopener noreferrer"
        title="Share to Telegram"
        aria-label="Share to Telegram"
        className="px-2.5 py-1.5 rounded-full text-stone-600 hover:text-blue-600 hover:bg-white text-xs font-mono uppercase tracking-wider flex items-center gap-1.5 transition-colors"
      >
        <span className="text-sm leading-none">✈️</span>
        <span className="hidden sm:inline">Telegram</span>
      </a>

      {/* X / Twitter Button */}
      <a
        href={twitterUrl}
        target="_blank"
        rel="noopener noreferrer"
        title="Share to X"
        aria-label="Share to X"
        className="px-2.5 py-1.5 rounded-full text-stone-600 hover:text-black hover:bg-white text-xs font-mono uppercase tracking-wider flex items-center gap-1.5 transition-colors"
      >
        <span className="font-bold text-xs leading-none">𝕏</span>
      </a>

      {/* Copy / Native Share */}
      <button
        type="button"
        onClick={handleNativeShare}
        title="Copy Link / Share"
        aria-label="Copy Link"
        className="px-2.5 py-1.5 rounded-full text-stone-600 hover:text-black hover:bg-white text-xs font-mono uppercase tracking-wider flex items-center gap-1.5 transition-colors min-h-0 min-w-0"
      >
        {copied ? (
          <>
            <Check className="w-3.5 h-3.5 text-emerald-600" />
            <span className="text-emerald-700 font-semibold">Copied</span>
          </>
        ) : (
          <>
            <Copy className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Copy</span>
          </>
        )}
      </button>
    </div>
  );
}
