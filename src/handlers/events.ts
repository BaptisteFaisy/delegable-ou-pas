/**
 * The event triggers — SPEC §17 "Événements", §5, §6; DP-06, DP-15; recipes
 * 2, 3.
 *
 * `avi:jira:created:issue` classifies the nature of the new ticket (rules
 * first, model second, kept by fingerprint — DP-06). `avi:jira:updated:issue`
 * refreshes the involvement and the outcome of the touched ticket when it
 * closed. Neither ever blocks the user's edit: a failure is logged, never
 * thrown (SPEC §20), and absent data stays `null` / `[]`.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { Deps } from '../deps.js';
import type { Involvement, IssueClass, Outcome, SourceCandidate } from '../types.js';
import { DEFAULT_NATURES } from '../types.js';
import type { ProjectSettings } from '../types-advice.js';
import type { JiraTicket, StatusHistory } from '../types-graph.js';
import { classifyTicket } from '../domain/nature.js';
import { closureAt, isAbandoned } from '../domain/outcome.js';
import { maturityDate } from '../domain/maturity.js';
import { fromAdoptionDate, resolveInvolvement } from '../domain/involvement.js';
import { cleanClosureFromFacts, collectJiraOnly } from '../collect/jira-only.js';
import { asRecord } from '../actions/common.js';

/** The issue an event carries: id first, key as a fallback (defensive read). */
export function eventIssue(event: unknown): { id: string; key: string } {
  const record = asRecord(event);
  const issue = asRecord(record.issue ?? record);
  const id = typeof issue.id === 'string' ? issue.id : '';
  const key = typeof issue.key === 'string' ? issue.key : '';
  return { id: id || key, key: key || id };
}

/** The kind of event, read from the Forge webhook info when present. */
export function eventType(event: unknown): 'created' | 'updated' | 'unknown' {
  const record = asRecord(event);
  const info = asRecord(record.webhookInfo);
  const type = [info.type, record.type, record.eventType]
    .find((value): value is string => typeof value === 'string')
    ?.toLowerCase() ?? '';
  if (type.includes('created')) return 'created';
  if (type.includes('updated')) return 'updated';
  return 'unknown';
}

/** Classifies the nature of a new ticket (DP-06), kept by text fingerprint. */
export async function onIssueCreated(deps: Deps, event: unknown): Promise<void> {
  const issue = eventIssue(event);
  if (issue.id === '') return;
  const ticket = await deps.jira.getTicket(issue.id);
  if (ticket === null) return;
  const settings = await deps.stores.settings.get(ticket.projectId);
  const classified: IssueClass | null = await classifyTicket(ticket, {
    llm: deps.llm,
    store: deps.stores.issueClass,
    natures: settings?.natures ?? DEFAULT_NATURES,
    sizes: settings?.sizes,
  });
  deps.logger.log('info', `issue classified: ${ticket.key} → ${classified?.nature ?? 'none'}`);
}

/** The existing involvement, as a candidate, so the sources arbitrate (DP-01). */
function existingCandidate(existing: Involvement | null): SourceCandidate[] {
  if (existing === null) return [];
  return [{ source: existing.source, level: existing.level, evidence: existing.evidence.join(';') }];
}

/** Refreshes the involvement of a closed ticket (sources 4 and 5, SPEC §5). */
async function refreshInvolvement(
  deps: Deps,
  ticket: JiraTicket,
  settings: ProjectSettings | null,
  closedAt: string,
): Promise<void> {
  const existing = await deps.stores.involvement.get(ticket.id);
  const candidates = existingCandidate(existing);
  if (settings !== null && settings.adoptionDate !== '') {
    candidates.push(fromAdoptionDate(closedAt, settings.adoptionDate));
  }
  const resolved = resolveInvolvement(
    ticket.id,
    candidates,
    deps.clock.now(),
    existing?.client ?? '',
    existing?.model ?? '',
    existing?.sessionRef ?? '',
  );
  if (resolved !== null) await deps.stores.involvement.save(resolved);
}

/** Builds the outcome of a closed ticket from the frozen L2/L1 pieces. */
async function refreshOutcome(
  deps: Deps,
  ticket: JiraTicket,
  history: StatusHistory,
  settings: ProjectSettings | null,
): Promise<void> {
  const links = await deps.jira.links(ticket.id);
  const waiting = settings?.waitingStatuses ?? [];
  const facts = collectJiraOnly(history, links, ticket.description, null, { waiting });
  const closedAt = closureAt(history);
  const previous = await deps.stores.outcome.get(ticket.id);
  const outcome: Outcome = {
    issueId: ticket.id,
    closedAt,
    leadTimeH: facts.leadTimeH ?? 0,
    reopened: facts.reopened,
    causedBugs: facts.causedBugs,
    neighborBugs: 0,
    incidents: facts.incidents,
    takeover: previous?.takeover ?? false,
    abandoned: isAbandoned(history, waiting),
    clean: closedAt !== '' && cleanClosureFromFacts(facts),
    matureAt: maturityDate(closedAt),
  };
  await deps.stores.outcome.save(outcome);
}

/** Refreshes involvement and outcome of the touched ticket (SPEC §17). */
export async function onIssueUpdated(deps: Deps, event: unknown): Promise<void> {
  const issue = eventIssue(event);
  if (issue.id === '') return;
  const ticket = await deps.jira.getTicket(issue.id);
  if (ticket === null) return;
  const settings = await deps.stores.settings.get(ticket.projectId);
  const history = await deps.jira.statusHistory(ticket.id);
  if (history.closed) {
    await refreshInvolvement(deps, ticket, settings, closureAt(history));
    await refreshOutcome(deps, ticket, history, settings);
    await deps.engine.compute(ticket.id);
  }
}

/** The manifest entry `handlers/events.onEvent` (docs/CONTRACTS.md §6). */
export async function onEvent(deps: Deps, event: unknown): Promise<void> {
  try {
    const kind = eventType(event);
    if (kind === 'created') await onIssueCreated(deps, event);
    else if (kind === 'updated') await onIssueUpdated(deps, event);
    else deps.logger.log('warn', 'unrouted issue event ignored');
  } catch (error: unknown) {
    // The user's edit must never be blocked by the app (SPEC §17, §20).
    deps.logger.log('error', 'issue event failed', error instanceof Error ? error.message : String(error));
  }
}
