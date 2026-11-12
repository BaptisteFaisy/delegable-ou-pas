/**
 * MCP tool `record-involvement` (CREATE) — SPEC §15, §5 source 1; DP-01, DP-15.
 *
 * The declaration made by the tool itself: the strongest source of the app.
 * No person name is accepted (recipe 12) — the input carries the tool, the
 * model and a session reference, and the stored evidence is a list of
 * structured keys, never a free-text quote (SPEC §17).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { Deps } from '../deps.js';
import type { McpResult, RecordInvolvementInput, RecordInvolvementOutput } from '../types-mcp.js';
import type { Level } from '../types.js';
import { LEVELS } from '../types.js';
import { fromDeclaration, resolveInvolvement } from '../domain/involvement.js';
import { asRecord, empty, fail, isIssueKey, ok, oneOf, textOf } from './common.js';

/** Reads a declaration field: a string, possibly empty, capped. */
function fieldOf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return textOf(value) ?? (value.trim() === '' ? '' : null);
}

/** Validates the raw payload into the frozen input shape. */
export function parseRecordInvolvementInput(payload: unknown): RecordInvolvementInput | null {
  const record = asRecord(payload);
  if (!isIssueKey(record.issueKey)) return null;
  if (!oneOf(record.level, LEVELS as readonly string[])) return null;
  const client = fieldOf(record.client);
  const model = fieldOf(record.model);
  const session = fieldOf(record.session);
  if (client === null || model === null || session === null) return null;
  return { issueKey: record.issueKey, level: record.level as Level, client, model, session };
}

/** The frozen signature of docs/CONTRACTS.md §L7. */
export async function recordInvolvement(
  deps: Deps,
  input: RecordInvolvementInput,
): Promise<McpResult<RecordInvolvementOutput>> {
  const ticket = await deps.jira.getTicket(input.issueKey);
  if (ticket === null) return empty();
  const at = deps.clock.now();
  const candidate = fromDeclaration(
    { issueKey: ticket.key, level: input.level, client: input.client, model: input.model, session: input.session },
    at,
  );
  const involvement = resolveInvolvement(ticket.id, [candidate], at, input.client, input.model, input.session);
  if (involvement === null) return fail('internal-error');
  await deps.stores.involvement.save(involvement);
  return ok({
    issueKey: ticket.key,
    level: involvement.level,
    source: involvement.source,
    recordedAt: involvement.decidedAt,
  });
}

/** Registry shape: validates then runs. */
export async function runRecordInvolvement(deps: Deps, payload: unknown): Promise<McpResult<unknown>> {
  const input = parseRecordInvolvementInput(payload);
  if (input === null) return fail('invalid-input');
  return recordInvolvement(deps, input);
}
