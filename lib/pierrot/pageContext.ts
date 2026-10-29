import { normalizePathname } from '@/lib/pierrot/navigation';
import type { PierrotOfferId } from '@/lib/pierrot/offers';

/**
 * Route context is a hint, not a purchase signal.
 *
 * A page can tell Pierrot which offer is likely to be relevant, but it never
 * turns an ordinary question into a commercial intent. The planner still
 * requires a conversational signal before it introduces anything.
 */
export type PierrotPageSurface =
  | 'postcard'
  | 'unframed'
  | 'unframed_reader'
  | 'unframed_proposal'
  | 'journal'
  | 'flow'
  | 'flow_join'
  | 'other';

export type PierrotPageContext = {
  pathname: string;
  surface: PierrotPageSurface;
  /** The catalogue entry a demonstrative question ("how much is this?") may resolve to. */
  contextOfferId: PierrotOfferId | null;
  /** Whether a proactive suggestion is allowed on this surface at all. */
  allowProactive: boolean;
  /** Short label used in the model prompt. */
  label: string;
};

const OTHER: PierrotPageContext = {
  pathname: '/',
  surface: 'other',
  contextOfferId: null,
  allowProactive: false,
  label: 'General site page',
};

function matches(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function resolvePierrotPageContext(pathname?: string | null): PierrotPageContext {
  const normalized = normalizePathname(typeof pathname === 'string' ? pathname : '/');

  if (matches(normalized, '/unframed/proposal')) {
    return {
      pathname: normalized,
      surface: 'unframed_proposal',
      contextOfferId: 'unframed',
      // A publisher/agent is already on the professional route. A consumer
      // sales pitch here would be the wrong conversation.
      allowProactive: false,
      label: 'UNFRAMED publisher proposal',
    };
  }

  if (matches(normalized, '/unframed/book')) {
    return {
      pathname: normalized,
      surface: 'unframed_reader',
      contextOfferId: 'unframed',
      allowProactive: true,
      label: 'UNFRAMED private manuscript reader',
    };
  }

  if (matches(normalized, '/unframed')) {
    return {
      pathname: normalized,
      surface: 'unframed',
      contextOfferId: 'unframed',
      allowProactive: true,
      label: 'UNFRAMED book page',
    };
  }

  if (matches(normalized, '/flow/join')) {
    return {
      pathname: normalized,
      surface: 'flow_join',
      contextOfferId: 'journal_flow',
      // The visitor is already looking at the subscription form. Repeating a
      // subscription pitch adds friction rather than reducing it.
      allowProactive: false,
      label: 'Flow subscription page',
    };
  }

  if (matches(normalized, '/flow')) {
    return {
      pathname: normalized,
      surface: 'flow',
      contextOfferId: 'journal_flow',
      allowProactive: true,
      label: 'Flow stream',
    };
  }

  if (matches(normalized, '/journal')) {
    return {
      pathname: normalized,
      surface: 'journal',
      contextOfferId: 'journal_flow',
      allowProactive: true,
      label: 'Journal',
    };
  }

  if (matches(normalized, '/heartandangel')) {
    return {
      pathname: normalized,
      surface: 'postcard',
      contextOfferId: 'heart_angel_postcard',
      allowProactive: true,
      label: 'Heart & Angel',
    };
  }

  return { ...OTHER, pathname: normalized };
}
