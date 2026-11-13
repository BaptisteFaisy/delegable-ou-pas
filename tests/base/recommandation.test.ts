/**
 * The recommendation floor, traversed on the reference database.
 *
 * Covers: DP-11, DP-12, DP-26.
 *
 * The four recommendations of SPEC §8 come out of the base's own cohorts; the
 * three guardrails fire on the named tickets; the failure causes and the
 * reference tickets are cited from the base.
 */
import { describe, expect, it } from 'vitest';
import { base, casLimite, cohorte, orange, rouge, verte } from '../helpers/base.js';
import { conditionsFor } from '../../src/domain/conditions.js';
import { guardrails, recommendFrom, confidenceOf } from '../../src/domain/recommendation.js';
import { balanceOfConclusion } from '../../src/actions/get-cohort.js';

describe('la recommandation sur la base', () => {
  it('décline les quatre recommandations du SPEC §8 sur les cohortes réelles', () => {
    expect(verte().recommandation).toBe('delegate');
    expect(orange().recommandation).toBe('delegate-with-review');
    expect(rouge().recommandation).toBe('keep-human');
    // The grey cohort is the fourth answer: "we do not know".
    const grise = cohorte('epoch-2|configuration|api|S');
    expect(grise.recommandation).toBe('not-enough-data');
  });

  it('porte les effectifs et les intervalles sur chaque bras', () => {
    const vue = verte();
    expect(vue.agentStat?.n).toBe(vue.agent.length);
    expect(vue.humanStat?.n).toBe(vue.human.length);
    expect(vue.agentStat?.ciLow).toBeLessThanOrEqual(vue.agentStat?.rate ?? 1);
    expect(vue.agentStat?.ciHigh).toBeGreaterThanOrEqual(vue.agentStat?.rate ?? 0);
    expect(vue.agentLead?.n).toBe(vue.agent.length);
  });

  it('déclenche le garde-fou « incident ouvert » sur le ticket nommé', () => {
    const p509 = casLimite('PROJ-509');
    const fired = guardrails(true, p509.ticket!.zone, base().settings.sensitiveZones, true);
    expect(fired).toContain('open-incident');
    expect(recommendFrom('better', balanceOfConclusion(true), fired, true)).not.toBe('delegate');
  });

  it('déclenche le garde-fou « zone sensible » sur le ticket nommé', () => {
    const p517 = casLimite('PROJ-517');
    const fired = guardrails(false, p517.ticket!.zone, base().settings.sensitiveZones, true);
    expect(fired).toContain('sensitive-zone');
    expect(base().settings.sensitiveZones).toContain(p517.ticket!.zone);
  });

  it('déclenche le garde-fou « critères d’acceptation manquants »', () => {
    const p523 = casLimite('PROJ-523');
    const fired = guardrails(false, p523.ticket!.zone, base().settings.sensitiveZones, false);
    expect(fired).toContain('missing-acceptance-criteria');
    expect(recommendFrom('better', balanceOfConclusion(true), fired, true)).toBe('delegate-with-review');
  });

  it('donne la confiance selon les effectifs et les intervalles de la base', () => {
    const vue = verte();
    const confidence = confidenceOf(vue.agentStat, vue.humanStat, vue.conclusion);
    expect(vue.confidence).toBe(confidence);
    expect(['high', 'medium', 'low']).toContain(confidence);
  });

  it('ancre la relecture renforcée sur la définition du projet', () => {
    const conditions = conditionsFor('delegate-with-review', []);
    // Two reviewers and a zone owner, per the project's own definition.
    const required = new Set(conditions.filter((condition) => condition.required).map((condition) => condition.kind));
    expect(required.has('two-reviewers')).toBe(true);
    expect(required.has('evidence-per-criterion')).toBe(true);
    expect(conditions.some((condition) => condition.kind === 'zone-owner-review')).toBe(true);
  });

  it('cite les tickets de référence du SPEC §8', () => {
    const card = base().cards.find((item) => item.issueKey === 'PROJ-412');
    expect(card?.referenceIssueKeys).toEqual(['PROJ-207', 'PROJ-233', 'PROJ-301']);
  });
});