/**
 * The registry of the nine MCP tools — SPEC §15; DP-15.
 *
 * One row per tool: the verb comes from the frozen `MCP_TOOL_VERBS` table,
 * the runner validates the raw payload then calls the tool. A tool is never
 * called with an unvalidated input, and no exception escapes: `runTool`
 * catches everything into the `McpResult` envelope (SPEC §20).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { Deps } from '../deps.js';
import type { McpResult, McpToolKey } from '../types-mcp.js';
import { MCP_TOOL_KEYS, MCP_TOOL_VERBS } from '../types-mcp.js';
import { fail, guardResult, toolKeyFromModule } from './common.js';
import { runShouldDelegate } from './should-delegate.js';
import { runListDelegableWork } from './list-delegable-work.js';
import { runGetDelegationEvidence } from './get-delegation-evidence.js';
import { runGetDelegationMap } from './get-delegation-map.js';
import { runGetCohort } from './get-cohort.js';
import { runGetCalibration } from './get-calibration.js';
import { runRecordInvolvement } from './record-involvement.js';
import { runRecordDecision } from './record-decision.js';
import { runReportTakeover } from './report-takeover.js';

/** One validated runner: raw payload in, envelope out, never throws. */
export type ToolRunner = (deps: Deps, payload: unknown) => Promise<McpResult<unknown>>;

/** The nine runners, keyed by the frozen tool keys (SPEC §15 order). */
export const TOOL_RUNNERS: Readonly<Record<McpToolKey, ToolRunner>> = {
  'should-delegate': runShouldDelegate,
  'list-delegable-work': runListDelegableWork,
  'get-delegation-evidence': runGetDelegationEvidence,
  'get-delegation-map': runGetDelegationMap,
  'get-cohort': runGetCohort,
  'get-calibration': runGetCalibration,
  'record-involvement': runRecordInvolvement,
  'record-decision': runRecordDecision,
  'report-takeover': runReportTakeover,
};

/** The verb of one tool: `GET` reads, `CREATE`/`UPDATE` writes (SPEC §19). */
export function verbOf(tool: McpToolKey): 'GET' | 'CREATE' | 'UPDATE' {
  return MCP_TOOL_VERBS[tool];
}

/** True when every frozen key has exactly one runner (build-time sanity). */
export function registryComplete(): boolean {
  return MCP_TOOL_KEYS.every((key) => typeof TOOL_RUNNERS[key] === 'function');
}

/**
 * Runs one tool: validation errors are typed, unexpected exceptions become
 * `internal-error`, and every answer passes the anonymity guard before it
 * leaves the app (recipe 12, DP-17).
 */
export async function runTool(deps: Deps, tool: McpToolKey | null, payload: unknown): Promise<McpResult<unknown>> {
  if (tool === null) return fail('unknown-tool');
  try {
    return guardResult(deps, tool, await TOOL_RUNNERS[tool](deps, payload));
  } catch (error: unknown) {
    deps.logger.log('error', `mcp tool failed: ${tool}`, error instanceof Error ? error.message : String(error));
    return fail('internal-error');
  }
}

/** Resolves a tool key from a payload field or a Forge module key. */
export function toolOf(payloadTool: unknown, moduleKey: unknown): McpToolKey | null {
  return toolKeyFromModule(payloadTool) ?? toolKeyFromModule(moduleKey);
}
