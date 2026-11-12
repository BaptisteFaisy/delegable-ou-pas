/**
 * Links between Jira tickets (SPEC §6 "Bug à la suite" / "Incident",
 * SPEC §17 "Historique Jira", DP-04).
 *
 * A "is caused by" link or a JSM incident is read from `issuelinks`, never
 * raising: a missing field becomes `[]` or a `false` flag (SPEC §20). The
 * direction is resolved against our ticket id, so the link type always reads
 * from `issueId` toward the linked ticket.
 *
 * Pure module. Rule: files < 500 lines, functions < 50 lines.
 */
import type { IssueLink, LinkType } from '../types-graph.js';
import { LINK_TYPES } from '../types-graph.js';

/** The relation kind detected on a Jira link, before the direction is applied. */
type LinkKind = 'blocks' | 'causes' | 'relates' | null;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Reads the link kind from the name and the inward/outward labels (tolerant). */
function linkKind(name: unknown, inward: unknown, outward: unknown): LinkKind {
  const text = `${str(name)} ${str(inward)} ${str(outward)}`.toLowerCase();
  if (text.includes('block')) return 'blocks';
  if (text.includes('caus')) return 'causes';
  // Only "relates" is known here: clones, duplicates and any other kind are
  // ignored, not guessed (SPEC §6, tolerance).
  if (text.includes('relat')) return 'relates';
  return null;
}

/** Maps a kind and a direction to the link type from our ticket to the other. */
function typeFor(kind: LinkKind, inward: boolean): LinkType | null {
  if (kind === 'blocks') return inward ? 'is-blocked-by' : 'blocks';
  if (kind === 'causes') return inward ? 'caused-by' : 'causes';
  if (kind === 'relates') return 'relates-to';
  return null;
}

/** Flags read on the linked ticket: incident (JSM) or bug (SPEC §6). */
function flagsOf(linked: Record<string, unknown>): { incident: boolean; bug: boolean } {
  const fields = asRecord(linked['fields']);
  const issuetype = asRecord(fields?.['issuetype']);
  const typeName = str(issuetype?.['name']).toLowerCase();
  const projectType = str(asRecord(fields?.['project'])?.['projectTypeKey']).toLowerCase();
  const incident = typeName.includes('incident') || (projectType === 'service_desk' && typeName === 'issue');
  const bug = typeName === 'bug' || typeName.includes('défaut') || typeName.includes('defect');
  return { incident, bug };
}

function createdAtOf(linked: Record<string, unknown>): string {
  return str(asRecord(linked['fields'])?.['created']);
}

function idOf(issue: Record<string, unknown>): string {
  return str(issue['id']) || str(issue['key']);
}

/**
 * The `issuelinks` array of a ticket → its `IssueLink`s, in the order given.
 * A type outside the five known kinds is ignored (SPEC §6, tolerance).
 */
export function parseIssueLinks(issueId: string, issuelinks: unknown): IssueLink[] {
  if (!Array.isArray(issuelinks)) return [];
  const result: IssueLink[] = [];
  for (const raw of issuelinks) {
    const item = asRecord(raw);
    if (item === null) continue;
    const type = asRecord(item['type']);
    const outward = asRecord(item['outwardIssue']);
    const inward = asRecord(item['inwardIssue']);
    let linked: Record<string, unknown> | null = null;
    let inwardDirection = false;
    if (outward !== null && idOf(outward) === issueId && inward !== null) {
      linked = inward;
      inwardDirection = false;
    } else if (inward !== null && idOf(inward) === issueId && outward !== null) {
      linked = outward;
      inwardDirection = true;
    } else if (outward !== null) {
      linked = outward;
    } else if (inward !== null) {
      linked = inward;
      inwardDirection = true;
    }
    if (linked === null) continue;
    const linkType = typeFor(linkKind(type?.['name'], type?.['inward'], type?.['outward']), inwardDirection);
    if (linkType === null || !LINK_TYPES.includes(linkType)) continue;
    const linkedIssueId = idOf(linked);
    if (linkedIssueId === '') continue;
    const flags = flagsOf(linked);
    result.push({
      issueId,
      linkedIssueId,
      type: linkType,
      linkedIsIncident: flags.incident,
      linkedIsBug: flags.bug,
      createdAt: createdAtOf(linked),
    });
  }
  return result;
}