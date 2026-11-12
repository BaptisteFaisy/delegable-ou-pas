/**
 * Screen 1 — the card on the ticket (SPEC §8, §16.1; DP-01, DP-11, DP-12,
 * DP-13, DP-20, DP-26, recipes 9 and 10).
 *
 * Mute components: they display the `CardView` / `IssuePanelView` the viewmodel
 * projected, they decide and compute nothing. Every rate goes through the single
 * `Rate` component (recipe 10), the guardrails that fired are said out loud
 * (recipe 9), the demo banner is permanent (DP-20), and the decision taken and
 * the involvement detected are shown with the source (SPEC §16.1, DP-01).
 *
 * The `Translate` comes from the viewmodel world (src/i18n): the UI carries no
 * sentence of its own, it only picks labels through it.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import { Button, Stack, Text } from '@forge/react';
import { invoke } from '@forge/bridge';
import type { Translate } from '../i18n/index.js';
import type { Decision, RecommendationCard } from '../types-advice.js';
import type { Involvement } from '../types.js';
import {
  issuePanelView,
  type CardView,
  type IssuePanelView,
} from '../viewmodel/issue-card.js';
import { RESOLVER_METHOD, usePayload } from './components/data.js';
import { armLabel, confidenceLabel, rateLine, recommendationLabel } from '../viewmodel/common.js';
import { ColorBadge, DemoBanner } from './components/badges.js';
import { Rate } from './components/rate.js';
import { BulletList, SectionTitle } from './components/sections.js';

/** Props of the card renderer (frozen contract, docs/CONTRACTS.md §L8). */
export interface RecommendationCardViewProps {
  readonly view: CardView;
  /** Labels and formats come from the i18n world, never hard-coded here. */
  readonly t: Translate;
}

/**
 * The exact block of SPEC §8: key and recommendation, cohort, both clean
 * closures with their sample sizes and intervals, the median delay of the two
 * arms, the reference tickets, the conditions and the confidence.
 */
export function RecommendationCardView(props: RecommendationCardViewProps) {
  const view = props.view;
  const t = props.t;
  const empty = t('stats.none');
  return (
    <Stack space="space.200">
      <Text>{view.title}</Text>
      <ColorBadge color={view.cell} label={recommendationLabel(view.recommendation, t)} />
      <Text>{view.cohortLine}</Text>
      <Rate label={armLabel('agent', t)} line={rateLine(view.agent, t)} empty={empty} />
      <Rate label={armLabel('human', t)} line={rateLine(view.human, t)} empty={empty} />
      <Text>{view.medianLine}</Text>
      <SectionTitle title={t('card.references')} />
      <BulletList items={view.referenceKeys} />
      <SectionTitle title={t('card.conditions')} />
      <BulletList items={view.conditions} />
      <Text>{t('card.confidence', { level: confidenceLabel(view.confidence, t) })}</Text>
    </Stack>
  );
}

/** Props of the whole panel: the card plus decision and involvement. */
export interface IssuePanelProps {
  readonly view: IssuePanelView;
  readonly t: Translate;
}

/**
 * The panel of SPEC §16.1: the card, the decision taken (followed or not), the
 * involvement detected and its source, what went wrong with an agent, and the
 * guardrails said out loud (recipe 9).
 */
export function IssuePanel(props: IssuePanelProps) {
  const view = props.view;
  const t = props.t;
  return (
    <Stack space="space.200">
      <DemoBanner notice={view.demo} />
      <RecommendationCardView view={view.card} t={t} />
      <Text>{view.conclusionLine}</Text>
      <Text>{view.gapLine}</Text>
      <Text>{view.cohortLevelLine}</Text>
      {view.widenedNotice === null ? null : <Text>{view.widenedNotice}</Text>}
      <SectionTitle title={t('card.guardrails')} />
      <BulletList items={view.guardrailLines} />
      <SectionTitle title={t('card.reasons')} />
      <BulletList items={view.reasons} />
      <SectionTitle title={view.failureCausesTitle} />
      <BulletList items={view.failureCauses} />
      <SectionTitle title={t('ui.section.decision')} />
      <Text>{view.decision.line}</Text>
      <SectionTitle title={t('ui.section.involvement')} />
      {view.involvement === null ? <Text>{t('card.no-involvement')}</Text> : (
        <Stack space="space.0">
          <Text>{view.involvement.line}</Text>
          <Text>{view.involvement.sourceLine}</Text>
        </Stack>
      )}
      <Text>{view.anonymityNotice}</Text>
    </Stack>
  );
}

/* ---------------------------------------------------------- screen container */

/** What the resolver of the ticket panel answers: domain data (SPEC §16.1). */
export interface IssuePanelPayload {
  readonly card: RecommendationCard | null;
  readonly decision: Decision | null;
  readonly involvement: Involvement | null;
}

/** The panel container: fetches the domain data, projects it, offers the actions. */
export function IssuePanelScreen(props: { readonly t: Translate }) {
  const payload = usePayload<IssuePanelPayload>(RESOLVER_METHOD.issuePanel);
  const t = props.t;
  if (payload.loading) return <Text>{t('ui.loading')}</Text>;
  if (payload.error) return <Text>{t('ui.error')}</Text>;
  const data = payload.data ?? { card: null, decision: null, involvement: null };
  return (
    <Stack space="space.200">
      <IssuePanel view={issuePanelView(data.card, data.decision, data.involvement, t)} t={t} />
      <DecisionButtons t={t} onDone={payload.reload} />
    </Stack>
  );
}

/** The two decisions and the takeover, one button each (SPEC §8 "Un avis, pas un ordre"). */
function DecisionButtons(props: { readonly t: Translate; readonly onDone: () => void }) {
  const t = props.t;
  const send = (method: string, args: Readonly<Record<string, unknown>>) => {
    invoke(method, args).then(props.onDone).catch(props.onDone);
  };
  return (
    <Stack space="space.100">
      <Button onClick={() => send(RESOLVER_METHOD.recordDecision, { decision: 'delegate', reason: '' })}>
        {t('action.delegate')}
      </Button>
      <Button onClick={() => send(RESOLVER_METHOD.recordDecision, { decision: 'keep-human', reason: '' })}>
        {t('action.keep-human')}
      </Button>
      <Button onClick={() => send(RESOLVER_METHOD.reportTakeover, { reason: '' })}>
        {t('action.report-takeover')}
      </Button>
    </Stack>
  );
}
