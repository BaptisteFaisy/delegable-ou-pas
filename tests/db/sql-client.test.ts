/**
 * The SQL façade, tested with a Forge-shaped double (SPEC §17, SPEC §19,
 * DP-18).
 *
 * No network, no Forge: the double only records what it receives, which is
 * exactly what the production path sends to `@forge/sql`.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import { describe, expect, it } from 'vitest';
import { DDL } from '../../src/db/schema.js';
import { createDdlRunner, createSqlClient } from '../../src/db/sql-client.js';

interface Call {
  readonly statement: string;
  readonly parameters: readonly unknown[];
}

/** A double of the Forge SQL singleton: `prepare().bindParams().execute()`. */
function forgeDouble(rows: unknown) {
  const calls: Call[] = [];
  const sql = {
    prepare(statement: string) {
      return {
        bindParams(...parameters: unknown[]) {
          return {
            async execute(): Promise<{ rows: unknown }> {
              calls.push({ statement, parameters });
              return { rows };
            },
          };
        },
      };
    },
  };
  return { sql, calls };
}

describe('createSqlClient', () => {
  it('sends a write through prepare/bindParams/execute', async () => {
    const { sql, calls } = forgeDouble({ affectedRows: 1 });
    const client = createSqlClient({ sql });
    await client.execute('INSERT INTO involvement (issue_id) VALUES (?)', ['PROJ-1']);
    expect(calls).toEqual([
      {
        statement: 'INSERT INTO involvement (issue_id) VALUES (?)',
        parameters: ['PROJ-1'],
      },
    ]);
  });

  it('returns the rows of a read', async () => {
    const { sql } = forgeDouble([{ issue_id: 'PROJ-1' }]);
    const client = createSqlClient({ sql });
    const rows = await client.query<{ issue_id: string }>(
      'SELECT issue_id FROM involvement WHERE issue_id = ? LIMIT ?',
      ['PROJ-1', 1],
    );
    expect(rows).toEqual([{ issue_id: 'PROJ-1' }]);
  });

  it('answers an empty list when the backend returns no row set', async () => {
    const { sql } = forgeDouble({ affectedRows: 0 });
    const client = createSqlClient({ sql });
    await expect(client.query('SELECT 1 FROM involvement WHERE issue_id = ? LIMIT ?', ['x'])).resolves.toEqual([]);
  });

  it('sends no parameter when the caller gives none', async () => {
    const { sql, calls } = forgeDouble([]);
    const client = createSqlClient({ sql });
    await client.query('SELECT id FROM signature_pattern WHERE id IS NOT NULL LIMIT ?');
    expect(calls[0].parameters).toEqual([]);
  });
});

describe('createDdlRunner', () => {
  it('replays every statement of the schema, in order', async () => {
    const { sql, calls } = forgeDouble({ affectedRows: 0 });
    const client = createSqlClient({ sql });
    await createDdlRunner(client).ensureSchema(DDL);
    expect(calls.map((call) => call.statement)).toEqual([...DDL]);
  });

  it('accepts an empty schema without a sound', async () => {
    const { sql, calls } = forgeDouble({ affectedRows: 0 });
    await createDdlRunner(createSqlClient({ sql })).ensureSchema([]);
    expect(calls).toEqual([]);
  });
});
