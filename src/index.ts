/**
 * The assembly entry — SPEC §17; DP-15 (docs/CONTRACTS.md §6, §L7).
 *
 * Wiring only: instantiate the shared `Deps` once (`src/deps.ts`) and route
 * the event to `src/handlers/` or `src/actions/dispatch.ts`. NO business
 * logic lives in this file — the Forge modules of the manifest point at the
 * handler files directly; this generic entry serves runtimes and tests that
 * hand over one undifferentiated event.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import { getDeps } from './deps.js';
import { routeEntry } from './handlers/entry.js';

/** The frozen signature of docs/CONTRACTS.md §L7. */
export const handler: (event: unknown) => Promise<unknown> = async (event: unknown): Promise<unknown> =>
  routeEntry(await getDeps(), event);

export default handler;
