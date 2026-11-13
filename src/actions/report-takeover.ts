/**
 * MCP tool `report-takeover` (UPDATE) — SPEC §15, §9, §6 "Reprise humaine";
 * DP-13, DP-15.
 *
 * An agent reports that a human took the ticket back. The involvement falls
 * back from `autonomous` to `driven` (SPEC §6); a takeover counts against the
 * clean closure of the ticket. The free-text reason is read but never stored:
 * the app keeps structured evidence keys, never a quote (SPEC §17).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { Deps } from '../deps.js';
import type { McpResult, ReportTakeoverInput, ReportTakeoverOutput } from '../types-mcp.js';
import type { Involvement, Level } from '../types.js';
import { asRecord, empty, fail, isIssueKey, ok } from './common.js';

/** Validates the raw payload into the frozen input shape. */
export function parseReportTakeoverInput(payload: unknown): ReportTakeoverInput | null {
  const record = asRecord(payload);
  if (!isIssueKey(record.issueKey)) return null;
  const reason = typeof record.reason === 'string' ? record.reason.trim().slice(0, 500) : '';
  return { issueKey: record.issueKey, reason };
}

/**
 * The level the ticket falls back to (SPEC §6): `autonomous` becomes
 * `driven`; an unknown involvement becomes `driven` too, because a reported
 * takeover proves an agent was at work. The other levels stand.
 */
export function takeoverLevel(current: Level | null): Level {
  if (current === null || current === 'autonomous' || current === 'unknown') return 'driven';
  return current;
}

/** The frozen signature of docs/CONTRACTS.md §L7. */
export async function reportTakeover(
  deps: Deps,
  input: ReportTakeoverInput,
): Promise<McpResult<ReportTakeoverOutput>> {
  const ticket = await deps.jira.getTicket(input.issueKey);
  if (ticket === null) return empty();
  const at = deps.clock.now();
  const current = await deps.stores.involvement.get(ticket.id);
  const level = takeoverLevel(current?.level ?? null);
  const involvement: Involvement = {
    issueId: ticket.id,
    level,
    source: 'mcp-declaration',
    client: current?.client ?? '',
    model: current?.model ?? '',
    sessionRef: current?.sessionRef ?? '',
    evidence: ['takeover-reported'],
    decidedAt: at,
  };
  await deps.stores.involvement.save(involvement);
  const outcome = await deps.stores.outcome.get(ticket.id);
  if (outcome !== null && !outcome.takeover) {
    await deps.stores.outcome.save({ ...outcome, takeover: true });
  }
  return ok({ issueKey: ticket.key, level, recordedAt: at });
}

/** Registry shape: validates then runs. */
export async function runReportTakeover(deps: Deps, payload: unknown): Promise<McpResult<unknown>> {
  const input = parseReportTakeoverInput(payload);
  if (input === null) return fail('invalid-input');
  return reportTakeover(deps, input);
}
