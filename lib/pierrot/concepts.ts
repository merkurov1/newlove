/**
 * Canonical concepts for free-form Pierrot conversations.
 *
 * These are editorial anchors, not a replacement for the model's knowledge.
 * The API injects only the most relevant entries so Pierrot explains the
 * project's own vocabulary instead of improvising a generic art-history answer.
 */

import { normalizePathname } from '@/lib/pierrot/navigation';

export type PierrotConcept = {
  id: string;
  title: string;
  summary: string;
  aliases: string[];
  routes?: string[];
};

export const PIERROT_CONCEPTS: PierrotConcept[] = [
  {
    id: 'pierrot',
    title: 'Pierrot',
    summary:
      "Pierrot is Anton Merkurov's digital shadow and the gatekeeper of the Digital Temple: a concise, ironic, hospitable guide to the site, its projects and its public archive. It is not Anton and never claims to be him.",
    aliases: ['pierrot', 'пьеро', 'digital shadow', 'цифровая тень', 'gatekeeper'],
    routes: ['/'],
  },
  {
    id: 'conceptualism',
    title: 'Conceptualism / context as material',
    summary:
      "Anton's conceptual approach treats context as the material of the work: archives, interfaces, rituals, and texts are arranged so an idea can be experienced, not merely illustrated.",
    aliases: ['conceptualism', 'концептуализм', 'concept', 'концепция'],
    routes: ['/'],
  },
  {
    id: 'context-architecture',
    title: 'Context Architecture',
    summary:
      "The practice of building the cultural, historical, and technical frame around a work or decision so it becomes legible. The site's own formula: structure is the antidote to chaos.",
    aliases: ['context architecture', 'контекстная архитектура', 'context'],
    routes: ['/'],
  },
  {
    id: 'cultural-capital',
    title: 'Cultural Capital',
    summary:
      'The trust, references, access, and historical weight around art and heritage — not simply money.',
    aliases: ['cultural capital', 'культурный капитал'],
    routes: ['/', '/advising'],
  },
  {
    id: 'heart-and-angel',
    title: 'Heart & Angel',
    summary:
      'An ongoing multidisciplinary art project exploring the heart, the Angel, and the Devil through painting, digital imagery, and interactive experiences. Love is treated as a survival strategy, not a romantic category.',
    aliases: ['heart & angel', 'heart and angel', 'ангел', 'сердце'],
    routes: ['/heartandangel'],
  },
  {
    id: 'digital-temple',
    title: 'The Digital Temple',
    summary:
      'The Sanctuary: a digital temple of presence, ritual, and traces, with small rituals for love, release, calm, and memory.',
    aliases: ['temple', 'храм', 'ritual', 'ритуал', 'sanctuary'],
    routes: [
      '/temple',
      '/heartandangel/calm',
      '/heartandangel/letitgo',
      '/vigil',
      '/absolution',
      '/tribute',
    ],
  },
  {
    id: 'heritage',
    title: 'Heritage Archive',
    summary:
      'The documented legacy of sculptor Sergey Merkurov: family archive, the Gyumri house-museum, the Dynamo reliefs, death masks, and contemporary digital art.',
    aliases: ['heritage', 'наследие', 'gyumri', 'гюмри', 'merkurov museum'],
    routes: ['/heritage'],
  },
  {
    id: 'unframed',
    title: 'UNFRAMED / Flow',
    summary:
      'A memoir and publishing thread about closing the loop and returning to the line, connected to Flow, the Journal, and the letter archive.',
    aliases: ['unframed', 'анфреймд', 'memoir', 'мемуар'],
    routes: ['/unframed', '/flow', '/journal', '/letters'],
  },
  {
    id: 'selection',
    title: 'Selection',
    summary:
      'The vault: curated works and chronicles presented as an auction catalogue, with artist, year, and context around each entry.',
    aliases: ['selection', 'vault', 'выбор', 'хранилище'],
    routes: ['/selection'],
  },
  {
    id: 'media',
    title: 'Media Archive',
    summary:
      'The public record: interviews, expert commentary, author columns, and citations, each linked to its original publication.',
    aliases: ['media', 'медиа', 'press', 'пресса'],
    routes: ['/media'],
  },
  {
    id: 'advising',
    title: 'Advising / The Office',
    summary:
      'Direct, peer-to-peer counsel at the intersection of technology, culture, and capital, designed for high-consequence environments.',
    aliases: ['advising', 'advisory', 'office', 'советник', 'офис'],
    routes: ['/advising'],
  },
];

function matchesRoute(pathname: string, route: string): boolean {
  const current = normalizePathname(pathname);
  const target = normalizePathname(route);

  return current === target || current.startsWith(`${target}/`);
}

export function selectConceptsForContext({
  pathname,
  message,
  limit = 3,
}: {
  pathname?: string;
  message: string;
  limit?: number;
}): PierrotConcept[] {
  const normalizedMessage = message.trim().toLowerCase();
  const aliasMatches: PierrotConcept[] = [];
  const routeMatches: PierrotConcept[] = [];

  for (const concept of PIERROT_CONCEPTS) {
    const aliasMatch = concept.aliases.some((alias) =>
      normalizedMessage.includes(alias.toLowerCase())
    );

    if (aliasMatch) {
      aliasMatches.push(concept);
      continue;
    }

    const routeMatch = pathname && concept.routes?.some((route) => matchesRoute(pathname, route));

    if (routeMatch) {
      routeMatches.push(concept);
    }
  }

  const selected = [...aliasMatches, ...routeMatches];

  if (selected.length === 0) {
    const fallback = PIERROT_CONCEPTS.find((concept) => concept.id === 'conceptualism');
    if (fallback) selected.push(fallback);
  }

  return selected.slice(0, limit);
}

export function buildPierrotContextPrompt({
  pathname,
  sectionLabel,
  sectionRoute,
  message,
}: {
  pathname?: string;
  sectionLabel?: string;
  sectionRoute?: string;
  message: string;
}): string {
  const concepts = selectConceptsForContext({ pathname, message });

  const lines = [
    'SITE CONTEXT (canonical, do not contradict):',
    '- The site is merkurov.love by Anton Merkurov.',
    '- Known sections: Art (/heartandangel), Lobby (/lobby), Selection (/selection), Journal (/journal), Advising (/advising), Media (/media), Heritage (/heritage).',
  ];

  if (pathname) {
    lines.push(`- Current route: ${pathname}`);
  }

  if (sectionLabel && sectionRoute) {
    lines.push(`- Current section: ${sectionLabel} (${sectionRoute})`);
  }

  if (concepts.length > 0) {
    lines.push('CANONICAL CONCEPTS:');
    concepts.forEach((concept) => {
      lines.push(`- ${concept.title}: ${concept.summary}`);
    });
  }

  lines.push(
    'Use this context only when relevant. Do not invent routes, artworks, or features. If the visitor asks something outside it, answer honestly and briefly.'
  );

  return lines.join('\n');
}
