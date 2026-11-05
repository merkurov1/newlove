import React from 'react';
import { render, screen } from '@testing-library/react';
import FlowImage from '../FlowImage';

jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => (
    <span
      data-testid="next-image"
      data-src={String(props.src || '')}
      data-sizes={String(props.sizes || '')}
    />
  ),
}));

describe('FlowImage', () => {
  it('uses next/image and a Supabase transform for configured hosts', () => {
    render(
      <FlowImage
        src="https://abc.supabase.co/storage/v1/object/public/media/flow/a.jpg"
        alt="A"
        aspectRatio="16 / 9"
      />
    );

    const image = screen.getByTestId('next-image');
    expect(image).toHaveAttribute('data-src', expect.stringContaining('width=1200'));
    expect(image).toHaveAttribute('data-sizes', '(max-width: 768px) 100vw, 720px');
  });

  it('falls back to a plain lazy image for an unknown external host', () => {
    render(
      <FlowImage src="https://unknown.example.org/image.jpg" alt="External" />
    );

    const image = screen.getByRole('img', { name: 'External' });
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(image).toHaveAttribute('decoding', 'async');
    expect(image).toHaveAttribute('src', 'https://unknown.example.org/image.jpg');
  });

  it('reserves space when the source is missing', () => {
    render(<FlowImage src={null} alt="Missing" aspectRatio="1 / 1" />);
    const fallback = screen.getByRole('img', { name: 'Missing' });
    expect(fallback).toBeTruthy();
  });
});
