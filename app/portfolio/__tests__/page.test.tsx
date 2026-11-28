/* eslint-disable @next/next/no-img-element */
import fs from 'node:fs';
import path from 'node:path';

import { fireEvent, render, screen, within } from '@testing-library/react';

import PortfolioPage, { metadata } from '../page';

jest.mock('@/components/seo/JsonLd', () => ({
  JsonLd: () => null,
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

describe('/portfolio', () => {
  it('publishes a self-canonical English portfolio page', () => {
    expect(metadata.alternates?.canonical).toBe('https://www.merkurov.love/portfolio');
    expect(metadata.title).toEqual({
      absolute: 'Anton Merkurov — Selected Works | Artist Portfolio',
    });
    expect(metadata.openGraph?.images).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: expect.stringContaining('heartandangel/World.png'),
        }),
      ])
    );
  });

  it('keeps one h1 and presents the work as one developing practice', () => {
    render(<PortfolioPage />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Anton Merkurov');

    const sequence = [
      'IMAGE',
      'OBJECT',
      'PUBLIC SPACE',
      'DIGITAL ENVIRONMENT',
      'SACRED SPACE',
      'SHARED WORLD',
    ];
    const sequenceList = screen.getByRole('list', {
      name: 'The development of Heart & Angel',
    });
    const sequenceItems = within(sequenceList).getAllByRole('listitem');

    expect(sequenceItems.map((item) => item.textContent?.replace(/^\d{2}/, ''))).toEqual(sequence);

    for (const heading of [
      'Heart & Angel',
      'Painting & Drawing',
      'Physical Objects',
      'Street Interventions',
      'Digital Artifacts',
      'The Temple',
      'A Shared World',
      'UNFRAMED',
      'Heritage Archive',
      'Media Archive',
    ]) {
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    }
  });

  it('marks the multiplayer world as in development and shows no fake product UI', () => {
    render(<PortfolioPage />);

    const sharedWorld = screen.getByRole('heading', { name: 'A Shared World' }).closest('section');
    expect(sharedWorld).not.toBeNull();
    expect(sharedWorld).toHaveTextContent('In development');
    expect(sharedWorld).toHaveTextContent('not presented here as a finished product');
    expect(screen.queryByText(/screenshot/i)).not.toBeInTheDocument();
  });

  it('exposes only the native print action as a button', () => {
    const print = jest.fn();
    Object.defineProperty(window, 'print', {
      configurable: true,
      value: print,
    });

    render(<PortfolioPage />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName('Save this portfolio as a PDF');

    fireEvent.click(buttons[0]);
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('ships a dedicated A4 print stylesheet with page-break and chrome rules', () => {
    const css = fs.readFileSync(
      path.join(process.cwd(), 'app', 'portfolio', 'portfolio.module.css'),
      'utf8'
    );

    expect(css).toContain('@media print');
    expect(css).toContain('size: A4');
    expect(css).toContain('break-inside: avoid');
    expect(css).toContain('page-break-before: always');
    expect(css).toContain('.site-header');
    expect(css).toContain('.site-footer');
    expect(css).toContain('.portfolio-save-pdf');
  });
});
