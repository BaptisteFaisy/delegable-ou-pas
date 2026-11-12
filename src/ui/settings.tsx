/**
 * Screen 5 — the project settings (SPEC §16.5, §13, §5 "Les mentions de
 * commit"; DP-02, DP-12, DP-22).
 *
 * Mute component: it displays the `SettingsView` the viewmodel projected — the
 * commit-mention catalogue with the mentions really seen, the adoption date, the
 * natures, zones, sizes, the threshold, the sensitive zones, the project's own
 * definition of the hardened review, and the epochs.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import { Stack, Text } from '@forge/react';
import type { Translate } from '../i18n/index.js';
import type { Epoch, SignaturePattern } from '../types.js';
import type { ProjectSettings } from '../types-advice.js';
import { settingsView, type SettingsView as SettingsViewModel } from '../viewmodel/settings.js';
import { DemoBanner } from './components/badges.js';
import { RESOLVER_METHOD, usePayload } from './components/data.js';
import { BulletList, SectionTitle } from './components/sections.js';

/** Props of the settings renderer. */
export interface SettingsViewProps {
  readonly view: SettingsViewModel;
  readonly t: Translate;
}

/** The settings screen, section by section (SPEC §16.5). */
export function SettingsScreenView(props: SettingsViewProps) {
  const view = props.view;
  const t = props.t;
  return (
    <Stack space="space.200">
      <DemoBanner notice={view.demo} />
      <SectionTitle title={view.title} />
      <Text>{view.projectKey}</Text>
      <Text>{view.adoptionLine}</Text>
      <Text>{view.thresholdLine}</Text>
      <SectionTitle title={t('docs.natures')} />
      <BulletList items={view.natures} />
      <SectionTitle title={t('docs.zones')} />
      <BulletList items={view.zones} />
      <SectionTitle title={t('docs.sizes')} />
      <BulletList items={view.sizes} />
      <SectionTitle title={view.sensitiveZonesTitle} />
      <BulletList items={view.sensitiveZones} />
      <SectionTitle title={t('docs.waiting-statuses')} />
      <BulletList items={view.waitingStatuses} />
      <BulletList items={view.hardenedReviewLines} />
      <SectionTitle title={view.patternsTitle} />
      <BulletList items={view.patterns.map((pattern) => pattern.line)} />
      <SectionTitle title={t('docs.commit-mentions-to-confirm')} />
      <BulletList items={view.patternsToConfirm} />
      <SectionTitle title={t('docs.epoch')} />
      <BulletList items={view.epochs.map((epoch) => epoch.label)} />
    </Stack>
  );
}

/** What the resolver of the settings page answers: domain data. */
export interface SettingsPayload {
  readonly settings: ProjectSettings | null;
  readonly patterns: readonly SignaturePattern[];
  readonly epochs: readonly Epoch[];
}

/** The container: fetches the settings and projects them. */
export function SettingsScreen(props: { readonly t: Translate }) {
  const payload = usePayload<SettingsPayload>(RESOLVER_METHOD.settings);
  const t = props.t;
  if (payload.loading) return <Text>{t('ui.loading')}</Text>;
  if (payload.error || payload.data === null) return <Text>{t('ui.error')}</Text>;
  const data = payload.data;
  return (
    <SettingsScreenView
      view={settingsView(data.settings, data.patterns, data.epochs, t)}
      t={t}
    />
  );
}
