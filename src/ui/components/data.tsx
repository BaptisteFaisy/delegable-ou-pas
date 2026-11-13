/**
 * The single data-access path of the screens (SPEC §16, §20; DP-11).
 *
 * The screens read everything from the unique resolver (lot L7) through
 * `invoke`, and they read it once per screen: this module holds the method
 * names and the small loading hook every screen reuses, so no screen
 * reinvents its own fetch (zéro duplication).
 *
 * Absent data is normal (SPEC §20): a resolver that answers nothing, or a
 * call that fails, renders the explicit empty state of the screen, never an
 * exception. The method names are the interface L8 expects from the resolver
 * of lot L7 (announced in the pull request; adjust there if L7 names differ).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@forge/bridge';

/** The resolver methods the screens call (interface with lot L7). */
export const RESOLVER_METHOD = {
  issuePanel: 'issue-panel',
  projectPage: 'project-page',
  cohort: 'cohort',
  sprintSplit: 'sprint-split',
  settings: 'settings',
  gadget: 'gadget',
  recordDecision: 'record-decision',
  reportTakeover: 'report-takeover',
} as const;

/** The state of one resolver call: loading, failed, or answered. */
export interface Payload<T> {
  readonly loading: boolean;
  readonly error: boolean;
  readonly data: T | null;
  /** Asks the resolver again, e.g. after a decision was recorded. */
  readonly reload: () => void;
}

interface PayloadState<T> {
  readonly loading: boolean;
  readonly error: boolean;
  readonly data: T | null;
}

/**
 * Calls one resolver method once and keeps its answer. A failure is normal
 * data: `error` is set and the screen renders its explicit empty state.
 */
export function usePayload<T>(
  method: string,
  args?: Readonly<Record<string, unknown>>,
): Payload<T> {
  const [state, setState] = useState<PayloadState<T>>({ loading: true, error: false, data: null });
  const [nonce, setNonce] = useState(0);
  const argsKey = JSON.stringify(args ?? {});
  useEffect(() => {
    let alive = true;
    setState({ loading: true, error: false, data: null });
    invoke<T>(method, JSON.parse(argsKey) as Record<string, unknown>)
      .then((data) => {
        if (alive) setState({ loading: false, error: false, data: data ?? null });
      })
      .catch(() => {
        if (alive) setState({ loading: false, error: true, data: null });
      });
    return () => {
      alive = false;
    };
  }, [method, argsKey, nonce]);
  const reload = useCallback(() => setNonce((value) => value + 1), []);
  return { loading: state.loading, error: state.error, data: state.data, reload };
}
