// lib/mockSupabaseClient.ts
// Small defensive mock that mimics the Supabase client shape enough for the app
// to run when the real database is unavailable. Returns empty data sets and
// harmless results for common operations. Intended for emergency fallback only.

function makeThenable(result: any) {
  const obj: any = {
    data: result.data ?? null,
    error: result.error ?? null,
    status: result.status ?? null,
  };
  // Chainable methods used in the codebase
  const chain = new Proxy(obj, {
    get(target, prop) {
      if (prop === 'then') return target.then;
      // Return chainable functions that resolve to the same default result
      return () => chain;
    }
  });

  // Promise-like then behavior
  (chain as any).then = (resolve: any) => {
    resolve({ data: obj.data, error: obj.error });
  };

  return chain;
}

class MockFrom {
  table: string;
  constructor(table: string) { this.table = table; }
  select() { return makeThenable({ data: [] }); }
  in() { return makeThenable({ data: [] }); }
  eq() { return makeThenable({ data: [] }); }
  maybeSingle() { return makeThenable({ data: null }); }
  single() { return makeThenable({ data: null }); }
  insert() { return makeThenable({ data: null }); }
  update() { return makeThenable({ data: null }); }
  delete() { return makeThenable({ data: null }); }
  upsert() { return makeThenable({ data: null }); }
  order() { return makeThenable({ data: [] }); }
  limit() { return makeThenable({ data: [] }); }
}

export function createMockSupabase() {
  return {
    from: (table: string) => new MockFrom(table),
    rpc: async (_name: string, _params?: any) => ({ data: null, error: null }),
    storage: {
      from: () => ({ list: async () => ({ data: [], error: null }) })
    },
    auth: {
      getUser: async () => ({ data: { user: null }, error: null })
    }
  } as any;
}

export default createMockSupabase;
