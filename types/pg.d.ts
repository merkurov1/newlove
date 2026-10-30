declare module 'pg' {
  export type QueryResult<T = Record<string, unknown>> = {
    rows: T[];
  };

  export class Client {
    constructor(config?: {
      connectionString?: string;
      ssl?: false | { rejectUnauthorized?: boolean };
    });
    connect(): Promise<void>;
    query<T = Record<string, unknown>>(
      text: string,
      values?: unknown[]
    ): Promise<QueryResult<T> & { rowCount: number | null }>;
    end(): Promise<void>;
  }

  export class Pool {
    constructor(config?: {
      connectionString?: string;
      max?: number;
      idleTimeoutMillis?: number;
      connectionTimeoutMillis?: number;
      ssl?: false | { rejectUnauthorized?: boolean };
    });
    query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<QueryResult<T>>;
    end(): Promise<void>;
  }
}
