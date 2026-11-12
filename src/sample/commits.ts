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
 * Four public agents, one pattern each; `seenCount` is what the settings screen
 * shows so the team can confirm the catalogue (docs/research/R3).
 */
export function sampleSignaturePatterns(): readonly SignaturePattern[] {
  const names: readonly string[] = ['code-agent', 'assistant-agent', 'pilot-agent', 'pair-agent'];
  return names.map((name, index) => ({
    id: `sig-${index + 1}`,
    expression: `Co-authored-by: ${name}`,
    agentName: ROBOT_ACCOUNT,
    enabled: true,
    seenCount: 0,
  }));
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
 * (SPEC §21 "Ticket sans commit").
 */
export function commitsOf(seed: Seed): readonly CommitFact[] {
  if (seed.commits <= 0) return [];
  const signed = signedOf(seed);
  return Array.from({ length: seed.commits }, (_unused, index) => ({
    issueId: seed.id,
    commitRef: commitRefOf(seed, index),
    hasSignature: signed,
    agentName: signed ? ROBOT_ACCOUNT : '',
    authorIsBot: seed.source === 'bot-author',
    committedAt: committedAtOf(seed, index),
  }));
}

/** Every commit fact of the demo dataset. */
export function sampleCommitFacts(seeds: readonly Seed[]): readonly CommitFact[] {
  return seeds.flatMap(commitsOf);
}

/** How many times each pattern of the catalogue was seen (SPEC §18 `seen_count`). */
export function seenCounts(facts: readonly CommitFact[]): readonly SignaturePattern[] {
  const patterns = sampleSignaturePatterns();
  const seen = facts.filter((fact) => fact.hasSignature).length;
  return patterns.map((pattern, index) => ({ ...pattern, seenCount: index === 0 ? seen : 0 }));
}
