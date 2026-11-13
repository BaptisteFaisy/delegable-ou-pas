/**
 * The repository entry point (SPEC §17, SPEC §18, SPEC §19; DP-13,
 * DP-18, DP-19).
 *
 * `createRepository` is what `src/deps.ts` (lot L7) calls once: it replays
 * the schema, then hands back the stores. These tests run it on the
 * in-memory engine, so no network and no Forge is involved.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import { describe, expect, it } from 'vitest';
import { createMemorySql } from '../../src/db/memory-sql.js';
import { createRepository } from '../../src/db/repo.js';
import { TABLE_NAMES } from '../../src/types-persistence.js';
import { PROJECT, sampleInvolvement, sampleSettings } from './fixtures.js';

describe('createRepository', () => {
  it('ensures the whole schema, then assembles the stores', async () => {
    const sql = createMemorySql();
    const stores = await createRepository(sql);

    expect(sql.tables.size).toBe(TABLE_NAMES.length);
    for (const table of TABLE_NAMES) {
      expect(sql.tables.has(table), table).toBe(true);
    }
    expect(Object.keys(stores)).toHaveLength(15);

    await stores.settings.save(sampleSettings());
    await expect(stores.settings.get(PROJECT)).resolves.toMatchObject({ minArmSize: 20 });
  });

  it('can be replayed: a restart loses no row', async () => {
    const sql = createMemorySql();
    const first = await createRepository(sql);
    await first.involvement.save(sampleInvolvement());

    const second = await createRepository(sql);
    await expect(second.involvement.get('PROJ-1')).resolves.toEqual(sampleInvolvement());
    expect(sql.rowsOf('involvement').length).toBe(1);
  });

  it('writes every store through the same client, and deletes nothing', async () => {
    const sql = createMemorySql();
    const stores = await createRepository(sql);
    await stores.involvement.save(sampleInvolvement());
    await stores.involvement.listByProject(PROJECT, 10);

    const writes = sql.statements.filter((statement) => /^\s*INSERT/i.test(statement));
    expect(writes.length).toBeGreaterThan(0);
    expect(writes.every((statement) => /ON DUPLICATE KEY UPDATE/i.test(statement))).toBe(true);
    expect(sql.statements.some((statement) => /^\s*DELETE/i.test(statement))).toBe(false);
  });
});
