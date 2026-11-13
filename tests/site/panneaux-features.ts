/**
 * The ten feature panels the public site shows, one per domain module the
 * product carries (lot E11b).
 *
 * Rule of the lot: no figure is written by hand here. Every number comes from
 * `src/domain/**` called on `src/sample/**`, so the site cannot drift away
 * from the app — the same discipline as the sixteen panels already published
 * (SPEC §7, §24, DP-20).
 *
 * The projections of the sample dataset live in `panneaux-features-base.ts`;
 * this file holds the panels themselves.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import { causalReadiness, confoundingBound, matchingSensitivity } from '../../src/domain/causal.js';
import { conclude } from '../../src/domain/conclusion.js';
import { cohortCost, DEFAULT_COST_MODEL, portfolioCost } from '../../src/domain/cost.js';
import { morningReport, selectForNight } from '../../src/domain/coordinator.js';
import { assessFreshness, collectionBudget, stateOf } from '../../src/domain/freshness.js';
import { poolCohorts } from '../../src/domain/pooling.js';
import { decisionProof, replayDecision } from '../../src/domain/proof.js';
import {
  defaultVariants, policyVersion, simulate, simulateCohorts, simulateThresholds,
} from '../../src/domain/simulation.js';
import type { PolicyVariant } from '../../src/domain/simulation.js';
import { calibrateSignal, DEFAULT_SIGNALS, extractFeatures, prioritiseUnknown, scoreInvolvement } from '../../src/domain/signals.js';
import { proportion } from '../../src/domain/stats.js';
import { flipProbability, ticketsToChangeConclusion, uncertaintyReport, unknownEntropy } from '../../src/domain/uncertainty.js';
import { APP_VERSION } from '../../src/version.js';
import { SCHEMA_VERSION, SUPPORTED_SCHEMA_VERSIONS, checkCompatibility, supports } from '../../src/mcp/schema.js';
import { SAMPLE_REFERENCE_DATE, sampleInvolvements, sampleSettings } from '../../src/sample/index.js';
import { armTotals } from './panneaux-stats.js';
import type { ArmTotals, Panel, SiteTicket } from './site-types.js';
import {
  armsOf, balanceOf, biggestCohort, cleanByIssue, cohortSizes, commitsByIssue, currentPolicy,
  freshnessContracts, labelledExamples, matchable, nightCandidates, nightOutcomes, poolingInputs,
  reopenedIn, scoresOf, simulationTickets, unknownCandidates,
} from './panneaux-features-base.js';

/* -------------------------------------------------- 1. the rule, replayed */

/**
 * Panel "the rule, replayed": the simulation of another policy on the same
 * tickets, cohort by cohort, and the sweep of thresholds (SPEC §8, §11).
 */
export function panneauSimulation(tickets: readonly SiteTicket[]): Panel {
  const variants = defaultVariants();
  const baseline = currentPolicy();
  const variant = variants[1];
  const replay = simulationTickets(tickets);
  const outcome = simulate({ tickets: replay, baseline, variant });
  const cohorts = simulateCohorts({ tickets: replay, baseline, variant });
  const thresholds = [10, 15, 20, 25, 30];
  const sweep = simulateThresholds(replay, thresholds);
  return {
    label: { fr: 'La règle, rejouée', en: 'The rule, replayed' },
    summary: {
      fr: 'Rejouer le passé sous une autre règle : combien de tickets seraient délégués, combien de réouvertures évitées, ce que ça change sur la qualité. Une simulation ne prouve rien — elle rejoue, et le dit.',
      en: 'Replaying the past under another rule: how many tickets would be delegated, how many reopenings avoided, what that changes on quality. A simulation proves nothing — it replays, and says so.',
    },
    baseline: policyRef(baseline),
    variante: policyRef(variant),
    resultat: outcome,
    cohortes: cohorts.slice(0, 8),
    balayage: sweep.map((item, index) => ({
      seuil: thresholds[index],
      delegues: item.variant.delegated,
      taux: item.variant.rate,
      conclusion: item.delta.conclusion,
    })),
    versions: variants.map(policyRef),
  };
}

/** A policy, as the site shows it: its label and the fingerprint of its rule. */
function policyRef(variant: PolicyVariant): { id: string; label: { fr: string; en: string }; version: string } {
  return { id: variant.id, label: variant.label, version: policyVersion(variant) };
}

/* ------------------------------------------------ 2. the causal inference */

/**
 * Panel "the causal inference": the E-value of the observed gap, the
 * Rosenbaum bound of the matching, and the readiness that never says "causal".
 */
export function panneauInferenceCausale(tickets: readonly SiteTicket[], totals: readonly ArmTotals[]): Panel {
  const best = biggestCohort(totals);
  const { agent, human } = armsOf(tickets, best.key);
  const bound = confoundingBound(agent, human.rate);
  const sensitivity = matchingSensitivity(
    matchable(tickets, 'agent'),
    matchable(tickets, 'human'),
    cleanByIssue(tickets),
  );
  const readiness = causalReadiness({
    n: Math.min(agent.n, human.n),
    randomised: false,
    confoundersKnown: [],
  });
  return {
    label: { fr: 'L’inférence causale, et ses limites', en: 'Causal inference, and its limits' },
    summary: {
      fr: 'Un écart observé ne prouve rien par lui-même : l’E-value dit ce qu’il faudrait de confusion non mesurée pour l’expliquer, la borne de Rosenbaum dit ce que l’appariement tolère, et la readiness dit toujours que l’observation n’est pas causale.',
      en: 'An observed gap proves nothing on its own: the E-value says what unmeasured confounding would explain it away, the Rosenbaum bound says what the matching tolerates, and the readiness always says the observation is not causal.',
    },
    cohorte: best.key,
    eValue: bound.eValue,
    confusion: bound,
    rosenbaum: sensitivity.bound,
    appariement: {
      paires: sensitivity.matchedPairs,
      decisivesAgent: sensitivity.decisiveForAgent,
      decisivesHuman: sensitivity.decisiveForHuman,
      net: sensitivity.netDifference,
    },
    note: sensitivity.note,
    lecture: readiness,
  };
}

/* --------------------------------------------------------- 3. the pooling */

/**
 * Panel "the pooling": every cohort is compared with the prior of its own
 * nature, and the strength that was borrowed is shown (SPEC §16).
 */
export function panneauPooling(tickets: readonly SiteTicket[]): Panel {
  const inputs = poolingInputs(tickets);
  const pooled = poolCohorts(inputs);
  return {
    label: { fr: 'Le pooling : emprunter à ses voisins', en: 'Pooling: borrowing from the neighbours' },
    summary: {
      fr: 'Une cohorte trop mince n’est pas jugée seule : elle est rapprochée des cohortes de même nature, et la force empruntée est affichée. L’intervalle pooling ne peut jamais être plus étroit que l’intervalle propre.',
      en: 'A cohort that is too thin is not judged alone: it is brought closer to the cohorts of the same nature, and the borrowed strength is shown. The pooled interval can never be narrower than the own interval.',
    },
    cohortes: pooled.map((item, index) => ({
      cohorte: inputs[index].cohortKey,
      propre: item.own,
      groupe: item.pooled,
      forceEmpruntee: item.borrowedStrength,
      retreci: item.shrunk,
      note: item.note,
    })),
  };
}

/* ------------------------------------------------- 4. the measured doubt */

/**
 * Panel "the measured doubt": the unknown involvement measured in bits, the
 * number of tickets that would settle a cohort, and the chance the advice
 * flips (SPEC §5, §7, DP-03, DP-19).
 */
export function panneauIncertitude(tickets: readonly SiteTicket[], totals: readonly ArmTotals[]): Panel {
  const settings = sampleSettings();
  const best = biggestCohort(totals);
  const { agent, human } = armsOf(tickets, best.key);
  const unknown = unknownEntropy(sampleInvolvements());
  const conclusion = conclude(agent, human, settings.minArmSize, balanceOf(tickets, best.key));
  const counts = armTotals(tickets, best.key);
  const reach = ticketsToChangeConclusion({
    n: counts.agent.total,
    clean: counts.agent.clean,
    threshold: settings.minArmSize,
  });
  const flip = flipProbability({
    n: counts.agent.total + counts.human.total,
    clean: counts.agent.clean + counts.human.clean,
    unknownShare: unknown.share,
  });
  return {
    label: { fr: 'L’incertitude, mesurée', en: 'Uncertainty, measured' },
    summary: {
      fr: '« 41 % d’implication inconnue » n’est pas une mesure : l’app la convertit en bits d’information manquante, en nombre de tickets à lever pour décider, et en probabilité que l’avis bascule — le tout avec son effectif et sa fourchette.',
      en: '“41 % unknown involvement” is not a measurement: the app turns it into missing bits of information, into the number of tickets to clarify in order to decide, and into the probability that the advice flips — all of it with its sample size and its interval.',
    },
    entropie: unknown,
    portee: reach,
    bascule: flip,
    rapport: uncertaintyReport({ unknown, conclusion, cohortKey: best.key }),
  };
}

/* ------------------------------------------------ 5. the reproducible proof */

/**
 * Panel "the reproducible proof": the fingerprints of a decision, and what a
 * replay says when the data moved (SPEC §7, §20, DP-21).
 */
export function panneauPreuve(tickets: readonly SiteTicket[], totals: readonly ArmTotals[]): Panel {
  const best = biggestCohort(totals);
  const { agent, human } = armsOf(tickets, best.key);
  const counts = armTotals(tickets, best.key);
  const data = { cohorte: best.key, agent, human };
  const output = { tauxAgent: agent.rate, tauxHumain: human.rate };
  const proof = decisionProof({
    issueKey: best.key,
    policy: policyVersion(currentPolicy()),
    seed: 'demo-e11b',
    data,
    output,
    computedAt: SAMPLE_REFERENCE_DATE,
  });
  const replay = replayDecision({ proof, data, output });
  const drifted = replayDecision({
    proof,
    data: { ...data, human: proportion(counts.human.clean + 1, counts.human.total) },
    output,
  });
  return {
    label: { fr: 'La preuve reproductible', en: 'The reproducible proof' },
    summary: {
      fr: 'Une décision auditable porte la version de la règle, l’empreinte des données, la graine et l’empreinte de la sortie. Rejouée à l’identique, elle rend la même empreinte ; rejouée sur des données qui ont bougé, elle dit quelle valeur a bougé.',
      en: 'An auditable decision carries the version of the rule, the fingerprint of the data, the seed and the fingerprint of the output. Replayed identically, it returns the same fingerprint; replayed on data that moved, it says which value moved.',
    },
    preuve: proof,
    rejeu: replay,
    derive: drifted,
    empreintes: {
      donnees: proof.dataFingerprint,
      sortie: proof.outputFingerprint,
      regle: proof.policyVersion,
    },
  };
}

/* ----------------------------------------------------- 6. the compared cost */

/**
 * Panel "the compared cost": what each cohort costs under both options, on
 * the assumption model the team can argue with (SPEC §8, §20).
 */
export function panneauCout(tickets: readonly SiteTicket[], totals: readonly ArmTotals[]): Panel {
  const cohorts = totals.map((item) => cohortCost({
    cohortKey: item.key,
    agentClean: item.agent.clean,
    agentTotal: item.agent.total,
    humanClean: item.human.clean,
    humanTotal: item.human.total,
    reopenings: reopenedIn(tickets, item.key),
  }));
  return {
    label: { fr: 'Le coût comparé, option par option', en: 'The compared cost, option by option' },
    summary: {
      fr: 'L’avis est technique, l’adoption est économique : ce panneau dit ce que coûte chaque option, sur des hypothèses assumées, avec la qualité en points et son intervalle. Les hypothèses sont affichées pour être discutées.',
      en: 'The advice is technical, the adoption is economic: this panel says what each option costs, on stated assumptions, with the quality in points and its interval. The assumptions are shown so they can be argued with.',
    },
    modele: DEFAULT_COST_MODEL,
    cohortes: cohorts,
    portefeuille: portfolioCost(cohorts),
  };
}

/* ---------------------------------------------- 7. the freshness contract */

/**
 * Panel "the freshness contract": the age of every read the figures rest on,
 * and what the next collection must collect first (SPEC §17, §19, DP-19).
 */
export function panneauFraicheur(): Panel {
  const contracts = freshnessContracts();
  const report = assessFreshness(contracts, SAMPLE_REFERENCE_DATE);
  return {
    label: { fr: 'Le contrat de fraîcheur', en: 'The freshness contract' },
    summary: {
      fr: 'Les chiffres ne valent que par la tranche qui les porte : chaque type d’objet a une dernière lecture, une limite d’âge et un état. « On ne sait pas » n’est jamais confondu avec « on n’a pas regardé ».',
      en: 'The figures are only as good as the slice behind them: every object type has a last read, an age limit and a state. “We do not know” is never confused with “we have not looked”.',
    },
    contrats: contracts.map((contract) => ({
      objet: contract.object,
      derniereLecture: contract.lastCollectedAt,
      limiteMinutes: contract.maxAgeMinutes,
      etat: stateOf(contract, SAMPLE_REFERENCE_DATE),
    })),
    rapport: report,
    collecte: collectionBudget(contracts, SAMPLE_REFERENCE_DATE, 3),
  };
}

/* ------------------------------------------------------ 8. the weak signals */

/**
 * Panel "the weak signals": the precision of each signal measured on the
 * labelled tickets, the score it produces, and the collection plan (SPEC §5).
 */
export function panneauSignauxFaibles(tickets: readonly SiteTicket[]): Panel {
  const examples = labelledExamples();
  const measured = DEFAULT_SIGNALS.map((signal) => ({
    ...signal,
    precision: calibrateSignal(signal.id, examples),
  }));
  const features = extractFeatures([...commitsByIssue().values()].flat());
  const score = scoreInvolvement(features, measured);
  const plan = prioritiseUnknown(unknownCandidates(tickets), cohortSizes(tickets), scoresOf(tickets), 10);
  return {
    label: { fr: 'Les signaux faibles, calibrés', en: 'The weak signals, calibrated' },
    summary: {
      fr: 'Un signal faible ne prouve rien : il pèse, et sa précision se mesure sur des tickets étiquetés. Un signal non calibré reste silencieux plutôt que d’affirmer, et le plan de collecte dit quel ticket inconnu lèverait le plus d’incertitude.',
      en: 'A weak signal proves nothing: it weighs, and its precision is measured on labelled tickets. An uncalibrated signal stays silent rather than asserting, and the collection plan says which unknown ticket would lift the most uncertainty.',
    },
    signaux: measured.map((signal) => ({
      id: signal.id,
      label: signal.label,
      poids: signal.weight,
      precision: signal.precision,
      calibrable: signal.calibratable,
    })),
    score,
    sansCalibrer: scoreInvolvement(features, DEFAULT_SIGNALS),
    plan,
    exemples: examples.length,
  };
}

/* ---------------------------------------------------- 9. the night coordinator */

/**
 * Panel "the night coordinator": the queue that goes out alone in the night,
 * and the morning report that says what was done (SPEC §27).
 */
export function panneauCoordinateur(tickets: readonly SiteTicket[]): Panel {
  const candidates = nightCandidates(tickets);
  const plan = selectForNight(candidates, 480);
  const bilan = morningReport({ plan, outcomes: nightOutcomes(tickets, plan.taken) });
  return {
    label: { fr: 'Le coordinateur : la nuit et le matin', en: 'The coordinator: the night and the morning' },
    summary: {
      fr: 'La nuit, un ticket part seul : prêt, non urgent, hors zone sensible, avec critères, relisible, sans collision de code, et délégable. Chaque ticket laissé derrière a une raison nommée. Le matin, un rapport dit ce qui a été prouvé.',
      en: 'At night, one ticket goes out alone: ready, not urgent, out of any sensitive zone, with criteria, reviewable, without a code collision, and delegable. Every ticket left behind has a named reason. In the morning, a report says what was proven.',
    },
    fileDeNuit: {
      pris: plan.taken,
      budgetMinutes: plan.budgetMinutes,
      laissees: plan.skipped.slice(0, 20),
      raisons: reasonCounts(plan.skipped),
      total: candidates.length,
      note: plan.note,
    },
    bilan: { ...bilan, left: bilan.left.slice(0, 20), leftTotal: bilan.left.length },
  };
}

/** How many tickets were left behind for each named reason. */
function reasonCounts(skipped: readonly { issueKey: string; reason: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  skipped.forEach((item) => { counts[item.reason] = (counts[item.reason] || 0) + 1; });
  return counts;
}

/* ------------------------------------------------------- 10. the API and the kit */

/**
 * Panel "the API and the kit": the version of the schema, the versions the
 * build still understands, and the compatibility verdict of each one.
 */
export function panneauApiKit(): Panel {
  const versions = SUPPORTED_SCHEMA_VERSIONS.map((version) => ({
    version,
    supportee: supports(version),
    verdict: checkCompatibility(version),
  }));
  return {
    label: { fr: 'L’API et le kit', en: 'The API and the kit' },
    summary: {
      fr: 'Une version majeure est une rupture, une version mineure un ajout : un orchestrateur bâti contre 1.0 doit continuer de fonctionner contre 1.1, et doit être prévenu clairement s’il rencontre 2.0. Le kit indique la version du schéma et le cycle de compatibilité.',
      en: 'A major version is a break, a minor version is an addition: an orchestrator built against 1.0 must keep working against 1.1, and must be told clearly when it meets 2.0. The kit states the schema version and the compatibility cycle.',
    },
    app: { nom: 'Délégable ou pas ?', version: APP_VERSION },
    schema: {
      version: SCHEMA_VERSION,
      supportees: SUPPORTED_SCHEMA_VERSIONS,
      verdict: checkCompatibility(SCHEMA_VERSION),
    },
    versions,
  };
}

/* ------------------------------------------------------- the ten, gathered */

/** The ten panels of the lot, gathered under their keys. */
export function panneauxFeatures(
  tickets: readonly SiteTicket[],
  totals: readonly ArmTotals[],
): Record<string, Panel> {
  return {
    simulation: panneauSimulation(tickets),
    inferenceCausale: panneauInferenceCausale(tickets, totals),
    pooling: panneauPooling(tickets),
    incertitude: panneauIncertitude(tickets, totals),
    preuve: panneauPreuve(tickets, totals),
    cout: panneauCout(tickets, totals),
    fraicheur: panneauFraicheur(),
    signauxFaibles: panneauSignauxFaibles(tickets),
    coordinateur: panneauCoordinateur(tickets),
    apiKit: panneauApiKit(),
  };
}
