/**
 * Epoch, cohort statistics and calibration stores (SPEC §7, SPEC §10,
 * SPEC §18, DP-07, DP-08, DP-17, DP-21, DP-22).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createCalibrationStore } from '../../src/db/calibration.js';
import { createCohortStatStore } from '../../src/db/cohorts.js';
import { createEpochStore } from '../../src/db/epochs.js';
import type { CalibrationStore, CohortStatStore, EpochStore } from '../../src/ports.js';
import type { CohortKey } from '../../src/types.js';
import { COHORT, EPOCH_ID, PROJECT, sampleCalibration, sampleCohortStat, sampleEpoch } from './fixtures.js';
import { allSelectsBounded, createFakeSql, nothingDeleted, type FakeSql } from './sql-fake.js';

let fake: FakeSql;
let epochs: EpochStore;
let cohorts: CohortStatStore;
let calibration: CalibrationStore;

beforeEach(async () => {
  fake = await createFakeSql();
  epochs = createEpochStore(fake);
  cohorts = createCohortStatStore(fake);
  calibration = createCalibrationStore(fake);
});

describe('EpochStore', () => {
  it('answers an empty list before the first epoch', async () => {
    await expect(epochs.listByProject(PROJECT)).resolves.toEqual([]);
    await expect(epochs.epochAt(PROJECT, '2026-11-01T00:00:00.000Z')).resolves.toBeNull();
  });

  it('reads back what it wrote, and leaves one row on a replay', async () => {
    const epoch = sampleEpoch();
    await epochs.save(epoch);
    await epochs.save(epoch);
    expect(fake.rowCount('epoch')).toBe(1);
    await expect(epochs.listByProject(PROJECT)).resolves.toEqual([epoch]);
  });

  it('answers the epoch a date falls in, and null before the first one', async () => {
    await epochs.save({ ...sampleEpoch('ep-1'), startsAt: '2026-01-01T00:00:00.000Z' });
    await epochs.save({ ...sampleEpoch('ep-2'), startsAt: '2026-09-14T00:00:00.000Z' });

    const at = await epochs.epochAt(PROJECT, '2026-11-01T00:00:00.000Z');
    expect(at?.id).toBe('ep-2');
    const early = await epochs.epochAt(PROJECT, '2026-06-01T00:00:00.000Z');
    expect(early?.id).toBe('ep-1');
    await expect(epochs.epochAt(PROJECT, '2025-01-01T00:00:00.000Z')).resolves.toBeNull();
    await expect(epochs.epochAt('OTHER', '2026-11-01T00:00:00.000Z')).resolves.toBeNull();
  });

  it('lists the epochs of one project, oldest first', async () => {
    await epochs.save({ ...sampleEpoch('ep-2'), startsAt: '2026-09-14T00:00:00.000Z' });
    await epochs.save({ ...sampleEpoch('ep-1'), startsAt: '2026-01-01T00:00:00.000Z' });
    await epochs.save({ ...sampleEpoch('other-1'), projectId: 'OTHER' });
    const list = await epochs.listByProject(PROJECT);
    expect(list.map((epoch) => epoch.id)).toEqual(['ep-1', 'ep-2']);
  });
});

describe('CohortStatStore', () => {
  it('answers an empty list for a cohort nobody computed', async () => {
    await expect(cohorts.listByCohort(PROJECT, EPOCH_ID, COHORT)).resolves.toEqual([]);
    await expect(cohorts.listByProject(PROJECT, EPOCH_ID, 10)).resolves.toEqual([]);
  });

  it('answers both arms of one cohort in one epoch', async () => {
    await cohorts.saveMany([sampleCohortStat('human'), sampleCohortStat('agent')]);
    const arms = await cohorts.listByCohort(PROJECT, EPOCH_ID, COHORT);
    expect(arms.map((stat) => stat.arm)).toEqual(['agent', 'human']);
    expect(arms).toEqual([sampleCohortStat('agent'), sampleCohortStat('human')]);
  });

  it('answers nothing for another cohort, another epoch or another project', async () => {
    await cohorts.saveMany([sampleCohortStat('agent')]);
    const other: CohortKey = { ...COHORT, nature: 'bug' };
    await expect(cohorts.listByCohort(PROJECT, EPOCH_ID, other)).resolves.toEqual([]);
    await expect(cohorts.listByCohort(PROJECT, 'ep-other', COHORT)).resolves.toEqual([]);
    await expect(cohorts.listByCohort('OTHER', EPOCH_ID, COHORT)).resolves.toEqual([]);
  });

  it('replaces a cohort when the nightly job recomputes it', async () => {
    await cohorts.saveMany([sampleCohortStat('agent')]);
    await cohorts.saveMany([{ ...sampleCohortStat('agent'), peopleCount: 6 }]);
    expect(fake.rowCount('cohort_stat')).toBe(1);
    const [stat] = await cohorts.listByCohort(PROJECT, EPOCH_ID, COHORT);
    expect(stat.peopleCount).toBe(6);
  });

  it('keeps a wide cohort apart from a narrow one', async () => {
    const wide: CohortKey = { level: 'nature', nature: 'migration', zone: null, size: null };
    await cohorts.saveMany([
      { ...sampleCohortStat('agent'), key: wide },
      sampleCohortStat('agent'),
    ]);
    expect(fake.rowCount('cohort_stat')).toBe(2);
    const arms = await cohorts.listByCohort(PROJECT, EPOCH_ID, wide);
    expect(arms).toHaveLength(1);
    expect(arms[0].key).toEqual(wide);
  });

  it('lists the cohorts of one epoch and stops at the bound', async () => {
    await cohorts.saveMany([
      { ...sampleCohortStat('agent'), computedAt: '2026-11-01T00:00:00.000Z' },
      { ...sampleCohortStat('human'), computedAt: '2026-11-02T00:00:00.000Z' },
      { ...sampleCohortStat('agent'), key: { ...COHORT, nature: 'bug' }, computedAt: '2026-11-03T00:00:00.000Z' },
    ]);
    const page = await cohorts.listByProject(PROJECT, EPOCH_ID, 2);
    expect(page.map((stat) => stat.computedAt)).toEqual([
      '2026-11-03T00:00:00.000Z',
      '2026-11-02T00:00:00.000Z',
    ]);
  });

  it('answers the age of the cache, and an empty date before any computation', async () => {
    await expect(cohorts.lastComputedAt(PROJECT)).resolves.toBe('');
    await cohorts.saveMany([{ ...sampleCohortStat('agent'), computedAt: '2026-11-01T00:00:00.000Z' }]);
    await cohorts.saveMany([{ ...sampleCohortStat('human'), computedAt: '2026-11-04T00:00:00.000Z' }]);
    await expect(cohorts.lastComputedAt(PROJECT)).resolves.toBe('2026-11-04T00:00:00.000Z');
    await expect(cohorts.lastComputedAt('OTHER')).resolves.toBe('');
  });

  it('stores no person identifier, only the count that masks', async () => {
    await cohorts.saveMany([sampleCohortStat('agent')]);
    const [row] = fake.rowsOf('cohort_stat');
    expect(Object.keys(row)).toContain('people_count');
    expect(Object.keys(row).join(',')).not.toMatch(/account|user|email|assignee|reporter|reviewer/i);
  });

  it('keeps every read bounded and scoped, and deletes nothing', async () => {
    await cohorts.saveMany([sampleCohortStat('agent')]);
    await cohorts.listByCohort(PROJECT, EPOCH_ID, COHORT);
    await cohorts.listByProject(PROJECT, EPOCH_ID, 10);
    await cohorts.lastComputedAt(PROJECT);
    expect(allSelectsBounded(fake)).toBe(true);
    expect(nothingDeleted(fake)).toBe(true);
  });
});

describe('CalibrationStore', () => {
  it('answers an empty list before any calibration', async () => {
    await expect(calibration.listByProject(PROJECT, EPOCH_ID)).resolves.toEqual([]);
  });

  it('reads back what it wrote, and replaces on a replay', async () => {
    const row = sampleCalibration();
    await calibration.saveMany([row]);
    await calibration.saveMany([row]);
    expect(fake.rowCount('calibration')).toBe(1);
    await expect(calibration.listByProject(PROJECT, EPOCH_ID)).resolves.toEqual([row]);
  });

  it('keeps one row per recommendation value, per epoch', async () => {
    await calibration.saveMany([
      sampleCalibration(),
      { ...sampleCalibration(), value: 'keep-human' },
      { ...sampleCalibration(), epochId: 'ep-other' },
    ]);
    expect(fake.rowCount('calibration')).toBe(3);
    const rows = await calibration.listByProject(PROJECT, EPOCH_ID);
    expect(rows.map((row) => row.value)).toEqual(['delegate-with-review', 'keep-human']);
  });

  it('stores no person identifier', async () => {
    await calibration.saveMany([sampleCalibration()]);
    const [row] = fake.rowsOf('calibration');
    expect(Object.keys(row).join(',')).not.toMatch(/account|user|email|assignee|reporter|reviewer/i);
  });

  it('keeps every read bounded and scoped, and deletes nothing', async () => {
    await calibration.saveMany([sampleCalibration()]);
    await calibration.listByProject(PROJECT, EPOCH_ID);
    expect(allSelectsBounded(fake)).toBe(true);
    expect(nothingDeleted(fake)).toBe(true);
  });
});
