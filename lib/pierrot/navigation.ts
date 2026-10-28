/**
 * Curated navigation metadata for Pierrot.
 *
 * Only destinations that exist in the current route tree are listed here.
 * Free-form questions continue to be handled by the language model; known
 * sections and confirmations are handled deterministically by the client.
 */

export type PierrotSectionId = 'art' | 'lobby';

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
};

export const PIERROT_SECTION_IDS = Object.keys(PIERROT_SECTIONS) as PierrotSectionId[];

export function isPierrotSectionId(value: unknown): value is PierrotSectionId {
  return value === 'art' || value === 'lobby';
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
    PIERROT_SECTION_IDS.map((id) => PIERROT_SECTIONS[id]).find(
      (section) => section.triggerText.toLowerCase() === normalized
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
