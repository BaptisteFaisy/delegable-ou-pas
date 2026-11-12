/**
 * Screen 3 — the detail of one cohort (SPEC §16.3, §7 rules 1, 5 and 6, §21;
 * DP-07, DP-10, DP-17, DP-22, recipes 10, 11 and 14).
 *
 * The mute renderer displays the `CohortDetailView` the viewmodel projected:
 * both arms with their sample sizes and intervals, the composition, the epochs
 * one by one, the widening announced, and the mask sentence with no figure when
 * fewer than three people carry the cohort (DP-17).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import { Button, Stack, Text } from '@forge/react';
import type { Translate } from '../i18n/index.js';
import type { GetCohortOutput } from '../types-mcp.js';
import { cohortView, type CohortDetailView, type CohortEpochView } from '../viewmodel/cohort-detail.js';
import { DemoBanner } from './components/badges.js';
import { RESOLVER_METHOD, usePayload } from './components/data.js';
import { Rate } from './components/rate.js';
import { BulletList, SectionTitle } from './components/sections.js';

/** One epoch: its two arms, its conclusion and its composition (recipe 14). */
export function CohortEpochBlock(props: { readonly epoch: CohortEpochView; readonly t: Translate }) {
  const epoch = props.epoch;
  const t = props.t;
  const label = epoch.outdated ? `${epoch.epochLabel} — ${t('ui.epoch.outdated')}` : epoch.epochLabel;
  return (
    <Stack space="space.100">
      <SectionTitle title={label} />
      {epoch.arms.map((arm) => (
        <Stack key={arm.arm} space="space.0">
          <Rate label={arm.label} line={arm.clean} empty={t('stats.none')} />
          <Text>{arm.leadTime}</Text>
          <Text>{arm.reviewLoad}</Text>
        </Stack>
      ))}
      <Text>{epoch.conclusionLine}</Text>
      <Text>{epoch.gapLine}</Text>
      <BulletList items={epoch.balanceLines} />
    </Stack>
  );
}

/** Props of the cohort renderer. */
export interface CohortDetailProps {
  readonly view: CohortDetailView;
  readonly t: Translate;
}

/** The cohort screen: mask, widening, people line and epoch by epoch. */
export function CohortDetail(props: CohortDetailProps) {
  const view = props.view;
  const t = props.t;
  return (
    <Stack space="space.200">
      <DemoBanner notice={view.demo} />
      <SectionTitle title={view.title} />
      <Text>{view.cohortLine}</Text>
      {view.cohortLevelLine === '' ? null : <Text>{view.cohortLevelLine}</Text>}
      {view.widenedNotice === null ? null : <Text>{view.widenedNotice}</Text>}
      {view.maskedNotice === null ? null : <Text>{view.maskedNotice}</Text>}
      <Text>{view.peopleLine}</Text>
      {view.noHumanArmNotice === null ? null : <Text>{view.noHumanArmNotice}</Text>}
      {view.epochs.map((epoch) => (
        <CohortEpochBlock key={epoch.epochId} epoch={epoch} t={t} />
      ))}
      <Text>{view.anonymityNotice}</Text>
    </Stack>
  );
}

/** What the resolver of the cohort screen answers: domain data. */
export interface CohortPayload {
  readonly cohort: GetCohortOutput | null;
}

/** Props of the cohort container: which cohort to ask the resolver for. */
export interface CohortScreenProps {
  readonly t: Translate;
  readonly nature: string;
  readonly zone: string;
  readonly size: string | null;
  readonly onBack: () => void;
}

/** The container: fetches the cohort and projects it, back button included. */
export function CohortScreen(props: CohortScreenProps) {
  const payload = usePayload<CohortPayload>(RESOLVER_METHOD.cohort, {
    nature: props.nature,
    zone: props.zone,
    size: props.size ?? '',
  });
  const t = props.t;
  if (payload.loading) return <Text>{t('ui.loading')}</Text>;
  if (payload.error) return <Text>{t('ui.error')}</Text>;
  const view = cohortView(payload.data === null ? null : payload.data.cohort, t);
  return (
    <Stack space="space.100">
      <Button onClick={props.onBack}>{t('ui.back')}</Button>
      <CohortDetail view={view} t={t} />
    </Stack>
  );
}
