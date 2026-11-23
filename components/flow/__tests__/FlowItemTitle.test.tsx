import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { FlowItemTitle } from '../FlowItemTitle';

describe('FlowItemTitle', () => {
  it('renders a visible h1 when the item wants its title shown', () => {
    const html = renderToStaticMarkup(
      <FlowItemTitle showTitle title="A visible Flow title" />
    );

    expect(html).toContain('<h1');
    expect(html).toContain('A visible Flow title');
    expect(html).not.toContain('sr-only');
  });

  it('keeps one semantic h1 when the visual title is suppressed', () => {
    const html = renderToStaticMarkup(
      <FlowItemTitle showTitle={false} title="Title repeated in the body" />
    );

    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('class="sr-only"');
    expect(html).toContain('Title repeated in the body');
  });

  it('renders nothing for an empty title instead of an empty heading', () => {
    expect(renderToStaticMarkup(<FlowItemTitle showTitle title="   " />)).toBe('');
  });
});
