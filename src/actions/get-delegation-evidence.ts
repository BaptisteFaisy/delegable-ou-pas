/**
 * MCP tool `get-delegation-evidence` (GET) — SPEC §15, §20 "Explicabilité";
 * DP-11, DP-26.
 *
 * Returns the cohort, both arms with sample sizes and intervals, the median
 * delays, the failure causes and the reference tickets behind one cached
 * recommendation. Reads the cache only (SPEC §20 "moins de 2 s").
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { Deps } from '../deps.js';
import type {
  GetDelegationEvidenceInput,
  GetDelegationEvidenceOutput,
  McpResult,
} from '../types-mcp.js';
import type { RecommendationCard } from '../types-advice.js';
import { asRecord, empty, fail, isIssueKey, ok } from './common.js';

/** Validates the raw payload into the frozen input shape. */
export function parseGetDelegationEvidenceInput(payload: unknown): GetDelegationEvidenceInput | null {
  const record = asRecord(payload);
  if (!isIssueKey(record.issueKey)) return null;
  return { issueKey: record.issueKey };
}

/** Projects one cached card into the evidence answer (SPEC §15). */
export function toEvidenceOutput(card: RecommendationCard): GetDelegationEvidenceOutput {
  return {
    issueKey: card.issueKey,
    cohort: card.cohort,
    agent: card.agent,
    human: card.human,
    agentLeadTime: card.agentLeadTime,
    humanLeadTime: card.humanLeadTime,
    failureCauses: card.failureCauses,
    referenceIssueKeys: card.referenceIssueKeys,
    conclusion: card.conclusion,
    balance: card.balance,
    demo: card.demo,
  };
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
  return ok(toEvidenceOutput({ ...card, issueKey: ticket.key }));
}

/** Registry shape: validates then runs. */
export async function runGetDelegationEvidence(deps: Deps, payload: unknown): Promise<McpResult<unknown>> {
  const input = parseGetDelegationEvidenceInput(payload);
  if (input === null) return fail('invalid-input');
  return getDelegationEvidence(deps, input);
}
