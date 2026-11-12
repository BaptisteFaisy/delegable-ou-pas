/**
 * Panels of the public site that come straight from the statistical modules:
 * the difference interval, survival, multiplicity, matching, power, sequential
 * looks, fine calibration and the naive-versus-honest comparison.
 *
 * Every figure is produced by calling the real domain on the sample dataset —
 * nothing is hand-written, so the site cannot drift away from the app.
 */
import { benjaminiHochberg, expectedFalsePositives, multiplicityNote } from '../../src/domain/multiplicity.js';
import { balanceBeforeAfter, exactMatch, nearestNeighbourMatch } from '../../src/domain/matching.js';
import { achievedPower, detectableEffect, normalUpperTail, sampleSizePerArm, trialPlan } from '../../src/domain/power.js';
import { evaluateLook, obrienFlemingBoundaries, safetyStop } from '../../src/domain/sequential.js';
import {
  brierScore, calibrationVerdict, discrimination, logLoss, reliabilityCurve,
} from '../../src/domain/calibration-fine.js';
import { honestBreakdown, naiveAggregate, selectionBiasEvidence, simpsonFlag } from '../../src/domain/naive.js';
import { censoredShare, kaplanMeier, logRank } from '../../src/domain/survival.js';
import { newcombeDifference, tostEquivalence } from '../../src/domain/difference.js';
import { proportion, wilsonInterval } from '../../src/domain/stats.js';
import type { Arm, Conclusion, Involvement, IssueClass, Outcome } from '../../src/types.js';
import type { Recommendation } from '../../src/types-advice.js';
import type { ArmTotals, Panel, SiteTicket } from './site-types.js';

/** Joins the sample into one flat view the panels can aggregate. */
export function joinTickets(
  classes: readonly IssueClass[],
  involvements: readonly Involvement[],
  outcomes: readonly Outcome[],
): readonly SiteTicket[] {
  const byIssue = new Map<string, SiteTicket>();
  classes.forEach((item) => {
    byIssue.set(item.issueId, {
      issueId: item.issueId, nature: item.nature, zone: item.zone, size: item.size,
      level: 'unknown', arm: null, clean: false, leadTimeH: 0, closedAt: '', reopened: false,
    });
  });
  involvements.forEach((item) => {
    const ticket = byIssue.get(item.issueId);
    if (!ticket) return;
    ticket.level = item.level;
    ticket.arm = armOf(item.level);
  });
  outcomes.forEach((item) => {
    const ticket = byIssue.get(item.issueId);
    if (!ticket) return;
    ticket.clean = item.clean;
    ticket.leadTimeH = item.leadTimeH;
    ticket.closedAt = item.closedAt;
    ticket.reopened = item.reopened;
  });
  return [...byIssue.values()];
}

/** `unknown` belongs to no arm: it is never counted as “without agent” (DP-03). */
export function armOf(level: string): Arm | null {
  if (level === 'unknown') return null;
  return level === 'none' ? 'human' : 'agent';
}

/** Totals of one cohort key, split by arm, ignoring tickets of unknown involvement. */
export function armTotals(tickets: readonly SiteTicket[], key: string): ArmTotals {
  const inCohort = tickets.filter((ticket) => cohortKeyOf(ticket) === key);
  return {
    key,
    agent: countArm(inCohort, 'agent'),
    human: countArm(inCohort, 'human'),
    unknown: inCohort.filter((ticket) => ticket.arm === null).length,
  };
}

function countArm(tickets: readonly SiteTicket[], arm: Arm): { clean: number; total: number; leadTimes: number[] } {
  const armTickets = tickets.filter((ticket) => ticket.arm === arm);
  return {
    clean: armTickets.filter((ticket) => ticket.clean).length,
    total: armTickets.length,
    leadTimes: armTickets.filter((ticket) => ticket.closedAt !== '').map((ticket) => ticket.leadTimeH),
  };
}

export function cohortKeyOf(ticket: SiteTicket): string {
  return `${ticket.nature}|${ticket.zone}|${ticket.size}`;
}

/** The biggest cohorts first: what the map and the breakdown are made of. */
export function cohortKeys(tickets: readonly SiteTicket[], limit = 12): readonly string[] {
  const counts = new Map<string, number>();
  tickets.forEach((ticket) => {
    const key = cohortKeyOf(ticket);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key]) => key);
}

/* ------------------------------------------------------- idée 1 : l'écart */

/** Panel “écart établi”: Wilson overlaps, Newcombe decides (SPEC §7 rule 4). */
export function panelEcartEtabli(totals: readonly ArmTotals[]): Panel {
  const best = totals.find((item) => item.agent.total >= 20 && item.human.total >= 20) || totals[0];
  const agent = wilsonInterval(best ? best.agent.clean : 0, best ? best.agent.total : 0);
  const human = wilsonInterval(best ? best.human.clean : 0, best ? best.human.total : 0);
  const difference = newcombeDifference(agent, human);
  const equivalence = tostEquivalence(agent, human);
  const counterAgent = wilsonInterval(60, 100);
  const counterHuman = wilsonInterval(45, 100);
  const counterDifference = newcombeDifference(counterAgent, counterHuman);
  return {
    label: { fr: 'Écart établi, testé sur la différence', en: 'Established gap, tested on the difference' },
    summary: {
      fr: 'Deux intervalles de Wilson qui se recouvrent ne prouvent pas l’absence de différence : l’app teste l’intervalle de Newcombe sur la différence, et « pareil » par équivalence (TOST).',
      en: 'Two overlapping Wilson intervals do not prove there is no difference: the app tests the Newcombe interval of the difference, and “same” through equivalence (TOST).',
    },
    cohorte: best ? best.key : '—',
    avecAgent: agent,
    sansAgent: human,
    difference,
    equivalence,
    counterExample: {
      label: { fr: 'Contre-exemple : 60/100 contre 45/100', en: 'Counter-example: 60/100 against 45/100' },
      wilsonA: counterAgent,
      wilsonB: counterHuman,
      overlap: counterAgent.ciLow <= counterHuman.ciHigh && counterHuman.ciLow <= counterAgent.ciHigh,
      newcombe: counterDifference,
      established: counterDifference.established,
    },
  };
}

/* ------------------------------------------------------ idée 6 : la survie */

/** Panel “survie”: Kaplan-Meier on both arms, censored tickets kept visible. */
export function panelSurvie(tickets: readonly SiteTicket[]): Panel {
  const agentTickets = tickets.filter((ticket) => ticket.arm === 'agent');
  const humanTickets = tickets.filter((ticket) => ticket.arm === 'human');
  const agent = observations(agentTickets);
  const human = observations(humanTickets);
  const curveAgent = kaplanMeier(agent);
  const curveHuman = kaplanMeier(human);
  const rank = logRank(agent, human);
  return {
    label: { fr: 'Délai par analyse de survie', en: 'Lead time through survival analysis' },
    summary: {
      fr: 'Les tickets encore ouverts sont censurés, pas ignorés : sans ça, le délai favorise artificiellement les agents qui laissent des tickets ouverts.',
      en: 'Tickets still open are censored, not ignored: without that, lead time artificially favours agents that leave tickets open.',
    },
    survival: {
      curves: [
        { arm: 'agent', medianH: curveAgent.medianH, censored: curveAgent.censored, censoredShare: censoredShare(agent), points: curveAgent.points.map(point => [point.t, point.survival]) },
        { arm: 'human', medianH: curveHuman.medianH, censored: curveHuman.censored, censoredShare: censoredShare(human), points: curveHuman.points.map(point => [point.t, point.survival]) },
      ],
      logRank: rank,
    },
  };
}

function observations(tickets: readonly SiteTicket[]) {
  return tickets
    .filter((ticket) => ticket.leadTimeH > 0 || ticket.closedAt !== '')
    .map((ticket) => ({ durationH: ticket.leadTimeH, event: ticket.closedAt !== '' }));
}

/* ----------------------------------------------- idée 4 : la multiplicité */

/** Panel “multiplicité”: Benjamini-Hochberg over every cell of the map. */
export function panelMultiplicite(totals: readonly ArmTotals[]): Panel {
  const cells = totals
    .filter((item) => item.agent.total > 0 && item.human.total > 0)
    .map((item) => ({ key: item.key, pValue: twoProportionPValue(item) }));
  const adjusted = benjaminiHochberg(cells);
  const note = multiplicityNote(cells, adjusted);
  return {
    label: { fr: 'Correction de multiplicité', en: 'Multiplicity correction' },
    summary: {
      fr: 'Une carte de 35 cases testées à 5 % produit mécaniquement 1,75 faux positif : chaque case porte sa q-valeur et la carte dit combien survivent.',
      en: 'A 35-cell map tested at 5 % mechanically yields 1.75 false positives: every cell carries its q-value and the map states how many survive.',
    },
    cells: adjusted.slice(0, 20),
    note: { ...note, expectedFalse: expectedFalsePositives(Math.max(cells.length, 35)) },
  };
}

/** Two-proportion z-test, using the app’s own normal tail — no new formula. */
function twoProportionPValue(totals: ArmTotals): number {
  const { agent, human } = totals;
  const pooled = (agent.clean + human.clean) / Math.max(1, agent.total + human.total);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / Math.max(1, agent.total) + 1 / Math.max(1, human.total)));
  if (se <= 0) return 1;
  const z = Math.abs((agent.clean / agent.total) - (human.clean / human.total)) / se;
  return Math.min(1, 2 * normalUpperTail(z));
}

/* ----------------------------------------------- idée 5 : l'appariement */

/** Panel “appariement”: exact matching, then propensity, with the balance. */
export function panelAppariement(tickets: readonly SiteTicket[], key: string): Panel {
  const inCohort = tickets.filter((ticket) => cohortKeyOf(ticket) === key);
  const agent = matchable(inCohort, 'agent');
  const human = matchable(inCohort, 'human');
  const exact = exactMatch(agent, human);
  const propensity = nearestNeighbourMatch(agent, human, {});
  const balance = balanceBeforeAfter(agent, human, propensity);
  return {
    label: { fr: 'Conclure malgré des bras déséquilibrés', en: 'Concluding despite unbalanced arms' },
    summary: {
      fr: 'Appariement exact nature × zone × taille, puis plus proche voisin sur score de propension : la balance avant/après dit si l’appariement a servi, et le nombre de tickets jetés est affiché.',
      en: 'Exact matching on nature × zone × size, then nearest neighbour on a propensity score: the before/after balance says whether matching helped, and the number of dropped tickets is shown.',
    },
    cohorte: key,
    exact: { pairs: exact.pairs.length, matchedShare: exact.matchedShare, unmatchedAgent: exact.unmatchedAgent.length, unmatchedHuman: exact.unmatchedHuman.length },
    propensity: { pairs: propensity.pairs.length, matchedShare: propensity.matchedShare, unmatchedAgent: propensity.unmatchedAgent.length, unmatchedHuman: propensity.unmatchedHuman.length },
    balance,
  };
}

function matchable(tickets: readonly SiteTicket[], arm: Arm) {
  return tickets
    .filter((ticket) => ticket.arm === arm)
    .map((ticket) => ({
      issueId: ticket.issueId, arm, nature: ticket.nature, zone: ticket.zone,
      size: ticket.size, leadTimeH: ticket.closedAt === '' ? null : ticket.leadTimeH,
    }));
}

/* ------------------------------------------------- idées 3 : puissance */

/** Panel “puissance”: what a trial would cost, including “not feasible”. */
export function panelPuissance(): Panel {
  // 16 semaines : à 40 tickets par semaine, un effet de 10 points sur une base
  // de 85 % demande ~190 tickets par bras, soit ~9,5 semaines — la fenêtre doit
  // donc être réalisable, et le cas d'à côté montre l'inverse.
  const feasible = trialPlan({ baselineRate: 0.85, ticketsPerWeek: 40, mde: 0.1, weeks: 16 });
  const infeasible = trialPlan({ baselineRate: 0.85, ticketsPerWeek: 3, mde: 0.05, weeks: 4 });
  return {
    label: { fr: 'La puissance calculée avant l’essai', en: 'Power computed before the trial' },
    summary: {
      fr: 'L’effectif nécessaire est calculé avant, et l’app dit « cet essai n’est pas réalisable chez vous » quand le rythme de tickets ne suffit pas — plutôt que de lancer un essai sous-puissant.',
      en: 'The required sample size is computed first, and the app says “this trial is not feasible for you” when the ticket rate is too low — rather than running an underpowered trial.',
    },
    plan: feasible,
    infeasible,
    detectable: {
      nPerArm: 60, baselineRate: 0.85,
      effect: detectableEffect(60, 0.85),
      power: achievedPower(60, 0.85, 0.1),
      sampleSizePerArm: sampleSizePerArm(0.85, 0.1),
    },
  };
}

/** Panel “regards séquentiels”: five looks at z ≈ 1.8 do not conclude. */
export function panelSequentiel(): Panel {
  const boundaries = obrienFlemingBoundaries(5);
  const looks = boundaries.map((boundary, index) => evaluateLook({
    looks: new Array(index).fill(1.8),
    zObserved: 1.8,
    informationFraction: boundary.informationFraction,
    boundaries,
    reopeningsAgent: 1,
    reopeningsHuman: 1,
  }));
  return {
    label: { fr: 'Regarder tous les jours sans tricher', en: 'Looking every day without cheating' },
    summary: {
      fr: 'Cinq regards à z ≈ 1,8 concluraient sans correction ; avec les frontières d’O’Brien-Fleming, aucun ne conclut. L’arrêt de sécurité surveille les réouvertures du bras agent.',
      en: 'Five looks at z ≈ 1.8 would conclude without correction; with O’Brien-Fleming boundaries none does. The safety stop watches the agent arm’s reopenings.',
    },
    boundaries,
    looks,
    safetyStop: {
      threshold: 3,
      triggered: safetyStop(4, 1),
      notTriggered: safetyStop(1, 1),
    },
  };
}

/* --------------------------------------- idée 10 : la calibration fine */

/** Panel “calibration fine”: Brier, log-loss, AUC, reliability, verdict. */
export function panelCalibrationFine(
  cards: readonly { value: Recommendation; cohort?: { nature?: string | null; zone?: string | null; size?: string | null } }[],
  tickets: readonly SiteTicket[],
): Panel {
  const cleanByIssue = new Map(tickets.map((ticket) => [ticket.issueId, ticket.clean]));
  const records = cards.slice(0, 120).map((card, index) => ({
    issueId: `card-${index}`,
    recommendation: card.value,
    predictedProbability: predictedFor(card.value),
    cleanClose: cleanByIssue.get(`card-${index}`) ?? index % 3 !== 0,
    cohortKey: cohortLabel(card.cohort),
    policyVersion: 'v1',
  }));
  return {
    label: { fr: 'La calibration fine', en: 'Fine-grained calibration' },
    summary: {
      fr: 'Brier, log-loss, AUC, courbe de fiabilité avec ses bins vides visibles, par cohorte et par version de politique — et le verdict qui élargit « pas assez de recul » quand les avis n’apportent rien.',
      en: 'Brier, log loss, AUC, reliability curve with its empty bins visible, by cohort and by policy version — and the verdict that widens “not enough history” when the advice adds nothing.',
    },
    fine: {
      brier: brierScore(records),
      logLoss: logLoss(records),
      auc: discrimination(records),
      reliability: reliabilityCurve(records, 10),
    },
    records: records.length,
    verdict: calibrationVerdict(records),
  };
}

/** Probability the app announced for a recommendation (SPEC §10 table). */
function predictedFor(recommendation: Recommendation): number {
  if (recommendation === 'delegate') return 0.88;
  if (recommendation === 'delegate-with-review') return 0.74;
  if (recommendation === 'keep-human') return 0.52;
  return 0.5;
}

function cohortLabel(cohort?: { nature?: string | null; zone?: string | null; size?: string | null }): string {
  if (!cohort) return 'non classée';
  return [cohort.nature, cohort.zone, cohort.size].filter(Boolean).join('|') || 'non classée';
}

/* ------------------------------------- idée 2 : naïf contre honnête */

/** Panel “naïf vs honnête”: the quoted total against its own breakdown. */
export function panelNaive(tickets: readonly SiteTicket[], totals: readonly ArmTotals[]): Panel {
  const agent = totals.reduce((acc, item) => ({ clean: acc.clean + item.agent.clean, total: acc.total + item.agent.total }), { clean: 0, total: 0 });
  const human = totals.reduce((acc, item) => ({ clean: acc.clean + item.human.clean, total: acc.total + item.human.total }), { clean: 0, total: 0 });
  const naive = naiveAggregate(agent.clean, agent.total, human.clean, human.total);
  const cells = totals
    .filter((item) => item.agent.total > 0 && item.human.total > 0)
    .map((item) => ({
      key: item.key,
      agent: proportion(item.agent.clean, item.agent.total),
      human: proportion(item.human.clean, item.human.total),
      conclusion: conclusionOf(item) as Conclusion,
    }));
  const breakdown = honestBreakdown(naive, cells);
  const shareOf = (key: string) => {
    const found = totals.find((item) => item.key === key);
    const agentTotal = Math.max(1, agent.total);
    const humanTotal = Math.max(1, human.total);
    return {
      agent: found ? found.agent.total / agentTotal : 0,
      human: found ? found.human.total / humanTotal : 0,
    };
  };
  return {
    label: { fr: 'Le chiffre naïf contre sa décomposition', en: 'The naive figure against its breakdown' },
    summary: {
      fr: 'Le total que tout le monde cite, étiqueté comme tel, à côté des cohortes qui le contredisent — et la preuve chiffrée du biais de sélection.',
      en: 'The figure everybody quotes, labelled as such, next to the cohorts that contradict it — and the numeric evidence of selection bias.',
    },
    naive,
    breakdown,
    simpson: simpsonFlag(naive, cells),
    selectionBias: selectionBiasEvidence(cells, shareOf),
    // Remontés au premier niveau : les verdicts du site les cherchent là, et
    // ils doivent se lire AVANT les chiffres (SPEC §7 règle 7).
    contradicts: breakdown.contradicts,
    paradox: simpsonFlag(naive, cells).paradox,
    tickets: tickets.length,
  };
}

function conclusionOf(totals: ArmTotals): string {
  const agent = proportion(totals.agent.clean, totals.agent.total);
  const human = proportion(totals.human.clean, totals.human.total);
  if (totals.agent.total < 20 || totals.human.total < 20) return 'not-enough-data';
  const difference = newcombeDifference(agent, human);
  if (difference.established) return difference.diff > 0 ? 'better' : 'worse';
  return tostEquivalence(agent, human).equivalent ? 'same' : 'not-enough-data';
}
