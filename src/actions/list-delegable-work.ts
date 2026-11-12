/**
 * MCP tool `list-delegable-work` (GET) — SPEC §15, §9; DP-15, DP-24; recipe 13.
 *
 * Runs a bounded JQL search, keeps ONLY the tickets whose cached card says
 * `delegate`, and sorts them from the safest to the least safe (the confidence
 * of the recommendation). No person name enters or leaves (recipe 12).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { Deps } from '../deps.js';
import type {
  DelegableWorkItem,
  ListDelegableWorkInput,
  ListDelegableWorkOutput,
  McpResult,
} from '../types-mcp.js';
import type { Confidence, RecommendationCard } from '../types-advice.js';
import { CONFIDENCES } from '../types-advice.js';
import { asRecord, fail, limitOf, ok, textOf, MAX_JQL_LENGTH } from './common.js';

/** Validates the raw payload: a JQL string and a capped `limit`. */
export function parseListDelegableWorkInput(payload: unknown): ListDelegableWorkInput | null {
  const record = asRecord(payload);
  const jql = textOf(record.jql, MAX_JQL_LENGTH);
  if (jql === null) return null;
  return { jql, limit: limitOf(record.limit) };
}

/** The confidence rank: 0 is the surest (SPEC §8, recipe 13). */
export function confidenceRank(value: Confidence): number {
  const rank = CONFIDENCES.indexOf(value);
  return rank === -1 ? CONFIDENCES.length : rank;
}

/** One cached `delegate` card becomes one item of the answer. */
function toItem(card: RecommendationCard): DelegableWorkItem {
  return { issueKey: card.issueKey, confidence: card.confidence, reasons: card.reasons };
}

/** Keeps only `delegate`, safest first (recipe 13); a missing card drops out. */
export function delegableItems(cards: readonly RecommendationCard[]): DelegableWorkItem[] {
  return cards
    .filter((card) => card.value === 'delegate')
    .sort((a, b) => confidenceRank(a.confidence) - confidenceRank(b.confidence))
    .map(toItem);
}

/** The frozen signature of docs/CONTRACTS.md §L7. */
export async function listDelegableWork(
  deps: Deps,
  input: ListDelegableWorkInput,
): Promise<McpResult<ListDelegableWorkOutput>> {
  const summaries = await deps.jira.searchJql(input.jql, input.limit);
  const cards: RecommendationCard[] = [];
  for (const summary of summaries) {
    const card = await deps.engine.read(summary.id);
    if (card !== null) cards.push({ ...card, issueKey: summary.key });
  }
  return ok({ items: delegableItems(cards), demo: cards.some((card) => card.demo) });
}

/** Registry shape: validates then runs. */
export async function runListDelegableWork(deps: Deps, payload: unknown): Promise<McpResult<unknown>> {
  const input = parseListDelegableWorkInput(payload);
  if (input === null) return fail('invalid-input');
  return listDelegableWork(deps, input);
}
