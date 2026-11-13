/**
 * SPEC §5, §17 · DP-02, DP-20 — the commits of the demo dataset.
 *
 * The message of a commit is never stored: only "mention found or not" and the
 * agent name read in it (SPEC §17). The demo therefore produces `CommitFact`
 * rows, never messages, and the mentions it carries are the ones of the
 * tunable catalogue of SPEC §5 (DP-02) — confirmed by the team, never guessed.
 */
import type { CommitFact, SignaturePattern } from '../types.js';
import type { Seed } from './issues.js';
import { ROBOT_ACCOUNT } from './history.js';
import { addHours, contentHash, instantOf } from './project.js';

/**
 * The commit-mention catalogue the demo project declares (SPEC §5, DP-02).
 *
 * The four tools the team uses, one pattern each, plus one mention seen in the
 * wild that nobody recognised yet: it stays disabled and the settings screen
 * says it has to be confirmed (SPEC §5 "à confirmer par l'équipe").
 */
export function sampleSignaturePatterns(): readonly SignaturePattern[] {
  const tools: readonly string[] = ['Claude Code', 'Codex', 'Cursor', 'Copilot'];
  const patterns: SignaturePattern[] = tools.map((name, index) => ({
    id: `sig-${index + 1}`,
    expression: `Co-authored-by: ${name}${name === 'Copilot' ? ' [agent]' : ''}`,
    agentName: ROBOT_ACCOUNT,
    enabled: true,
    seenCount: 0,
  }));
  patterns.push({
    id: 'sig-5',
    expression: 'Co-authored-by: (mention non reconnue / unrecognised mention)',
    agentName: '',
    enabled: false,
    seenCount: 0,
  });
  return patterns;
}

/** A stable commit reference: the ticket key and a fingerprint of its place. */
export function commitRefOf(seed: Seed, index: number): string {
  return `${seed.key.toLowerCase()}-${contentHash(`${seed.key}#${index}`).slice(-10)}`;
}

/** The date of one commit, between the creation and the closure of the ticket. */
function committedAtOf(seed: Seed, index: number): string {
  const start = instantOf(seed.createdAt);
  const end = instantOf(seed.closedAt === '' ? seed.updatedAt : seed.closedAt);
  const span = Math.max(1, end - start);
  return addHours(seed.createdAt, (span / 3_600_000) * ((index + 1) / (seed.commits + 1)));
}

/** True when the commits of a ticket carry an agent mention (SPEC §5 source 3). */
function signedOf(seed: Seed): boolean {
  return seed.source === 'commit-mention' || seed.source === 'bot-author';
}

/**
 * The commit facts of one ticket (SPEC §18 table `commit_fact`).
 *
 * A ticket without code has no commit at all: an empty list, never an error
 * (SPEC §21 "Ticket sans commit"). A ticket may mix signed and unsigned
 * commits: only the first ones carry the mention (SPEC §5, recipe 6).
 */
export function commitsOf(seed: Seed): readonly CommitFact[] {
  if (seed.commits <= 0) return [];
  const signed = signedOf(seed);
  return Array.from({ length: seed.commits }, (_unused, index) => {
    const hasSignature = seed.signedCommits > 0 ? index < seed.signedCommits : signed;
    return {
      issueId: seed.id,
      commitRef: commitRefOf(seed, index),
      hasSignature,
      agentName: hasSignature ? ROBOT_ACCOUNT : '',
      authorIsBot: seed.source === 'bot-author',
      committedAt: committedAtOf(seed, index),
    };
  });
}

/** Every commit fact of the demo dataset. */
export function sampleCommitFacts(seeds: readonly Seed[]): readonly CommitFact[] {
  return seeds.flatMap(commitsOf);
}

/** How many times each pattern of the catalogue was seen (SPEC §18 `seen_count`). */
export function seenCounts(facts: readonly CommitFact[]): readonly SignaturePattern[] {
  const patterns = sampleSignaturePatterns();
  const signed = facts.filter((fact) => fact.hasSignature);
  const enabled = patterns.filter((pattern) => pattern.enabled);
  return patterns.map((pattern) => {
    if (!pattern.enabled) return { ...pattern, seenCount: 0 };
    const rank = enabled.findIndex((item) => item.id === pattern.id);
    const seen = signed.filter((_fact, position) => position % enabled.length === rank).length;
    return { ...pattern, seenCount: seen };
  });
}
