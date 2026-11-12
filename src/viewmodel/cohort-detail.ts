/**
 * The detail of one cohort as a screen shows it (SPEC §16.3, §7 rule 5 and
 * rule 6, §21; DP-07, DP-10, DP-17, DP-22, recipes 10, 11 and 14).
 *
 * The cohort is shown epoch by epoch, both arms with their sample sizes and
 * their intervals, the composition that tells whether the arms are comparable,
 * and the widening announced out loud when the app had to go up a level.
 *
 * A cohort carried by fewer than three people is masked: the screen says so and
 * renders no figure (DP-17, recipe 11). The number of people behind a cohort is
 * never displayed for its own sake, only to mask it (SPEC §18 `people_count`).
 *
 * Pure module: no `@forge/*`, no clock.
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { CohortEpoch, CohortEpochArm, GetCohortOutput } from '../types-mcp.js';
import type { Arm, Balance } from '../types.js';
import type { Conclusion } from '../types.js';
import { reportablePeopleCount } from '../domain/privacy.js';
import type { Translate } from '../i18n/index.js';
import type { DemoNotice, RateLine } from './common.js';
import {
  armLabel,
  conclusionLabel,
  cohortLevelLine,
  cohortLine,
  demoNotice,
  gapLabel,
  maskedNotice,
  medianText,
  rateLine,
  widenedNotice,
} from './common.js';

/** One arm of one epoch, with the three parts of recipe 10. */
export interface CohortArmView {
  readonly arm: Arm;
  readonly label: string;
  /** Clean closure with its sample size and its interval, or `null` when empty. */
  readonly clean: RateLine | null;
  readonly leadTime: string;
  readonly reviewLoad: string;
}

/** One epoch of the cohort (SPEC §7 rule 6, DP-22). */
export interface CohortEpochView {
  readonly epochId: string;
  readonly epochLabel: string;
  /** True when the epoch is not the current one: shown, but greyed out (SPEC §21). */
  readonly outdated: boolean;
  readonly arms: readonly CohortArmView[];
  readonly conclusion: Conclusion;
  readonly conclusionLine: string;
  readonly gapLine: string;
  /** The composition comparison, said in words (SPEC §7 rule 5, DP-10). */
  readonly balanceLines: readonly string[];
  readonly balanced: boolean;
}

/** The whole cohort screen (SPEC §16.3). */
export interface CohortDetailView {
  readonly title: string;
  readonly cohortLine: string;
  readonly cohortLevelLine: string;
  /** The widening announced, or `null` when the cohort is the narrowest one. */
  readonly widenedNotice: string | null;
  /** True when fewer than three people carry the cohort: no figure is shown. */
  readonly masked: boolean;
  readonly maskedNotice: string | null;
  /** People behind the cohort: 0 when masked, never a name (DP-17). */
  readonly peopleLine: string;
  readonly epochs: readonly CohortEpochView[];
  /** The sentence for a cohort whose human arm is empty (SPEC §21). */
  readonly noHumanArmNotice: string | null;
  readonly demo: DemoNotice | null;
  readonly anonymityNotice: string;
}

/** One arm projected; an arm with no ticket stays empty, never zero (SPEC §20). */
function armView(arm: CohortEpochArm, t: Translate): CohortArmView {
  return {
    arm: arm.arm,
    label: armLabel(arm.arm, t),
    clean: rateLine(arm.clean.n === 0 ? null : arm.clean, t),
    leadTime: medianText({ n: arm.clean.n, medianH: arm.leadTime.medianH }, t),
    reviewLoad: t('stats.review-load', { count: arm.reviewLoad }),
  };
}

/** The composition differences, in words and with the sample sizes (DP-10). */
function balanceLines(balance: Balance, arms: readonly CohortEpochArm[], t: Translate): readonly string[] {
  if (balance.balanced) return [t('balance.balanced')];
  const agentN = arms.find((arm) => arm.arm === 'agent')?.clean.n ?? 0;
  const humanN = arms.find((arm) => arm.arm === 'human')?.clean.n ?? 0;
  const lines = balance.signals.map((signal) => t('balance.signal', {
    criterion: t(`balance.criterion.${signal.criterion}`),
    agentN,
    humanN,
  }));
  return [t('balance.unbalanced'), ...lines];
}

/** One epoch projected, outdated epochs included (SPEC §7 rule 6, SPEC §21). */
function epochView(epoch: CohortEpoch, t: Translate): CohortEpochView {
  return {
    epochId: epoch.epochId,
    epochLabel: epoch.epochLabel,
    outdated: epoch.outdated,
    arms: epoch.arms.map((arm) => armView(arm, t)),
    conclusion: epoch.conclusion,
    conclusionLine: conclusionLabel(epoch.conclusion, t),
    gapLine: gapLabel(epoch.conclusion, t),
    balanceLines: balanceLines(epoch.balance, epoch.arms, t),
    balanced: epoch.balance.balanced,
  };
}

/** True when an epoch has an agent arm but no human arm at all (SPEC §21). */
function hasNoHumanArm(epochs: readonly CohortEpoch[]): boolean {
  return epochs.some((epoch) => {
    const agent = epoch.arms.find((arm) => arm.arm === 'agent');
    const human = epoch.arms.find((arm) => arm.arm === 'human');
    return agent !== undefined && agent.clean.n > 0 && (human === undefined || human.clean.n === 0);
  });
}

/** The empty cohort screen: no cohort found is normal data (SPEC §20). */
function emptyView(t: Translate): CohortDetailView {
  return {
    title: t('ui.screen.cohort'),
    cohortLine: t('ui.cohort.empty'),
    cohortLevelLine: '',
    widenedNotice: null,
    masked: false,
    maskedNotice: null,
    peopleLine: t('cohort.no-people'),
    epochs: [],
    noHumanArmNotice: null,
    demo: null,
    anonymityNotice: t('ui.anonymity'),
  };
}

/** The people line: a count only when the cohort is not masked (DP-17). */
function peopleLineOf(out: GetCohortOutput, t: Translate): string {
  const count = reportablePeopleCount(out.peopleCount);
  return count === 0 ? t('cohort.no-people') : t('cohort.people', { count });
}

/** Projects the detail of one cohort, masked cohorts included (recipe 11). */
export function cohortView(out: GetCohortOutput | null, t: Translate): CohortDetailView {
  if (out === null) return emptyView(t);
  const masked = out.masked;
  return {
    title: t('ui.screen.cohort'),
    cohortLine: masked ? maskedNotice(t) : cohortLine(out.cohort, t),
    cohortLevelLine: masked ? '' : cohortLevelLine(out.cohort, t),
    widenedNotice: masked ? null : widenedNotice(out.cohort, t),
    masked,
    maskedNotice: masked ? maskedNotice(t) : null,
    peopleLine: peopleLineOf(out, t),
    epochs: masked ? [] : out.epochs.map((epoch) => epochView(epoch, t)),
    noHumanArmNotice: masked || !hasNoHumanArm(out.epochs) ? null : t('cohort.no-human-arm'),
    demo: demoNotice(out.demo, t),
    anonymityNotice: t('ui.anonymity'),
  };
}
