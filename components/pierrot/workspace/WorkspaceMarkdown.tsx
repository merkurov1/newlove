'use client';

import React from 'react';
import Markdown from 'markdown-to-jsx';
import { safeSourceUrl } from '@/lib/pierrot/workspace/chatParser';

export default function WorkspaceMarkdown({
  content,
  className = '',
}: {
  content: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <Markdown
        options={{
          disableParsingRawHTML: true,
          forceBlock: true,
          sanitizer: (value: string) => safeSourceUrl(value) || '',
          overrides: {
            a: {
              component: ({
                href,
                children,
                ...props
              }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
                children?: React.ReactNode;
              }) => {
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
        {content}
      </Markdown>
    </div>
  );
}
