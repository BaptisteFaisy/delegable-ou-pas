/**
 * The persistence floor, traversed on the reference database.
 *
 * Covers: DP-13, DP-18, DP-20.
 *
 * The whole base is written through the repository's own stores and read back:
 * the 14 tables of SPEC §18 and the two screens' tables. Idempotence
 * (natural-key upserts), the cursor replay and the trial round-trip are
 * exercised on the base, not on canned rows.
 */
import { describe, expect, it } from 'vitest';
import { base, baseStoreFrais, essai, inconnus } from '../helpers/base.js';
import { BASE_ID } from '../helpers/base.js';
import { calibrate } from '../../src/domain/calibration.js';
import { recordDecision } from '../../src/domain/decision.js';
import { SPEC_TABLES } from '../../src/types-persistence.js';

describe('la persistance de la base', () => {
  it('écrit puis relit les faits de chaque table du SPEC §18', async () => {
    const current = base();
    const stores = await baseStoreFrais();

    const involvement = await stores.involvement.get('proj-demo-001-412');
    expect(involvement?.level).toBe(current.tickets.find((t) => t.key === 'PROJ-412')?.level);

    const outcome = await stores.outcome.get('proj-demo-001-412');
    expect(outcome?.clean).toBe(true);

    const issueClass = await stores.issueClass.get('proj-demo-001-412');
    expect(issueClass?.nature).toBe('data-migration');

    const patterns = await stores.signature.list();
    expect(patterns).toHaveLength(current.patterns.length);

    const commits = await stores.commitFact.listByIssue('proj-demo-001-412');
    expect(commits.length).toBeGreaterThan(0);

    const reviews = await stores.reviewFact.listByProject(BASE_ID, 1000);
    expect(reviews.length).toBeGreaterThan(0);

    const epochs = await stores.epoch.listByProject(BASE_ID);
    expect(epochs).toHaveLength(current.epochs.length);

    const cohort = await stores.cohortStat.listByCohort(BASE_ID, 'epoch-3', { level: 'nature-zone-size', nature: 'data-migration', zone: 'billing', size: 'M' });
    expect(cohort.length).toBe(2);

    const cards = await stores.recommendation.listByProject(BASE_ID, 'delegate-with-review', 1000);
    expect(cards.length).toBeGreaterThan(0);

    const trial = await stores.trial.get(essai().trial.id);
    expect(trial?.state).toBe('running');

    const assignments = await stores.trial.listAssignments(essai().trial.id);
    expect(assignments).toHaveLength(essai().assignments.length);

    const settings = await stores.settings.get(BASE_ID);
    expect(settings?.projectKey).toBe('PROJ');

    const coverage = await stores.coverage.get(BASE_ID);
    expect(coverage?.totalIssues).toBe(current.tickets.length);

    expect(SPEC_TABLES.length).toBe(14);
  });

  it('est idempotent : réécrire un fait ne dédouble jamais la base', async () => {
    const stores = await baseStoreFrais();
    const before = await stores.involvement.countTotal(BASE_ID);
    const actuel = await stores.involvement.get('proj-demo-001-412');
    await stores.involvement.save(actuel!);
    await stores.involvement.save(actuel!);
    expect(await stores.involvement.countTotal(BASE_ID)).toBe(before);
  });

  it('compte l’implication connue et l’inconnue de la base', async () => {
    const stores = await baseStoreFrais();
    const known = await stores.involvement.countKnown(BASE_ID);
    const total = await stores.involvement.countTotal(BASE_ID);
    expect(total).toBe(base().tickets.length);
    expect(known).toBe(total - inconnus().length);
  });

  it('enregistre une décision et la rapproche de la recommandation', async () => {
    const stores = await baseStoreFrais();
    const card = await stores.recommendation.get('proj-demo-001-412');
    const decision = recordDecision('proj-demo-001-412', 'delegate', 'safe migration', card, 'driven', base().now);
    await stores.decision.save(decision);
    const saved = await stores.decision.get('proj-demo-001-412');
    // "delegate" follows the "delegate-with-review" advice of the SPEC card.
    expect(saved?.followed).toBe(true);
    expect(saved?.actualLevel).toBe('driven');
    // A fresh row of calibration for this advice is read back by its key.
    const rows = await stores.calibration.listByProject(BASE_ID, 'epoch-3');
    const avant = rows.filter((row) => row.value === 'delegate').length;
    await stores.calibration.saveMany([calibrate(BASE_ID, 'epoch-3', 'delegate', 1, 2)]);
    const apres = await stores.calibration.listByProject(BASE_ID, 'epoch-3');
    expect(apres.filter((row) => row.value === 'delegate').length).toBe(avant + 1);
  });

  it('reprend la collecte là où le curseur s’était arrêté', async () => {
    const stores = await baseStoreFrais();
    await stores.graphCursor.save({ projectId: BASE_ID, objectType: 'commit', lastIssueId: 'proj-demo-001-42', lastRunAt: base().now });
    const cursor = await stores.graphCursor.get(BASE_ID, 'commit');
    expect(cursor?.lastIssueId).toBe('proj-demo-001-42');
    // A second save replaces the row, it never appends (DP-18).
    await stores.graphCursor.save({ projectId: BASE_ID, objectType: 'commit', lastIssueId: 'proj-demo-001-60', lastRunAt: base().now });
    const again = await stores.graphCursor.get(BASE_ID, 'commit');
    expect(again?.lastIssueId).toBe('proj-demo-001-60');
  });
});