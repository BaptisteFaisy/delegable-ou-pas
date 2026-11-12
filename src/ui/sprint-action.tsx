/**
 * Screen 4 — the sprint split (SPEC §16.4, §12 "La part délégable d'un
 * sprint", §9; DP-24, recipe 13).
 *
 * Mute component: it displays the `SprintView` the viewmodel projected — the
 * tickets an orchestrator may take, safest first — and the DP-24 sentence:
 * "38 % of the points of sprint 42 are to be entrusted to an agent".
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import { Stack, Text } from '@forge/react';
import type { Translate } from '../i18n/index.js';
import type { DelegableWorkItem } from '../types-mcp.js';
import { sprintShareView, sprintView, type SprintView as SprintViewModel } from '../viewmodel/sprint.js';
import { RESOLVER_METHOD, usePayload } from './components/data.js';
import { BulletList, SectionTitle } from './components/sections.js';

/** Props of the sprint renderer (frozen contract, docs/CONTRACTS.md §L8). */
export interface SprintViewProps {
  readonly view: SprintViewModel;
  /** The DP-24 sentence, projected by `sprintShareView`. */
  readonly shareLine: string;
  readonly t: Translate;
}

/** The sprint screen: the share of points, then the tickets, safest first. */
export function SprintView(props: SprintViewProps) {
  const view = props.view;
  return (
    <Stack space="space.200">
      <SectionTitle title={view.title} />
      <Text>{props.shareLine}</Text>
      <Text>{view.countLine}</Text>
      {view.items.map((item) => (
        <Stack key={item.issueKey} space="space.0">
          <Text>{item.issueKey}</Text>
          <Text>{item.confidenceLine}</Text>
          <BulletList items={item.reasons} />
        </Stack>
      ))}
      <Text>{view.anonymityNotice}</Text>
    </Stack>
  );
}

/** What the resolver of the sprint action answers: domain data. */
export interface SprintPayload {
  readonly items: readonly DelegableWorkItem[];
  readonly delegableShare: number;
  readonly sprintId: string;
}

/** The container: fetches the sprint split and projects it. */
export function SprintScreen(props: { readonly t: Translate }) {
  const payload = usePayload<SprintPayload>(RESOLVER_METHOD.sprintSplit);
  const t = props.t;
  if (payload.loading) return <Text>{t('ui.loading')}</Text>;
  if (payload.error || payload.data === null) return <Text>{t('ui.error')}</Text>;
  const data = payload.data;
  return (
    <SprintView
      view={sprintView(data.items, t)}
      shareLine={sprintShareView(data.delegableShare, data.sprintId, t).shareLine}
      t={t}
    />
  );
}
