/**
 * Nature, zone and size of a ticket — DP-06.
 *
 * SPEC §4 "Nature", §14 DP-06 (rules first, model second, result kept by the
 * fingerprint of the text), §16.5 (project settings: natures, zones, sizes),
 * §17 "Ce que l'app conserve" (a classification is kept by fingerprint),
 * §19 "à valider" (a declared size, otherwise an estimated one),
 * §21 "Ticket sans commit" (work without commit stays out of the code cohorts).
 *
 * Pure domain: no clock, no network, no randomness. The model is reached only
 * through the `LlmGateway` port, the kept results only through `IssueClassStore`.
 */
import type { IssueClass, Nature, Size, Zone } from '../types.js';
import { NATURE_NO_CODE } from '../types.js';
import type { AdfNode, JiraTicket } from '../types-graph.js';
import type { IssueClassStore, LlmGateway, NatureClassification } from '../ports.js';

/* ------------------------------------------------------------------ hashing */

/**
 * A stable fingerprint of a text (SPEC §17 "conservées par empreinte").
 *
 * FNV-1a, 32 bits: deterministic, dependency-free, no clock and no randomness.
 */
export function contentHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a-${hash.toString(16).padStart(8, '0')}`;
}

/* --------------------------------------------------------------- ticket text */

function flattenDescription(node: AdfNode | null): string {
  if (node === null) return '';
  const parts: string[] = [];
  const walk = (current: AdfNode): void => {
    if (typeof current.text === 'string' && current.text.trim() !== '') parts.push(current.text.trim());
    for (const child of current.content ?? []) walk(child);
  };
  walk(node);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * The canonical text of a ticket: what is fingerprinted, and what the model sees.
 *
 * The ticket id is left out on purpose: two tickets with the same wording share
 * one classification (DP-06).
 */
export function ticketText(ticket: JiraTicket): string {
  return [
    ticket.summary.trim(),
    flattenDescription(ticket.description),
    ticket.labels.join(' '),
    ticket.issueType.trim(),
    ticket.components.join(' '),
  ]
    .filter((part) => part !== '')
    .join('\n');
}

/* -------------------------------------------------------------- nature rules */

interface LabelRule {
  readonly label: string;
  readonly nature: Nature;
}

interface TitleRule {
  readonly id: string;
  readonly pattern: RegExp;
  readonly nature: Nature;
}

/** Work without commit: documentation and tooling (SPEC §21, DP-06). */
const NO_CODE_LABELS: readonly string[] = ['documentation', 'doc', 'outillage', 'tooling'];

const LABEL_RULES: readonly LabelRule[] = [
  { label: 'migration', nature: 'data-migration' },
  { label: 'data-migration', nature: 'data-migration' },
  { label: 'ui', nature: 'ui-change' },
  { label: 'interface', nature: 'ui-change' },
  { label: 'ux', nature: 'ui-change' },
  { label: 'refactor', nature: 'refactor' },
  { label: 'refonte', nature: 'refactor' },
  { label: 'tech-debt', nature: 'refactor' },
  { label: 'test', nature: 'tests' },
  { label: 'tests', nature: 'tests' },
  { label: 'coverage', nature: 'tests' },
  { label: 'configuration', nature: 'configuration' },
  { label: 'config', nature: 'configuration' },
  { label: 'chore', nature: 'configuration' },
  { label: 'integration', nature: 'external-integration' },
  { label: 'external', nature: 'external-integration' },
  { label: 'webhook', nature: 'external-integration' },
];

const BUG_TYPES: readonly string[] = ['bug', 'defect', 'bug report', 'bugfix', 'failure'];

const TITLE_RULES: readonly TitleRule[] = [
  { id: 'title:migration', pattern: /\b(migration|migrat\w+)\b/i, nature: 'data-migration' },
  { id: 'title:ui', pattern: /\b(ui|ergonomie|design|interface)\b/i, nature: 'ui-change' },
  { id: 'title:refactor', pattern: /\b(refactor|refonte|clean[-\s]?up|tech[-\s]?debt)\b/i, nature: 'refactor' },
  { id: 'title:tests', pattern: /\b(tests?|coverage)\b/i, nature: 'tests' },
  { id: 'title:documentation', pattern: /\b(doc|documentation)\b/i, nature: NATURE_NO_CODE },
  { id: 'title:integration', pattern: /\b(api|intégration|integration|webhook)\b/i, nature: 'external-integration' },
  { id: 'title:bug', pattern: /\b(bug|correctif|fix)\b/i, nature: 'bugfix' },
];

interface NatureDecision {
  readonly nature: Nature;
  /** The rule that decided, so the screen can say why (DP-06). */
  readonly rule: string;
}

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, '-');
}

function decideByLabels(labels: readonly string[], issueType: string): NatureDecision | null {
  const normalized = labels.map(normalizeLabel);
  const noCode = normalized.find((label) => NO_CODE_LABELS.includes(label));
  if (noCode !== undefined) return { nature: NATURE_NO_CODE, rule: `label:${noCode}` };
  // A label is more specific than the ticket type: it decides first.
  for (const rule of LABEL_RULES) {
    if (normalized.includes(rule.label)) return { nature: rule.nature, rule: `label:${rule.label}` };
  }
  const type = issueType.trim().toLowerCase();
  if (BUG_TYPES.includes(type)) return { nature: 'bugfix', rule: `issue-type:${type}` };
  return null;
}

function decideByTitle(summary: string): NatureDecision | null {
  for (const rule of TITLE_RULES) {
    if (rule.pattern.test(summary)) return { nature: rule.nature, rule: rule.id };
  }
  return null;
}

/**
 * The nature of a ticket from its type and its labels (SPEC §4, DP-06).
 *
 * Null when the rules do not decide: the model then has the word (DP-06).
 */
export function natureFromLabels(labels: readonly string[], issueType: string): Nature | null {
  return decideByLabels(labels, issueType)?.nature ?? null;
}

/** The nature of a ticket from the words of its title; null when nothing matches. */
export function natureFromTitle(summary: string): Nature | null {
  return decideByTitle(summary)?.nature ?? null;
}

/* --------------------------------------------------------------- zone, size */

/** The standard size ladder, used when the project declares none (SPEC §16.5). */
export const DEFAULT_SIZES: readonly Size[] = ['S', 'M', 'L', 'XL'];

/** Story point ceilings of the ladder, from the smallest size to the biggest. */
const POINT_CEILINGS: readonly number[] = [1, 3, 8, 21];

/** Duration ceilings in hours, used to estimate a size from similar tickets. */
const HOUR_CEILINGS: readonly number[] = [8, 24, 56, 120];

const SIZE_FIELD_KEYS: readonly string[] = ['size', 'taille', 'customfield_10004'];

function ceilingIndex(value: number, ceilings: readonly number[], count: number): number {
  for (let index = 0; index < ceilings.length; index += 1) {
    if (value <= ceilings[index]) return Math.min(index, count - 1);
  }
  return count - 1;
}

function middleSize(sizes: readonly Size[]): Size {
  return sizes[Math.floor((sizes.length - 1) / 2)];
}

/**
 * The size of a ticket from its story points (SPEC §19).
 *
 * A missing story point gives an estimated size: the SPEC allows it explicitly.
 */
export function sizeFromStoryPoints(
  storyPoints: number | null,
  sizes: readonly Size[],
): { readonly size: Size; readonly estimated: boolean } {
  if (sizes.length === 0) return { size: '', estimated: true };
  if (storyPoints === null) return { size: middleSize(sizes), estimated: true };
  return { size: sizes[ceilingIndex(storyPoints, POINT_CEILINGS, sizes.length)], estimated: false };
}

/**
 * An estimated size, from the median duration of the tickets that look alike
 * (SPEC §19 "à valider", fallback of the declared size).
 */
export function sizeFromSimilarDurations(
  medianH: number | null,
  sizes: readonly Size[],
): { readonly size: Size; readonly estimated: boolean } {
  if (sizes.length === 0) return { size: '', estimated: true };
  if (medianH === null) return { size: middleSize(sizes), estimated: true };
  return { size: sizes[ceilingIndex(medianH, HOUR_CEILINGS, sizes.length)], estimated: true };
}

/** The size declared by the project on the ticket itself; null when there is none. */
export function declaredSize(ticket: JiraTicket): Size | null {
  for (const key of SIZE_FIELD_KEYS) {
    const value = (ticket.customFields[key] ?? '').trim();
    if (value !== '') return value;
  }
  return null;
}

/** The zone of a ticket: its component, or the zone field of the project. */
export function zoneOf(ticket: JiraTicket): Zone {
  for (const component of ticket.components) {
    const trimmed = component.trim();
    if (trimmed !== '') return trimmed;
  }
  return (ticket.customFields['zone'] ?? ticket.customFields['component'] ?? '').trim();
}

/** The size of a ticket: the declared one, otherwise the one from the story points. */
export function sizeOf(
  ticket: JiraTicket,
  sizes: readonly Size[] = DEFAULT_SIZES,
): { readonly size: Size; readonly estimated: boolean } {
  const declared = declaredSize(ticket);
  if (declared !== null) return { size: declared, estimated: false };
  return sizeFromStoryPoints(ticket.storyPoints, sizes);
}

/* ------------------------------------------------------------ classification */

/** A classification made by the rules, with the rule that decided (DP-06). */
export interface RuleClassification {
  readonly issueClass: IssueClass;
  readonly rule: string;
}

function classifyByRulesDetailed(
  ticket: JiraTicket,
  sizes: readonly Size[] = DEFAULT_SIZES,
): RuleClassification | null {
  const decision = decideByLabels(ticket.labels, ticket.issueType) ?? decideByTitle(ticket.summary);
  if (decision === null) return null;
  const size = sizeOf(ticket, sizes);
  return {
    issueClass: {
      issueId: ticket.id,
      nature: decision.nature,
      zone: zoneOf(ticket),
      size: size.size,
      classifiedBy: 'rules',
      contentHash: contentHash(ticketText(ticket)),
      sizeEstimated: size.estimated,
    },
    rule: decision.rule,
  };
}

/** The classification made by the rules; null when the rules do not decide. */
export function classifyByRules(ticket: JiraTicket): IssueClass | null {
  return classifyByRulesDetailed(ticket)?.issueClass ?? null;
}

/**
 * The classification built from the proposal of the model (DP-06).
 *
 * The rationale of the model is kept by the caller, with the proposal itself.
 */
export function classifyWithModel(
  ticket: JiraTicket,
  proposal: NatureClassification,
  contentHash: string,
): IssueClass {
  const size = sizeOf(ticket);
  return {
    issueId: ticket.id,
    nature: proposal.nature,
    zone: zoneOf(ticket),
    size: size.size,
    classifiedBy: 'model',
    contentHash,
    sizeEstimated: size.estimated,
  };
}

/** A ticket with no commit at all is work without commit (SPEC §21). */
export function asNoCode(issueClass: IssueClass): IssueClass {
  return { ...issueClass, nature: NATURE_NO_CODE };
}

/** False for the nature reserved to the work that stays out of the code cohorts. */
export function isCodeNature(nature: Nature): boolean {
  return nature !== NATURE_NO_CODE;
}

/* ------------------------------------------------------------- orchestration */

/** What the classification needs to run: a model, a place to keep the results. */
export interface ClassificationDeps {
  /** The model port; null means the rules-only fallback (SPEC §19). */
  readonly llm: LlmGateway | null;
  /** Where a classification is kept, by fingerprint of the text (DP-06). */
  readonly store: IssueClassStore | null;
  /** The natures the project declares (SPEC §16.5). */
  readonly natures: readonly Nature[];
  /** The sizes the project declares; the standard ladder by default. */
  readonly sizes?: readonly Size[];
  /** True when the ticket has no commit at all (SPEC §21). */
  readonly hasNoCommit?: boolean;
}

async function cachedClassification(
  ticket: JiraTicket,
  hash: string,
  store: IssueClassStore | null,
): Promise<IssueClass | null> {
  if (store === null) return null;
  const found = await store.getByContentHash(ticket.projectId, hash);
  if (found === null) return null;
  return { ...found, issueId: ticket.id };
}

async function keepClassification(issueClass: IssueClass, deps: ClassificationDeps): Promise<IssueClass> {
  const result = deps.hasNoCommit === true ? asNoCode(issueClass) : issueClass;
  if (deps.store !== null) await deps.store.save(result);
  return result;
}

/**
 * The classification of a ticket: rules first, model second, kept by
 * fingerprint of the text (DP-06).
 *
 * The same text is never classified twice: the kept result is read before any
 * call to the model, so two tickets with the same wording cost one call only.
 */
export async function classifyTicket(
  ticket: JiraTicket,
  deps: ClassificationDeps,
): Promise<IssueClass | null> {
  const sizes = deps.sizes ?? DEFAULT_SIZES;
  const hash = contentHash(ticketText(ticket));
  const cached = await cachedClassification(ticket, hash, deps.store);
  if (cached !== null) return cached;
  const ruled = classifyByRulesDetailed(ticket, sizes);
  if (ruled !== null) return keepClassification(ruled.issueClass, deps);
  if (deps.llm === null) return null;
  const proposal = await deps.llm.classifyNature(ticketText(ticket), deps.natures);
  if (!deps.natures.includes(proposal.nature)) return null;
  return keepClassification(classifyWithModel(ticket, proposal, hash), deps);
}
