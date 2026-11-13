/**
 * The demo mode without Forge SQL (SPEC §13, SPEC §20, DP-20).
 *
 * The stub is what the sample dataset of lot L9 flows through: the very same
 * stores, the very same statements, on an in-memory engine. These tests prove
 * that the app reads and writes without a database, and without touching the
 * network.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import { describe, expect, it } from 'vitest';
import { createStubRepository, createStubSqlClient } from '../../src/db/stub.js';
import { TABLE_NAMES } from '../../src/types-persistence.js';
import { PROJECT, sampleCard, sampleCoverage, sampleCursor, sampleSettings } from './fixtures.js';
import { allSelectsBounded, nothingDeleted } from './sql-fake.js';

describe('createStubSqlClient', () => {
  it('is a SqlClient that needs no Forge and no network', async () => {
    const client = createStubSqlClient();
    await client.execute(
      'CREATE TABLE IF NOT EXISTS demo_probe (id VARCHAR(64) NOT NULL, PRIMARY KEY (id))',
    );
    await client.execute('INSERT INTO demo_probe (id) VALUES (?) ON DUPLICATE KEY UPDATE id = VALUES(id)', ['x']);
    await expect(client.query('SELECT id FROM demo_probe WHERE id = ? LIMIT ?', ['x', 1])).resolves.toEqual([
      { id: 'x' },
    ]);
  });
});

describe('createStubRepository', () => {
  it('creates the whole schema in memory', async () => {
    const stub = await createStubRepository();
    for (const table of TABLE_NAMES) {
      expect(stub.sql.tables.has(table), table).toBe(true);
    }
    expect(stub.sql.tables.size).toBe(TABLE_NAMES.length);
  });

  it('hands back every store of the app', async () => {
    const { stores } = await createStubRepository();
    for (const name of [
      'involvement',
      'signature',
      'commitFact',
      'reviewFact',
      'outcome',
      'issueClass',
      'epoch',
      'cohortStat',
      'recommendation',
      'decision',
      'calibration',
      'trial',
      'graphCursor',
      'settings',
      'coverage',
    ]) {
      expect(stores[name as keyof typeof stores], name).toBeDefined();
    }
  });

  it('runs a demo write and read through the real statements', async () => {
    const stub = await createStubRepository();
    await stub.stores.settings.save(sampleSettings());
    await stub.stores.coverage.save(sampleCoverage());
    await stub.stores.graphCursor.save(sampleCursor());
    await stub.stores.recommendation.save(sampleCard());

    await expect(stub.stores.settings.get(PROJECT)).resolves.toEqual(sampleSettings());
    await expect(stub.stores.coverage.get(PROJECT)).resolves.toMatchObject({ knownIssues: 42 });
    await expect(stub.stores.graphCursor.get(PROJECT, 'commit')).resolves.toEqual(sampleCursor());
    const card = await stub.stores.recommendation.get('PROJ-1');
    expect(card?.value).toBe('delegate-with-review');

    expect(allSelectsBounded(stub.sql)).toBe(true);
    expect(nothingDeleted(stub.sql)).toBe(true);
  });

  it('answers empty and null, never an exception, on absent data', async () => {
    const { stores } = await createStubRepository();
    await expect(stores.involvement.get('ABSENT-1')).resolves.toBeNull();
    await expect(stores.involvement.listByProject('ABSENT', 10)).resolves.toEqual([]);
    await expect(stores.cohortStat.lastComputedAt('ABSENT')).resolves.toBe('');
    await expect(stores.commitFact.countByIssue('ABSENT-1')).resolves.toEqual({
      total: 0,
      signed: 0,
    });
  });

  it('keeps the demo data of two runs apart', async () => {
    const first = await createStubRepository();
    const second = await createStubRepository();
    await first.stores.settings.save(sampleSettings());
    await expect(second.stores.settings.get(PROJECT)).resolves.toBeNull();
  });
});
