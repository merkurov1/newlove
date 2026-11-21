/**
 * Complete journal issue catalogue loader.
 *
 * The interface language is deliberately not part of this query. `/journal`
 * and `/ru/journal` share one archive: a Russian issue remains visible in the
 * English catalogue (and vice versa) and keeps its own `lang` for display.
 *
 * Supabase/PostgREST applies a server-side row limit when a query does not
 * page explicitly. The archive must not inherit that limit, so rows are read
 * in deterministic pages until the catalogue is exhausted.
 */

export const JOURNAL_ISSUE_PAGE_SIZE = 100;
const MAX_JOURNAL_ISSUE_PAGES = 100;

export const JOURNAL_ISSUE_SELECT =
  'id,title,slug,publishedAt,sentAt,createdAt,lang,number,' +
  'leadTitle:payload->lead->>title,leadBody:payload->lead->>body,' +
  'itemCount:payload->stats->>published,byType:payload->stats->>byType,' +
  'periodStart:payload->period->>start,periodEnd:payload->period->>end';

export type JournalIssueRow = {
  id?: string | number | null;
  title?: string | null;
  slug?: string | null;
  publishedAt?: string | null;
  sentAt?: string | null;
  createdAt?: string | null;
  lang?: string | null;
  number?: number | null;
  [key: string]: unknown;
};

/**
 * The catalogue query stays deliberately small: archive rows only need
 * metadata. The complete payload (including the canonical material list) is
 * read for the single featured issue.
 */
export const JOURNAL_ISSUE_DETAIL_SELECT = 'id,payload,content';

export type JournalIssueDetailRow = {
  id?: string | number | null;
  payload?: unknown;
  content?: string | null;
};

/**
 * Load the stored payload for one issue. The public page uses this to read
 * `payload.items`; it never reads `html_web` or `html_email` snapshots.
 */
export async function loadJournalIssueDetail(
  supabase: any,
  issueId: string | number
): Promise<JournalIssueDetailRow | null> {
  if (issueId == null || issueId === '') return null;

  const { data, error } = await supabase
    .from('letters')
    .select(JOURNAL_ISSUE_DETAIL_SELECT)
    .eq('id', issueId)
    .eq('kind', 'issue')
    .eq('status', 'published')
    .eq('published', true)
    .maybeSingle();

  if (error) throw error;

  return data && typeof data === 'object' ? (data as JournalIssueDetailRow) : null;
}

export type LoadJournalIssuesOptions = {
  pageSize?: number;
};

/**
 * Load every published Flow issue for the journal catalogue.
 *
 * Errors are thrown to the caller so the page can distinguish "empty archive"
 * from "archive could not be loaded"; a partial page is never presented as
 * the complete catalogue.
 */
export async function loadAllJournalIssues(
  supabase: any,
  options: LoadJournalIssuesOptions = {}
): Promise<JournalIssueRow[]> {
  const requested = Number(options.pageSize ?? JOURNAL_ISSUE_PAGE_SIZE);
  const pageSize =
    Number.isFinite(requested) && requested > 0
      ? Math.floor(Math.min(requested, 500))
      : JOURNAL_ISSUE_PAGE_SIZE;

  const rows: JournalIssueRow[] = [];
  const seen = new Set<string>();

  for (let page = 0; page < MAX_JOURNAL_ISSUE_PAGES; page++) {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const base = supabase
      .from('letters')
      .select(JOURNAL_ISSUE_SELECT)
      .eq('published', true)
      .eq('kind', 'issue')
      .order('publishedAt', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false });

    const supportsRange = typeof base?.range === 'function';
    const query = supportsRange ? base.range(from, to) : base;
    const { data, error } = await query;

    if (error) throw error;

    const batch: JournalIssueRow[] = Array.isArray(data) ? data : [];

    for (const row of batch) {
      const id = row?.id == null ? '' : String(row.id);

      // A row can move between pages while the archive is being read. Never
      // show the same issue twice.
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);

      rows.push(row);
    }

    // Without range support we cannot request another page safely. Returning
    // the available rows is better than re-reading the same page forever.
    if (!supportsRange) break;
    if (batch.length < pageSize) break;
  }

  return rows;
}
