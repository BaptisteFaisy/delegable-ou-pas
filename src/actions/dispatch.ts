/**
 * The single dispatch of the nine MCP tools — SPEC §15, §19 "Action"; DP-15.
 *
 * `createDispatch(deps)` returns the one resolver behind every `fn-*` action
 * of the manifest and behind the `rovo:mcp` module: the tool key arrives in
 * the payload (`tool`) or through the Forge module key, the answer is always
 * the `McpResult` envelope, never a thrown exception (SPEC §20).
 *
 * An agent started by an automation rule only calls the `GET` tools
 * (SPEC §19): the verb table is exposed so a caller can check before it asks.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { Deps } from '../deps.js';
import type { McpResult, McpToolKey } from '../types-mcp.js';
import { asRecord, fail, toolKeyFromModule } from './common.js';
import { runTool, verbOf } from './registry.js';

/** The dispatch function: one payload in, one envelope out. */
export type Dispatch = (payload: unknown) => Promise<unknown>;

/** Reads the tool key: payload `tool`, else payload `moduleKey` (SPEC §15). */
function toolFromPayload(payload: unknown): McpToolKey | null {
  const record = asRecord(payload);
  return toolKeyFromModule(record.tool) ?? toolKeyFromModule(record.moduleKey);
}

/** The tool inputs: the payload itself, minus the routing fields. */
export function inputOf(payload: unknown): Readonly<Record<string, unknown>> {
  const record = asRecord(payload);
  const input: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key !== 'tool' && key !== 'moduleKey') input[key] = value;
  }
  return input;
}

/**
 * Builds the dispatch bound to one dependency graph (frozen signature of
 * docs/CONTRACTS.md §L7). An unknown tool is a typed error, not an exception.
 */
export function createDispatch(deps: Deps): Dispatch {
  return async (payload: unknown): Promise<unknown> => {
    const tool = toolFromPayload(payload);
    if (tool === null) return fail<unknown>('unknown-tool');
    const result = (await runTool(deps, tool, inputOf(payload))) as McpResult<unknown>;
    return result;
  };
}

/** The verb of one tool, for a caller that must stay on reads (SPEC §19). */
export { verbOf };
