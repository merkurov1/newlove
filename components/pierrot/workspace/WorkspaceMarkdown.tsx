'use client';

import React from 'react';
import Markdown from 'markdown-to-jsx';
import { safeSourceUrl } from '@/lib/pierrot/workspace/chatParser';
import {
  CITATION_HREF_PREFIX,
  citationIndexFromHref,
  prepareCitationMarkdown,
} from '@/lib/pierrot/workspace/citations';

function CitationBadge({
  index,
  onCitation,
}: {
  index: number;
  onCitation?: (index: number) => void;
}) {
  const content = <span aria-hidden="true">{index}</span>;

  if (!onCitation) {
    return (
      <span className="pw-cite" aria-label={`Источник ${index}`}>
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      className="pw-cite"
      onClick={() => onCitation(index - 1)}
      aria-label={`Открыть источник ${index}`}
    >
      {content}
    </button>
  );
}

export default function WorkspaceMarkdown({
  content,
  className = '',
  citationCount = 0,
  onCitation,
}: {
  content: string;
  className?: string;
  citationCount?: number;
  onCitation?: (index: number) => void;
}) {
  const prepared = prepareCitationMarkdown(content, citationCount);
  const hasRenderedCitation =
    citationCount > 0 && prepared.includes(CITATION_HREF_PREFIX);

  return (
    <div className={className}>
      <Markdown
        options={{
          disableParsingRawHTML: true,
          forceBlock: true,
          sanitizer: (value: string) => {
            if (value.startsWith(CITATION_HREF_PREFIX)) return value;
            return safeSourceUrl(value) || '';
          },
          overrides: {
            a: {
              component: ({
                href,
                children,
                ...props
              }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
                children?: React.ReactNode;
              }) => {
                const citation = citationIndexFromHref(href || '');

                if (citation !== null) {
                  if (citation > citationCount) return <span>{children}</span>;
                  return (
                    <CitationBadge index={citation} onCitation={onCitation} />
                  );
                }

                const safe = safeSourceUrl(href || '');
                if (!safe) return <span>{children}</span>;
                const external = /^https?:\/\//i.test(safe);

                return (
                  <a
                    {...props}
                    href={safe}
                    {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  >
                    {children}
                  </a>
                );
              },
            },
          },
        }}
      >
        {prepared}
      </Markdown>

      {citationCount > 0 && !hasRenderedCitation && (
        <span className="pw-citations" aria-label="Источники ответа">
          {Array.from({ length: citationCount }, (_, index) => (
            <CitationBadge
              key={index + 1}
              index={index + 1}
              onCitation={onCitation}
            />
          ))}
        </span>
      )}
    </div>
  );
}
