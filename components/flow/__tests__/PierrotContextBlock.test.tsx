import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import PierrotContextBlock, { type AIContextData } from '@/components/flow/PierrotContextBlock';
import { PIERROT_AVATAR_SRC } from '@/lib/pierrot/config';

// react-markdown ships ESM only; these tests exercise the language state,
// avatar and absence of duplicated panes. Real Markdown is covered in the
// reader Playwright spec.
jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => children,
}));

jest.mock('remark-gfm', () => ({
  __esModule: true,
  default: () => undefined,
}));

const BILINGUAL = ['[EN] English insight only.', '', '[RU] Русский текст только.'].join('\n');

function ready(content: string, status = 'ready'): AIContextData {
  return { content, status };
}

function languageGroup() {
  return screen.queryByRole('group', { name: 'Pierrot comment language' });
}

describe('PierrotContextBlock', () => {
  it('keeps a stable hook order when context turns from null to ready', () => {
    const { rerender, container } = render(<PierrotContextBlock context={null} />);

    expect(container).toBeEmptyDOMElement();

    rerender(<PierrotContextBlock context={ready('Steady insight')} />);

    expect(screen.getByText('Steady insight')).toBeInTheDocument();
  });

  it('hides the whole block until the context is ready', () => {
    const { container } = render(
      <PierrotContextBlock context={ready('Draft context', 'pending')} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('starts in English when the publication is English', () => {
    render(<PierrotContextBlock context={ready(BILINGUAL)} defaultLang="en" />);

    expect(screen.getByText('English insight only.')).toBeInTheDocument();
    expect(screen.queryByText('Русский текст только.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('starts in Russian when the publication is Russian', () => {
    render(<PierrotContextBlock context={ready(BILINGUAL)} defaultLang="ru" />);

    expect(screen.getByText('Русский текст только.')).toBeInTheDocument();
    expect(screen.queryByText('English insight only.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'RU' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('switches between EN and RU without ever showing both versions', () => {
    const { container } = render(
      <PierrotContextBlock context={ready(BILINGUAL)} defaultLang="en" />
    );

    expect(container.querySelectorAll('[data-flow-pierrot-body]')).toHaveLength(1);
    expect(screen.queryByText('Двуязычно')).not.toBeInTheDocument();
    expect(screen.queryByText('Двуязычно', { exact: false })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'RU' }));

    expect(screen.getByText('Русский текст только.')).toBeInTheDocument();
    expect(screen.queryByText('English insight only.')).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-flow-pierrot-body]')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'EN' }));

    expect(screen.getByText('English insight only.')).toBeInTheDocument();
    expect(screen.queryByText('Русский текст только.')).not.toBeInTheDocument();
  });

  it('keeps a legacy single-language English context and hides the switcher', () => {
    render(<PierrotContextBlock context={ready('A single English comment.')} defaultLang="en" />);

    expect(screen.getByText('A single English comment.')).toBeInTheDocument();
    expect(languageGroup()).not.toBeInTheDocument();
  });

  it('keeps a legacy single-language Russian context and hides the switcher', () => {
    render(
      <PierrotContextBlock context={ready('Единственный русский комментарий.')} defaultLang="en" />
    );

    expect(screen.getByText('Единственный русский комментарий.')).toBeInTheDocument();
    expect(languageGroup()).not.toBeInTheDocument();
  });

  it('does not offer an empty language when a tagged context has one version', () => {
    const { container } = render(
      <PierrotContextBlock context={ready('[EN] Only one tagged version.')} defaultLang="ru" />
    );

    expect(screen.getByText('Only one tagged version.')).toBeInTheDocument();
    expect(screen.queryByText(/\[EN\]/)).not.toBeInTheDocument();
    expect(languageGroup()).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-flow-pierrot-body]')).toHaveLength(1);
  });

  it('removes technical labels and the P monogram', () => {
    render(<PierrotContextBlock context={ready(BILINGUAL)} defaultLang="en" />);

    expect(screen.queryByText('Context Architecture')).not.toBeInTheDocument();
    expect(screen.queryByText('Digital shadow & advisor')).not.toBeInTheDocument();
    expect(screen.queryByText('PIERROT EDITORIAL')).not.toBeInTheDocument();
    expect(screen.queryByText('P')).not.toBeInTheDocument();
    expect(screen.getByText('Pierrot')).toBeInTheDocument();
  });

  it('renders the real Pierrot portrait and no letter fallback on error', () => {
    const { container } = render(
      <PierrotContextBlock context={ready(BILINGUAL)} defaultLang="en" />
    );

    const image = container.querySelector<HTMLImageElement>('[data-pierrot-avatar] img');

    expect(image).not.toBeNull();
    expect(image?.getAttribute('src')).toBe(PIERROT_AVATAR_SRC);
    expect(PIERROT_AVATAR_SRC).toBe('/pierrot/pierrot-avatar-512.jpg');

    fireEvent.error(image as HTMLImageElement);

    expect(container.querySelector('[data-pierrot-avatar] img')).toBeNull();
    expect(container.querySelector('[data-pierrot-avatar]')).toHaveAttribute(
      'data-avatar-state',
      'fallback'
    );
    expect(screen.queryByText('P')).not.toBeInTheDocument();
  });
});
