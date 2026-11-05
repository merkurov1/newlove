/**
 * Minimal embedding contract shared by the memory store, the search module and
 * tests. No server-only imports so it can be referenced from client-safe types.
 */
export type MemoryEmbeddingClient = {
  modelId: string;
  dimensions: number;
  embed(texts: string[], signal?: AbortSignal): Promise<number[][]>;
};
