import React from 'react';
import { render, screen } from '@testing-library/react';

import QuestionSynthesis from '../QuestionSynthesis';

describe('QuestionSynthesis', () => {
  it('renders editorial Markdown without raw HTML', () => {
    render(
      <QuestionSynthesis
        content={'# Мысль\n\nАбзац с **акцентом**.\n\n> Тихая цитата.\n\n<script>alert(1)</script>'}
      />
    );

    expect(screen.getByRole('heading', { name: 'Мысль' })).toBeInTheDocument();
    expect(screen.getByText('акцентом')).toBeInTheDocument();
    expect(screen.getByText('Тихая цитата.')).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
  });

  it('never mounts images or tables from synthesis text', () => {
    render(
      <QuestionSynthesis
        content={
          '![график](https://example.com/x.png)\n\n| метрика | значение |\n| --- | --- |\n| шум | 42 |'
        }
      />
    );

    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('table')).toBeNull();
  });

  it('blocks javascript links and keeps safe external links isolated', () => {
    render(
      <QuestionSynthesis
        content={
          '[опасно](javascript:alert(1)) и [безопасно](https://example.com/text)'
        }
      />
    );

    expect(screen.queryByRole('link', { name: 'опасно' })).toBeNull();
    expect(screen.getByText('опасно')).toBeInTheDocument();

    const safe = screen.getByRole('link', { name: 'безопасно' });
    expect(safe).toHaveAttribute('href', 'https://example.com/text');
    expect(safe).toHaveAttribute('rel', 'noopener noreferrer nofollow');
    expect(safe).toHaveAttribute('target', '_blank');
  });
});
