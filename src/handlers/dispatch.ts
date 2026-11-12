/**
 * The Forge action entry of the nine MCP tools — SPEC §15, §19 "Action"; DP-15.
 *
 * The manifest points its nine `fn-*` functions at this single export: it
 * reads the tool key from `context.moduleKey` (`fn-should-delegate` →
 * `should-delegate`), or from the payload when the caller is the `rovo:mcp`
 * module, and hands everything to `createDispatch` (src/actions/dispatch.ts).
 * No business logic lives here — only wiring and the shared assembly.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { Deps } from '../deps.js';
import { getDeps } from '../deps.js';
import { asRecord, toolKeyFromModule } from '../actions/common.js';
import { createDispatch } from '../actions/dispatch.js';

/** Routes one Forge action call, with the deps already built (tests inject). */
export async function runDispatch(deps: Deps, payload: unknown, context?: unknown): Promise<unknown> {
  const record = asRecord(payload);
  const moduleKey = asRecord(context).moduleKey ?? record.moduleKey;
  const tool = toolKeyFromModule(record.tool) ?? toolKeyFromModule(moduleKey);
  const dispatch = createDispatch(deps);
  return dispatch({ ...record, tool: tool ?? '' });
}

/** The manifest entry `handlers/dispatch.dispatch` (docs/CONTRACTS.md §6). */
export async function dispatch(payload: unknown, context?: unknown): Promise<unknown> {
  return runDispatch(await getDeps(), payload, context);
}
