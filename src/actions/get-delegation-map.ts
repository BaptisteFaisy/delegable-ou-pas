/**
 * MCP tool `get-delegation-map` (GET) — SPEC §15, §12; DP-14, DP-15.
 *
 * Reads the delegation map through `deps.engine.map`: the summarized matrix
 * (nature × zone) and the share of grey cells — "we do not know" is an answer
 * (SPEC §12). No person identifier: a cell is a cohort, never a carrier
 * (DP-17, recipe 12).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { Deps } from '../deps.js';
import type {
  DelegationMapCellSummary,
  GetDelegationMapInput,
  GetDelegationMapOutput,
  McpResult,
} from '../types-mcp.js';
import type { DelegationMap, DelegationMapCell } from '../types-advice.js';
import { asRecord, empty, fail, ok, requiredText, settingsByKey } from './common.js';

/** Validates the raw payload into the frozen input shape. */
export function parseGetDelegationMapInput(payload: unknown): GetDelegationMapInput | null {
  const record = asRecord(payload);
  const projectKey = requiredText(record.projectKey, 50);
  if (projectKey === null) return null;
  return { projectKey };
}

/** One matrix cell, summarized: no sample is dropped silently upstream (SPEC §12). */
export function toCellSummary(cell: DelegationMapCell): DelegationMapCellSummary {
  return { nature: cell.nature, zone: cell.zone, color: cell.color, recommendation: cell.recommendation };
}

/** Projects the cached map into the tool answer (SPEC §15). */
export function toMapOutput(projectKey: string, map: DelegationMap): GetDelegationMapOutput {
  return {
    projectKey,
    natures: map.natures,
    zones: map.zones,
    cells: map.cells.map(toCellSummary),
    greyShare: map.greyShare,
    demo: map.demo,
  };
}

/** The frozen signature of docs/CONTRACTS.md §L7. */
export async function getDelegationMap(
  deps: Deps,
  input: GetDelegationMapInput,
): Promise<McpResult<GetDelegationMapOutput>> {
  const settings = await settingsByKey(deps, input.projectKey);
  if (settings === null) return empty();
  const map = await deps.engine.map(settings.projectId, '');
  if (map === null) return empty();
  return ok(toMapOutput(settings.projectKey, map));
}

/** Registry shape: validates then runs. */
export async function runGetDelegationMap(deps: Deps, payload: unknown): Promise<McpResult<unknown>> {
  const input = parseGetDelegationMapInput(payload);
  if (input === null) return fail('invalid-input');
  return getDelegationMap(deps, input);
}
