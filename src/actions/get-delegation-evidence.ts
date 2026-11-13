/**
 * MCP tool `get-delegation-evidence` (GET) — SPEC §15, §20 "Explicabilité";
 * DP-11, DP-26.
 *
 * Returns the cohort, both arms with sample sizes and intervals, the median
 * delays, the failure causes and the reference tickets behind one cached
 * recommendation. The `recommendation` table keeps the verdict, the cohort,
 * the confidence and the reasons (lot L5); the FIGURES live in the
 * `cohort_stat` cache, so the tool completes the card with the current-epoch
 * rows of its cohort. Both are cache reads — nothing is recomputed
 * (SPEC §20 "moins de 2 s").
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { Deps } from '../deps.js';
import type {
  GetDelegationEvidenceInput,
  GetDelegationEvidenceOutput,
  McpResult,
} from '../types-mcp.js';
import type { CohortStat, RecommendationCard } from '../types-advice.js';
import type { DurationStat, ProportionStat } from '../types.js';
import { currentEpoch } from '../domain/epochs.js';
import { asRecord, empty, fail, isIssueKey, ok } from './common.js';
import { balanceOfConclusion } from './get-cohort.js';

/** Validates the raw payload into the frozen input shape. */
export function parseGetDelegationEvidenceInput(payload: unknown): GetDelegationEvidenceInput | null {
  const record = asRecord(payload);
  if (!isIssueKey(record.issueKey)) return null;
  return { issueKey: record.issueKey };
}

function statOf(row: CohortStat | undefined): ProportionStat | null {
  return row !== undefined && row.clean.n > 0 ? row.clean : null;
}

function leadOf(row: CohortStat | undefined): DurationStat | null {
  return row !== undefined && row.clean.n > 0 ? { n: row.clean.n, medianH: row.medianLeadH } : null;
}

/** Reads the cached figures of the card's cohort, current epoch (SPEC §7). */
async function cohortRows(deps: Deps, projectId: string, card: RecommendationCard): Promise<CohortStat[]> {
  const epochs = await deps.stores.epoch.listByProject(projectId);
  const current = currentEpoch(epochs);
  if (current === null) return [];
  return deps.stores.cohortStat.listByCohort(projectId, current.id, card.cohort);
}

/** The frozen signature of docs/CONTRACTS.md §L7. */
export async function getDelegationEvidence(
  deps: Deps,
  input: GetDelegationEvidenceInput,
): Promise<McpResult<GetDelegationEvidenceOutput>> {
  const ticket = await deps.jira.getTicket(input.issueKey);
  if (ticket === null) return empty();
  const card = await deps.engine.read(ticket.id);
  if (card === null) return empty();
  const rows = card.agent === null && card.human === null ? await cohortRows(deps, ticket.projectId, card) : [];
  const agentRow = rows.find((row) => row.arm === 'agent');
  const humanRow = rows.find((row) => row.arm === 'human');
  const agent = card.agent ?? statOf(agentRow);
  const human = card.human ?? statOf(humanRow);
  const conclusion = rows[0]?.conclusion ?? card.conclusion;
  const settings = await deps.stores.settings.get(ticket.projectId);
  return ok({
    issueKey: ticket.key,
    cohort: card.cohort,
    agent,
    human,
    agentLeadTime: card.agentLeadTime ?? leadOf(agentRow),
    humanLeadTime: card.humanLeadTime ?? leadOf(humanRow),
    failureCauses: card.failureCauses,
    referenceIssueKeys: card.referenceIssueKeys,
    conclusion,
    balance: rows.length === 0 ? card.balance : balanceOfConclusion(conclusion !== 'not-enough-data'),
    demo: settings?.demo ?? card.demo,
  });
}

/** Registry shape: validates then runs. */
export async function runGetDelegationEvidence(deps: Deps, payload: unknown): Promise<McpResult<unknown>> {
  const input = parseGetDelegationEvidenceInput(payload);
  if (input === null) return fail('invalid-input');
  return getDelegationEvidence(deps, input);
}
