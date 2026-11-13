'use client';

import React from 'react';
import Markdown from 'markdown-to-jsx';

import styles from './question.module.css';

/* eslint-disable react/prop-types */

function safeQuestionUrl(value: string): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();

  if (!trimmed) return null;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
  if (trimmed.startsWith('#')) return trimmed;

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
    } catch {
      return null;
    }
  }

  return null;
}

function SafeLink({
  href,
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const safe = safeQuestionUrl(href || '');

  if (!safe) return <span>{children}</span>;

  const external = /^https?:\/\//i.test(safe);

  return (
    <a
      href={safe}
      {...props}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer nofollow' } : {})}
      className={styles.synthesisLink}
    >
      {children}
    </a>
  );
}

/**
 * Editorial renderer for a saved synthesis.
 *
 * Only a closed Markdown subset is rendered. Raw HTML, images and dashboard
 * blocks are never mounted. The same trust boundary is enforced on the server
 * when the synthesis is stored.
 */
export default function QuestionSynthesis({ content }: { content: string }) {
  return (
    <div className={styles.synthesis}>
      <Markdown
        options={{
          disableParsingRawHTML: true,
          forceBlock: true,
          sanitizer: safeQuestionUrl,
          overrides: {
            p: { component: 'p', props: { className: styles.synthesisParagraph } },
            h1: { component: 'h1', props: { className: styles.synthesisH1 } },
            h2: { component: 'h2', props: { className: styles.synthesisH2 } },
            h3: { component: 'h3', props: { className: styles.synthesisH3 } },
            h4: { component: 'h4', props: { className: styles.synthesisH3 } },
            strong: { component: 'strong', props: { className: styles.synthesisStrong } },
            em: { component: 'em', props: { className: styles.synthesisEm } },
            blockquote: {
              component: 'blockquote',
              props: { className: styles.synthesisQuote },
            },
            ul: { component: 'ul', props: { className: styles.synthesisList } },
            ol: { component: 'ol', props: { className: styles.synthesisList } },
            li: { component: 'li', props: { className: styles.synthesisListItem } },
            hr: { component: 'hr', props: { className: styles.synthesisRule } },
            a: { component: SafeLink },
            img: { component: () => null },
            table: { component: () => null },
            pre: {
              component: 'pre',
              props: { className: styles.synthesisPre },
            },
            code: {
              component: 'code',
              props: { className: styles.synthesisCode },
            },
          },
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
