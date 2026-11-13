/**
 * The measured uncertainty of a cohort, as a screen shows it (SPEC §5, §7;
 * DP-03, DP-19, recipe 10).
 */
import { describe, expect, it } from 'vitest';
import { uncertaintyView } from '../../src/viewmodel/uncertainty.js';

const INVOLVEMENTS = [
  { level: 'driven' },
  { level: 'unknown' },
  { level: 'assisted' },
  { level: 'unknown' },
];

/** A cohort with two unknown tickets out of four. */
const INPUT = {
  involvements: INVOLVEMENTS,
  conclusion: 'better' as const,
  cohortKey: 'bugfix-billing-M',
  n: 40,
  clean: 34,
  threshold: 30,
};

describe('uncertaintyView', () => {
  it('se rend sans donnée', () => {
    const view = uncertaintyView({ ...INPUT, involvements: [] }, 'fr');
    expect(view.unknownShare).toBe(0);
    expect(view.bits).toBe(0);
    expect(view.flipLine).toBeNull();
    expect(view.flipNotice).not.toBeNull();
    expect(view.flipNotice?.fr.length).toBeGreaterThan(0);
    expect(view.flipNotice?.en.length).toBeGreaterThan(0);
  });

  it('mesure la part inconnue et l’entropie', () => {
    const view = uncertaintyView(INPUT, 'fr');
    expect(view.unknownShare).toBeCloseTo(0.5);
    expect(view.unknownShareText).toContain('%');
    expect(view.bits).toBeGreaterThan(0);
    expect(view.ticketsToDecide).toBe(2);
  });

  it('montre la probabilité de bascule avec son effectif et son intervalle', () => {
    const view = uncertaintyView(INPUT, 'fr');
    expect(view.flipLine).not.toBeNull();
    expect(view.flipLine?.n).toBe(40);
    expect(view.flipLine?.text).toContain('n = 40');
    expect(view.flipLine?.interval).toMatch(/^\[\d+ % ; \d+ %\]$/);
  });

  it('dit combien de tickets manquent pour conclure', () => {
    const view = uncertaintyView({ ...INPUT, n: 10, threshold: 30 }, 'fr');
    expect(view.reachNote.fr).toContain('20');
    expect(view.reachNote.en).toContain('20');
  });

  it('nomme les bloqueurs quand on ne conclut pas', () => {
    const view = uncertaintyView({ ...INPUT, conclusion: 'not-enough-data' }, 'fr');
    expect(view.canConclude).toBe(false);
    expect(view.blockers.length).toBeGreaterThan(0);
    expect(view.nextCollect.length).toBeGreaterThan(0);
  });

  it('propose une collecte quand la conclusion tient', () => {
    const view = uncertaintyView(INPUT, 'fr');
    expect(view.canConclude).toBe(true);
    expect(view.nextCollect.length).toBeGreaterThan(0);
  });

  it('parle français et anglais', () => {
    const view = uncertaintyView(INPUT, 'fr');
    expect(view.title.fr).not.toBe(view.title.en);
    expect(view.entropyNote.fr).not.toBe(view.entropyNote.en);
    expect(view.reportNote.fr).not.toBe(view.reportNote.en);
  });
});
