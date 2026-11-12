/**
 * MCP tool `should-delegate` (GET) — SPEC §15, §9, §20; DP-11, DP-15.
 *
 * Reads the cached recommendation card through `deps.engine.read`: the tool
 * never recomputes (SPEC §20 "moins de 2 s"). An unknown ticket or a ticket
 * without a card yet is normal: `data: null`, never an exception.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { Deps } from '../deps.js';
import type { McpResult, ShouldDelegateInput, ShouldDelegateOutput } from '../types-mcp.js';
import type { RecommendationCard } from '../types-advice.js';
import { asRecord, empty, fail, isIssueKey, ok } from './common.js';

/** Validates the raw payload into the frozen input shape. */
export function parseShouldDelegateInput(payload: unknown): ShouldDelegateInput | null {
  const record = asRecord(payload);
  if (!isIssueKey(record.issueKey)) return null;
  return { issueKey: record.issueKey };
}

/** Projects one cached card into the tool answer (SPEC §15). */
export function toShouldDelegateOutput(card: RecommendationCard): ShouldDelegateOutput {
  return {
    issueKey: card.issueKey,
    recommendation: card.value,
    confidence: card.confidence,
    reasons: card.reasons,
    conditions: card.conditions,
    guardrails: card.guardrails,
    cohort: card.cohort,
    demo: card.demo,
  };
}

/** The frozen signature of docs/CONTRACTS.md §L7. */
export async function shouldDelegate(
  deps: Deps,
  input: ShouldDelegateInput,
): Promise<McpResult<ShouldDelegateOutput>> {
  const ticket = await deps.jira.getTicket(input.issueKey);
  if (ticket === null) return empty();
  const card = await deps.engine.read(ticket.id);
  if (card === null) return empty();
  return ok(toShouldDelegateOutput({ ...card, issueKey: ticket.key }));
}

/** Registry shape: validates then runs (an invalid input is a typed error). */
export async function runShouldDelegate(deps: Deps, payload: unknown): Promise<McpResult<unknown>> {
  const input = parseShouldDelegateInput(payload);
  if (input === null) return fail('invalid-input');
  return shouldDelegate(deps, input);
}
