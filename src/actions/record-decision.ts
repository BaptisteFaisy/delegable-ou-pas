/**
 * MCP tool `record-decision` (CREATE) — SPEC §15, §8 "Un avis, pas un ordre";
 * DP-13, DP-15.
 *
 * Records the decision taken on a ticket and matches it against the cached
 * recommendation: this is what feeds the calibration (SPEC §10, §13). The
 * decision is kept even when no card was shown yet (SPEC §20).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { Deps } from '../deps.js';
import type { McpResult, RecordDecisionInput, RecordDecisionOutput } from '../types-mcp.js';
import { recordDecision as buildDecision } from '../domain/decision.js';
import { asRecord, empty, fail, isIssueKey, ok } from './common.js';

/** Validates the raw payload into the frozen input shape. */
export function parseRecordDecisionInput(payload: unknown): RecordDecisionInput | null {
  const record = asRecord(payload);
  if (!isIssueKey(record.issueKey)) return null;
  if (record.decision !== 'delegate' && record.decision !== 'keep-human') return null;
  const reason = typeof record.reason === 'string' ? record.reason.trim().slice(0, 500) : '';
  return { issueKey: record.issueKey, decision: record.decision, reason };
}

/** The frozen signature of docs/CONTRACTS.md §L7 (`recordDecision`). */
export async function recordDecision(
  deps: Deps,
  input: RecordDecisionInput,
): Promise<McpResult<RecordDecisionOutput>> {
  const ticket = await deps.jira.getTicket(input.issueKey);
  if (ticket === null) return empty();
  const card = await deps.engine.read(ticket.id);
  const involvement = await deps.stores.involvement.get(ticket.id);
  const decision = buildDecision(
    ticket.id,
    input.decision,
    input.reason,
    card,
    involvement?.level ?? 'unknown',
    deps.clock.now(),
  );
  await deps.stores.decision.save(decision);
  return ok({
    issueKey: ticket.key,
    recommendation: card?.value ?? 'not-enough-data',
    followed: decision.followed,
    recordedAt: decision.at,
  });
}

/** Registry shape: validates then runs. */
export async function runRecordDecision(deps: Deps, payload: unknown): Promise<McpResult<unknown>> {
  const input = parseRecordDecisionInput(payload);
  if (input === null) return fail('invalid-input');
  return recordDecision(deps, input);
}
