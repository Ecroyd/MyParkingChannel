// Minimal types for node:sqlite (built into Node 24; the repo's @types/node predates it).
declare module 'node:sqlite' {
  type SqlValue = string | number | bigint | null | Uint8Array;

  export interface StatementSync {
    run(...params: SqlValue[]): { changes: number | bigint; lastInsertRowid: number | bigint };
    get(...params: SqlValue[]): Record<string, SqlValue> | undefined;
    all(...params: SqlValue[]): Record<string, SqlValue>[];
  }

  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
