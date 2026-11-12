/**
 * Le parcours complet, de bout en bout (lot L10 §3) : « une journée dans la
 * vie de l'app » — collecte d'un ticket (historique + graphe) → détection de
 * la mention → classement de nature → attribution à une cohorte → calcul des
 * bras et des fourchettes → recommandation → décision enregistrée →
 * calibration. Avec les fakes, sans réseau, en moins de 5 secondes.
 *
 * DP-01, DP-04, DP-06, DP-07, DP-08, DP-11, DP-13, DP-15, DP-21.
 */
import { describe, expect, it } from 'vitest';
import { runTool } from '../../src/actions/registry.js';
import { fromCommitMention, resolveInvolvement } from '../../src/domain/involvement.js';
import { onEvent } from '../../src/handlers/events.js';
import { recomputeProject } from '../../src/handlers/scheduled.js';
import { RECOMMENDATIONS, type Recommendation } from '../../src/types-advice.js';
import {
  sampleCommitFact,
  sampleEpoch,
  sampleInvolvement,
  sampleOutcome,
  sampleSettings,
} from '../db/fixtures.js';
import { closedHistory, createTestApp, fakeTicket, seedTicket, type TestApp } from '../handlers/app-deps.js';

const CLOSED_AT = '2026-11-02T09:00:00.000Z';

/** The settings of the journey: a small threshold so a small cohort concludes. */
const SETTINGS = { ...sampleSettings(), minArmSize: 2 };

/** The app with its settings, its epoch and the ticket of the day. */
async function journeyApp(): Promise<TestApp> {
  const app = await createTestApp();
  await app.stores.settings.save(SETTINGS);
  await app.stores.epoch.save(sampleEpoch());
  const ticket = { ...fakeTicket('PROJ-1', 'PROJ-1'), labels: ['migration'] };
  seedTicket(app.jira, ticket);
  return app;
}

/** The closed history of past tickets, so the cohort has two arms. */
async function seedHistoryOfTheCohort(app: TestApp, issueId: string, agentArm: boolean): Promise<void> {
  const stored = await app.stores.issueClass.get('PROJ-1');
  if (stored !== null) await app.stores.issueClass.save({ ...stored, issueId });
  await app.stores.outcome.save({ ...sampleOutcome(issueId), clean: issueId !== 'PROJ-4' });
  await app.stores.involvement.save(
    agentArm
      ? sampleInvolvement(issueId)
      : { ...sampleInvolvement(issueId), level: 'none', source: 'adoption-date' },
  );
}

/** Collect → mention → nature → cohort → arms → advice → decision → calibration. */
async function aDayInTheLife(app: TestApp): Promise<void> {
  // 1. Collecte : le graphe livre un commit signé (chaîne L6, ici en fake).
  const commit = sampleCommitFact('PROJ-1');
  await app.stores.commitFact.saveMany([commit]);

  // 2. Détection de la mention (source 3, SPEC §5) → implication résolue.
  const candidate = fromCommitMention([commit], CLOSED_AT);
  const involvement =
    candidate === null
      ? null
      : resolveInvolvement('PROJ-1', [candidate], CLOSED_AT, 'forge-cli', 'model-a', 'session-journey');
  if (involvement !== null) await app.stores.involvement.save(involvement);

  // 3. Classement de nature par l'événement réel (DP-06, règles d'abord).
  await onEvent(app.deps, { type: 'created', issue: { id: 'PROJ-1', key: 'PROJ-1' } });

  // 4. L'historique de la cohorte : trois tickets clos, un bras par côté.
  await seedHistoryOfTheCohort(app, 'PROJ-2', true);
  await seedHistoryOfTheCohort(app, 'PROJ-3', false);
  await seedHistoryOfTheCohort(app, 'PROJ-4', false);

  // 5. Attribution aux cohortes, bras et fourchettes (SPEC §7).
  const first = await recomputeProject(app.deps, SETTINGS);
  expect(first.cohortRows).toBe(2);

  // 6. Clôture du ticket : l'historique devient résultat, la carte est calculée.
  app.jira.histories.set('PROJ-1', closedHistory('PROJ-1', CLOSED_AT));
  await onEvent(app.deps, { type: 'updated', issue: { id: 'PROJ-1', key: 'PROJ-1' } });

  // 7. La passe nocturne calcule la carte du ticket mûri (SPEC §17) : le
  //    moteur en cache est un lecteur (CONTRACT-NEEDED connu de L4), c'est la
  //    recalculation qui écrit la carte.
  await recomputeProject(app.deps, SETTINGS);

  // 8. La décision est enregistrée SUR la carte affichée (DP-13), puis une
  //    dernière passe nourrit la calibration (SPEC §10).
  const decided = await runTool(app.deps, 'record-decision', {
    issueKey: 'PROJ-1',
    decision: 'delegate',
    reason: 'critères acceptés',
  });
  expect(decided.ok).toBe(true);
  expect((decided.data as { followed: boolean } | null)?.followed).toBe(true);
  await recomputeProject(app.deps, SETTINGS);
}

describe('parcours complet — une journée dans la vie de l’app', () => {
  it('mène un ticket de la collecte à la calibration, en moins de 5 secondes', async () => {
    const started = Date.now();
    const app = await journeyApp();
    await aDayInTheLife(app);

    // La mention a décidé de l'implication, et l'événement de clôture la garde.
    const stored = await app.stores.involvement.get('PROJ-1');
    expect(stored?.source).toBe('commit-mention');
    expect(stored?.level).toBe('assisted');

    // La nature a été classée par les règles et conservée (DP-06).
    const issueClass = await app.stores.issueClass.get('PROJ-1');
    expect(issueClass?.nature).toBe('data-migration');
    expect(issueClass?.classifiedBy).toBe('rules');

    // La clôture propre vient de l'historique réel (DP-04).
    const outcome = await app.stores.outcome.get('PROJ-1');
    expect(outcome?.clean).toBe(true);
    expect(outcome?.closedAt).toBe(CLOSED_AT);

    // La carte cachée porte le verdict ; les chiffres des bras vivent dans
    // `cohort_stat` et sont rejoints par `get-delegation-evidence` (le store de
    // cartes ne conserve délibérément que value/cohort/confidence/reasons —
    // voir src/db/recommendations.ts ; écart documenté à docs/CONTRACTS.md).
    const card = await app.stores.recommendation.get('PROJ-1');
    expect(card).not.toBeNull();
    expect(RECOMMENDATIONS).toContain(card?.value as Recommendation);
    expect(card?.cohort.nature).toBe('data-migration');
    expect(card?.reasons.length ?? 0).toBeGreaterThan(0);

    const evidence = await runTool(app.deps, 'get-delegation-evidence', { issueKey: 'PROJ-1' });
    expect(evidence.ok).toBe(true);
    const figures = evidence.data as {
      agent: { n: number; ciLow: number; ciHigh: number } | null;
      human: { n: number } | null;
    } | null;
    expect(figures?.agent?.n).toBe(2);
    expect(figures?.human?.n).toBe(2);
    expect(figures?.agent?.ciLow ?? 0).toBeLessThan(figures?.agent?.ciHigh ?? 0);

    // L'outil MCP répond avec l'avis calculé (DP-15).
    const advice = await runTool(app.deps, 'should-delegate', { issueKey: 'PROJ-1' });
    expect(advice.ok).toBe(true);
    const adviceData = advice.data as { recommendation: Recommendation; reasons: readonly string[] } | null;
    expect(RECOMMENDATIONS).toContain(adviceData?.recommendation);
    expect(adviceData?.reasons.length ?? 0).toBeGreaterThan(0);

    // La décision est enregistrée et la calibration répond (DP-13, DP-21).
    const decision = await app.stores.decision.get('PROJ-1');
    expect(decision?.taken).toBe('delegate');
    const calibration = await runTool(app.deps, 'get-calibration', { projectKey: 'PROJ' });
    expect(calibration.ok).toBe(true);

    expect(Date.now() - started).toBeLessThan(5000);
  }, 10_000);
});
