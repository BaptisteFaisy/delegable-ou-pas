/**
 * MCP tool `get-cohort` (GET) — SPEC §15, §16.3, §7 rules 3, 6, 8; DP-07,
 * DP-17, DP-22; recipes 10, 11, 14.
 *
 * Reads the cached cohort statistics epoch by epoch: every rate comes with
 * its sample size and its interval (recipe 10), outdated epochs stay visible
 * but greyed (SPEC §21), and a cohort carried by fewer than three people is
 * masked with its figures withheld (recipe 11, DP-17).
 *
 * CONTRACT-NEEDED: types-advice.CohortStat.balance — the cache does not keep
 * the composition verdict, so `balance` is reconstructed from the conclusion
 * (an established conclusion proves balanced arms; `not-enough-data` cannot
 * tell "too small" from "unbalanced" and stays flagged with no signal).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { Deps } from '../deps.js';
import type {
  CohortEpoch,
  CohortEpochArm,
  GetCohortInput,
  GetCohortOutput,
  McpResult,
} from '../types-mcp.js';
import type { CohortStat, ProjectSettings } from '../types-advice.js';
import type { Balance, CohortKey, Epoch } from '../types.js';
import { currentEpoch, isOutdated } from '../domain/epochs.js';
import { maskCohort, reportablePeopleCount } from '../domain/privacy.js';
import { asRecord, empty, fail, ok, requiredText, settingsByKey } from './common.js';

/** Validates the raw payload into the frozen input shape. */
export function parseGetCohortInput(payload: unknown): GetCohortInput | null {
  const record = asRecord(payload);
  const projectKey = requiredText(record.projectKey, 50);
  const nature = requiredText(record.nature, 100);
  const zone = requiredText(record.zone, 100);
  const size = requiredText(record.size, 20);
  if (projectKey === null || nature === null || zone === null || size === null) return null;
  return { projectKey, nature, zone, size };
}

/** The asked cohort at its narrowest level (SPEC §7 rule 1). */
export function cohortKeyOfInput(input: GetCohortInput): CohortKey {
  return { level: 'nature-zone-size', nature: input.nature, zone: input.zone, size: input.size };
}

/** The balance verdict reconstructed from the cached conclusion (see header). */
export function balanceOfConclusion(established: boolean): Balance {
  return { balanced: established, signals: [] };
}

/** One cached arm row becomes one arm of the epoch (recipe 10). */
function toEpochArm(row: CohortStat, epoch: Epoch): CohortEpochArm {
  return {
    epochId: epoch.id,
    epochLabel: epoch.label,
    arm: row.arm,
    clean: row.clean,
    leadTime: { n: row.clean.n, medianH: row.medianLeadH },
    reviewLoad: row.reviewLoad,
  };
}

/** One epoch of the cohort, both arms and the honest conclusion (SPEC §7). */
export function toCohortEpoch(rows: readonly CohortStat[], epoch: Epoch, current: Epoch | null): CohortEpoch {
  const conclusion = rows[0]?.conclusion ?? 'not-enough-data';
  return {
    epochId: epoch.id,
    epochLabel: epoch.label,
    arms: rows.map((row) => toEpochArm(row, epoch)),
    conclusion,
    balance: balanceOfConclusion(conclusion !== 'not-enough-data'),
    outdated: isOutdated(epoch, current),
  };
}

/** The people count behind the cohort, and the mask verdict (DP-17). */
function peopleOf(rows: readonly CohortStat[]): number {
  return rows.reduce((max, row) => Math.max(max, row.peopleCount), 0);
}

/** Reads every epoch of one cohort from the cache (SPEC §7 rule 6). */
async function readEpochs(
  deps: Deps,
  settings: ProjectSettings,
  key: CohortKey,
): Promise<{ epochs: CohortEpoch[]; people: number }> {
  const all = await deps.stores.epoch.listByProject(settings.projectId);
  const current = currentEpoch(all);
  const epochs: CohortEpoch[] = [];
  let people = 0;
  for (const epoch of all) {
    const rows = await deps.stores.cohortStat.listByCohort(settings.projectId, epoch.id, key);
    if (rows.length === 0) continue;
    people = Math.max(people, peopleOf(rows));
    epochs.push(toCohortEpoch(rows, epoch, current));
  }
  return { epochs, people };
}

/** Builds the cohort answer for known settings (shared with the UI resolver). */
export async function buildCohortOutput(
  deps: Deps,
  settings: ProjectSettings,
  input: GetCohortInput,
): Promise<GetCohortOutput> {
  const { epochs, people } = await readEpochs(deps, settings, cohortKeyOfInput(input));
  return {
    cohort: cohortKeyOfInput(input),
    epochs,
    masked: maskCohort(people),
    peopleCount: reportablePeopleCount(people),
    demo: settings.demo,
  };
}

/** The frozen signature of docs/CONTRACTS.md §L7. */
export async function getCohort(deps: Deps, input: GetCohortInput): Promise<McpResult<GetCohortOutput>> {
  const settings = await settingsByKey(deps, input.projectKey);
  if (settings === null) return empty();
  return ok(await buildCohortOutput(deps, settings, input));
}

/** Registry shape: validates then runs. */
export async function runGetCohort(deps: Deps, payload: unknown): Promise<McpResult<unknown>> {
  const input = parseGetCohortInput(payload);
  if (input === null) return fail('invalid-input');
  return getCohort(deps, input);
}
