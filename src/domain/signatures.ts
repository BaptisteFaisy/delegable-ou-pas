/**
 * The tunable catalogue of agent mentions found in commit messages
 * (SPEC §5 "Les mentions de commit", SPEC §17 "Ce que l'app conserve",
 * SPEC §19 "à confirmer"; DP-02).
 *
 * Pure domain: a commit message is read, matched, then dropped. Nothing of the
 * message leaves this module: the result is the fact "mention found or not"
 * plus the agent name (SPEC §17, SPEC §20).
 *
 * The catalogue is tunable: only the `enabled` patterns are applied, from the
 * most specific to the most general, and the first match wins (SPEC §5).
 */
import type { SignatureMatch, SignaturePattern } from '../types.js';
import type { GraphCommit, SeenSignature, SignatureScanInput } from '../types-graph.js';

/**
 * The note every default pattern carries: public sources do not agree on the
 * published formats, so the team has to confirm them (SPEC §19).
 */
export const CONFIRMATION_NOTE = 'à confirmer par l’équipe';

/** Ids of the default patterns (SPEC §5, SPEC §19). */
export const DEFAULT_PATTERN_IDS: readonly string[] = [
  'copilot-agent',
  'claude-code',
  'codex',
  'cursor',
  'copilot',
];

/** Matches the `Co-authored-by` header whatever the case and the spaces (SPEC §5). */
const CO_AUTHORED_BY = 'co[-\\s]*authored[-\\s]*by\\s*:';

/** One default pattern, enabled and never seen yet (DP-02). */
function defaultPattern(id: string, expression: string, agentName: string): SignaturePattern {
  return { id, expression, agentName, enabled: true, seenCount: 0 };
}

/**
 * The default catalogue: Claude Code, Codex, Cursor and Copilot, including the
 * autonomous form of Copilot whose format is not confirmed (SPEC §19).
 */
export function defaultPatterns(): readonly SignaturePattern[] {
  return [
    defaultPattern(
      'copilot-agent',
      `${CO_AUTHORED_BY}[^\\n]*(copilot[^\\n]*agent|agent[^\\n]*copilot)`,
      'Copilot (agent autonome)',
    ),
    defaultPattern('claude-code', `${CO_AUTHORED_BY}[^\\n]*claude`, 'Claude Code'),
    defaultPattern('codex', `${CO_AUTHORED_BY}[^\\n]*codex`, 'Codex'),
    defaultPattern('cursor', `${CO_AUTHORED_BY}[^\\n]*cursor`, 'Cursor'),
    defaultPattern('copilot', `${CO_AUTHORED_BY}[^\\n]*copilot`, 'Copilot'),
  ];
}

/**
 * The note attached to a pattern of the catalogue: every default one is to be
 * confirmed by the team (SPEC §19).
 */
export function patternNote(patternId: string): string {
  return DEFAULT_PATTERN_IDS.includes(patternId) ? CONFIRMATION_NOTE : '';
}

/** Normalises a message: NFC and unified line endings (SPEC §5). */
export function normalizeMessage(message: string): string {
  return message.normalize('NFC').replace(/\r\n?/g, '\n');
}

/** True when the pattern matches; an invalid pattern is ignored (SPEC §19). */
function matchesPattern(pattern: SignaturePattern, message: string): boolean {
  try {
    return new RegExp(pattern.expression, 'i').test(message);
  } catch {
    return false;
  }
}

/**
 * Scans one message against the catalogue and renders the first match:
 * only the enabled patterns are applied (SPEC §5, DP-02).
 */
export function scanMessage(input: SignatureScanInput): SignatureMatch {
  const message = normalizeMessage(input.message);
  for (const pattern of input.patterns) {
    if (!pattern.enabled) continue;
    if (matchesPattern(pattern, message)) {
      return { found: true, agentName: pattern.agentName, patternId: pattern.id };
    }
  }
  return { found: false, agentName: '', patternId: '' };
}

/** Scans one message against the catalogue (SPEC §5). */
export function matchesAny(message: string, patterns: readonly SignaturePattern[]): SignatureMatch {
  return scanMessage({ message, patterns });
}

/** The result of a scan over a list of commits (SPEC §19 "Fusion par écrasement"). */
export interface CommitScan {
  /** The mention found across the commits; the most specific pattern wins. */
  match: SignatureMatch;
  /** The mentions actually seen, so the team can confirm the catalogue (SPEC §5). */
  seen: readonly SeenSignature[];
}

/** Rank of a pattern in the catalogue: the most specific comes first. */
function patternRank(patternId: string, patterns: readonly SignaturePattern[]): number {
  const index = patterns.findIndex(p => p.id === patternId);
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

/** The later of two ISO dates; empty when there is none. */
function latestDate(a: string, b: string): string {
  if (a === '') return b;
  if (b === '') return a;
  return a > b ? a : b;
}

/** The seen mentions, ordered like the catalogue. */
function orderedSeen(
  seen: ReadonlyMap<string, SeenSignature>,
  patterns: readonly SignaturePattern[],
): readonly SeenSignature[] {
  return [...seen.values()].sort(
    (a, b) => patternRank(a.patternId, patterns) - patternRank(b.patternId, patterns),
  );
}

/**
 * Scans a list of commits: a squash may have erased the mention from the final
 * commit, so the branch commits are scanned too (SPEC §19, DP-02).
 */
export function scanCommits(
  commits: readonly GraphCommit[],
  patterns: readonly SignaturePattern[],
): CommitScan {
  const seen = new Map<string, SeenSignature>();
  let best: SignatureMatch = { found: false, agentName: '', patternId: '' };
  let bestRank = Number.MAX_SAFE_INTEGER;
  for (const commit of commits) {
    const match = scanMessage({ message: commit.message, patterns });
    if (!match.found) continue;
    const rank = patternRank(match.patternId, patterns);
    if (rank < bestRank) {
      best = match;
      bestRank = rank;
    }
    const previous = seen.get(match.patternId);
    seen.set(match.patternId, {
      patternId: match.patternId,
      agentName: match.agentName,
      seenCount: (previous?.seenCount ?? 0) + 1,
      lastSeenAt: latestDate(previous?.lastSeenAt ?? '', commit.committedAt),
    });
  }
  return { match: best, seen: orderedSeen(seen, patterns) };
}