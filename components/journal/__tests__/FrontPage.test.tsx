import React from 'react';
import { render, screen } from '@testing-library/react';
import FrontPage, { type FlowEntry, type FrontIssue } from '../FrontPage';
import type { JournalMaterial } from '@/lib/journal/issue';

const enIssue: FrontIssue = {
  id: 'en-1',
  slug: 'issue-en',
  lang: 'en',
  number: 18,
  headline: 'UNFRAMED // Episode 0: The Spectral Tiger | Anton Merkurov',
  excerpt: 'English excerpt.',
  summary: 'Notes 2, Links 1',
  published: 5,
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
  headline: 'Русский заголовок — Антон Меркуров',
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
    id: 'lead-1',
    kind: 'article',
    type: 'article',
    lang: 'en',
    title: enIssue.headline,
    body: 'The complete lead story text.',
    description: 'The lead story as a short editorial preview.',
    url: 'https://www.merkurov.love/unframed/spectral-tiger',
    image: 'https://cdn.example.com/lead.jpg',
    imageAlt: 'Spectral Tiger lead image',
    siteName: '',
    publishedAt: '2026-11-18T10:00:00.000Z',
    isLead: true,
    isExternal: false,
  },
  {
    id: 'post-1',
    kind: 'note',
    type: 'note',
    lang: 'ru',
    title: 'Заметка о книге',
    body: 'Полный текст заметки о книге UNFRAMED.',
    description: '',
    url: 'https://www.merkurov.love/flow/post-1',
    image: null,
    imageAlt: '',
    siteName: '',
    publishedAt: '2026-11-17T10:00:00.000Z',
    isLead: false,
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
    publishedAt: '2026-11-17T09:00:00.000Z',
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
  {
    id: 'extra-1',
    kind: 'article',
    type: 'article',
    lang: 'en',
    title: 'An extra article that must stay in the full issue only',
    body: 'This item is published but is not selected for the compact front page.',
    description: '',
    url: 'https://www.merkurov.love/flow/extra-1',
    image: null,
    imageAlt: '',
    siteName: '',
    publishedAt: '2026-11-14T10:00:00.000Z',
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

function materialsFor(lang: 'en' | 'ru'): JournalMaterial[] {
  if (lang === 'en') return materials;

  return materials.map((material) =>
    material.isLead ? { ...material, lang: 'ru', title: ruIssue.headline } : material
  );
}

function renderPage(lang: 'en' | 'ru') {
  return render(
    <FrontPage
      lang={lang}
      featured={lang === 'en' ? enIssue : ruIssue}
      materials={materialsFor(lang)}
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

function selectedIds(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('#contents [data-material-id]')).map(
    (element) => element.getAttribute('data-material-id') || ''
  );
}

describe('Journal FrontPage editorial composition', () => {
  it('shows one main material with the issue context and a normalized headline', () => {
    renderPage('en');

    expect(screen.getByRole('heading', { level: 1, name: 'The Journal' })).toBeInTheDocument();
    expect(screen.getByText('Current issue')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /Current issue/ })).toHaveTextContent(
      '№18'
    );
    expect(screen.getByText(/Original language/)).toBeInTheDocument();
    expect(screen.getAllByText('In English').length).toBeGreaterThan(0);

    const headline = screen.getByRole('heading', {
      level: 3,
      name: 'UNFRAMED // Episode 0: The Spectral Tiger',
    });
    expect(headline).toHaveAttribute('lang', 'en');
    expect(headline).not.toHaveTextContent('Anton Merkurov');
    expect(headline).not.toHaveTextContent('Flow');

    expect(screen.getByText('Pierrot, archives, and scarce attention.')).toBeInTheDocument();
    expect(screen.getByText('The lead story as a short editorial preview.')).toBeInTheDocument();
  });

  it('keeps the main story title free of site, author and service suffixes in both languages', () => {
    const ru = renderPage('ru');

    const headline = screen.getByRole('heading', { level: 3, name: 'Русский заголовок' });
    expect(headline).toHaveAttribute('lang', 'ru');
    expect(headline).not.toHaveTextContent('Антон Меркуров');

    ru.unmount();
  });

  it('renders one main material and exactly four selected materials, one per format', () => {
    const { container } = renderPage('en');

    expect(screen.getByRole('heading', { name: "What's inside" })).toBeInTheDocument();
    expect(selectedIds(container)).toEqual(['post-1', 'photo-1', 'video-1', 'link-1']);
    expect(container.querySelectorAll('#contents [data-material-format]')).toHaveLength(4);
    expect(
      Array.from(container.querySelectorAll('#contents [data-material-format]')).map((element) =>
        element.getAttribute('data-material-format')
      )
    ).toEqual(['post', 'photo', 'video', 'link']);
  });

  it('never repeats the main material and never renders unselected issue materials', () => {
    const { container } = renderPage('en');

    expect(container.querySelector('#contents [data-material-id="lead-1"]')).toBeNull();
    expect(container.querySelector('#contents [data-material-id="extra-1"]')).toBeNull();
    expect(screen.queryByText('An extra article that must stay in the full issue only')).toBeNull();
  });

  it('keeps each selected format visually distinct instead of repeating one card', () => {
    const { container } = renderPage('en');

    expect(container.querySelector('#contents [data-material-format="post"] img')).toBeNull();
    expect(container.querySelector('#contents [data-material-format="link"] img')).toBeNull();
    expect(container.querySelector('#contents [data-material-format="video"] img')).not.toBeNull();
    expect(container.querySelector('#contents [data-material-format="photo"] img')).not.toBeNull();
    expect(screen.getByText('ARTnews.com')).toBeInTheDocument();
  });

  it('links to the full issue, the lead material and every selected material', () => {
    const { container } = renderPage('en');

    const fullIssue = screen.getByRole('link', { name: /Read the full issue/ });
    expect(fullIssue).toHaveAttribute('href', '/en/flow-issues/issue-en');
    expect(fullIssue.closest('#issues')).not.toBeNull();
    expect(fullIssue.closest('#contents')).toBeNull();
    expect(container.querySelector('#contents')?.compareDocumentPosition(fullIssue)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(container.querySelector('a[href="/unframed/spectral-tiger"]')).not.toBeNull();
    expect(container.querySelector('a[href="/flow/post-1"]')).not.toBeNull();
    expect(container.querySelector('a[href="https://www.artnews.com/story"]')).not.toBeNull();
    expect(container.querySelector('a[href="https://www.youtube.com/watch?v=abc"]')).not.toBeNull();
    expect(container.querySelector('a[href="/flow/photo-1"]')).not.toBeNull();
  });

  it('separates the main-material action from the full-issue action', () => {
    const { container } = renderPage('en');

    const mainAction = screen
      .getAllByRole('link', { name: /Open material/ })
      .find((link) => link.closest('[data-role="main-material"]'));
    const fullIssue = screen.getByRole('link', { name: /Read the full issue/ });

    expect(mainAction).toBeDefined();

    expect(mainAction?.closest('[data-role="main-material"]')).not.toBeNull();
    expect(fullIssue).toHaveAttribute('data-role', 'full-issue');
    // The full-issue transition is an editorial text link, not a filled CTA.
    expect(fullIssue.className).not.toContain('bg-[#1D1B18]');
    expect(fullIssue.className).not.toContain('text-[#F5F2EB]');
    expect(fullIssue.className).toContain('border-t');
    expect(container.querySelector('#issues [data-role="full-issue"]')).not.toBeNull();
    expect(container.querySelector('#contents [data-role="full-issue"]')).toBeNull();
  });

  it('labels the main story and keeps the inside selection explicitly partial', () => {
    renderPage('en');

    expect(screen.getByText('Main story')).toBeInTheDocument();
    expect(
      screen.getByText('A selection, not the full issue: the main story and up to four formats.')
    ).toBeInTheDocument();
  });

  it('labels the issue language and each material language separately', () => {
    renderPage('en');

    expect(screen.getByText(/Original language/)).toBeInTheDocument();
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

    expect(screen.queryByRole('link', { name: /Other language edition/ })).not.toBeInTheDocument();
  });

  it('keeps Recent Flow, Archive and Subscribe as independent sections below the issue', () => {
    const { container } = renderPage('en');

    expect(orderedIds(container)).toEqual(['issues', 'contents', 'stream', 'archive', 'subscribe']);
    expect(screen.getByRole('link', { name: /Full stream/ })).toHaveAttribute('href', '/flow');
    expect(screen.getByText('A recent English note')).toBeInTheDocument();
    expect(screen.getByText('Свежая русская статья')).toBeInTheDocument();
  });

  it('shows a compact multilingual archive preview with a link to the full archive', () => {
    const { container } = renderPage('en');

    expect(container.querySelectorAll('#archive ul li')).toHaveLength(2);
    expect(container.querySelector('#archive a[href="/flow-issues/issue-ru"]')).toBeNull();
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
    expect(screen.getByText('Главный материал')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Что внутри' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Читать полный выпуск/ })).toHaveAttribute(
      'href',
      '/flow-issues/issue-ru'
    );
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

    expect(screen.getByText('The materials of this issue are being prepared.')).toBeInTheDocument();
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
    const headline = screen.getByRole('heading', {
      level: 3,
      name: 'UNFRAMED // Episode 0: The Spectral Tiger',
    });

    expect(headline.className).toContain('break-words');
    expect(headline.className).not.toMatch(/truncate|line-clamp|overflow-hidden/);
    expect(headline).toHaveTextContent('UNFRAMED // Episode 0: The Spectral Tiger');
  });

  it('does not mask layout errors with a global overflow lock', () => {
    const { container } = renderPage('en');
    const page = container.firstElementChild as HTMLElement;

    expect(page.className).not.toContain('overflow-x-clip');
    expect(page.className).not.toContain('overflow-hidden');
  });

  it('falls back to a typographic cover when the lead has no image', () => {
    const noImageMaterials = materials.map((material) => ({ ...material, image: null }));

    const { container } = render(
      <FrontPage
        lang="en"
        featured={enIssue}
        materials={noImageMaterials}
        flow={[]}
        archive={[]}
        subscribe={<div>Subscription form</div>}
      />
    );

    expect(container.querySelector('#issues figure')).toBeNull();
    expect(container.querySelector('#current-issue-title')).toHaveTextContent(
      'UNFRAMED // Episode 0: The Spectral Tiger'
    );
  });

  it('uses the main material itself, not a duplicate, for the cover', () => {
    const { container } = renderPage('en');
    const issueSection = container.querySelector('#issues');
    const contents = container.querySelector('#contents');

    expect(issueSection?.textContent).toContain('UNFRAMED // Episode 0: The Spectral Tiger');
    expect(contents?.textContent).not.toContain('UNFRAMED // Episode 0: The Spectral Tiger');
    expect(contents?.textContent).toContain('Заметка о книге');
  });
});
