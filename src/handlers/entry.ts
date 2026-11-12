/**
 * The generic entry router — SPEC §17; DP-15.
 *
 * The manifest points each Forge module at its own file under `src/handlers/`;
 * this router is the single fallback entry (`src/index.ts`) for runtimes and
 * tests that hand over one undifferentiated event. It routes by the SHAPE of
 * the event, never by anything a person wrote (recipe 12), and an unknown
 * shape answers `null` — absence is normal (SPEC §20).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { Deps } from '../deps.js';
import { asRecord, toolKeyFromModule } from '../actions/common.js';
import { SCREEN_ROUTES, routeScreen } from './screens.js';
import { eventType, onEvent } from './events.js';
import { onScheduled } from './scheduled.js';
import { runJqlDelegable } from './jql.js';
import { runDispatch } from './dispatch.js';

/** Routes one event by shape: screen, tool, schedule, JQL or issue event. */
export async function routeEntry(deps: Deps, event: unknown): Promise<unknown> {
  const record = asRecord(event);
  const method = typeof record.method === 'string' ? record.method : '';
  if (SCREEN_ROUTES[method] !== undefined) {
    return routeScreen(deps, method, record.payload, record.context);
  }
  if (toolKeyFromModule(record.tool) !== null || typeof asRecord(record.context).moduleKey === 'string') {
    return runDispatch(deps, record.payload ?? record, record.context);
  }
  if (record.scheduled === true || record.type === 'scheduledTrigger') return onScheduled(deps);
  if (record.jql === true || record.functionKey === 'jqlDelegable') return runJqlDelegable(deps, record.payload ?? record);
  if (eventType(event) !== 'unknown') {
    await onEvent(deps, event);
    return null;
  }
  deps.logger.log('warn', 'entry: unroutable event ignored');
  return null;
}
