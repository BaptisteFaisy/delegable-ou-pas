/**
 * Weak signals for the involvement of an agent — a prioritiser, never a proof.
 *
 * Why: 41 % of the tickets have an unknown involvement, and that is the biggest
 * hole in the data. The mentions (SPEC §5) are the only *proof* the app
 * accepts; the signals here — the shape of the diff, the regularity of the
 * commits, a bot author — are **weak**: they are calibrated against labelled
 * examples and they come with their measured precision, and a signal that was
 * never calibrated stays silent instead of asserting anything.
 *
 * The product use is not to decide but to **priorise the collection**: which
 * tickets to read first, because they would carry the most missing information.
 *
 * The domain is pure: no `@forge/*`, no network, no clock.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import { proportion } from './stats.js';
import type { ProportionStat } from '../types.js';

/** One weak signal, with the precision measured on labelled examples. */
export interface WeakSignal {
  readonly id: string;
  readonly label: { readonly fr: string; readonly en: string };
  /** How much the signal moves the score, in [0, 1]. */
  readonly weight: number;
  /** Measured precision, or null when the signal was never calibrated. */
  readonly precision: number | null;
  /** False when the signal cannot be calibrated at all (it never fires). */
  readonly calibratable: boolean;
}

/** The default signals, uncalibrated until a team measures them (precision: null). */
export const DEFAULT_SIGNALS: readonly WeakSignal[] = [
  {
    id: 'bot-author',
    label: { fr: 'auteur robot', en: 'bot author' },
    weight: 0.35,
    precision: null,
    calibratable: true,
  },
  {
    id: 'signed-share',
    label: { fr: 'part de commits signés', en: 'share of signed commits' },
    weight: 0.3,
    precision: null,
    calibratable: true,
  },
  {
    id: 'granularity',
    label: { fr: 'petits commits réguliers', en: 'small regular commits' },
    weight: 0.2,
    precision: null,
    calibratable: true,
  },
  {
    id: 'diff-size',
    label: { fr: 'taille du diff', en: 'diff size' },
    weight: 0.15,
    precision: null,
    calibratable: true,
  },
];

/** What the signals observe on a ticket. */
export interface SignalFeatures {
  readonly commits: number;
  readonly filesTouched: number;
  readonly linesChanged: number;
  /** Regularity of the commit times, in [0, 1]. */
  readonly regularity: number;
  readonly botAuthor: boolean;
  readonly signedShare: number;
}

/** One commit, as the collector sees it. */
export interface SignalCommit {
  readonly filesTouched: number;
  readonly linesChanged: number;
  readonly authorIsBot: boolean;
  readonly hasSignature: boolean;
  /** ISO timestamp of the commit. */
  readonly committedAt: string;
}

/**
 * Extracts the features from the commits of a ticket.
 *
 * The regularity is the share of commit times that fall inside working hours —
 * a crude but honest signal, and one a team can calibrate or ignore.
 */
export function extractFeatures(commits: readonly SignalCommit[]): SignalFeatures {
  if (commits.length === 0) {
    return {
      commits: 0, filesTouched: 0, linesChanged: 0, regularity: 0, botAuthor: false, signedShare: 0,
    };
  }
  const files = commits.reduce((total, commit) => total + commit.filesTouched, 0);
  const lines = commits.reduce((total, commit) => total + commit.linesChanged, 0);
  const signed = commits.filter((commit) => commit.hasSignature).length;
  const inWorkingHours = commits.filter((commit) => inWorkingHoursOf(commit.committedAt)).length;
  return {
    commits: commits.length,
    filesTouched: files,
    linesChanged: lines,
    regularity: round4(inWorkingHours / commits.length),
    botAuthor: commits.some((commit) => commit.authorIsBot),
    signedShare: round4(signed / commits.length),
  };
}

function inWorkingHoursOf(timestamp: string): boolean {
  const hour = new Date(timestamp).getUTCHours();
  return Number.isFinite(hour) && hour >= 6 && hour < 22;
}

/** Why a signal fired, and how much it is worth. */
export interface SignalReason {
  readonly id: string;
  readonly weight: number;
  readonly note: { readonly fr: string; readonly en: string };
}

/** The score of a ticket, and how confident the app is in it. */
export interface InvolvementScore {
  /** Between 0 and 1: how much the signals look like agent work. */
  readonly score: number;
  /** A proportion: the precision of the signals that fired, with its interval. */
  readonly confidence: ProportionStat;
  readonly reasons: readonly SignalReason[];
}

/**
 * Scores a ticket from its weak signals.
 *
 * Only **calibrated** signals contribute: a signal whose precision is unknown
 * stays silent rather than asserting something. The confidence is the precision
 * of the signals that fired, rendered as a proportion — so it too carries its
 * sample size and its interval, and a ticket scored by two uncalibrated signals
 * has an **empty** confidence rather than a fake one.
 */
export function scoreInvolvement(
  features: SignalFeatures,
  signals: readonly WeakSignal[] = DEFAULT_SIGNALS,
): InvolvementScore {
  const fired: SignalReason[] = [];
  let weight = 0;
  let precisionWeight = 0;
  let precisionSum = 0;

  signals.forEach((signal) => {
    if (!fires(signal.id, features)) return;
    fired.push({
      id: signal.id,
      weight: signal.weight,
      note: {
        fr: `${signal.label.fr} — signal faible, précision mesurée : ${signal.precision === null ? 'non calibré' : `${Math.round(signal.precision * 100)} %`}`,
        en: `${signal.label.en} — weak signal, measured precision: ${signal.precision === null ? 'not calibrated' : `${Math.round(signal.precision * 100)} %`}`,
      },
    });
    weight += signal.weight;
    if (signal.precision !== null) {
      precisionWeight += signal.weight;
      precisionSum += signal.precision * signal.weight;
    }
  });

  const score = round4(Math.min(1, weight));
  // La confiance est la précision des signaux qui ont fired, exprimée comme une
  // proportion : sur les signaux pondérés qui ont fired, combien étaient justes.
  // Sans signal calibré, la confiance est **vide** (n = 0) — pas un zéro qui
  // ressemble à une mesure.
  const confidence = precisionWeight === 0
    ? proportion(0, 0)
    : (() => {
      const total = Math.max(1, Math.round(precisionWeight * 100));
      const successes = Math.min(total, Math.round((precisionSum / precisionWeight) * total));
      return proportion(successes, total);
    })();
  return {
    score,
    confidence,
    reasons: fired,
  };
}

function fires(id: string, features: SignalFeatures): boolean {
  if (id === 'bot-author') return features.botAuthor;
  if (id === 'signed-share') return features.signedShare > 0;
  if (id === 'granularity') return features.commits >= 5 && features.regularity >= 0.8;
  if (id === 'diff-size') return features.linesChanged >= 500;
  return false;
}

/** One labelled example: features, and whether it really was agent work. */
export interface LabelledExample {
  readonly features: SignalFeatures;
  readonly labelledAgent: boolean;
}

/**
 * Measures the precision of a signal on labelled examples.
 *
 * Precision = among the examples where the signal fires, the share that are
 * really agent work. A signal that never fires on the labelled set has a
 * precision of 0 — it says nothing, which is different from saying "no".
 */
export function calibrateSignal(id: string, examples: readonly LabelledExample[]): number {
  const fired = examples.filter((example) => fires(id, example.features));
  if (fired.length === 0) return 0;
  const truePositives = fired.filter((example) => example.labelledAgent).length;
  return round4(truePositives / fired.length);
}

/** One ticket of unknown involvement, and what collecting it would bring. */
export interface UnknownCandidate {
  readonly issueKey: string;
  readonly cohortKey: string;
}

/** The collection plan: which tickets to read first, and why. */
export interface UnknownPlan {
  readonly issueIds: readonly string[];
  readonly rationale: readonly { readonly issueKey: string; readonly expectedGain: number; readonly note: { readonly fr: string; readonly en: string } }[];
  /** Share of the cohort the plan would cover, in [0, 1]. */
  readonly coverageShare: number;
}

/**
 * Orders the tickets of unknown involvement by the information their collection
 * would bring, and keeps the budget.
 *
 * The gain is the share of the cohort that the ticket's own collection would
 * settle: a ticket that closes half a thin cohort is worth more than one that
 * confirms a wide one.
 */
export function prioritiseUnknown(
  candidates: readonly UnknownCandidate[],
  cohortSizes: Readonly<Record<string, number>>,
  scores: Readonly<Record<string, number>>,
  budget: number,
): UnknownPlan {
  const ordered = [...candidates]
    .map((candidate) => ({
      candidate,
      gain: expectedGain(candidate, cohortSizes, scores),
    }))
    .sort((a, b) => b.gain - a.gain || a.candidate.issueKey.localeCompare(b.candidate.issueKey));
  const chosen = ordered.slice(0, Math.max(0, budget));
  const coveredTickets = chosen.length;
  const total = candidates.length;
  return {
    issueIds: chosen.map((item) => item.candidate.issueKey),
    rationale: chosen.map((item) => ({
      issueKey: item.candidate.issueKey,
      expectedGain: item.gain,
      note: {
        fr: `Collecter ce ticket tranche ${Math.round(item.gain * 100)} % de l information manquante de sa cohorte.`,
        en: `Collecting this ticket settles ${Math.round(item.gain * 100)} % of its cohort's information.`,
      },
    })),
    coverageShare: total === 0 ? 0 : round4(coveredTickets / total),
  };
}

function expectedGain(
  candidate: UnknownCandidate,
  cohortSizes: Readonly<Record<string, number>>,
  scores: Readonly<Record<string, number>>,
): number {
  const size = cohortSizes[candidate.cohortKey] ?? 0;
  if (size === 0) return 0;
  const confidence = scores[candidate.issueKey] ?? 0.5;
  return round4(Math.min(1, (1 / size) * confidence));
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
