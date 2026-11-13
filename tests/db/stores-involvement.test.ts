/**
 * Involvement and signature stores (SPEC §5, SPEC §18, DP-01, DP-02).
 *
 * Every test runs the real statements against the in-memory engine: no
 * network, no Forge, no canned answer.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createCommitFactStore } from '../../src/db/commit-facts.js';
import { createInvolvementStore } from '../../src/db/involvement.js';
import { createSignatureStore } from '../../src/db/signatures.js';
import type { InvolvementStore, SignatureStore } from '../../src/ports.js';
import { ISSUE, PROJECT, sampleCommitFact, sampleInvolvement, samplePattern } from './fixtures.js';
import { allSelectsBounded, createFakeSql, nothingDeleted, type FakeSql } from './sql-fake.js';

let fake: FakeSql;
let store: InvolvementStore;

beforeEach(async () => {
  fake = await createFakeSql();
  store = createInvolvementStore(fake);
});

function at(index: number): string {
  return `2026-11-0${index + 1}T09:00:00.000Z`;
}

describe('InvolvementStore', () => {
  it('answers null for a ticket that was never declared', async () => {
    await expect(store.get('PROJ-404')).resolves.toBeNull();
  });

  it('reads back what it wrote, evidence included', async () => {
    const involvement = sampleInvolvement();
    await store.save(involvement);
    await expect(store.get(ISSUE)).resolves.toEqual(involvement);
  });

  it('leaves one row when the same write is replayed', async () => {
    await store.save(sampleInvolvement());
    await store.save(sampleInvolvement());
    expect(fake.rowCount('involvement')).toBe(1);
  });

  it('replaces a declaration instead of adding one', async () => {
    await store.save(sampleInvolvement());
    await store.save({ ...sampleInvolvement(), level: 'autonomous', source: 'bot-author' });
    expect(fake.rowCount('involvement')).toBe(1);
    await expect(store.get(ISSUE)).resolves.toMatchObject({ level: 'autonomous' });
  });

  it('lists one project only, oldest first, and stops at the bound', async () => {
    await store.save({ ...sampleInvolvement('PROJ-3'), decidedAt: at(2) });
    await store.save({ ...sampleInvolvement('PROJ-1'), decidedAt: at(0) });
    await store.save({ ...sampleInvolvement('OTHER-9'), decidedAt: at(1) });
    await store.save({ ...sampleInvolvement('PROJ-2'), decidedAt: at(1) });

    const page = await store.listByProject(PROJECT, 2);
    expect(page.map((row) => row.issueId)).toEqual(['PROJ-1', 'PROJ-2']);

    const all = await store.listByProject(PROJECT, 50);
    expect(all.map((row) => row.issueId)).toEqual(['PROJ-1', 'PROJ-2', 'PROJ-3']);
  });

  it('answers an empty list for a project with no ticket', async () => {
    await store.save(sampleInvolvement());
    await expect(store.listByProject('OTHER', 10)).resolves.toEqual([]);
  });

  it('counts the known levels and the total, without naming anybody', async () => {
    await store.save({ ...sampleInvolvement('PROJ-1'), level: 'driven' });
    await store.save({ ...sampleInvolvement('PROJ-2'), level: 'none' });
    await store.save({ ...sampleInvolvement('PROJ-3'), level: 'unknown' });
    await store.save({ ...sampleInvolvement('OTHER-1'), level: 'driven' });

    await expect(store.countKnown(PROJECT)).resolves.toBe(2);
    await expect(store.countTotal(PROJECT)).resolves.toBe(3);
  });

  it('answers zero on an empty project', async () => {
    await expect(store.countKnown(PROJECT)).resolves.toBe(0);
    await expect(store.countTotal(PROJECT)).resolves.toBe(0);
  });

  it('keeps every list read bounded and scoped, and deletes nothing', async () => {
    await store.save(sampleInvolvement());
    await store.listByProject(PROJECT, 10);
    await store.countKnown(PROJECT);
    expect(allSelectsBounded(fake)).toBe(true);
    expect(nothingDeleted(fake)).toBe(true);
  });
});

describe('SignatureStore', () => {
  let signatures: SignatureStore;

  beforeEach(() => {
    signatures = createSignatureStore(fake);
  });

  it('answers an empty catalogue before any declaration', async () => {
    await expect(signatures.list()).resolves.toEqual([]);
    await expect(signatures.listEnabled()).resolves.toEqual([]);
    await expect(signatures.listSeen(10)).resolves.toEqual([]);
  });

  it('lists the catalogue and only the enabled patterns', async () => {
    await signatures.save(samplePattern('pat-a'));
    await signatures.save({ ...samplePattern('pat-b'), enabled: false });

    expect((await signatures.list()).map((row) => row.id)).toEqual(['pat-a', 'pat-b']);
    expect((await signatures.listEnabled()).map((row) => row.id)).toEqual(['pat-a']);
  });

  it('reads a pattern back without loss, and leaves one row on a replay', async () => {
    const pattern = samplePattern('pat-a');
    await signatures.save(pattern);
    await signatures.save(pattern);
    expect(fake.rowCount('signature_pattern')).toBe(1);
    await expect(signatures.list()).resolves.toEqual([pattern]);
  });

  it('counts a mention each time it is seen', async () => {
    await signatures.save(samplePattern('pat-a'));
    await signatures.recordSeen('pat-a', '2026-11-01T09:00:00.000Z');
    await signatures.recordSeen('pat-a', '2026-11-02T09:00:00.000Z');
    const [pattern] = await signatures.list();
    expect(pattern.seenCount).toBe(2);
  });

  it('answers the mentions really seen, with the date of the last commit', async () => {
    await signatures.save(samplePattern('pat-a'));
    await signatures.recordSeen('pat-a', '2026-11-02T09:00:00.000Z');
    await createInvolvementStore(fake).save(sampleInvolvement());

    const commits = createCommitFactStore(fake);
    await commits.saveMany([
      { ...sampleCommitFact(ISSUE, 'sha-1'), committedAt: '2026-11-01T09:00:00.000Z' },
      { ...sampleCommitFact(ISSUE, 'sha-2'), committedAt: '2026-11-05T09:00:00.000Z' },
    ]);

    await expect(signatures.listSeen(10)).resolves.toEqual([
      {
        patternId: 'pat-a',
        agentName: 'agent-a',
        seenCount: 1,
        lastSeenAt: '2026-11-05T09:00:00.000Z',
      },
    ]);
  });

  it('answers an empty date when no commit carried the mention', async () => {
    await signatures.save(samplePattern('pat-a'));
    await signatures.recordSeen('pat-a', '2026-11-02T09:00:00.000Z');
    const [seen] = await signatures.listSeen(10);
    expect(seen.lastSeenAt).toBe('');
  });

  it('ignores a pattern that was never seen', async () => {
    await signatures.save(samplePattern('pat-a'));
    await expect(signatures.listSeen(10)).resolves.toEqual([]);
  });
});
