/**
 * Adapter — verifies the executable conditions on one pull request and its
 * commits (SPEC §12, SPEC §17 "Ce qu'impose le graphe", SPEC §19; DP-17).
 *
 * It reads only what the graph really exposes and produces `ConditionFact`
 * for the domain (`conditions.ts`); it never concludes — the report is built
 * by `checkConditions`, nowhere else (zero duplication).
 *
 * The frozen contract gives no file list on a commit (SPEC §19): migration
 * detection goes through the file paths of the commits when a read exposes
 * them (`CommitForConditions.filePaths`, optional), and falls back to the
 * message patterns otherwise — the `detail` always says which way was used.
 *
 * A commit message is read, matched, then dropped: no message, no file path,
 * no account id is ever stored or returned (SPEC §17, SPEC §20, DP-17).
 */
import type { GraphCommit, GraphPullRequest } from '../types-graph.js';
import type { ConditionFact } from '../domain/conditions.js';
import { reviewFact } from '../domain/review.js';

/**
 * A commit as read for the conditions: the frozen `GraphCommit` plus, when the
 * read exposes them, the file paths it changed. Optional: without paths the
 * detection falls back to the message patterns (SPEC §19).
 */
export interface CommitForConditions extends GraphCommit {
  readonly filePaths?: readonly string[];
}

/** Options of the verification: the patterns that reveal a migration. */
export interface VerifyOptions {
  readonly testPathPatterns?: readonly string[];
}

/** The default migration patterns, matched on paths and messages alike. */
export const DEFAULT_TEST_PATH_PATTERNS: readonly string[] = [
  'migration',
  'migrate',
  'flyway',
  'liquibase',
  'alembic',
];

/** True when the text contains one of the patterns, case-insensitive. */
function matches(text: string, patterns: readonly string[]): boolean {
  const lowered = text.toLowerCase();
  return patterns.some(pattern => lowered.includes(pattern.toLowerCase()));
}

/**
 * Detects a migration test on the commits of a pull request (SPEC §12):
 * first by the file paths of the commits when they are available, only then
 * by the message patterns — and the `detail` says which way was used, with
 * counts only. No message, no path, no identifier is ever returned (DP-17).
 */
export function detectMigrationTest(
  commits: readonly CommitForConditions[],
  patterns: readonly string[],
): { found: boolean; detail: string } {
  if (commits.length === 0) {
    return {
      found: false,
      detail: 'no commit read — aucun commit lu',
    };
  }
  const withPaths = commits.filter(
    commit => commit.filePaths !== undefined && commit.filePaths.length > 0,
  );
  if (withPaths.length > 0) {
    const hits = withPaths.reduce(
      (total, commit) =>
        total + (commit.filePaths ?? []).filter(path => matches(path, patterns)).length,
      0,
    );
    return {
      found: hits > 0,
      detail:
        `detected from file paths: ${hits} matching path(s) over ${withPaths.length} commit(s) with paths`
        + ` — détecté par les chemins de fichiers : ${hits} chemin(s) correspondant(s) sur ${withPaths.length} commit(s) avec chemins`,
    };
  }
  const hits = commits.filter(commit => matches(commit.message, patterns)).length;
  return {
    found: hits > 0,
    detail:
      `the graph exposes no file path (SPEC §19): detected from message patterns, ${hits}/${commits.length} commit(s) matched`
      + ` — le graphe n'expose aucun chemin de fichier (SPEC §19) : détecté par motif de message, ${hits}/${commits.length} commit(s) correspondant(s)`,
  };
}

/** The migration fact: null when no commit could be read at all (SPEC §5). */
function migrationTestFact(
  commits: readonly CommitForConditions[],
  patterns: readonly string[],
): ConditionFact {
  if (commits.length === 0) {
    return {
      kind: 'migration-test',
      observed: null,
      detail: 'no commit available — aucun commit disponible',
    };
  }
  const detection = detectMigrationTest(commits, patterns);
  return { kind: 'migration-test', observed: detection.found, detail: detection.detail };
}

/**
 * The two-reviewers fact: the distinct reviewer count comes from `review.ts`
 * (zero duplication); the account ids are counted, never returned (SPEC §7
 * rule 8, DP-17).
 */
function twoReviewersFact(pr: GraphPullRequest): ConditionFact {
  const count = reviewFact(pr.ref, pr).reviewerCount;
  return {
    kind: 'two-reviewers',
    observed: count >= 2,
    detail:
      `${count} distinct reviewer(s) on the pull request`
      + ` — ${count} relecteur(s) distinct(s) sur la pull request`,
  };
}

/**
 * Reads one pull request and its commits and returns the facts the graph can
 * support: the migration test and the two reviewers. The remaining kinds
 * (acceptance criteria, zone owner, evidence, sensitive zone) live in Jira or
 * in the settings: the adapter emits no fact for them, and the domain turns
 * the absence into `satisfied: null` — never into a zero that looks measured
 * (SPEC §5, SPEC §17).
 */
export function verifyOnPullRequest(
  pr: GraphPullRequest,
  commits: readonly CommitForConditions[],
  options: VerifyOptions = {},
): readonly ConditionFact[] {
  const patterns = options.testPathPatterns ?? DEFAULT_TEST_PATH_PATTERNS;
  return [migrationTestFact(commits, patterns), twoReviewersFact(pr)];
}
