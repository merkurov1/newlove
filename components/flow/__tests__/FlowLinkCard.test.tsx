import React from 'react';
import { render, screen } from '@testing-library/react';

import FlowLinkCard from '../FlowLinkCard';
import type { FlowLink } from '@/lib/flow/content';

jest.mock('next/link', () => {
  return function MockLink({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    children: React.ReactNode;
  }) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  };
});

function link(overrides: Partial<FlowLink> = {}): FlowLink {
  return {
    url: 'https://example.com/article',
    title: 'Example article',
    description: 'A preview description',
    image: null,
    siteName: 'Example',
    domain: 'example.com',
    inBody: false,
    ...overrides,
  };
}

describe('Flow link cards', () => {
  it('keeps external cards unchanged: Flow post plus external source', () => {
    render(
      <FlowLinkCard
        link={link()}
        itemHref="/flow/example"
        variant="card"
      />
    );

    const card = document.querySelector('[data-link-kind="external"]');

    expect(card).not.toBeNull();
    expect(screen.getByText('Example article').closest('a')).toHaveAttribute(
      'href',
      '/flow/example'
    );
    expect(screen.getByText('Example ↗').closest('a')).toHaveAttribute(
      'href',
      'https://example.com/article'
    );
    expect(screen.getByText('Example ↗').closest('a')).toHaveAttribute(
      'target',
      '_blank'
    );
  });

  it('renders Telegram links as their own card that opens Telegram', () => {
    render(
      <FlowLinkCard
        link={link({
          url: 'https://t.me/unframed_am/42',
          title: 'A Telegram post',
          siteName: 'Telegram',
          domain: 't.me',
        })}
        itemHref="/flow/example"
        variant="card"
      />
    );

    const card = document.querySelector('[data-link-kind="telegram"]');

    expect(card).not.toBeNull();
    expect(screen.queryByText('t.me ↗')).not.toBeInTheDocument();
    expect(screen.getByText('A Telegram post').closest('a')).toHaveAttribute(
      'href',
      'https://t.me/unframed_am/42'
    );
    expect(screen.getByText('Telegram ↗').closest('a')).toHaveAttribute(
      'target',
      '_blank'
    );
  });

  it('renders merkurov.love links as an internal route without a new tab', () => {
    render(
      <FlowLinkCard
        link={link({
          url: 'https://www.merkurov.love/flow/note?from=feed#top',
          title: 'An internal note',
          siteName: null,
          domain: 'merkurov.love',
        })}
        itemHref="/flow/example"
        variant="card"
      />
    );

    const card = document.querySelector('[data-link-kind="internal"]');

    expect(card).not.toBeNull();
    expect(card).toHaveAttribute('href', '/flow/note?from=feed#top');
    expect(card).not.toHaveAttribute('target');
    expect(screen.getByText('merkurov.love →')).toBeInTheDocument();
  });

  it('keeps the reader variant distinct for all three families', () => {
    const { rerender } = render(
      <FlowLinkCard link={link()} itemHref="/flow/example" variant="reader" />
    );

    expect(document.querySelector('[data-link-kind="external"]')).not.toBeNull();

    rerender(
      <FlowLinkCard
        link={link({ url: 'https://t.me/unframed_am/42', title: 'Telegram reader' })}
        itemHref="/flow/example"
        variant="reader"
      />
    );

    const telegram = document.querySelector('[data-link-kind="telegram"]');
    expect(telegram).toHaveAttribute('href', 'https://t.me/unframed_am/42');
    expect(telegram).toHaveAttribute('target', '_blank');

    rerender(
      <FlowLinkCard
        link={link({ url: 'https://merkurov.love/flow/note', title: 'Internal reader' })}
        itemHref="/flow/example"
        variant="reader"
      />
    );

    const internal = document.querySelector('[data-link-kind="internal"]');
    expect(internal).toHaveAttribute('href', '/flow/note');
    expect(internal).not.toHaveAttribute('target');
  });

  it('uses the same three families in compact rows', () => {    const { rerender } = render(
      <FlowLinkCard link={link()} itemHref="/flow/example" variant="row" />
    );

    expect(document.querySelector('[data-link-kind="external"]')).not.toBeNull();

    rerender(
      <FlowLinkCard
        link={link({ url: 'https://t.me/unframed_am/42', title: 'Telegram row' })}
        itemHref="/flow/example"
        variant="row"
      />
    );

    expect(document.querySelector('[data-link-kind="telegram"]')).not.toBeNull();

    rerender(
      <FlowLinkCard
        link={link({ url: 'https://merkurov.love/flow/note', title: 'Internal row' })}
        itemHref="/flow/example"
        variant="row"
      />
    );

    expect(document.querySelector('[data-link-kind="internal"]')).toHaveAttribute(
      'href',
      '/flow/note'
    );
  });
});
