import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import SectionLanguageSwitcher from '../SectionLanguageSwitcher';

jest.mock('next/link', () => {
  return function MockLink(props: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
    return React.createElement('a', props);
  };
});

function setBrowserLanguages(languages: string[]) {
  Object.defineProperty(window.navigator, 'languages', {
    configurable: true,
    value: languages,
  });
}

describe('SectionLanguageSwitcher', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setBrowserLanguages(['en-US']);
  });

  it('shows only the languages available for Advising', () => {
    render(<SectionLanguageSwitcher section="advising" currentLang="en" />);

    expect(screen.getByRole('link', { name: 'English (EN)' })).toHaveAttribute('href', '/advising');
    expect(screen.getByRole('link', { name: 'Russian (RU)' })).toHaveAttribute(
      'href',
      '/ru/advising'
    );
    expect(screen.getByRole('link', { name: 'German (DE)' })).toHaveAttribute(
      'href',
      '/de/advising'
    );
    expect(screen.getByRole('link', { name: 'French (FR)' })).toHaveAttribute(
      'href',
      '/fr/advising'
    );
    expect(screen.getByRole('link', { name: 'Arabic (AR)' })).toHaveAttribute(
      'href',
      '/ar/advising'
    );
  });

  it('does not show German or French in Lobby', () => {
    render(<SectionLanguageSwitcher section="lobby" currentLang="en" />);

    expect(screen.getByRole('link', { name: 'German (DE)' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'French (FR)' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Arabic (AR)' })).not.toBeInTheDocument();
  });

  it('offers a matching browser language without redirecting', async () => {
    setBrowserLanguages(['de-DE', 'en-US']);
    render(<SectionLanguageSwitcher section="lobby" currentLang="en" />);

    await waitFor(() => {
      expect(screen.getByText(/This page is also available in/)).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'Deutsch' })).toHaveAttribute('href', '/de/lobby');
  });

  it('honours an explicit English choice by not prompting', async () => {
    window.localStorage.setItem('merkurov.language-choice', 'en');
    setBrowserLanguages(['de-DE']);
    render(<SectionLanguageSwitcher section="lobby" currentLang="en" />);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText(/This page is also available in/)).not.toBeInTheDocument();
  });
});
