'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Markdown from 'markdown-to-jsx';

import { usePierrotOptional } from '@/components/pierrot/PierrotContext';
import { linkifyInternalRoutes } from '@/lib/pierrot/linkify';
import { stabilizeStreamingMarkdown } from '@/lib/pierrot/streamingText';

function shouldCloseBeforeNavigation(href: string, pathname: string): boolean {
  if (href.startsWith('#')) return true;
  if (!href.startsWith('/')) return false;

  try {
    const target = new URL(href, 'https://pierrot.local');
    return (
      target.pathname.replace(/\/+$/, '') === pathname.replace(/\/+$/, '')
    );
  } catch {
    return false;
  }
}

export function safeMarkdownUrl(value: string): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();

  if (!trimmed) return null;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
  if (trimmed.startsWith('#')) return trimmed;
  if (/^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed)) return trimmed;

  return null;
}

/**
 * Assistant prose. Renders a safe Markdown subset (emphasis, links, lists,
 * code) and never raw HTML. User messages stay plain text.
 */
export function PierrotMarkdown({
  content,
  streaming = false,
}: {
  content: string;
  streaming?: boolean;
}) {
  const pierrot = usePierrotOptional();
  const pathname = usePathname() || '/';

  return (
    <Markdown
      options={{
        disableParsingRawHTML: true,
        forceBlock: true,
        sanitizer: (value: string) => safeMarkdownUrl(value),
        overrides: {
          p: {
            component: 'p',
            props: { className: 'mb-3 last:mb-0' },
          },
          strong: {
            component: 'strong',
            props: { className: 'font-semibold text-[#1F1C18]' },
          },
          em: {
            component: 'em',
            props: { className: 'italic' },
          },
          a: {
            component: ({
              href,
              children,
              ...props
            }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
              children?: React.ReactNode;
            }) => {
              const safe = safeMarkdownUrl(href || '');

              if (!safe) return <span>{children}</span>;

              if (safe.startsWith('/') || safe.startsWith('#')) {
                return (
                  <Link
                    href={safe}
                    onClick={() => {
                      if (shouldCloseBeforeNavigation(safe, pathname)) {
                        pierrot?.closeConversation();
                      }
                    }}
                    {...props}
                    className="text-[#3F3A33] underline decoration-[#A5764F] decoration-1 underline-offset-4 transition-colors hover:text-[#111111] hover:decoration-[#6B4F37]"
                  >
                    {children}
                  </Link>
                );
              }

              return (
                <a
                  href={safe}
                  target="_blank"
                  rel="noopener noreferrer"
                  {...props}
                  className="text-[#3F3A33] underline decoration-[#A5764F] decoration-1 underline-offset-4 transition-colors hover:text-[#111111] hover:decoration-[#6B4F37]"
                >
                  {children}
                </a>
              );
            },
          },
          ul: {
            component: 'ul',
            props: {
              className: 'my-3 list-disc space-y-1.5 pl-5 marker:text-[#B08A5A]',
            },
          },
          ol: {
            component: 'ol',
            props: {
              className: 'my-3 list-decimal space-y-1.5 pl-5 marker:text-[#B08A5A]',
            },
          },
          li: {
            component: 'li',
            props: { className: 'pl-0.5 [&>p]:mb-1 [&>p:last-child]:mb-0' },
          },
          code: {
            component: 'code',
            props: {
              className:
                'rounded-[3px] bg-[#EEE8DE] px-1 py-0.5 font-mono text-[0.86em] text-[#4A3E33]',
            },
          },
          pre: {
            component: 'pre',
            props: {
              className:
                'my-4 max-w-full overflow-x-auto rounded-lg border border-[#E4DCCF] bg-[#F7F3EC] p-3.5 font-mono text-[12px] leading-[1.65] text-[#37332D] sm:text-[14px] [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-[#37332D]',
            },
          },
          blockquote: {
            component: 'blockquote',
            props: {
              className:
                'my-7 border-l-2 border-[#B08A5A]/70 py-1 pl-5 font-serif text-[18px] italic leading-[1.62] text-[#3F3A33]',
            },
          },
          hr: {
            component: 'hr',
            props: { className: 'my-5 border-[#E4DCCF]' },
          },
          h1: {
            component: 'h1',
            props: {
              className:
                'mb-2 mt-5 font-serif text-[24px] font-normal leading-[1.2] text-[#111111] first:mt-0',
            },
          },
          h2: {
            component: 'h2',
            props: {
              className:
                'mb-2 mt-5 font-serif text-[20px] font-normal leading-[1.3] text-[#111111] first:mt-0',
            },
          },
          h3: {
            component: 'h3',
            props: {
              className:
                'mb-1.5 mt-4 font-serif text-[17px] font-normal leading-snug text-[#111111] first:mt-0',
            },
          },
          h4: {
            component: 'h4',
            props: {
              className:
                'mb-1 mt-3.5 font-serif text-[16px] font-normal leading-snug text-[#111111] first:mt-0',
            },
          },
          table: {
            component: ({ children }: { children?: React.ReactNode }) => (
              <div className="my-4 w-full overflow-x-auto">
                <table className="w-full min-w-[340px] table-auto border-collapse text-left text-[14px] leading-relaxed sm:text-[14px]">
                  {children}
                </table>
              </div>
            ),
          },
          thead: {
            component: 'thead',
            props: { className: 'bg-[#FBF8F2]' },
          },
          tr: {
            component: 'tr',
            props: { className: 'align-top' },
          },
          th: {
            component: 'th',
            props: {
              className:
                'break-words border-b border-[#D9D0C3] px-2.5 py-2 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-[#7D7468]',
            },
          },
          td: {
            component: 'td',
            props: {
              className:
                'break-words border-b border-[#EEE8DE] px-2.5 py-2 align-top text-[#4D463D]',
            },
          },
          img: {
            // Markdown images are intentionally not rendered: the message
            // contract has no verified image payload and remote images can be
            // used as tracking pixels. The alt text remains readable.
            component: ({ alt }: { alt?: string }) =>
              alt ? <span className="font-mono text-[12px] text-[#8A8175]">[{alt}]</span> : null,
          },
        },
      }}
    >
      {linkifyInternalRoutes(stabilizeStreamingMarkdown(content, streaming))}
    </Markdown>
  );
}

export default PierrotMarkdown;
