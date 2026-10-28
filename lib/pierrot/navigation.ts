/**
 * Curated navigation metadata for Pierrot.
 *
 * Only destinations that exist in the current route tree are listed here.
 * Free-form questions continue to be handled by the language model; known
 * sections and confirmations are handled deterministically by the client.
 */

export type PierrotSectionId =
  'art' | 'lobby' | 'selection' | 'journal' | 'advising' | 'media' | 'heritage';

export type PierrotMessageLink = {
  label: string;
  href: string;
};

export type PierrotChatAction =
  | {
      kind: 'navigate';
      label: string;
      sectionId: PierrotSectionId;
    }
  | {
      kind: 'prompt';
      label: string;
      prompt: string;
    };

export type PierrotSection = {
  id: PierrotSectionId;
  label: string;
  route: string;
  triggerText: string;
  aliases?: string[];
  actionLabel: string;
  intro: string;
  followUpPrompt: string;
  arrival: {
    content: string;
    links: PierrotMessageLink[];
  };
};

export const PIERROT_SECTIONS: Record<PierrotSectionId, PierrotSection> = {
  art: {
    id: 'art',
    label: 'Art',
    route: '/heartandangel',
    triggerText: 'Art',
    aliases: ['heart & angel', 'heart and angel'],
    actionLabel: 'Enter Art',
    intro: `Art is where the site becomes something other than a portfolio.

Heart & Angel is an ongoing multidisciplinary art project exploring the heart, the Angel and the Devil through painting, digital imagery, and interactive experiences.

Would you like to enter?`,
    followUpPrompt: 'Tell me more about Heart & Angel.',
    arrival: {
      content: `You're now in Heart & Angel.

There is more to this site than the gallery. You can explore the World, visit the Temple, try its rituals, or return to the Lobby.

Just ask, or select a section.`,
      links: [
        { label: 'World', href: '/heartandangel/world' },
        { label: 'Temple', href: '/temple' },
        { label: 'Rituals', href: '/heartandangel/calm' },
        { label: 'Lobby', href: '/lobby' },
      ],
    },
  },
  lobby: {
    id: 'lobby',
    label: 'Lobby',
    route: '/lobby',
    triggerText: 'Lobby',
    aliases: ['the lobby'],
    actionLabel: 'Enter Lobby',
    intro: `The Lobby is the private office: two decades of work across media, decentralized protocols, fine art, and heritage.

From here you can enter the Office, explore the Heritage archive, read the research and press, browse the Art Engine, or open UNFRAMED.

Would you like to enter?`,
    followUpPrompt: 'Tell me more about the Lobby.',
    arrival: {
      content: `You're now in the Lobby.

The Lobby is the private office. You can enter the Office, explore the Heritage archive, read the research and press, or open UNFRAMED.

Just ask, or select a section.`,
      links: [
        { label: 'Office', href: '/advising' },
        { label: 'Heritage', href: '/heritage' },
        { label: 'Research', href: '/research' },
        { label: 'UNFRAMED', href: '/unframed' },
      ],
    },
  },
  selection: {
    id: 'selection',
    label: 'Selection',
    route: '/selection',
    triggerText: 'Selection',
    aliases: ['the vault', 'vault'],
    actionLabel: 'Enter Selection',
    intro: `Selection is the vault: a curated, auction-catalogue view of works and chronicles.

Each entry carries the artist, year, and context around the piece. It is a record of what has been chosen, not everything that exists.

Would you like to enter?`,
    followUpPrompt: 'Tell me more about Selection.',
    arrival: {
      content: `You're now in Selection.

The vault is arranged as a catalogue; each card opens a work or chronicle. You can return to the Lobby, browse the Art Engine, or ask about anything you see.

Just ask, or select a section.`,
      links: [
        { label: 'Art Engine', href: '/art-engine' },
        { label: 'Lobby', href: '/lobby' },
        { label: 'Journal', href: '/journal' },
      ],
    },
  },
  journal: {
    id: 'journal',
    label: 'Journal',
    route: '/journal',
    triggerText: 'Journal',
    aliases: ['the journal'],
    actionLabel: 'Enter Journal',
    intro: `The Journal is the editorial record: notes on art, technology, and the architecture of value.

It brings together recent issues, the Flow stream, the issue archive, and a way to subscribe.

Would you like to enter?`,
    followUpPrompt: 'Tell me more about the Journal.',
    arrival: {
      content: `You're now in the Journal.

You can read the latest issues, follow the Flow, open the issue archive, or subscribe.

Just ask, or select a section.`,
      links: [
        { label: 'Issues', href: '/journal#issues' },
        { label: 'Flow', href: '/flow' },
        { label: 'Archive', href: '/letters' },
        { label: 'Subscribe', href: '/journal#subscribe' },
      ],
    },
  },
  advising: {
    id: 'advising',
    label: 'Advising',
    route: '/advising',
    triggerText: 'Advising',
    aliases: ['office', 'the office'],
    actionLabel: 'Enter Office',
    intro: `Advising is the Office: direct, peer-to-peer counsel at the intersection of technology, culture, and capital.

It covers horizon navigation, cultural capital, high-stakes boards, and confidential strategy sessions.

Would you like to enter?`,
    followUpPrompt: 'Tell me more about Advising.',
    arrival: {
      content: `You're now in Advising.

You can read the operating principles, review engagement formats, or start a direct conversation. The Lobby, Heritage, and the Media archive are also within reach.

Just ask, or select a section.`,
      links: [
        { label: 'Lobby', href: '/lobby' },
        { label: 'Heritage', href: '/heritage' },
        { label: 'Media', href: '/media' },
      ],
    },
  },
  media: {
    id: 'media',
    label: 'Media',
    route: '/media',
    triggerText: 'Media',
    aliases: ['media archive', 'the media archive'],
    actionLabel: 'Enter Media',
    intro: `Media is the public record: a chronological archive of interviews, commentary, columns, and citations.

You can filter it by year, format, language, topic, and publication; every entry links to the original source.

Would you like to enter?`,
    followUpPrompt: 'Tell me more about the Media archive.',
    arrival: {
      content: `You're now in Media.

The archive can be filtered by year, format, language, topic, and publication. Every record links to its original source. The Journal and Heritage archive are also within reach.

Just ask, or select a section.`,
      links: [
        { label: 'Journal', href: '/journal' },
        { label: 'Heritage', href: '/heritage' },
        { label: 'Lobby', href: '/lobby' },
      ],
    },
  },
  heritage: {
    id: 'heritage',
    label: 'Heritage',
    route: '/heritage',
    triggerText: 'Heritage',
    aliases: ['heritage archive', 'the heritage archive'],
    actionLabel: 'Enter Heritage',
    intro: `Heritage is the family archive: the documented legacy of sculptor Sergey Merkurov and Anton Merkurov's cultural and digital initiatives.

It moves through family history, the Gyumri house-museum, the Dynamo reliefs, death masks, digital art, the alphabet, press, and sources.

Would you like to enter?`,
    followUpPrompt: 'Tell me more about the Heritage Archive.',
    arrival: {
      content: `You're now in the Heritage Archive.

You can move through the chapters: Family, the Gyumri Museum, Dynamo, the Masks, Digital Art, Alphabet, Press, and Sources. The Lobby is also within reach.

Just ask, or select a section.`,
      links: [
        { label: 'Family', href: '/heritage#family' },
        { label: 'Museum', href: '/heritage#museum' },
        { label: 'Digital Art', href: '/heritage#digital' },
        { label: 'Lobby', href: '/lobby' },
      ],
    },
  },
};

export const PIERROT_SECTION_IDS = Object.keys(PIERROT_SECTIONS) as PierrotSectionId[];

export function isPierrotSectionId(value: unknown): value is PierrotSectionId {
  return (
    value === 'art' ||
    value === 'lobby' ||
    value === 'selection' ||
    value === 'journal' ||
    value === 'advising' ||
    value === 'media' ||
    value === 'heritage'
  );
}

export function getPierrotSection(sectionId: PierrotSectionId): PierrotSection {
  return PIERROT_SECTIONS[sectionId];
}

/**
 * Detect a section when the visitor types its name instead of clicking it.
 * Matching is deliberately narrow so ordinary questions still reach the API.
 */
export function findSectionByPrompt(text: string): PierrotSection | null {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/[.!?,;:…]+$/g, '')
    .replace(/\s+/g, ' ');

  if (!normalized) return null;

  return (
    PIERROT_SECTION_IDS.map((id) => PIERROT_SECTIONS[id]).find((section) =>
      [section.triggerText, ...(section.aliases ?? [])].some(
        (candidate) => candidate.toLowerCase() === normalized
      )
    ) ?? null
  );
}

const CONFIRMATION_PHRASES = new Set([
  'yes',
  'yes please',
  'yeah',
  'yep',
  'sure',
  'ok',
  'okay',
  'go',
  'go ahead',
  'show me',
  'show me around',
  'enter',
  'open',
  "let's go",
  'lets go',
  'do it',
  'please do',
  'да',
  'да пожалуйста',
  'ага',
  'давай',
  'идём',
  'идем',
  'войти',
  'покажи',
  'покажи мне',
  'открой',
  'конечно',
  'хорошо',
  'ладно',
  'вперёд',
  'вперед',
]);

/**
 * A confirmation only has meaning while a navigation proposal is pending.
 * Callers must check that separately, so a standalone "yes" never navigates.
 */
export function isNavigationConfirmation(text: string): boolean {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/[.!?,;:…]+$/g, '')
    .replace(/\s+/g, ' ');

  return CONFIRMATION_PHRASES.has(normalized);
}

export type PierrotNavigationBase = {
  id: string;
  sectionId: PierrotSectionId;
  route: string;
  confirmed: boolean;
  executed: boolean;
  arrivalDelivered: boolean;
  createdAt: number;
};

export type PierrotNavigationProposal = PierrotNavigationBase & {
  pending: true;
};

export type PierrotNavigationRecord = PierrotNavigationBase & {
  pending: false;
};

export function createPierrotId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `pierrot-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createNavigationProposal(
  sectionId: PierrotSectionId,
  id: string = createPierrotId()
): PierrotNavigationProposal {
  const section = getPierrotSection(sectionId);

  return {
    id,
    sectionId,
    route: section.route,
    pending: true,
    confirmed: false,
    executed: false,
    arrivalDelivered: false,
    createdAt: Date.now(),
  };
}

export function createNavigationRecord(
  proposal: PierrotNavigationProposal
): PierrotNavigationRecord {
  const section = getPierrotSection(proposal.sectionId);

  return {
    ...proposal,
    route: section.route,
    pending: false,
    confirmed: true,
    executed: true,
    arrivalDelivered: false,
  };
}

export function normalizePathname(pathname: string): string {
  return pathname.replace(/\/+$/, '').toLowerCase() || '/';
}

/**
 * Never trust a persisted route. The destination always comes from the
 * section metadata; a tampered or unknown record is ignored.
 */
export function parseNavigationRecord(raw: string | null): PierrotNavigationRecord | null {
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object') return null;

    const value = parsed as Record<string, unknown>;

    if (
      typeof value.id !== 'string' ||
      !value.id ||
      !isPierrotSectionId(value.sectionId) ||
      typeof value.arrivalDelivered !== 'boolean'
    ) {
      return null;
    }

    const section = getPierrotSection(value.sectionId);
    const createdAt = typeof value.createdAt === 'number' ? value.createdAt : Date.now();

    return {
      id: value.id,
      sectionId: value.sectionId,
      route: section.route,
      pending: false,
      confirmed: true,
      executed: true,
      arrivalDelivered: value.arrivalDelivered,
      createdAt,
    };
  } catch {
    return null;
  }
}
