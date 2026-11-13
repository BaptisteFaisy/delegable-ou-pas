/**
 * The five sources of involvement, from the safest to the least safe
 * (SPEC §5 "Cinq sources", SPEC §13; DP-01, DP-03).
 *
 * The app keeps the best available source and displays it (DP-01). The absence
 * of a mention proves nothing: with no evidence in either direction the
 * involvement stays `unknown`, and `unknown` is never counted as "without
 * agent" (SPEC §5, DP-03, recipe 2).
 */
import type { CommitFact, Involvement, Level, ProportionStat, SourceCandidate } from '../types.js';
import type { InvolvementDeclaration } from '../ports.js';
import { SOURCE_ORDER } from '../types.js';
import { proportion } from './stats.js';

/**
 * Evidence keys joined with `;`: a key or a count, never a free-text quote,
 * never a person (SPEC §17). `resolveInvolvement` splits them back into the
 * list carried by the involvement.
 */
function evidenceOf(entries: readonly (readonly [string, string])[]): string {
  return entries
    .filter(([, value]) => value !== '')
    .map(([key, value]) => `${key}:${value}`)
    .join(';');
}

/** A share written with two decimals (SPEC §21). */
function formatShare(share: number): string {
  return String(Math.round(share * 100) / 100);
}

/**
 * The share of commits carrying an agent signature, in [0, 1].
 * Mixed commits: some signed, some not (SPEC §21).
 */
export function signedShare(facts: readonly CommitFact[]): number {
  if (facts.length === 0) return 0;
  const signed = facts.filter(fact => fact.hasSignature).length;
  return signed / facts.length;
}

/**
 * Source 1 — the declaration made through the MCP tool `record-involvement`:
 * the safest source, it carries the level, the tool, the model and the session
 * (SPEC §5, SPEC §15).
 */
export function fromDeclaration(decl: InvolvementDeclaration, at: string): SourceCandidate {
  return {
    source: 'mcp-declaration',
    level: decl.level,
    evidence: evidenceOf([
      ['declared-by', decl.client],
      ['model', decl.model],
      ['session', decl.session],
      ['at', at],
    ]),
  };
}

/**
 * Source 2 — the commit or pull request written by a robot account: autonomous
 * work, and only that case (SPEC §5).
 */
export function fromBotAuthor(facts: readonly CommitFact[]): SourceCandidate | null {
  const bots = facts.filter(fact => fact.authorIsBot);
  if (bots.length === 0) return null;
  return {
    source: 'bot-author',
    level: 'autonomous',
    evidence: evidenceOf([
      ['bot-commits', String(bots.length)],
      ['signed-share', formatShare(signedShare(facts))],
    ]),
  };
}

/**
 * Source 3 — a mention in a commit message: an agent co-wrote the commit.
 * Its absence proves nothing (SPEC §5, SPEC §21 "commits mêlés").
 */
export function fromCommitMention(
  facts: readonly CommitFact[],
  at: string,
): SourceCandidate | null {
  const mentioned = facts.filter(fact => fact.hasSignature);
  if (mentioned.length === 0) return null;
  return {
    source: 'commit-mention',
    level: 'assisted',
    evidence: evidenceOf([
      ['mention', mentioned[0]?.agentName ?? ''],
      ['signed-share', formatShare(signedShare(facts))],
      ['seen-at', at],
    ]),
  };
}

/** The levels a closure field can declare, written by the developer (SPEC §5). */
const CLOSURE_LEVELS: ReadonlyMap<string, Level> = new Map([
  ['aucune', 'none'],
  ['aucun', 'none'],
  ['none', 'none'],
  ['humain', 'none'],
  ['humaine', 'none'],
  ['human', 'none'],
  ['sans agent', 'none'],
  ['manuelle', 'none'],
  ['manuel', 'none'],
  ['assistee', 'assisted'],
  ['assiste', 'assisted'],
  ['assisted', 'assisted'],
  ['pilotee', 'driven'],
  ['pilote', 'driven'],
  ['pilotage', 'driven'],
  ['driven', 'driven'],
  ['autonome', 'autonomous'],
  ['autonomous', 'autonomous'],
  ['inconnue', 'unknown'],
  ['inconnu', 'unknown'],
  ['unknown', 'unknown'],
]);

/** The declared label, lowercased and stripped of its accents (SPEC §5). */
function closureLabel(value: string): string {
  const first = value.split(/[(,;:]/)[0] ?? '';
  return first
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Source 4 — the "Implication d'agent" field filled at closure: declarative,
 * the level comes from the developer (SPEC §5).
 */
export function fromClosureField(value: string): SourceCandidate | null {
  const level = CLOSURE_LEVELS.get(closureLabel(value));
  if (level === undefined) return null;
  return { source: 'closure-field', level, evidence: evidenceOf([['declared', level]]) };
}

/**
 * Source 5 — the adoption date of the agents by the team: everything before
 * that date is work without an agent, by construction (SPEC §5, recipe 3).
 * A ticket closed after the adoption date says nothing: the involvement stays
 * unknown (DP-03).
 */
export function fromAdoptionDate(closedAt: string, adoptionDate: string): SourceCandidate {
  const closed = Date.parse(closedAt);
  const adopted = Date.parse(adoptionDate);
  const before = Number.isFinite(closed) && Number.isFinite(adopted) && closed < adopted;
  if (before) {
    return {
      source: 'adoption-date',
      level: 'none',
      evidence: evidenceOf([['closed-before-adoption', adoptionDate]]),
    };
  }
  return {
    source: 'adoption-date',
    level: 'unknown',
    evidence: evidenceOf([['adoption', adoptionDate]]),
  };
}

/**
 * The safest available source, and the one displayed (DP-01).
 * `null` when there is no source at all (DP-03).
 */
export function bestCandidate(candidates: readonly SourceCandidate[]): SourceCandidate | null {
  let best: SourceCandidate | null = null;
  for (const candidate of candidates) {
    if (best === null || SOURCE_ORDER[candidate.source] < SOURCE_ORDER[best.source]) {
      best = candidate;
    }
  }
  return best;
}

/**
 * The involvement of one ticket, read from its best source (DP-01).
 * `null` when no source is available: the caller then writes `level: 'unknown'`,
 * never `'none'` (DP-03, recipe 2).
 */
export function resolveInvolvement(
  issueId: string,
  candidates: readonly SourceCandidate[],
  decidedAt: string,
  client: string,
  model: string,
  sessionRef: string,
): Involvement | null {
  const best = bestCandidate(candidates);
  if (best === null) return null;
  return {
    issueId,
    level: best.level,
    source: best.source,
    client,
    model,
    sessionRef,
    evidence: best.evidence === '' ? [] : best.evidence.split(';'),
    decidedAt,
  };
}

/**
 * The "taux d'implication connue" health indicator (SPEC §13): the share of
 * tickets whose involvement is known, with its sample size and its Wilson
 * interval, computed by L1 `proportion` (SPEC §7 rule 3).
 */
export function knownInvolvement(involvements: readonly Involvement[]): ProportionStat {
  const known = involvements.filter(involvement => involvement.level !== 'unknown').length;
  return proportion(known, involvements.length);
}