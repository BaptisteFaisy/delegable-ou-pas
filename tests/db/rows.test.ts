/**
 * Bounded reads (SPEC §19: five seconds per SELECT, no list without a
 * limit; DP-18).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import { describe, expect, it } from 'vitest';
import { boundLimit, DEFAULT_LIMIT, MAX_LIMIT, selectAggregate, selectList, selectOne } from '../../src/db/rows.js';
import type { SqlClient } from '../../src/db/sql-client.js';

interface Call {
  readonly statement: string;
  readonly parameters: readonly unknown[];
}

/** A client that records its calls and answers a fixed row set. */
function recording(rows: readonly unknown[] = []) {
  const calls: Call[] = [];
  const client: SqlClient = {
    async execute(statement: string, parameters: readonly unknown[] = []): Promise<void> {
      calls.push({ statement, parameters });
    },
    async query<T>(statement: string, parameters: readonly unknown[] = []): Promise<T[]> {
      calls.push({ statement, parameters });
      return rows as T[];
    },
  };
  return { client, calls };
}

const BOUNDED = 'SELECT issue_id FROM involvement WHERE issue_id = ? LIMIT ?';
const LITERAL = 'SELECT issue_id FROM involvement WHERE issue_id = ? LIMIT 10';

describe('selectList', () => {
  it('refuses a statement without a limit: a development error', async () => {
    const { client } = recording();
    await expect(
      selectList(client, 'SELECT issue_id FROM involvement WHERE issue_id = ?', ['PROJ-1']),
    ).rejects.toThrow(/LIMIT/);
  });

  it('binds the default limit when the caller gives none', async () => {
    const { client, calls } = recording();
    await selectList(client, BOUNDED, ['PROJ-1']);
    expect(calls[0].parameters).toEqual(['PROJ-1', DEFAULT_LIMIT]);
  });

  it('binds the limit the caller asks for', async () => {
    const { client, calls } = recording();
    await selectList(client, BOUNDED, ['PROJ-1'], 25);
    expect(calls[0].parameters).toEqual(['PROJ-1', 25]);
  });

  it('leaves a literal limit alone', async () => {
    const { client, calls } = recording();
    await selectList(client, LITERAL, ['PROJ-1'], 25);
    expect(calls[0].parameters).toEqual(['PROJ-1']);
  });

  it('answers an empty list when nothing matches', async () => {
    const { client } = recording([]);
    await expect(selectList(client, BOUNDED, ['PROJ-1'])).resolves.toEqual([]);
  });

  it('answers an empty list when the backend returns nothing at all', async () => {
    const broken: SqlClient = {
      async execute(): Promise<void> {},
      async query<T>(): Promise<T[]> {
        return undefined as unknown as T[];
      },
    };
    await expect(selectList(broken, BOUNDED, ['PROJ-1'])).resolves.toEqual([]);
  });
});

describe('boundLimit', () => {
  it('falls back to the default on an absent or absurd bound', () => {
    expect(boundLimit(undefined)).toBe(DEFAULT_LIMIT);
    expect(boundLimit(0)).toBe(DEFAULT_LIMIT);
    expect(boundLimit(-5)).toBe(DEFAULT_LIMIT);
    expect(boundLimit(Number.NaN)).toBe(DEFAULT_LIMIT);
  });

  it('clamps to the ceiling, so no caller can ask for a scan', () => {
    expect(boundLimit(MAX_LIMIT + 1)).toBe(MAX_LIMIT);
    expect(boundLimit(10)).toBe(10);
    expect(boundLimit(2.7)).toBe(2);
  });
});

describe('selectOne', () => {
  it('answers null when the row is absent', async () => {
    const { client } = recording([]);
    await expect(selectOne(client, BOUNDED, ['PROJ-1'])).resolves.toBeNull();
  });

  it('answers the first row and binds a limit of one', async () => {
    const { client, calls } = recording([{ issue_id: 'PROJ-1' }, { issue_id: 'PROJ-2' }]);
    const row = await selectOne<{ issue_id: string }>(client, BOUNDED, ['PROJ-1']);
    expect(row).toEqual({ issue_id: 'PROJ-1' });
    expect(calls[0].parameters).toEqual(['PROJ-1', 1]);
  });

  it('refuses a statement without a limit', async () => {
    const { client } = recording();
    await expect(
      selectOne(client, 'SELECT issue_id FROM involvement WHERE issue_id = ?', ['PROJ-1']),
    ).rejects.toThrow(/LIMIT/);
  });
});

describe('selectAggregate', () => {
  it('answers the single row of a count', async () => {
    const { client } = recording([{ n: 7 }]);
    await expect(
      selectAggregate<{ n: number }>(
        client,
        'SELECT COUNT(*) AS n FROM involvement WHERE issue_id LIKE ?',
        ['PROJ-%'],
      ),
    ).resolves.toEqual({ n: 7 });
  });

  it('answers null when the engine returns nothing', async () => {
    const { client } = recording([]);
    await expect(
      selectAggregate(client, 'SELECT COUNT(*) AS n FROM involvement WHERE issue_id LIKE ?', ['x']),
    ).resolves.toBeNull();
  });
});
