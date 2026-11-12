/**
 * The controlled trial floor, traversed on the reference database.
 *
 * Covers: DP-27.
 *
 * The draw is reproducible from the seed, the compliance is enforced, the
 * safety stop stops the trial, and only the trial may claim a result is
 * "proven" — an observed cohort is never proven.
 */
import { describe, expect, it } from 'vitest';
import { base, essai } from '../helpers/base.js';
import { draw, enforceCompliance, isEligible, stopReason } from '../../src/domain/trial.js';
import { seededRandom } from '../../src/deps.js';
import { wording } from '../../src/domain/conclusion.js';
import { createTranslator } from '../../src/i18n/index.js';

const fr = createTranslator('fr');

describe('l’essai contrôlé de la base', () => {
  it('tire un bras reproductible depuis la graine', () => {
    const essaiVue = essai();
    const premier = draw(essaiVue.trial, 'proj-demo-001-701', seededRandom());
    const second = draw(essaiVue.trial, 'proj-demo-001-701', seededRandom());
    expect(second.arm).toBe(premier.arm);
    expect(second.trialId).toBe(essaiVue.trial.id);
  });

  it('n’admet que les tickets prêts, hors zone sensible', () => {
    const settings = base().settings;
    expect(isEligible(true, 'billing', settings.sensitiveZones, false)).toBe(true);
    expect(isEligible(true, settings.sensitiveZones[0], settings.sensitiveZones, false)).toBe(false);
    expect(isEligible(false, 'billing', settings.sensitiveZones, false)).toBe(false);
  });

  it('sort de l’essai un tirage non respecté, avec son motif', () => {
    const essaiVue = essai();
    const tiré = draw(essaiVue.trial, 'proj-demo-001-706', seededRandom());
    const réel = tiré.arm === 'agent' ? 'human' : 'agent';
    const contrôle = enforceCompliance(tiré, réel);
    expect(contrôle.complied).toBe(false);
    expect(contrôle.excludedReason).toContain('tirage non respecté');
    // The dataset itself demonstrates it: at least one excluded draw.
    expect(essaiVue.excluded).toBeGreaterThan(0);
    expect(essaiVue.complied + essaiVue.excluded).toBe(essaiVue.assignments.length);
  });

  it('s’arrête par sécurité quand les réouvertures s’accumulent', () => {
    const essaiVue = essai();
    const raison = stopReason(essaiVue.trial, '2026-11-15T12:00:00Z', false, { agent: 4, human: 1 });
    expect(raison).toContain('réouvertures');
    const encore = stopReason(essaiVue.trial, '2026-11-15T12:00:00Z', false, { agent: 1, human: 0 });
    expect(encore).toBe('');
  });

  it('réserve le mot « prouvé » à l’essai ; une cohorte observée ne l’est jamais', () => {
    expect(wording('better').proven).toBe(false);
    expect(wording('worse').proven).toBe(false);
    // The i18n lock says it out loud (SPEC §7 rule 7, §11).
    expect(fr('docs.proven-reserved')).toContain('prouvé');
  });
});