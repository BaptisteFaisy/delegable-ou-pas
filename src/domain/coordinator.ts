/**
 * The orchestration coordinator: the night queue and the morning report.
 *
 * Why: the specification ends on the night queue (SPEC §27) — a ready, allowed,
 * collision-free, reviewable, delegable ticket goes out alone in the night, and
 * in the morning a report says what was done, what was proven, and what was
 * left. This module selects the tickets and writes that report; it does not run
 * the agent (that is the orchestrator's job), it does not take the decision
 * (that is the developer's).
 *
 * The domain is pure: no `@forge/*`, no network, no clock.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import { proportion } from './stats.js';
import type { Recommendation } from '../types-advice.js';
import type { ProportionStat } from '../types.js';

/** What the app knows about one ticket, for the night selection. */
export interface NightCandidate {
  readonly issueKey: string;
  readonly cohortKey: string;
  readonly recommendation: Recommendation;
  readonly ready: boolean;
  readonly urgent: boolean;
  readonly sensitive: boolean;
  readonly hasCriteria: boolean;
  readonly reviewable: boolean;
  readonly collision: boolean;
  readonly estimateMinutes: number;
}

/** The reason a ticket stayed behind — named, never a silent omission. */
export type SkipReason =
  | 'not-ready'
  | 'urgent'
  | 'sensitive'
  | 'no-criteria'
  | 'not-reviewable'
  | 'collision'
  | 'not-delegable'
  | 'budget';

/** The plan of one night: who goes, who stays, and why. */
export interface NightPlan {
  readonly taken: readonly string[];
  readonly skipped: readonly { readonly issueKey: string; readonly reason: SkipReason }[];
  readonly budgetMinutes: number;
  readonly note: { readonly fr: string; readonly en: string };
}

/**
 * Selects the tickets of one night, against a budget.
 *
 * The order follows the specification §27, rule by rule: a ticket must be
 * ready, not urgent, outside a sensitive zone, with acceptance criteria,
 * reviewable, without a code collision, and recommendable to an agent. Every
 * exclusion is named — a silent skip would be the worst thing a queue can do.
 */
export function selectForNight(candidates: readonly NightCandidate[], budgetMinutes: number): NightPlan {
  const skipped: { issueKey: string; reason: SkipReason }[] = [];
  const taken: string[] = [];
  let spent = 0;
  const ordered = [...candidates].sort((a, b) => a.estimateMinutes - b.estimateMinutes);

  ordered.forEach((candidate) => {
    const reason = rejectionReason(candidate);
    if (reason !== null) {
      skipped.push({ issueKey: candidate.issueKey, reason });
      return;
    }
    if (spent + candidate.estimateMinutes > Math.max(0, budgetMinutes)) {
      skipped.push({ issueKey: candidate.issueKey, reason: 'budget' });
      return;
    }
    spent += candidate.estimateMinutes;
    taken.push(candidate.issueKey);
  });

  return {
    taken,
    skipped,
    budgetMinutes: budgetMinutes,
    note: {
      fr: `${taken.length} ticket(s) pris pour la nuit, ${skipped.length} laissé(s), chacun avec sa raison.`,
      en: `${taken.length} ticket(s) taken for the night, ${skipped.length} left, each with its reason.`,
    },
  };
}

/** The rule a ticket breaks, or null when it is eligible. */
export function rejectionReason(candidate: NightCandidate): SkipReason | null {
  if (!candidate.ready) return 'not-ready';
  if (candidate.urgent) return 'urgent';
  if (candidate.sensitive) return 'sensitive';
  if (!candidate.hasCriteria) return 'no-criteria';
  if (!candidate.reviewable) return 'not-reviewable';
  if (candidate.collision) return 'collision';
  if (candidate.recommendation === 'keep-human' || candidate.recommendation === 'not-enough-data') return 'not-delegable';
  return null;
}

/** One ticket's fate, for the morning report. */
export interface NightOutcome {
  readonly issueKey: string;
  readonly clean: boolean;
  readonly reopened: boolean;
  readonly proven: boolean;
}

/** The report the team reads in the morning. */
export interface MorningReport {
  readonly taken: readonly string[];
  readonly proven: readonly string[];
  readonly left: readonly { readonly issueKey: string; readonly reason: string }[];
  readonly reopened: number;
  readonly cleanClosed: ProportionStat;
  readonly note: { readonly fr: string; readonly en: string };
}

/**
 * Writes the morning: what was taken and is proven, what was taken but reopened,
 * and what stayed behind — with the clean-close rate as a proportion, sample
 * size and interval included.
 */
export function morningReport(input: {
  readonly plan: NightPlan;
  readonly outcomes: readonly NightOutcome[];
}): MorningReport {
  const byIssue = new Map(input.outcomes.map((outcome) => [outcome.issueKey, outcome]));
  const taken = input.plan.taken;
  const outcomesOfTaken = taken
    .map((issueKey) => byIssue.get(issueKey))
    .filter((outcome): outcome is NightOutcome => outcome !== undefined);
  const proven = outcomesOfTaken.filter((outcome) => outcome.proven).map((outcome) => outcome.issueKey);
  const reopened = outcomesOfTaken.filter((outcome) => outcome.reopened).map((outcome) => outcome.issueKey);
  const clean = outcomesOfTaken.filter((outcome) => outcome.clean).length;
  const stat = proportion(clean, outcomesOfTaken.length);
  const left = input.plan.skipped.map((item) => ({
    issueKey: item.issueKey,
    reason: reasonInWords(item.reason),
  }));
  return {
    taken,
    proven,
    left,
    reopened: reopened.length,
    cleanClosed: stat,
    note: {
      fr: `${proven.length} preuve(s) constituée(s), ${reopened.length} réouverture(s) — ${Math.round(stat.rate * 100)} % de clôture propre sur les tickets pris (${stat.n} tickets).`,
      en: `${proven.length} proof(s) established, ${reopened.length} reopening(s) — ${Math.round(stat.rate * 100)} % clean close on the tickets taken (${stat.n} tickets).`,
    },
  };
}

function reasonInWords(reason: SkipReason): string {
  const words: Record<SkipReason, string> = {
    'not-ready': 'pas prêt',
    urgent: 'urgent',
    sensitive: 'zone sensible',
    'no-criteria': 'sans critères d’acceptation',
    'not-reviewable': 'non relisible',
    collision: 'collision de code',
    'not-delegable': 'à garder pour un humain',
    budget: 'budget atteint',
  };
  return words[reason];
}