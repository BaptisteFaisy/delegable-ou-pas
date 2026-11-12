/**
 * The ten scenarios of the reference base — SPEC §8, §12, §21, §22.
 *
 * The brief gives the figures of every cohort; this file locks them: the
 * effectives of the two arms, their clean closures, their median delays and
 * the censored tickets they carry. The numbers are written here on purpose —
 * the scenario table is the source of the data, this file is the witness that
 * it produces what the brief asks for (SPEC §24.1).
 */
import { describe, expect, it } from 'vitest';
import type { Conclusion } from '../../src/types.js';
import type { Seed } from '../../src/sample/issues.js';
import { sampleSeeds } from '../../src/sample/index.js';
import { balanceOf, conclusionOf, figuresOf } from './fixtures.js';

const SEEDS: readonly Seed[] = sampleSeeds();

/** What the brief asks of one scenario: counts, clean closures, delays, censoring. */
interface Expected {
  readonly id: string;
  readonly cohort: string;
  /** Closed tickets, clean closures, median delay in hours. */
  readonly agent: readonly [number, number, number];
  readonly human: readonly [number, number, number];
  /** Tickets of the arm that are still open: censored, never counted in a rate. */
  readonly open: readonly [number, number];
  /** What the merged domain concludes on the cohort of the scenario. */
  readonly conclusion: Conclusion;
}

/**
 * The ten cohorts of the brief, with their figures.
 *
 * The conclusion is the one the merged domain gives (SPEC §7 rule 4). Two of
 * them differ from the colour the brief announces: the difference is neither
 * established nor equivalent at ten points, so the app answers "we do not
 * know" — see `docs/DEMO-DATA.md` §6.
 */
const EXPECTED: readonly Expected[] = [
  {
    id: 'e3-orange-migration-m', cohort: 'data-migration|billing|M',
    agent: [26, 18, 36], human: [31, 27, 72], open: [2, 2], conclusion: 'not-enough-data',
  },
  {
    id: 'e2-scenario-bugfix-api-s', cohort: 'bugfix|api|S',
    agent: [60, 55, 30], human: [55, 47, 40], open: [4, 4], conclusion: 'not-enough-data',
  },
  {
    id: 'e2-scenario-tests-web-m', cohort: 'tests|web-ui|M',
    agent: [48, 44, 40], human: [42, 38, 52], open: [3, 3], conclusion: 'better',
  },
  {
    id: 'e2-scenario-refactor-billing-l', cohort: 'refactor|billing|L',
    agent: [30, 15, 44], human: [35, 29, 48], open: [2, 2], conclusion: 'worse',
  },
  {
    id: 'e2-scenario-ui-data-m', cohort: 'ui-change|data-pipeline|M',
    agent: [34, 22, 28], human: [30, 24, 44], open: [3, 3], conclusion: 'not-enough-data',
  },
  {
    id: 'e2-scenario-config-api-s', cohort: 'configuration|api|S',
    agent: [8, 6, 20], human: [6, 5, 26], open: [1, 1], conclusion: 'not-enough-data',
  },
  {
    id: 'e2-scenario-integration-billing-m', cohort: 'external-integration|billing|M',
    agent: [40, 32, 60], human: [12, 8, 96], open: [3, 1], conclusion: 'not-enough-data',
  },
  {
    id: 'e2-scenario-refactor-api-m', cohort: 'refactor|api|M',
    agent: [22, 18, 40], human: [24, 20, 44], open: [2, 2], conclusion: 'not-enough-data',
  },
  {
    id: 'e3-scenario-bugfix-web-s', cohort: 'bugfix|web-ui|S',
    agent: [29, 25, 22], human: [28, 24, 26], open: [16, 12], conclusion: 'not-enough-data',
  },
];

/** The tickets of one family of the base. */
function family(id: string): readonly Seed[] {
  return SEEDS.filter((seed) => seed.family === id);
}

/** The tickets of one cohort of the base: same nature, zone, size and epoch. */
function cohortOf(id: string): readonly Seed[] {
  const seed = family(id)[0];
  return SEEDS.filter((other) =>
    other.nature === seed.nature && other.zone === seed.zone &&
    other.size === seed.size && other.epochId === seed.epochId);
}

describe('les dix scénarios de la base de référence', () => {
  for (const expected of EXPECTED) {
    it(`${expected.id} — ${expected.cohort}`, () => {
      const tickets = family(expected.id);
      const figures = figuresOf(tickets);
      expect(figures.agentTickets.length, 'effectif du bras agent').toBe(expected.agent[0]);
      expect(figures.humanTickets.length, 'effectif du bras humain').toBe(expected.human[0]);
      const clean = (arm: readonly Seed[]): number => arm.filter((seed) => !seed.failure.reopened &&
        seed.failure.causedBugs === 0 && seed.failure.incidents === 0 && !seed.failure.abandoned).length;
      expect(clean(figures.agentTickets), 'clôtures propres avec agent').toBe(expected.agent[1]);
      expect(clean(figures.humanTickets), 'clôtures propres sans agent').toBe(expected.human[1]);
      expect(figures.agentLead?.medianH, 'délai médian avec agent').toBe(expected.agent[2]);
      expect(figures.humanLead?.medianH, 'délai médian sans agent').toBe(expected.human[2]);
      const censored = (arm: Seed['arm']): number =>
        tickets.filter((seed) => seed.arm === arm && seed.closedAt === '').length;
      expect(censored('agent'), 'tickets censurés avec agent').toBe(expected.open[0]);
      expect(censored('human'), 'tickets censurés sans agent').toBe(expected.open[1]);
      const cohort = figuresOf(cohortOf(expected.id));
      expect(conclusionOf(cohort), 'conclusion de la cohorte').toBe(expected.conclusion);
    });
  }
});

describe('scénario 8 — le paradoxe de Simpson', () => {
  const EASY = 'e2-simpson-easy-bugfix-web-m';
  const MIDDLE = 'e2-simpson-middle-tests-data-m';
  const HARD = 'e2-simpson-hard-refactor-data-l';

  it('les trois sous-cohortes : les humains font mieux que les agents', () => {
    for (const id of [EASY, MIDDLE, HARD]) {
      const figures = figuresOf(family(id));
      expect(figures.agent?.rate ?? 0, `${id} : le taux du bras agent`).toBeLessThan(figures.human?.rate ?? 1);
    }
  });

  it('le total agrégé inverse le signe : les agents y semblent meilleurs', () => {
    const tickets = [...family(EASY), ...family(MIDDLE), ...family(HARD)];
    const figures = figuresOf(tickets);
    expect(figures.agent?.rate ?? 0).toBeGreaterThan(figures.human?.rate ?? 1);
    expect(figures.agent?.n).toBe(335);
    expect(figures.human?.n).toBe(270);
  });

  it('les agents reçoivent les tickets faciles : le biais est établi', () => {
    const easy = figuresOf(family(EASY));
    const total = figuresOf([...family(EASY), ...family(MIDDLE), ...family(HARD)]);
    const agentShare = easy.agentTickets.length / (total.agent?.n ?? 1);
    const humanShare = easy.humanTickets.length / (total.human?.n ?? 1);
    expect(agentShare).toBeGreaterThan(0.8);
    expect(agentShare - humanShare).toBeGreaterThan(0.2);
  });
});

describe('scénario 9 — la cohorte portée par deux personnes', () => {
  it('deux rôles seulement : la cohorte est masquée', () => {
    const roles = new Set(family('e2-scenario-refactor-api-m').map((seed) => seed.role));
    expect([...roles].sort()).toEqual(['dev-1', 'dev-2']);
  });
});

describe('scénario 7 — les bras déséquilibrés', () => {
  it('le volume gap dépasse la tolérance : l\'app ne conclut pas', () => {
    const cohort = figuresOf(cohortOf('e2-scenario-integration-billing-m'));
    expect(balanceOf(cohort).balanced).toBe(false);
    expect(conclusionOf(cohort)).toBe('not-enough-data');
  });
});

describe('scénario 10 — l\'analyse de survie a de la matière', () => {
  it('des tickets censurés dans les deux bras, et des médianes atteintes', () => {
    const tickets = family('e3-scenario-bugfix-web-s');
    const agent = tickets.filter((seed) => seed.arm === 'agent');
    const human = tickets.filter((seed) => seed.arm === 'human');
    expect(agent.length).toBe(45);
    expect(human.length).toBe(40);
    expect(agent.filter((seed) => seed.closedAt === '').length / agent.length).toBeGreaterThan(0.3);
    expect(human.filter((seed) => seed.closedAt === '').length / human.length).toBeGreaterThan(0.25);
    expect(agent.filter((seed) => seed.closedAt !== '' && seed.leadTimeH <= 22).length).toBeGreaterThan(0);
    expect(agent.filter((seed) => seed.closedAt !== '' && seed.leadTimeH > 22).length).toBeGreaterThan(0);
  });
});
