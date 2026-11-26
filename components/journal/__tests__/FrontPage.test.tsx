import React from 'react';
import { render, screen } from '@testing-library/react';
import FrontPage, { type FlowEntry, type FrontIssue } from '../FrontPage';
import type { JournalMaterial } from '@/lib/journal/issue';

const enIssue: FrontIssue = {
  id: 'en-1',
  slug: 'issue-en',
  lang: 'en',
  number: 18,
  headline: 'The English headline',
  excerpt: 'English excerpt.',
  summary: 'Notes 2, Links 1',
  published: 4,
  publishedAt: '2026-11-20T10:00:00.000Z',
  periodStart: '2026-11-14T00:00:00.000Z',
  periodEnd: '2026-11-20T00:00:00.000Z',
  lead: 'A full editorial lead that explains what the issue is about and why it matters.',
  editorialSummary: 'Pierrot, archives, and scarce attention.',
};

const ruIssue: FrontIssue = {
  ...enIssue,
  id: 'ru-1',
  slug: 'issue-ru',
  lang: 'ru',
  number: 26,
  headline: 'Русский заголовок',
  excerpt: 'Русский фрагмент.',
  summary: 'Заметки 2',
  published: 2,
  publishedAt: '2026-11-20T11:00:00.000Z',
  lead: 'Полноценный редакционный анонс этого выпуска.',
  editorialSummary: 'Пьеро, архивы и дефицит внимания.',
};

const olderEnIssue: FrontIssue = {
  ...enIssue,
  id: 'en-2',
  slug: 'issue-en-old',
  number: 17,
  headline: 'An older English issue',
  publishedAt: '2025-10-10T10:00:00.000Z',
  periodStart: '2025-10-04T00:00:00.000Z',
  periodEnd: '2025-10-10T00:00:00.000Z',
};

const olderRuIssue: FrontIssue = {
  ...ruIssue,
  id: 'ru-2',
  slug: 'issue-ru-old',
  number: 25,
  headline: 'Старый русский выпуск',
  publishedAt: '2024-09-10T10:00:00.000Z',
  periodStart: '2024-09-04T00:00:00.000Z',
  periodEnd: '2024-09-10T00:00:00.000Z',
};

const materials: JournalMaterial[] = [
  {
    id: 'note-1',
    kind: 'note',
    type: 'note',
    lang: 'ru',
    title: 'Заметка о книге',
    body: 'Полный текст заметки о книге UNFRAMED.',
    description: '',
    url: 'https://www.merkurov.love/flow/note-1',
    image: null,
    imageAlt: '',
    siteName: '',
    publishedAt: '2026-11-18T10:00:00.000Z',
    isLead: true,
    isExternal: false,
  },
  {
    id: 'link-1',
    kind: 'link',
    type: 'link',
    lang: 'en',
    title: 'A Kandinsky record at Christie’s',
    body: '',
    description: 'The painting fetched a new auction high.',
    url: 'https://www.artnews.com/story',
    image: 'https://www.artnews.com/preview.jpg',
    imageAlt: 'Kandinsky painting',
    siteName: 'ARTnews.com',
    publishedAt: '2026-11-17T10:00:00.000Z',
    isLead: false,
    isExternal: true,
  },
  {
    id: 'video-1',
    kind: 'video',
    type: 'video',
    lang: 'ru',
    title: 'Ночная смена',
    body: '',
    description: '',
    url: 'https://www.youtube.com/watch?v=abc',
    image: 'https://i.ytimg.com/vi/abc/hqdefault.jpg',
    imageAlt: 'Night Shift thumbnail',
    siteName: 'YouTube',
    publishedAt: '2026-11-16T10:00:00.000Z',
    isLead: false,
    isExternal: true,
  },
  {
    id: 'photo-1',
    kind: 'photo',
    type: 'photo',
    lang: 'en',
    title: 'Opening night',
    body: '',
    description: 'A crowd at the opening.',
    url: 'https://www.merkurov.love/flow/photo-1',
    image: 'https://cdn.example.com/photo.jpg',
    imageAlt: 'Opening night crowd',
    siteName: '',
    publishedAt: '2026-11-15T10:00:00.000Z',
    isLead: false,
    isExternal: false,
  },
];

const flow: FlowEntry[] = [
  {
    id: 'flow-en-1',
    slug: 'flow-en-entry',
    type: 'note',
    lang: 'en',
    text: 'A recent English note',
    at: '2026-11-22T10:00:00.000Z',
  },
  {
    id: 'flow-ru-1',
    slug: 'flow-ru-entry',
    type: 'article',
    lang: 'ru',
    text: 'Свежая русская статья',
    at: '2026-11-22T10:00:00.000Z',
  },
];

function renderPage(lang: 'en' | 'ru') {
  return render(
    <FrontPage
      lang={lang}
      featured={lang === 'en' ? enIssue : ruIssue}
      materials={materials}
      flow={flow}
      archive={[enIssue, ruIssue, olderEnIssue, olderRuIssue].filter(
        (issue) => issue.id !== (lang === 'en' ? 'en-1' : 'ru-1')
      )}
      subscribe={<div>Subscription form</div>}
    />
  );
}

function orderedIds(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('section[id]')).map(
    (element) => element.getAttribute('id') || ''
  );
}

describe('Journal FrontPage editorial composition', () => {
  it('shows the issue number, period, language, title, lead, metadata and CTA first', () => {
    renderPage('en');

    expect(screen.getByRole('heading', { level: 1, name: 'The Journal' })).toBeInTheDocument();
    expect(screen.getByText('Current issue')).toBeInTheDocument();
    expect(screen.getByText(/Issue №18/)).toBeInTheDocument();
    expect(screen.getByText(/Original language: In English/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'The English headline' })).toHaveAttribute(
      'lang',
      'en'
    );
    expect(
      screen.getByText(
        'A full editorial lead that explains what the issue is about and why it matters.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Pierrot, archives, and scarce attention.')).toBeInTheDocument();
    expect(screen.getAllByText('4 items').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /Read the issue/ })).toHaveAttribute(
      'href',
      '/en/flow-issues/issue-en'
    );
  });

  it('renders the actual published materials of the issue, not only a type summary', () => {
    const { container } = renderPage('en');

    expect(screen.getByRole('heading', { name: 'Inside this issue' })).toBeInTheDocument();
    expect(screen.getByText('Заметка о книге')).toBeInTheDocument();
    expect(screen.getByText('A Kandinsky record at Christie’s')).toBeInTheDocument();
    expect(screen.getByText('Ночная смена')).toBeInTheDocument();
    expect(screen.getByText('Opening night')).toBeInTheDocument();

    expect(container.querySelector('a[href="/flow/note-1"]')).not.toBeNull();
    expect(container.querySelector('a[href="https://www.artnews.com/story"]')).not.toBeNull();
    expect(container.querySelector('a[href="https://www.youtube.com/watch?v=abc"]')).not.toBeNull();
    expect(container.querySelector('a[href="/flow/photo-1"]')).not.toBeNull();

    expect(screen.getByAltText('Kandinsky painting')).toHaveAttribute(
      'src',
      'https://www.artnews.com/preview.jpg'
    );
    expect(screen.getByAltText('Night Shift thumbnail')).toBeInTheDocument();
    expect(screen.getByAltText('Opening night crowd')).toBeInTheDocument();
  });

  it('groups materials only by types that actually exist', () => {
    const { container } = renderPage('en');
    const groups = Array.from(
      container.querySelectorAll('#contents [data-material-kind]')
    ).map((element) => element.getAttribute('data-material-kind'));

    expect(groups).toEqual(['note', 'link', 'video', 'photo']);
    expect(container.querySelector('[data-material-kind="article"]')).toBeNull();
  });

  it('labels the issue language and each material language separately', () => {
    renderPage('en');

    expect(screen.getByText(/Original language: In English/)).toBeInTheDocument();
    expect(screen.getByText('Заметка о книге')).toHaveAttribute('lang', 'ru');
    expect(screen.getByText('A Kandinsky record at Christie’s')).toHaveAttribute('lang', 'en');
    expect(screen.getAllByText('In Russian').length).toBeGreaterThan(0);
    expect(screen.getAllByText('In English').length).toBeGreaterThan(0);
  });

  it('links to the same issue in the other language only when the period is confirmed', () => {
    renderPage('en');

    expect(
      screen.getByRole('link', { name: 'Other language edition: In Russian' })
    ).toHaveAttribute('href', '/flow-issues/issue-ru');
  });

  it('never invents a counterpart from a matching number in another period', () => {
    render(
      <FrontPage
        lang="en"
        featured={enIssue}
        materials={[]}
        flow={[]}
        archive={[{ ...olderRuIssue, number: enIssue.number }, olderEnIssue]}
        subscribe={<div>Subscription form</div>}
      />
    );

    expect(
      screen.queryByRole('link', { name: /Other language edition/ })
    ).not.toBeInTheDocument();
  });

  it('keeps Recent Flow, Archive and Subscribe below the issue contents', () => {
    const { container } = renderPage('en');

    expect(orderedIds(container)).toEqual([
      'issues',
      'contents',
      'stream',
      'archive',
      'subscribe',
    ]);
    expect(screen.getByRole('link', { name: /Full stream/ })).toHaveAttribute('href', '/flow');
    expect(screen.getByText('A recent English note')).toBeInTheDocument();
    expect(screen.getByText('Свежая русская статья')).toBeInTheDocument();
  });

  it('shows a compact multilingual archive preview with a link to the full archive', () => {
    const { container } = renderPage('en');

    expect(container.querySelectorAll('#archive ul li')).toHaveLength(3);
    expect(container.querySelector('a[href="/en/flow-issues/issue-en-old"]')).not.toBeNull();
    expect(container.querySelector('a[href="/flow-issues/issue-ru-old"]')).not.toBeNull();
    expect(screen.getByText('Старый русский выпуск')).toHaveAttribute('lang', 'ru');
    expect(screen.getByRole('link', { name: /All Flow issues/ })).toHaveAttribute(
      'href',
      '/en/flow-issues'
    );
  });

  it('renders complete Russian chrome on the Russian page', () => {
    renderPage('ru');

    expect(screen.getByRole('heading', { level: 1, name: 'Журнал' })).toBeInTheDocument();
    expect(screen.getByText('Текущий выпуск')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'В этом выпуске' })).toBeInTheDocument();
    expect(screen.getByText('Архив выпусков')).toBeInTheDocument();
    expect(screen.getByText('Подписка на еженедельную рассылку')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Все выпуски Flow/ })).toHaveAttribute(
      'href',
      '/flow-issues'
    );
  });

  it('shows an honest empty state when the issue materials could not be loaded', () => {
    render(
      <FrontPage
        lang="en"
        featured={enIssue}
        materials={[]}
        flow={[]}
        archive={[]}
        subscribe={<div>Subscription form</div>}
      />
    );

    expect(
      screen.getByText('The materials of this issue are being prepared.')
    ).toBeInTheDocument();
    expect(screen.queryByText('Notes')).not.toBeInTheDocument();
  });

  it('shows localized empty states instead of falling back to another language', () => {
    render(
      <FrontPage
        lang="en"
        featured={null}
        materials={[]}
        flow={[]}
        archive={[]}
        subscribe={<div>Subscription form</div>}
      />
    );

    expect(screen.getByText('The first issue is coming soon.')).toBeInTheDocument();
    expect(screen.getByText('No recent Flow entries yet.')).toBeInTheDocument();
    expect(screen.getByText('The issue archive is empty for now.')).toBeInTheDocument();
  });

  it('offers the correct journal language switch targets on both versions', () => {
    const en = renderPage('en');
    expect(screen.getByRole('link', { name: 'English (EN)' })).toHaveAttribute('href', '/journal');
    expect(screen.getByRole('link', { name: 'Russian (RU)' })).toHaveAttribute(
      'href',
      '/ru/journal'
    );
    en.unmount();

    renderPage('ru');
    expect(screen.getByRole('link', { name: 'English (EN)' })).toHaveAttribute('href', '/journal');
    expect(screen.getByRole('link', { name: 'Russian (RU)' })).toHaveAttribute(
      'href',
      '/ru/journal'
    );
  });

  it('renders exactly one page-level language switcher', () => {
    const { container } = renderPage('en');

    expect(container.querySelectorAll('nav[aria-label="Language selection"]')).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: 'English (EN)' })).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: 'Russian (RU)' })).toHaveLength(1);
  });

  it('keeps the featured headline complete and unwrapped by truncation utilities', () => {
    renderPage('en');
    const headline = screen.getByRole('heading', { level: 2, name: 'The English headline' });

    expect(headline.className).toContain('break-words');
    expect(headline.className).not.toMatch(/truncate|line-clamp|overflow-hidden/);
    expect(headline).toHaveTextContent('The English headline');
  });

  it('keeps the page from creating a second horizontal scroll container', () => {
    const { container } = renderPage('en');
    const page = container.firstElementChild as HTMLElement;

    expect(page.className).toContain('overflow-x-clip');
  });
});
