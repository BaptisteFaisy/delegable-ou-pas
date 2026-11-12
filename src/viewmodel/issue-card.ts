/**
 * The ticket card as a screen shows it (SPEC §8 "Ce que voit le développeur",
 * SPEC §16.1; DP-11, DP-12, DP-13, DP-20, DP-26, recipes 9 and 10).
 *
 * `cardView` is the frozen projection of the contract (docs/CONTRACTS.md §L8):
 * it formats what the domain put in a `RecommendationCard` and computes nothing.
 * `issuePanelView` adds what the panel shows around the card — the decision
 * taken and whether it followed the advice, the involvement detected and its
 * source (SPEC §16.1, DP-01, DP-13).
 *
 * Recipe 10: the two arms keep their `ProportionStat`, so a card can never be
 * projected without a sample size and an interval; the screen renders them with
 * the single `Rate` component (src/ui/components/rate.tsx).
 *
 * Pure module: no `@forge/*`, no clock.
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { Decision, RecommendationCard } from '../types-advice.js';
import type { Involvement, Level, Source } from '../types.js';
import type { Confidence, Guardrail, MapColor, Recommendation } from '../types-advice.js';
import type { ProportionStat, DurationStat } from '../types.js';
import type { Translate } from '../i18n/index.js';
import type { DemoNotice } from './common.js';
import {
  colorOf,
  cohortLevelLine,
  cohortLine,
  confidenceLabel,
  conclusionLabel,
  demoNotice,
  gapLabel,
  guardrailLabel,
  levelLabel,
  medianText,
  recommendationLabel,
  sourceLabel,
  widenedNotice,
} from './common.js';

/**
 * The card of one ticket, ready to render (SPEC §8, SPEC §16.1).
 *
 * The shape is the one of the frozen contract: `agent` and `human` keep their
 * `ProportionStat | null`, so the sample size and the interval travel with the
 * rate and a screen cannot show one without the others (recipe 10).
 */
export interface CardView {
  readonly title: string;
  readonly recommendation: Recommendation;
  readonly cohortLine: string;
  readonly cell: MapColor;
  readonly agent: ProportionStat | null;
  readonly human: ProportionStat | null;
  readonly medianLine: string;
  readonly referenceKeys: readonly string[];
  readonly conditions: readonly string[];
  readonly confidence: Confidence;
  readonly guardrails: readonly Guardrail[];
  readonly demo: boolean;
}

/** The median delay of both arms on one line (SPEC §6, SPEC §8). */
function medianLineOf(
  agent: DurationStat | null,
  human: DurationStat | null,
  t: Translate,
): string {
  return t('card.median', {
    agent: medianText(agent, t),
    human: medianText(human, t),
  });
}

/** The empty card: a ticket with no recommendation yet is normal, not an error. */
function emptyCard(t: Translate): CardView {
  return {
    title: t('card.empty'),
    recommendation: 'not-enough-data',
    cohortLine: t('ui.empty'),
    cell: 'grey',
    agent: null,
    human: null,
    medianLine: medianLineOf(null, null, t),
    referenceKeys: [],
    conditions: [],
    confidence: 'low',
    guardrails: [],
    demo: false,
  };
}

/**
 * Projects a recommendation card. `null` gives an explicit empty card, never an
 * exception (SPEC §20 "données absentes = normales").
 */
export function cardView(card: RecommendationCard | null, t: Translate): CardView {
  if (card === null) return emptyCard(t);
  return {
    title: t('card.title', {
      key: card.issueKey,
      recommendation: recommendationLabel(card.value, t),
    }),
    recommendation: card.value,
    cohortLine: cohortLine(card.cohort, t),
    cell: colorOf(card.value),
    agent: card.agent,
    human: card.human,
    medianLine: medianLineOf(card.agentLeadTime, card.humanLeadTime, t),
    referenceKeys: [...card.referenceIssueKeys],
    conditions: [...card.conditions],
    confidence: card.confidence,
    guardrails: [...card.guardrails],
    demo: card.demo,
  };
}

/** The decision taken on the ticket, followed or not (SPEC §8, DP-13). */
export interface DecisionView {
  /** What was decided; `null` when no decision was taken yet. */
  readonly taken: 'delegate' | 'keep-human' | null;
  /** Whether the decision followed the advice shown at the time; `null` when undecided. */
  readonly followed: boolean | null;
  /** The sentence the panel shows. */
  readonly line: string;
}

/** The involvement detected for the ticket, and the source it came from (DP-01). */
export interface InvolvementView {
  readonly level: Level;
  readonly source: Source;
  readonly line: string;
  readonly sourceLine: string;
}

/** The labels of the panel actions: strings come from the viewmodel, not the UI. */
export interface ActionLabels {
  readonly delegate: string;
  readonly keepHuman: string;
  readonly takeover: string;
}

/** Everything the ticket panel shows (SPEC §16.1). */
export interface IssuePanelView {
  readonly card: CardView;
  readonly decision: DecisionView;
  readonly involvement: InvolvementView | null;
  /** Why the app says this, in plain words (SPEC §8). */
  readonly reasons: readonly string[];
  /** What went wrong with an agent in this cohort (SPEC §8, DP-26). */
  readonly failureCauses: readonly string[];
  readonly failureCausesTitle: string;
  /** The verdict of the comparison and its wording (SPEC §7 rule 4). */
  readonly conclusionLine: string;
  readonly gapLine: string;
  readonly cohortLevelLine: string;
  /** The widening announced, or `null` when the cohort is the narrowest (SPEC §7 rule 1). */
  readonly widenedNotice: string | null;
  /** The guardrails, said out loud (recipe 9). */
  readonly guardrailLines: readonly string[];
  readonly confidenceLine: string;
  readonly demo: DemoNotice | null;
  readonly anonymityNotice: string;
  readonly actions: ActionLabels;
}

/** The decision as one sentence; an undecided ticket says so (DP-13). */
function decisionView(decision: Decision | null, t: Translate): DecisionView {
  if (decision === null) {
    return { taken: null, followed: null, line: t('card.no-decision') };
  }
  const label = t(`action.${decision.taken === 'delegate' ? 'delegate' : 'keep-human'}`);
  const key = decision.followed ? 'card.decision' : 'card.decision-not-followed';
  return { taken: decision.taken, followed: decision.followed, line: t(key, { decision: label }) };
}

/** The involvement and its source, always together (SPEC §5, DP-01). */
function involvementView(involvement: Involvement | null, t: Translate): InvolvementView | null {
  if (involvement === null) return null;
  return {
    level: involvement.level,
    source: involvement.source,
    line: t('card.involvement', { level: levelLabel(involvement.level, t) }),
    sourceLine: t('card.involvement-source', { source: sourceLabel(involvement.source, t) }),
  };
}

/**
 * Projects the whole ticket panel: the card, the decision, the involvement and
 * the sentences that explain them (SPEC §16.1). Absent data stays absent.
 */
export function issuePanelView(
  card: RecommendationCard | null,
  decision: Decision | null,
  involvement: Involvement | null,
  t: Translate,
): IssuePanelView {
  const view = cardView(card, t);
  return {
    card: view,
    decision: decisionView(decision, t),
    involvement: involvementView(involvement, t),
    reasons: card === null ? [] : [...card.reasons],
    failureCauses: card === null ? [] : [...card.failureCauses],
    failureCausesTitle: t('card.failure-causes'),
    conclusionLine: card === null
      ? t('card.empty')
      : t('card.conclusion', { conclusion: conclusionLabel(card.conclusion, t) }),
    gapLine: card === null ? '' : gapLabel(card.conclusion, t),
    cohortLevelLine: card === null ? '' : cohortLevelLine(card.cohort, t),
    widenedNotice: card === null ? null : widenedNotice(card.cohort, t),
    guardrailLines: view.guardrails.map((guardrail) => guardrailLabel(guardrail, t)),
    confidenceLine: t('card.confidence', { level: confidenceLabel(view.confidence, t) }),
    demo: demoNotice(view.demo, t),
    anonymityNotice: t('ui.anonymity'),
    actions: {
      delegate: t('action.delegate'),
      keepHuman: t('action.keep-human'),
      takeover: t('action.report-takeover'),
    },
  };
}
