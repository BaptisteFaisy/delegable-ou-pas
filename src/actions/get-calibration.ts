/**
 * MCP tool `get-calibration` (GET) — SPEC §15, §10, §16.7; DP-21.
 *
 * Reads the cached calibration rows of the current epoch: how right the past
 * recommendations turned out, each row with its sample size and interval
 * (recipe 10), plus the honest up-front warning when the advice adds nothing
 * measurable (SPEC §10).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { Deps } from '../deps.js';
import type {
  CalibrationRow,
  GetCalibrationInput,
  GetCalibrationOutput,
  McpResult,
} from '../types-mcp.js';
import type { Calibration } from '../types-advice.js';
import { adviceAddsNothing } from '../domain/calibration.js';
import { currentEpoch } from '../domain/epochs.js';
import { asRecord, empty, fail, ok, requiredText, settingsByKey } from './common.js';

/** Validates the raw payload into the frozen input shape. */
export function parseGetCalibrationInput(payload: unknown): GetCalibrationInput | null {
  const record = asRecord(payload);
  const projectKey = requiredText(record.projectKey, 50);
  if (projectKey === null) return null;
  return { projectKey };
}

/** One cached row becomes one row of the answer (SPEC §10). */
export function toCalibrationRow(row: Calibration): CalibrationRow {
  return { recommendation: row.value, n: row.clean.n, clean: row.clean };
}

/** The frozen signature of docs/CONTRACTS.md §L7. */
export async function getCalibration(
  deps: Deps,
  input: GetCalibrationInput,
): Promise<McpResult<GetCalibrationOutput>> {
  const settings = await settingsByKey(deps, input.projectKey);
  if (settings === null) return empty();
  const epochs = await deps.stores.epoch.listByProject(settings.projectId);
  const current = currentEpoch(epochs);
  const rows = current === null ? [] : await deps.stores.calibration.listByProject(settings.projectId, current.id);
  return ok({
    projectKey: settings.projectKey,
    rows: rows.map(toCalibrationRow),
    adviceAddsNothing: adviceAddsNothing(rows),
    demo: settings.demo,
  });
}

/** Registry shape: validates then runs. */
export async function runGetCalibration(deps: Deps, payload: unknown): Promise<McpResult<unknown>> {
  const input = parseGetCalibrationInput(payload);
  if (input === null) return fail('invalid-input');
  return getCalibration(deps, input);
}
