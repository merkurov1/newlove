/**
 * @jest-environment node
 */
import {
  approveScript,
  listScripts,
  saveScriptVersion,
  type EpisodeRecord,
} from '../episodes';

type Row = Record<string, unknown> & { id: string };

function makeArtifactStore() {
  let rows: Row[] = [];
  let sequence = 1;

  function builder(table: string) {
    const filters: Array<[string, unknown]> = [];
    let operation: 'select' | 'insert' | 'update' | 'upsert' = 'select';
    let payload: Record<string, unknown> = {};

    const matches = (row: Row) => filters.every(([column, value]) => row[column] === value);
    const apply = () => {
      if (operation === 'select') return rows.filter(matches);
      if (operation === 'insert') {
        const row = {
          id: String(payload.id || `row-${sequence++}`),
          created_at: new Date().toISOString(),
          ...payload,
        } as Row;
        rows.push(row);
        return [row];
      }
      if (operation === 'upsert') {
        const id = payload.id ? String(payload.id) : `row-${sequence++}`;
        const created = rows.find((row) => row.id === id);
        if (created) {
          rows = rows.map((row) => (row.id === id ? { ...row, ...payload, id } : row));
        } else {
          rows.push({
            id,
            created_at: new Date().toISOString(),
            ...payload,
          } as Row);
        }
        return rows.filter((row) => row.id === id);
      }
      rows = rows.map((row) => (matches(row) ? { ...row, ...payload } : row));
      return rows.filter(matches);
    };

    const result = () => ({ data: apply(), error: null });
    const api: Record<string, unknown> = {};
    api.select = () => api;
    api.insert = (value: Record<string, unknown>) => {
      operation = 'insert';
      payload = value;
      return api;
    };
    api.upsert = (value: Record<string, unknown>) => {
      operation = 'upsert';
      payload = value;
      return api;
    };
    api.update = (value: Record<string, unknown>) => {
      operation = 'update';
      payload = value;
      return api;
    };
    api.eq = (column: string, value: unknown) => {
      filters.push([column, value]);
      return api;
    };
    api.order = () => api;
    api.limit = () => api;
    api.single = async () => {
      const value = apply()[0] || null;
      return { data: value, error: value ? null : { message: 'not_found' } };
    };
    api.maybeSingle = async () => ({ data: apply()[0] || null, error: null });
    api.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve(result()).then(resolve);
    return { table, api };
  }

  return {
    rows: () => rows,
    store: {
      from: (table: string) => builder(table).api,
    } as never,
  };
}

function episode(): EpisodeRecord {
  return {
    id: 'episode-1',
    number: 43,
    title: 'The Alphabet and the Token',
    workingTitle: 'The Alphabet and the Token',
    status: 'SCRIPT',
    manuscriptDocumentId: 'doc_unframed_manuscript',
    chapterNumber: 39,
    chapterLabel: 'CHAPTER 39: THE ALPHABET AND THE TOKEN',
    chunkIds: ['chk_39a'],
    sourcePassages: [],
    centralStory: '',
    thesis: '',
    narrativeAngle: '',
    historicalPeriod: '2010s',
    keyCharacters: [],
    keyEvents: [],
    visualConcept: '',
    scriptId: null,
    approvedScriptId: null,
    voiceover: '',
    visualPrompts: [],
    music: '',
    videoUrl: '',
    publicationDate: null,
    publicPageUrl: '',
    description: '',
    relatedEpisodes: [],
    editorialNotes: '',
    createdAt: '2026-11-13T00:00:00.000Z',
    updatedAt: '2026-11-13T00:00:00.000Z',
    history: [],
  };
}

describe('script version safety', () => {
  it('M. preserves a previous approved script when a new version is approved', async () => {
    const fake = makeArtifactStore();
    const base = {
      ownerUserId: 'owner-1',
      projectId: 'project-1',
      episodeNumber: 43,
      title: 'The Alphabet and the Token',
      sourceChunkIds: ['chk_39a'],
      store: fake.store,
    };

    const first = await saveScriptVersion({ ...base, content: 'APPROVED VERSION ONE', note: 'first' });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const firstApproval = await approveScript({
      ownerUserId: 'owner-1',
      projectId: 'project-1',
      episode: episode(),
      scriptId: first.script.id,
      store: fake.store,
    });
    expect(firstApproval.ok).toBe(true);

    const second = await saveScriptVersion({ ...base, content: 'DRAFT VERSION TWO', note: 'second' });
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    const secondApproval = await approveScript({
      ownerUserId: 'owner-1',
      projectId: 'project-1',
      episode: episode(),
      scriptId: second.script.id,
      store: fake.store,
    });
    expect(secondApproval.ok).toBe(true);

    const scripts = await listScripts({
      ownerUserId: 'owner-1',
      projectId: 'project-1',
      episodeNumber: 43,
      store: fake.store,
    });
    expect(scripts.error).toBeNull();
    const one = scripts.scripts.find((script) => script.id === first.script.id);
    const two = scripts.scripts.find((script) => script.id === second.script.id);
    expect(one?.status).toBe('superseded');
    expect(one?.content).toBe('APPROVED VERSION ONE');
    expect(two?.status).toBe('approved');
    expect(two?.content).toBe('DRAFT VERSION TWO');
  });
});
