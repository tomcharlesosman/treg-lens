// Node 22.13+ provides this built-in module; the repository's Node 20 type
// package predates it. Keep this declaration limited to the API we use.
declare module "node:sqlite" {
  export type SQLInputValue = null | number | bigint | string | Uint8Array;
  export type SQLOutputValue = null | number | bigint | string | Uint8Array;
  export interface StatementSync {
    get(...parameters: SQLInputValue[]): Record<string, SQLOutputValue> | undefined;
    all(...parameters: SQLInputValue[]): Record<string, SQLOutputValue>[];
    run(...parameters: SQLInputValue[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  }
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
