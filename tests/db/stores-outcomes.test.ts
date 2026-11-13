/**
 * Outcome and classification stores (SPEC §6, SPEC §14, SPEC §17, SPEC §18,
 * DP-04, DP-06).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createIssueClassStore } from '../../src/db/issue-class.js';
import { createOutcomeStore } from '../../src/db/outcomes.js';
import type { IssueClassStore, OutcomeStore } from '../../src/ports.js';
import { ISSUE, PROJECT, sampleIssueClass, sampleOutcome } from './fixtures.js';
import { allSelectsBounded, createFakeSql, nothingDeleted, type FakeSql } from './sql-fake.js';

let fake: FakeSql;
let outcomes: OutcomeStore;
let classes: IssueClassStore;

beforeEach(async () => {
  fake = await createFakeSql();
  outcomes = createOutcomeStore(fake);
  classes = createIssueClassStore(fake);
});

describe('OutcomeStore', () => {
  it('answers null for a ticket that is not judged yet', async () => {
    await expect(outcomes.get('PROJ-404')).resolves.toBeNull();
  });

  it('reads back what it wrote, every flag included', async () => {
    const outcome = sampleOutcome();
    await outcomes.save(outcome);
    await expect(outcomes.get(ISSUE)).resolves.toEqual(outcome);
  });

  it('leaves one row when the same write is replayed', async () => {
    await outcomes.save(sampleOutcome());
    await outcomes.save(sampleOutcome());
    expect(fake.rowCount('outcome')).toBe(1);
  });

  it('lists one project, soonest judgeable first, and stops at the bound', async () => {
    await outcomes.save({ ...sampleOutcome('PROJ-1'), matureAt: '2027-01-01T00:00:00.000Z' });
    await outcomes.save({ ...sampleOutcome('PROJ-2'), matureAt: '2026-12-01T00:00:00.000Z' });
    await outcomes.save({ ...sampleOutcome('PROJ-3'), matureAt: '2027-02-01T00:00:00.000Z' });
    await outcomes.save({ ...sampleOutcome('OTHER-1'), matureAt: '2026-11-01T00:00:00.000Z' });

    const page = await outcomes.listByProject(PROJECT, 2);
    expect(page.map((row) => row.issueId)).toEqual(['PROJ-2', 'PROJ-1']);
    await expect(outcomes.listByProject('ABSENT', 10)).resolves.toEqual([]);
  });

  it('answers the tickets that became judgeable since a date', async () => {
    await outcomes.save({ ...sampleOutcome('PROJ-1'), matureAt: '2026-12-01T00:00:00.000Z' });
    await outcomes.save({ ...sampleOutcome('PROJ-2'), matureAt: '2027-01-15T00:00:00.000Z' });
    await outcomes.save({ ...sampleOutcome('PROJ-3'), matureAt: '2027-03-01T00:00:00.000Z' });
    await outcomes.save({ ...sampleOutcome('OTHER-1'), matureAt: '2027-01-20T00:00:00.000Z' });

    const matured = await outcomes.listMaturedSince(PROJECT, '2027-01-01T00:00:00.000Z', 10);
    expect(matured.map((row) => row.issueId)).toEqual(['PROJ-2', 'PROJ-3']);

    const bounded = await outcomes.listMaturedSince(PROJECT, '2026-01-01T00:00:00.000Z', 2);
    expect(bounded).toHaveLength(2);
    await expect(
      outcomes.listMaturedSince(PROJECT, '2030-01-01T00:00:00.000Z', 10),
    ).resolves.toEqual([]);
  });

  it('keeps every read bounded and scoped, and deletes nothing', async () => {
    await outcomes.save(sampleOutcome());
    await outcomes.get(ISSUE);
    await outcomes.listByProject(PROJECT, 10);
    await outcomes.listMaturedSince(PROJECT, '2026-01-01T00:00:00.000Z', 10);
    expect(allSelectsBounded(fake)).toBe(true);
    expect(nothingDeleted(fake)).toBe(true);
  });
});

describe('IssueClassStore', () => {
  it('answers null for a ticket that is not classified yet', async () => {
    await expect(classes.get('PROJ-404')).resolves.toBeNull();
  });

  it('reads back what it wrote', async () => {
    const issueClass = sampleIssueClass();
    await classes.save(issueClass);
    await expect(classes.get(ISSUE)).resolves.toEqual(issueClass);
  });

  it('leaves one row when the same write is replayed', async () => {
    await classes.save(sampleIssueClass());
    await classes.save(sampleIssueClass());
    expect(fake.rowCount('issue_class')).toBe(1);
  });

  it('reuses a classification already made for the same text', async () => {
    await classes.save(sampleIssueClass('PROJ-7'));
    await expect(classes.getByContentHash(PROJECT, 'hash-1')).resolves.toEqual(
      sampleIssueClass('PROJ-7'),
    );
    await expect(classes.getByContentHash(PROJECT, 'hash-unknown')).resolves.toBeNull();
    await expect(classes.getByContentHash('OTHER', 'hash-1')).resolves.toBeNull();
  });

  it('lists one project and stops at the bound', async () => {
    await classes.save(sampleIssueClass('PROJ-1'));
    await classes.save(sampleIssueClass('PROJ-2'));
    await classes.save(sampleIssueClass('OTHER-1'));
    const page = await classes.listByProject(PROJECT, 1);
    expect(page.map((row) => row.issueId)).toEqual(['PROJ-1']);
    await expect(classes.listByProject('ABSENT', 10)).resolves.toEqual([]);
  });

  it('keeps every read bounded and scoped, and deletes nothing', async () => {
    await classes.save(sampleIssueClass());
    await classes.get(ISSUE);
    await classes.listByProject(PROJECT, 10);
    await classes.getByContentHash(PROJECT, 'hash-1');
    expect(allSelectsBounded(fake)).toBe(true);
    expect(nothingDeleted(fake)).toBe(true);
  });
});
