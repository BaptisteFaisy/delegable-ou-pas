/**
 * The material of the base — the screens, the tools and the panels.
 *
 * This is the test that says the demo can show everything the product
 * promises: for each of the eight screens, the nine MCP tools and the sixteen
 * panels of the site, the base must carry the facts the screen reads. A
 * feature without material turns this test red — that is its whole job
 * (SPEC §12, §16, §19, §22).
 */
import { describe, expect, it } from 'vitest';
import { compareBalance, composition } from '../../src/domain/balance.js';
import { conclude } from '../../src/domain/conclusion.js';
import { recommendFrom } from '../../src/domain/recommendation.js';
import { wilsonInterval } from '../../src/domain/stats.js';
import { honestBreakdown, naiveAggregate, selectionBiasEvidence } from '../../src/domain/naive.js';
import { censoredShare, kaplanMeier } from '../../src/domain/survival.js';
import { isMature } from '../../src/domain/maturity.js';
import { maskCohort } from '../../src/domain/privacy.js';
import {
  sampleCards, sampleClasses, sampleCommitFacts, sampleCoverage, sampleInvolvements, sampleLinks,
  sampleOutcomes, sampleReviewFacts, sampleSeeds, sampleSettings, sampleTrial, sampleTrialAssignments,
} from '../../src/sample/index.js';
import { sampleSignaturePatterns, seenCounts } from '../../src/sample/commits.js';
import { cleanOf } from '../../src/sample/outcomes.js';
import { SAMPLE_MIN_ARM_SIZE } from '../../src/sample/project.js';

const SEEDS = sampleSeeds();
const CARDS = sampleCards();
const OUTCOMES = sampleOutcomes();
const INVOLVEMENTS = sampleInvolvements();

/** One ticket of the base. */
type SeedRow = (typeof SEEDS)[number];

/** One cohort of the base: same nature, zone, size and epoch. */
interface Cohort {
  readonly key: string;
  readonly agent: readonly SeedRow[];
  readonly human: readonly SeedRow[];
  readonly agentRate: ReturnType<typeof wilsonInterval> | null;
  readonly humanRate: ReturnType<typeof wilsonInterval> | null;
  readonly agentLead: number | null;
  readonly humanLead: number | null;
  readonly balanced: boolean;
  readonly conclusion: string;
  readonly recommendation: string;
}

/** Every cohort of the base, with the figures the domain reads. */
function cohorts(): readonly Cohort[] {
  const groups = new Map<string, SeedRow[]>();
  for (const seed of SEEDS) {
    const key = `${seed.epochId}|${seed.nature}|${seed.zone}|${seed.size}`;
    groups.set(key, [...(groups.get(key) ?? []), seed]);
  }
  return [...groups.entries()].map(([key, seeds]) => {
    const closed = seeds.filter((seed) => seed.closedAt !== '');
    const agent = closed.filter((seed) => seed.arm === 'agent');
    const human = closed.filter((seed) => seed.arm === 'human');
    const stat = (arm: readonly SeedRow[]) =>
      arm.length === 0 ? null : wilsonInterval(arm.filter(cleanOf).length, arm.length);
    const lead = (arm: readonly SeedRow[]) =>
      arm.length === 0 ? null : arm.reduce((sum, seed) => sum + seed.leadTimeH, 0) / arm.length;
    const balance = compareBalance(composition(agent.length, {}, {}), composition(human.length, {}, {}));
    const agentRate = stat(agent);
    const humanRate = stat(human);
    const conclusion = conclude(agentRate, humanRate, SAMPLE_MIN_ARM_SIZE, balance);
    const agentLead = lead(agent);
    const humanLead = lead(human);
    const delayBetter = agentLead !== null && humanLead !== null && agentLead < humanLead;
    return {
      key, agent, human, agentRate, humanRate, agentLead, humanLead, balanced: balance.balanced,
      conclusion,
      recommendation: recommendFrom(
        conclusion as never, balance, [], delayBetter,
      ),
    };
  });
}

const COHORTS = cohorts();

describe('les huit écrans de l\'application', () => {
  it('carte sur le ticket : une carte chiffrée par ticket nommé', () => {
    expect(CARDS.length).toBeGreaterThan(0);
    const card = CARDS.find((item) => item.issueKey === 'PROJ-412');
    expect(card?.agent?.n).toBe(26);
    expect(card?.human?.n).toBe(31);
    expect(card?.reasons.length).toBeGreaterThan(2);
  });

  it('carte de délégation : une case par couleur, et la part de gris', () => {
    expect(COHORTS.some((cohort) => cohort.conclusion === 'better')).toBe(true);
    expect(COHORTS.some((cohort) => cohort.conclusion === 'worse')).toBe(true);
    expect(COHORTS.some((cohort) => cohort.conclusion === 'not-enough-data')).toBe(true);
    expect(CARDS.some((card) => card.value === 'delegate-with-review')).toBe(true);
    const grey = COHORTS.filter((cohort) => cohort.conclusion === 'not-enough-data').length;
    expect(grey / COHORTS.length).toBeGreaterThan(0);
    expect(grey / COHORTS.length).toBeLessThan(1);
  });

  it('détail de cohorte : les deux bras, l\'écart et la composition', () => {
    const cohort = COHORTS.find((item) => item.agent.length > 0 && item.human.length > 0);
    expect(cohort?.agentRate).not.toBeNull();
    expect(cohort?.humanRate).not.toBeNull();
    expect(typeof cohort?.balanced).toBe('boolean');
    expect(COHORTS.some((item) => !item.balanced)).toBe(true);
  });

  it('sprint : des tickets avec des points d\'histoire', () => {
    const withPoints = SEEDS.filter((seed) => seed.storyPoints !== null);
    expect(withPoints.length).toBeGreaterThan(0);
    expect(new Set(SEEDS.map((seed) => seed.sprintId)).size).toBeGreaterThan(1);
  });

  it('réglages : le seuil, les zones sensibles et le catalogue de mentions', () => {
    const settings = sampleSettings();
    expect(settings.minArmSize).toBe(SAMPLE_MIN_ARM_SIZE);
    expect(settings.sensitiveZones.length).toBeGreaterThan(0);
    expect(settings.zones.length).toBeGreaterThan(0);
    const patterns = sampleSignaturePatterns();
    expect(patterns.filter((pattern) => pattern.enabled).length).toBe(4);
    expect(patterns.some((pattern) => !pattern.enabled)).toBe(true);
  });

  it('couverture : deux droits manquants sur le graphe, dits à voix haute', () => {
    const coverage = sampleCoverage();
    const missing = coverage.permissions.filter((permission) => permission.state !== 'granted');
    expect(missing.length).toBe(2);
    expect(coverage.totalIssues).toBe(SEEDS.length);
    expect(coverage.knownIssues).toBeGreaterThan(0);
  });

  it('calibration : des recommandations données et des résultats observés', () => {
    const clean = OUTCOMES.filter((outcome) => outcome.clean).length;
    expect(clean).toBeGreaterThan(0);
    expect(CARDS.length).toBeGreaterThan(0);
  });

  it('gadget : une part délégable qui repose sur des cartes', () => {
    const delegable = CARDS.filter((card) => card.value === 'delegate' || card.value === 'delegate-with-review');
    expect(delegable.length).toBeGreaterThan(0);
  });
});

describe('les neuf outils MCP', () => {
  it('should-delegate : la carte d\'un ticket nommé', () => {
    expect(CARDS.find((card) => card.issueKey === 'PROJ-412')).toBeDefined();
  });

  it('list-delegable-work : des tickets à confier, du plus sûr au moins sûr', () => {
    const delegable = CARDS.filter((card) => card.value === 'delegate' || card.value === 'delegate-with-review');
    expect(delegable.length).toBeGreaterThan(0);
  });

  it('get-delegation-evidence : les tickets de référence et les raisons', () => {
    const card = CARDS.find((item) => item.issueKey === 'PROJ-412');
    expect(card?.referenceIssueKeys.length).toBeGreaterThan(0);
    expect(card?.failureCauses.length).toBeGreaterThan(0);
  });

  it('get-delegation-map : une cohorte par couple nature-zone', () => {
    expect(COHORTS.length).toBeGreaterThan(10);
  });

  it('get-cohort : les deux bras d\'une cohorte', () => {
    const cohort = COHORTS.find((item) => item.agent.length >= 20 && item.human.length >= 20);
    expect(cohort).toBeDefined();
  });

  it('get-calibration : des résultats observés après les recommandations', () => {
    const mature = OUTCOMES.filter((outcome) => isMature(outcome, '2026-11-30T12:00:00Z'));
    expect(mature.length).toBeGreaterThan(0);
  });

  it('record-involvement : les cinq niveaux et les cinq sources', () => {
    const levels = new Set(INVOLVEMENTS.map((item) => item.level));
    expect(levels).toEqual(new Set(['none', 'assisted', 'driven', 'autonomous', 'unknown']));
    const sources = new Set(INVOLVEMENTS.map((item) => item.source));
    expect(sources.size).toBeGreaterThanOrEqual(5);
  });

  it('record-decision : des décisions rapprochables d\'un résultat', () => {
    expect(OUTCOMES.length).toBe(SEEDS.length);
  });

  it('report-takeover : une reprise humaine déclarée', () => {
    expect(OUTCOMES.some((outcome) => outcome.takeover)).toBe(true);
  });
});

describe('les seize panneaux du site public', () => {
  it('implication : les cinq niveaux dans le jeu', () => {
    const counts = new Map<string, number>();
    INVOLVEMENTS.forEach((item) => counts.set(item.level, (counts.get(item.level) ?? 0) + 1));
    expect(counts.size).toBe(5);
  });

  it('mentions : un catalogue avec des mentions vues et une à confirmer', () => {
    const patterns = seenCounts(sampleCommitFacts());
    expect(patterns.some((pattern) => pattern.seenCount > 0)).toBe(true);
    expect(patterns.filter((pattern) => !pattern.enabled)).toHaveLength(1);
  });

  it('écart établi : un couple où l\'écart est établi', () => {
    expect(COHORTS.some((cohort) => cohort.conclusion === 'better' || cohort.conclusion === 'worse')).toBe(true);
  });

  it('survie : des tickets censurés dans les deux bras', () => {
    const agent = SEEDS.filter((seed) => seed.arm === 'agent').map((seed) => ({
      durationH: seed.leadTimeH, event: seed.closedAt !== '',
    }));
    const human = SEEDS.filter((seed) => seed.arm === 'human').map((seed) => ({
      durationH: seed.leadTimeH, event: seed.closedAt !== '',
    }));
    expect(censoredShare(agent)).toBeGreaterThan(0);
    expect(censoredShare(human)).toBeGreaterThan(0);
    expect(kaplanMeier(agent).medianH).not.toBeNull();
  });

  it('multiplicité : plusieurs cohortes testables', () => {
    expect(COHORTS.filter((cohort) => cohort.agent.length > 0 && cohort.human.length > 0).length)
      .toBeGreaterThan(5);
  });

  it('appariement : des cohortes assez grosses pour être appariées', () => {
    expect(COHORTS.filter((cohort) => cohort.agent.length >= 20).length).toBeGreaterThan(2);
  });

  it('puissance : des effectifs quiported la puissance', () => {
    expect(COHORTS.filter((cohort) => cohort.agent.length >= 20 && cohort.human.length >= 20).length)
      .toBeGreaterThan(2);
  });

  it('séquentiel : un essai avec une date de fin', () => {
    const trial = sampleTrial();
    expect(trial.endsAt > trial.startsAt).toBe(true);
    expect(trial.state).toBe('running');
  });

  it('essai : un essai en cours, avec ses tirages', () => {
    expect(sampleTrialAssignments().length).toBeGreaterThan(0);
  });

  it('naïf : un total qui contredit ses propres cohortes (Simpson)', () => {
    const easy = SEEDS.filter((seed) => seed.family === 'e2-simpson-easy-bugfix-web-m');
    const middle = SEEDS.filter((seed) => seed.family === 'e2-simpson-middle-tests-data-m');
    const hard = SEEDS.filter((seed) => seed.family === 'e2-simpson-hard-refactor-data-l');
    const trio = [...easy, ...middle, ...hard];
    const arm = (tickets: readonly SeedRow[], name: 'agent' | 'human') =>
      tickets.filter((seed) => seed.arm === name);
    const naive = naiveAggregate(
      arm(trio, 'agent').filter(cleanOf).length, arm(trio, 'agent').length,
      arm(trio, 'human').filter(cleanOf).length, arm(trio, 'human').length,
    );
    const cells = [easy, middle, hard].map((tickets) => {
      const agentArm = arm(tickets, 'agent');
      const humanArm = arm(tickets, 'human');
      const agentStat = wilsonInterval(agentArm.filter(cleanOf).length, agentArm.length);
      const humanStat = wilsonInterval(humanArm.filter(cleanOf).length, humanArm.length);
      const balance = compareBalance(composition(agentArm.length, {}, {}), composition(humanArm.length, {}, {}));
      return {
        key: `${tickets[0].family}`,
        agent: agentStat,
        human: humanStat,
        conclusion: conclude(agentStat, humanStat, SAMPLE_MIN_ARM_SIZE, balance),
      };
    });
    const breakdown = honestBreakdown(naive, cells);
    expect(breakdown.contradicts).toBe(true);
    const bias = selectionBiasEvidence(cells, (key) => {
      const cell = cells.find((item) => item.key === key);
      const agentTotal = naive.agent.n || 1;
      const humanTotal = naive.human.n || 1;
      return {
        agent: (cell?.agent.n ?? 0) / agentTotal,
        human: (cell?.human.n ?? 0) / humanTotal,
      };
    });
    expect(bias.biased).toBe(true);
  });

  it('calibration fine : des cartes et des résultats à rapprocher', () => {
    expect(CARDS.length).toBeGreaterThan(0);
    expect(OUTCOMES.filter((outcome) => outcome.clean).length).toBeGreaterThan(0);
  });

  it('conditions : la définition de la relecture renforcée du projet', () => {
    expect(sampleSettings().hardenedReview.minReviewers).toBeGreaterThan(0);
    expect(CARDS.some((card) => card.conditions.length > 0)).toBe(true);
  });

  it('priorité : des tickets avec des points d\'histoire', () => {
    expect(SEEDS.filter((seed) => seed.storyPoints !== null).length).toBeGreaterThan(0);
  });

  it('jira seul : l\'app voit les tickets et leurs liens', () => {
    expect(sampleClasses().length).toBe(SEEDS.length);
    expect(sampleLinks().length).toBeGreaterThan(0);
  });

  it('époques : trois époques, chacune avec de la matière', () => {
    const epochs = new Set(SEEDS.map((seed) => seed.epochId));
    expect(epochs.size).toBe(3);
    epochs.forEach((epoch) => {
      expect(SEEDS.filter((seed) => seed.epochId === epoch).length).toBeGreaterThan(0);
    });
  });

  it('anonymat : aucun identifiant de personne dans le jeu', () => {
    const roles = new Set(SEEDS.map((seed) => seed.role));
    roles.forEach((role) => expect(role).toMatch(/^(dev-[123]|agent-bot-[0-9]+)$/));
  });
});

describe('la matière des cas limites', () => {
  it('une cohorte masquée, une réouverture écartée, un ticket sans commit', () => {
    const masked = SEEDS.filter((seed) => seed.family === 'e2-scenario-refactor-api-m');
    expect(maskCohort(new Set(masked.map((seed) => seed.role)).size)).toBe(true);
    expect(SEEDS.some((seed) => seed.reopenDurationMin > 0 && seed.reopenDurationMin < 10)).toBe(true);
    expect(SEEDS.some((seed) => seed.commits === 0)).toBe(true);
  });

  it('la part d\'implication inconnue est proche de 41 %', () => {
    const unknown = INVOLVEMENTS.filter((item) => item.level === 'unknown').length;
    expect(Math.round((unknown / INVOLVEMENTS.length) * 100)).toBeGreaterThanOrEqual(40);
    expect(Math.round((unknown / INVOLVEMENTS.length) * 100)).toBeLessThanOrEqual(42);
  });

  it('des tickets encore ouverts dans toutes les cohortes utiles', () => {
    const open = SEEDS.filter((seed) => seed.closedAt === '');
    expect(open.length).toBeGreaterThan(0);
    expect(new Set(open.map((seed) => seed.family)).size).toBeGreaterThan(5);
  });

  it('des rélectures, des commits et des liens : le graphe a de la matière', () => {
    expect(sampleReviewFacts().length).toBeGreaterThan(0);
    expect(sampleCommitFacts().length).toBeGreaterThan(0);
    expect(sampleLinks().length).toBeGreaterThan(0);
  });
});
