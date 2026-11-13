/**
 * Cursor, settings and coverage stores (SPEC §13, SPEC §16.5, SPEC §16.6,
 * SPEC §17, SPEC §19, DP-18, DP-19).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createCoverageStore } from '../../src/db/coverage.js';
import { createGraphCursorStore } from '../../src/db/graph-cursor.js';
import { createSettingsStore } from '../../src/db/settings.js';
import type { CoverageStore, GraphCursorStore, SettingsStore } from '../../src/ports.js';
import { PROJECT, sampleCoverage, sampleCursor, sampleSettings } from './fixtures.js';
import { allSelectsBounded, createFakeSql, nothingDeleted, type FakeSql } from './sql-fake.js';

let fake: FakeSql;
let cursors: GraphCursorStore;
let settings: SettingsStore;
let coverage: CoverageStore;

beforeEach(async () => {
  fake = await createFakeSql();
  cursors = createGraphCursorStore(fake);
  settings = createSettingsStore(fake);
  coverage = createCoverageStore(fake);
});

describe('GraphCursorStore', () => {
  it('answers null before the first slice: absent data is normal', async () => {
    await expect(cursors.get(PROJECT, 'commit')).resolves.toBeNull();
    await expect(cursors.listByProject(PROJECT)).resolves.toEqual([]);
  });

  it('resumes where the collection stopped', async () => {
    const cursor = sampleCursor('commit');
    await cursors.save(cursor);
    await expect(cursors.get(PROJECT, 'commit')).resolves.toEqual(cursor);

    await cursors.save({ ...cursor, lastIssueId: 'PROJ-40', lastRunAt: '2026-11-02T09:00:00.000Z' });
    expect(fake.rowCount('graph_cursor')).toBe(1);
    await expect(cursors.get(PROJECT, 'commit')).resolves.toMatchObject({
      lastIssueId: 'PROJ-40',
    });
  });

  it('keeps one cursor per object type, per project', async () => {
    await cursors.save(sampleCursor('commit'));
    await cursors.save(sampleCursor('pull-request'));
    await cursors.save({ ...sampleCursor('commit'), projectId: 'OTHER' });
    expect(fake.rowCount('graph_cursor')).toBe(3);

    const list = await cursors.listByProject(PROJECT);
    expect(list.map((cursor) => cursor.objectType)).toEqual(['commit', 'pull-request']);
  });

  it('keeps every read bounded and scoped, and deletes nothing', async () => {
    await cursors.save(sampleCursor());
    await cursors.get(PROJECT, 'commit');
    await cursors.listByProject(PROJECT);
    expect(allSelectsBounded(fake)).toBe(true);
    expect(nothingDeleted(fake)).toBe(true);
  });
});

describe('SettingsStore', () => {
  it('answers null for a project that declared nothing', async () => {
    await expect(settings.get('ABSENT')).resolves.toBeNull();
    await expect(settings.list(10)).resolves.toEqual([]);
  });

  it('reads back everything a project declared', async () => {
    const declared = sampleSettings();
    await settings.save(declared);
    await expect(settings.get(PROJECT)).resolves.toEqual(declared);
  });

  it('leaves one row when the same settings are saved twice', async () => {
    await settings.save(sampleSettings());
    await settings.save(sampleSettings());
    expect(fake.rowCount('settings')).toBe(1);
  });

  it('replaces the declaration when the project changes it', async () => {
    await settings.save(sampleSettings());
    await settings.save({ ...sampleSettings(), minArmSize: 12, sensitiveZones: [] });
    const back = await settings.get(PROJECT);
    expect(back?.minArmSize).toBe(12);
    expect(back?.sensitiveZones).toEqual([]);
  });

  it('lists the installed projects, bounded', async () => {
    await settings.save(sampleSettings('PROJ'));
    await settings.save(sampleSettings('OTHER'));
    await settings.save(sampleSettings('THIRD'));
    const page = await settings.list(2);
    expect(page.map((row) => row.projectId)).toEqual(['OTHER', 'PROJ']);
    expect((await settings.list(50))).toHaveLength(3);
  });

  it('keeps every read bounded, and deletes nothing', async () => {
    await settings.save(sampleSettings());
    await settings.get(PROJECT);
    await settings.list(10);
    expect(allSelectsBounded(fake)).toBe(true);
    expect(nothingDeleted(fake)).toBe(true);
  });
});

describe('CoverageStore', () => {
  it('answers null before any collection', async () => {
    await expect(coverage.get('ABSENT')).resolves.toBeNull();
  });

  it('reads back the coverage of a project, rights included', async () => {
    const state = sampleCoverage();
    await coverage.save(state);
    await expect(coverage.get(PROJECT)).resolves.toEqual(state);
  });

  it('leaves one row when the same coverage is saved twice', async () => {
    await coverage.save(sampleCoverage());
    await coverage.save(sampleCoverage());
    expect(fake.rowCount('coverage')).toBe(1);
  });

  it('records a collection that ended on a missing right', async () => {
    await coverage.save({
      ...sampleCoverage(),
      lastCollectionOk: false,
      permissions: [{ objectType: 'pull-request', state: 'missing', testedAt: '2026-11-02T09:00:00.000Z' }],
    });
    const back = await coverage.get(PROJECT);
    expect(back?.lastCollectionOk).toBe(false);
    expect(back?.permissions).toEqual([
      { objectType: 'pull-request', state: 'missing', testedAt: '2026-11-02T09:00:00.000Z' },
    ]);
  });

  it('keeps every read bounded, and deletes nothing', async () => {
    await coverage.save(sampleCoverage());
    await coverage.get(PROJECT);
    expect(allSelectsBounded(fake)).toBe(true);
    expect(nothingDeleted(fake)).toBe(true);
  });
});
