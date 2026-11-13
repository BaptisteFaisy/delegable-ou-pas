/**
 * The single UI entry of the app (SPEC §16, docs/CONTRACTS.md §6; the manifest
 * resource `main` points here).
 *
 * One resource serves the five Jira modules: the entry reads the Forge context,
 * picks the language of the site (SPEC §20 — English and French, from the Jira
 * locale) and routes `context.moduleKey` to the screen of SPEC §16 it belongs
 * to. No logic lives here: each screen fetches its own domain data from the
 * unique resolver and projects it through the viewmodels.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import { useEffect, useState } from 'react';
import ForgeReconciler, { Text } from '@forge/react';
import { view } from '@forge/bridge';
import { createTranslator, langOfLocale, type Translate } from '../../i18n/index.js';
import { IssuePanelScreen } from '../issue-panel.js';
import { ProjectPageScreen } from '../project-page.js';
import { SettingsScreen } from '../settings.js';
import { SprintScreen } from '../sprint-action.js';
import { GadgetScreen } from '../gadget.js';

/** The module keys the manifest declares (manifest.yml, modules jira:*). */
const MODULE_KEY = {
  issuePanel: 'delegation-card-panel',
  projectPage: 'delegation-map-page',
  settings: 'delegation-settings',
  sprint: 'sprint-delegation-split',
  gadget: 'delegation-gadget',
} as const;

/** What the entry knows once the Forge context is read. */
interface UiState {
  readonly ready: boolean;
  readonly moduleKey: string;
  readonly t: Translate;
}

/** The screen of one module key; an unknown module renders the empty state. */
function Screen(props: { readonly state: UiState }) {
  const { moduleKey, t } = props.state;
  if (!props.state.ready) return <Text>{t('ui.loading')}</Text>;
  switch (moduleKey) {
    case MODULE_KEY.issuePanel:
      return <IssuePanelScreen t={t} />;
    case MODULE_KEY.projectPage:
      return <ProjectPageScreen t={t} />;
    case MODULE_KEY.settings:
      return <SettingsScreen t={t} />;
    case MODULE_KEY.sprint:
      return <SprintScreen t={t} />;
    case MODULE_KEY.gadget:
      return <GadgetScreen t={t} />;
    default:
      return <Text>{t('ui.empty')}</Text>;
  }
}

/** The root: reads the context once, then routes to the screen of the module. */
function App() {
  const [state, setState] = useState<UiState>({
    ready: false,
    moduleKey: '',
    t: createTranslator('en'),
  });
  useEffect(() => {
    let alive = true;
    view.getContext()
      .then((context) => {
        if (!alive) return;
        setState({
          ready: true,
          moduleKey: context.moduleKey,
          t: createTranslator(langOfLocale(context.locale)),
        });
      })
      .catch(() => {
        if (alive) setState({ ready: true, moduleKey: '', t: createTranslator('en') });
      });
    return () => {
      alive = false;
    };
  }, []);
  return <Screen state={state} />;
}

ForgeReconciler.render(<App />);
