/**
 * Screen 8 — the dashboard gadget (SPEC §16.8, §12; DP-14, DP-20).
 *
 * The reduced card: the title, the share of grey cells — "we do not know" is an
 * answer (SPEC §12) — the legend and the permanent demo banner (DP-20). Mute
 * component: it displays the `MapView` the viewmodel projected, reduced to its
 * essential lines; the full matrix lives on the project page.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import { Stack, Text } from '@forge/react';
import type { Translate } from '../i18n/index.js';
import type { DelegationMap } from '../types-advice.js';
import { mapView } from '../viewmodel/delegation-map.js';
import { DemoBanner } from './components/badges.js';
import { RESOLVER_METHOD, usePayload } from './components/data.js';

/** What the resolver of the gadget answers: the map, domain data. */
export interface GadgetPayload {
  readonly map: DelegationMap | null;
}

/** The gadget: reduced card and share of grey (SPEC §16.8). */
export function GadgetScreen(props: { readonly t: Translate }) {
  const payload = usePayload<GadgetPayload>(RESOLVER_METHOD.gadget);
  const t = props.t;
  if (payload.loading) return <Text>{t('ui.loading')}</Text>;
  if (payload.error || payload.data === null) return <Text>{t('ui.error')}</Text>;
  const view = mapView(payload.data.map, t);
  return (
    <Stack space="space.100">
      <DemoBanner notice={view.demo} />
      <SectionTitleGadget title={t('ui.screen.gadget')} />
      <Text>{view.greyShareLine}</Text>
      <Text>{view.epochLine}</Text>
      <Text>{view.legend}</Text>
    </Stack>
  );
}

/** The gadget title, kept apart so the screen stays under the function limit. */
function SectionTitleGadget(props: { readonly title: string }) {
  return <Text>{props.title}</Text>;
}
