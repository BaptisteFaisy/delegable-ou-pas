/**
 * Tests of the demo figures — DP-20, SPEC §7, §8, §11, §12, §24.
 *
 * Every number the SPEC quotes is recomputed here from the dataset by the
 * merged domain functions: the demo never writes a figure by hand, and neither
 * does this test (SPEC §24.1, "les chiffres du jeu sont la source unique").
 */
import { describe, expect, it } from 'vitest';
import { percent } from '../../src/domain/stats.js';
import { wording } from '../../src/domain/conclusion.js';
import { EPOCH_1, EPOCH_2, EPOCH_3, sampleEpochs } from '../../src/sample/epochs.js';
import { sampleCards, sampleTrial } from '../../src/sample/index.js';
import {
  SEEDS,
  balanceOf,
  boundsOf,
  cohort,
  conclusionOf,
  confidenceOfCohort,
  delayBetterOf,
  figuresOf,
  recommendationOf,
} from './fixtures.js';

/** The cohort of the card the video shows (SPEC §8). */
const PROJ_412_COHORT = cohort('data-migration', 'billing', 'M', EPOCH_3);

describe('SPEC §7 — les trois jeux de chiffres tombent juste', () => {
  it('83 % sur 41 tickets [69 ; 91] contre 86 % sur 37 [72 ; 94]', () => {
    const figures = figuresOf(cohort('bugfix', 'api', 'M', EPOCH_2));
    expect(figures.agent?.n).toBe(41);
    expect(percent(figures.agent?.rate ?? 0)).toBe('83 %');
    expect(boundsOf(figures.agent ?? { n: 0, rate: 0, ciLow: 0, ciHigh: 0 })).toEqual([69, 91]);
    expect(figures.human?.n).toBe(37);
    expect(percent(figures.human?.rate ?? 0)).toBe('86 %');
    expect(boundsOf(figures.human ?? { n: 0, rate: 0, ciLow: 0, ciHigh: 0 })).toEqual([72, 94]);
  });

  it('cet écart n\'est pas établi : la conclusion est « on ne sait pas »', () => {
    const figures = figuresOf(cohort('bugfix', 'api', 'M', EPOCH_2));
    expect(conclusionOf(figures)).toBe('not-enough-data');
    expect(wording(conclusionOf(figures)).gap).toBe('écart non établi');
    expect(wording(conclusionOf(figures)).proven).toBe(false);
  });

  it('la cohorte rouge : 40 % [22 ; 61] contre 86 % [65 ; 95], écart établi', () => {
    const figures = figuresOf(cohort('data-migration', 'billing', 'M', EPOCH_2));
    expect(figures.agent?.n).toBe(20);
    expect(percent(figures.agent?.rate ?? 0)).toBe('40 %');
    expect(boundsOf(figures.agent ?? { n: 0, rate: 0, ciLow: 0, ciHigh: 0 })).toEqual([22, 61]);
    expect(percent(figures.human?.rate ?? 0)).toBe('86 %');
    expect(boundsOf(figures.human ?? { n: 0, rate: 0, ciLow: 0, ciHigh: 0 })).toEqual([65, 95]);
    expect(conclusionOf(figures)).toBe('worse');
    expect(wording(conclusionOf(figures)).gap).toBe('écart établi');
  });
});

describe('SPEC §8 — la carte de PROJ-412', () => {
  it('26 tickets avec agent, 31 sans, dans la même cohorte', () => {
    const figures = figuresOf(PROJ_412_COHORT);
    expect(figures.agent?.n).toBe(26);
    expect(figures.human?.n).toBe(31);
    expect(PROJ_412_COHORT.some((seed) => seed.key === 'PROJ-412')).toBe(true);
  });

  it('69 % [50 ; 83] contre 87 % [71 ; 95]', () => {
    const figures = figuresOf(PROJ_412_COHORT);
    expect(percent(figures.agent?.rate ?? 0)).toBe('69 %');
    expect(boundsOf(figures.agent ?? { n: 0, rate: 0, ciLow: 0, ciHigh: 0 })).toEqual([50, 83]);
    expect(percent(figures.human?.rate ?? 0)).toBe('87 %');
    expect(boundsOf(figures.human ?? { n: 0, rate: 0, ciLow: 0, ciHigh: 0 })).toEqual([71, 95]);
  });

  it('délai médian 1,5 jour avec agent, 3 jours sans', () => {
    const figures = figuresOf(PROJ_412_COHORT);
    expect(figures.agentLead?.medianH).toBe(36);
    expect(figures.humanLead?.medianH).toBe(72);
    expect(delayBetterOf(figures)).toBe(true);
  });

  it('5 réouvertures sur 8 pour une migration non rejouable', () => {
    const card = sampleCards().find((candidate) => candidate.issueKey === 'PROJ-412');
    expect(card?.failureCauses).toEqual(['5 réouvertures sur 8 pour une migration non rejouable']);
  });

  it('les tickets de référence sont PROJ-207, PROJ-233 et PROJ-301', () => {
    const card = sampleCards().find((candidate) => candidate.issueKey === 'PROJ-412');
    expect(card?.referenceIssueKeys).toEqual(['PROJ-207', 'PROJ-233', 'PROJ-301']);
    for (const key of ['PROJ-207', 'PROJ-233', 'PROJ-301']) {
      expect(SEEDS.some((seed) => seed.key === key)).toBe(true);
    }
  });

  it('la carte porte les chiffres de la cohorte et le drapeau de démonstration', () => {
    const card = sampleCards().find((candidate) => candidate.issueKey === 'PROJ-412');
    expect(card?.demo).toBe(true);
    expect(card?.agent?.n).toBe(26);
    expect(card?.human?.n).toBe(31);
    expect(card?.agentLeadTime?.medianH).toBe(36);
    expect(card?.humanLeadTime?.medianH).toBe(72);
    expect(card?.cohort).toEqual({
      level: 'nature-zone-size',
      nature: 'data-migration',
      zone: 'billing',
      size: 'M',
    });
    expect(card?.epochId).toBe(EPOCH_3);
    expect(card?.balance.balanced).toBe(true);
    expect(card?.confidence).toBe(confidenceOfCohort(figuresOf(PROJ_412_COHORT)));
  });
});

describe('SPEC §12 — la carte de délégation montre les quatre couleurs', () => {
  it('une case verte : les tests de l\'interface, écart établi en faveur de l\'agent', () => {
    const tickets = cohort('tests', 'web-ui', 'M', EPOCH_2);
    const figures = figuresOf(tickets);
    expect(conclusionOf(figures)).toBe('better');
    expect(recommendationOf(figures, tickets[0])).toBe('delegate');
  });

  it('une case orange : la migration en zone sensible, garde-fou', () => {
    const tickets = cohort('data-migration', 'data-pipeline', 'M', EPOCH_2);
    const figures = figuresOf(tickets);
    expect(conclusionOf(figures)).toBe('better');
    expect(recommendationOf(figures, tickets[0])).toBe('delegate-with-review');
  });

  it('une case rouge : la migration de facturation de l\'époque 2', () => {
    const tickets = cohort('data-migration', 'billing', 'M', EPOCH_2);
    const figures = figuresOf(tickets);
    expect(recommendationOf(figures, tickets[0])).toBe('keep-human');
  });

  it('beaucoup de gris honnête : plus de la moitié des cohortes ne conclut pas', () => {
    const cohorts = new Map<string, typeof SEEDS>();
    for (const seed of SEEDS) {
      const key = `${seed.epochId}|${seed.nature}|${seed.zone}|${seed.size}`;
      cohorts.set(key, [...(cohorts.get(key) ?? []), seed]);
    }
    const grey = [...cohorts.values()].filter(
      (tickets) => conclusionOf(figuresOf(tickets)) === 'not-enough-data',
    );
    expect(cohorts.size).toBeGreaterThan(10);
    expect(grey.length).toBeGreaterThan(cohorts.size / 2);
  });

  it('un cas « bras déséquilibrés » : 22 contre 3, l\'app ne conclut pas', () => {
    const figures = figuresOf(cohort('external-integration', 'api', 'L', EPOCH_2));
    expect(figures.agent?.n).toBe(22);
    expect(figures.human?.n).toBe(3);
    expect(balanceOf(figures).balanced).toBe(false);
    expect(conclusionOf(figures)).toBe('not-enough-data');
  });
});

describe('SPEC §12 — les époques', () => {
  it('trois époques, la troisième ouverte par un nouveau modèle le 14 septembre', () => {
    const epochs = sampleEpochs();
    expect(epochs).toHaveLength(3);
    expect(epochs[2].startsAt).toBe('2026-09-14');
    expect(epochs[2].label).toContain('nouveau modèle, 14 septembre');
    expect(epochs[2].model).not.toBe(epochs[1].model);
  });

  it('la migration de facturation passe du rouge à l\'époque 2 au gris à l\'époque 3', () => {
    const red = figuresOf(cohort('data-migration', 'billing', 'M', EPOCH_2));
    const now = figuresOf(PROJ_412_COHORT);
    expect(conclusionOf(red)).toBe('worse');
    expect(conclusionOf(now)).toBe('not-enough-data');
  });
});

describe('SPEC §11 — l\'essai contrôlé en cours', () => {
  it('un essai en cours sur la cohorte où l\'app ne savait pas conclure', () => {
    const trial = sampleTrial();
    expect(trial.state).toBe('running');
    expect(trial.stopReason).toBe('');
    expect(trial.epochId).toBe(EPOCH_3);
    expect(trial.cohort).toEqual({
      level: 'nature-zone-size',
      nature: 'external-integration',
      zone: 'api',
      size: 'M',
    });
    const figures = figuresOf(cohort('external-integration', 'api', 'M', EPOCH_3));
    expect(conclusionOf(figures)).toBe('not-enough-data');
    expect(SEEDS.some((seed) => seed.key === 'PROJ-460')).toBe(true);
  });
});

describe('SPEC §13 — l\'époque 1 commence avant l\'adoption', () => {
  it('le travail d\'avant l\'adoption forme le bras « sans agent »', () => {
    const before = cohort('bugfix', 'api', 'S', EPOCH_1).filter(
      (seed) => seed.source === 'adoption-date' && seed.arm === 'human',
    );
    expect(before.length).toBe(9);
    expect(before.every((seed) => seed.level === 'none')).toBe(true);
    expect(before.every((seed) => Date.parse(seed.closedAt) < Date.parse('2026-01-12'))).toBe(true);
  });
});
