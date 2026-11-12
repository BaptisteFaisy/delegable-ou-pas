/**
 * Atlassian Document Format (ADF) reading and acceptance-criteria detection
 * (SPEC §8 "critères d'acceptation", SPEC §16, SPEC §17 "Historique Jira", DP-04).
 *
 * The description is a tree of `AdfNode` (type / attrs / content / text). It is
 * parsed, never guessed: a criteria block is recognised by a heading carrying
 * the label, and counted from the items that follow. A missing field is normal
 * (`null` / `''` / `false`), never an exception (SPEC §20 "données absentes").
 *
 * Pure module: no `@forge/*`, no network, testable without a runtime.
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { AdfNode } from '../types-graph.js';

/** Criteria headings the app recognises, in French and in English (SPEC §20). */
const CRITERIA_HEADING = /^(?:crit[èe]res?\s+d['’]?\s*acceptation|acceptance\s+criteria)\s*$/i;

/** Visible text of an ADF node, recursed; a raw string passes through. */
export function adfTextOf(node: unknown): string {
  if (typeof node === 'string') return node;
  if (node === null || typeof node !== 'object') return '';
  const value = node as Partial<AdfNode>;
  if (typeof value.text === 'string') return value.text;
  if (!Array.isArray(value.content)) return '';
  return value.content.map(adfTextOf).join('').trim();
}

/** Description (ADF object or plain text) → root node, `null` when there is none. */
export function parseDescriptionAdf(description: unknown): AdfNode | null {
  if (description === null || description === undefined) return null;
  if (typeof description === 'string') {
    const trimmed = description.trim();
    return trimmed === '' ? null : { type: 'doc', content: [{ type: 'text', text: trimmed }] };
  }
  if (typeof description !== 'object') return null;
  const doc = description as Partial<AdfNode>;
  if (doc.type === undefined && doc.content === undefined) return null;
  return description as AdfNode;
}

/** A heading node whose text announces the acceptance criteria (SPEC §8). */
function isCriteriaHeading(node: AdfNode): boolean {
  return node.type === 'heading' && CRITERIA_HEADING.test(adfTextOf(node).trim());
}

/** A list item / task item, the unit counted under a criteria heading. */
function isCriteriaItem(node: AdfNode): boolean {
  return node.type === 'listItem' || node.type === 'taskItem';
}

/** The criteria found under the first matching heading, counted one level deep. */
function criteriaAfter(content: readonly AdfNode[]): number {
  let count = 0;
  for (const child of content) {
    if (isCriteriaHeading(child)) break;
    if (isCriteriaItem(child)) count += 1;
    const nested = Array.isArray(child.content) ? criteriaAfter(child.content) : 0;
    count += nested;
  }
  return count;
}

/**
 * Acceptance criteria in a description: present when a criteria heading exists
 * with at least one item under it (SPEC §8 "présence de critères d'acceptation").
 */
export function acceptanceCriteria(description: AdfNode | null): { present: boolean; count: number } {
  if (description === null) return { present: false, count: 0 };
  const content = Array.isArray(description.content) ? description.content : [];
  for (let i = 0; i < content.length; i += 1) {
    if (!isCriteriaHeading(content[i])) continue;
    const count = criteriaAfter(content.slice(i + 1));
    if (count > 0) return { present: true, count };
  }
  if (Array.isArray(description.content)) {
    const nested = description.content.find((child) => child.type === 'doc' || child.type === 'section');
    if (nested !== undefined && nested.content !== undefined) {
      const found = acceptanceCriteria(nested);
      if (found.present) return found;
    }
  }
  return { present: false, count: 0 };
}

/**
 * True when the description carries an acceptance criteria block, whatever the
 * tree depth (SPEC §8, DP-04).
 */
export function hasAcceptanceCriteria(description: AdfNode | null): boolean {
  if (description === null) return false;
  if (isCriteriaHeading(description)) return true;
  if (!Array.isArray(description.content)) return false;
  return description.content.some((child) => hasAcceptanceCriteria(child));
}

/** Description ADF → plain text, one block per line (read by the domain, SPEC §17). */
export function adfToPlainText(description: AdfNode | null): string {
  if (description === null) return '';
  return renderNodeLines(description)
    .filter((line) => line.trim().length > 0)
    .join('\n');
}

function renderNodeLines(node: AdfNode): string[] {
  if (node.type === 'bulletList' || node.type === 'orderedList') {
    return (node.content ?? []).map((item) => `- ${adfTextOf(item)}`);
  }
  if (node.type === 'heading') {
    return [`## ${adfTextOf(node)}`];
  }
  if (Array.isArray(node.content)) {
    return node.content.flatMap(renderNodeLines);
  }
  const text = adfTextOf(node);
  return text === '' ? [] : [text];
}