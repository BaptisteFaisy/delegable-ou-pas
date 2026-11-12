/**
 * Tests of the condition adapter (SPEC §12, SPEC §17, SPEC §19; DP-17).
 * Aucun réseau : les commits et la PR viennent des fakes déterministes.
 */
import { describe, expect, it } from 'vitest';
import type { GraphCommit } from '../../src/types-graph.js';
import {
  DEFAULT_TEST_PATH_PATTERNS,
  detectMigrationTest,
  verifyOnPullRequest,
} from '../../src/collect/verify-conditions.js';
import type { CommitForConditions } from '../../src/collect/verify-conditions.js';
import { commit, pullRequest, reviewer } from './fakes.js';

/** A commit whose read exposes the file paths it changed. */
function commitWithPaths(ref: string, message: string, filePaths: readonly string[]): CommitForConditions {
  return { ...commit(ref, message), filePaths };
}

const SECRET_MESSAGE = 'WIP do-not-leak this message';

describe('detectMigrationTest — paths first, message pattern only as fallback', () => {
  it('detects through the file paths when the read exposes them', () => {
    const commits = [commitWithPaths('c1', SECRET_MESSAGE, ['db/migration/V3__add_column.sql'])];
    const detection = detectMigrationTest(commits, DEFAULT_TEST_PATH_PATTERNS);
    expect(detection.found).toBe(true);
    expect(detection.detail).toContain('chemins de fichiers');
    expect(detection.detail).toContain('file paths');
  });

  it('says not found when paths are exposed but none matches', () => {
    const commits = [commitWithPaths('c1', 'fix typo', ['src/ui/Button.tsx'])];
    const detection = detectMigrationTest(commits, DEFAULT_TEST_PATH_PATTERNS);
    expect(detection.found).toBe(false);
  });

  it('falls back to message patterns when the graph exposes no path, and says so', () => {
    const commits = [commit('c1', 'add a replayable migration test'), commit('c2', 'fix typo')];
    const detection = detectMigrationTest(commits, DEFAULT_TEST_PATH_PATTERNS);
    expect(detection.found).toBe(true);
    expect(detection.detail).toContain('SPEC §19');
    expect(detection.detail).toContain('motif de message');
    expect(detection.detail).toContain('1/2');
  });

  it('prefers the paths as soon as one commit exposes them', () => {
    const commits: readonly CommitForConditions[] = [
      commitWithPaths('c1', 'migration everywhere in this message', ['src/app.ts']),
      commit('c2', 'migration mentioned but no path exposed'),
    ];
    const detection = detectMigrationTest(commits, DEFAULT_TEST_PATH_PATTERNS);
    // The message mentions a migration, but the exposed path does not: paths win.
    expect(detection.found).toBe(false);
    expect(detection.detail).toContain('file paths');
  });

  it('accepts a custom pattern list and reports no commit on an empty read', () => {
    const custom = detectMigrationTest([commit('c1', 'rejouer la bascule')], ['bascul']);
    expect(custom.found).toBe(true);
    const empty = detectMigrationTest([], DEFAULT_TEST_PATH_PATTERNS);
    expect(empty.found).toBe(false);
    expect(empty.detail).toContain('aucun commit');
  });
});

describe('verifyOnPullRequest — facts the graph can support', () => {
  it('emits exactly the migration test and the two reviewers', () => {
    const pr = pullRequest('pr-1', {
      reviewers: [reviewer('acct-1', 'approved'), reviewer('acct-2', 'none')],
    });
    const facts = verifyOnPullRequest(pr, [commitWithPaths('c1', 'x', ['db/migrations/1.sql'])]);
    expect(facts.map(entry => entry.kind)).toEqual(['migration-test', 'two-reviewers']);
    expect(facts[0]?.observed).toBe(true);
    expect(facts[1]?.observed).toBe(true);
    expect(facts[1]?.detail).toContain('2');
  });

  it('observes one reviewer as a failure of two-reviewers', () => {
    const pr = pullRequest('pr-1', { reviewers: [reviewer('acct-1', 'approved')] });
    const facts = verifyOnPullRequest(pr, [commit('c1', 'fix')]);
    expect(facts[1]?.observed).toBe(false);
  });

  it('turns an empty commit read into an unknown, never into a zero', () => {
    const facts = verifyOnPullRequest(pullRequest('pr-1'), []);
    expect(facts[0]?.kind).toBe('migration-test');
    expect(facts[0]?.observed).toBeNull();
  });

  it('accepts plain frozen GraphCommit values (no path field)', () => {
    const plain: readonly GraphCommit[] = [commit('c1', 'add migration test')];
    const facts = verifyOnPullRequest(pullRequest('pr-1'), plain);
    expect(facts[0]?.observed).toBe(true);
    expect(facts[0]?.detail).toContain('SPEC §19');
  });

  it('stores and returns no commit message and no person identifier (DP-17)', () => {
    const pr = pullRequest('pr-secret', {
      reviewers: [reviewer('acct-do-not-leak', 'approved'), reviewer('acct-2', 'none')],
    });
    const commits = [
      commitWithPaths('c1', SECRET_MESSAGE, ['db/migration/V1__x.sql']),
      commit('c2', SECRET_MESSAGE),
    ];
    const facts = verifyOnPullRequest(pr, commits);
    const serialised = JSON.stringify(facts);
    expect(serialised).not.toContain('do-not-leak');
    expect(serialised).not.toContain(SECRET_MESSAGE);
    expect(serialised).not.toContain('acct-do-not-leak');
    expect(serialised).not.toContain('pr-secret');
    // The detection itself still works without the message travelling.
    expect(facts[0]?.observed).toBe(true);
  });

  it('returns only counts and the method in every detail', () => {
    const pr = pullRequest('pr-1', { reviewers: [reviewer('acct-9', 'none')] });
    const facts = verifyOnPullRequest(pr, [commit('c1', 'message with migration inside')], {
      testPathPatterns: ['inside'],
    });
    for (const entry of facts) {
      expect(typeof entry.detail).toBe('string');
      expect(entry.detail.length).toBeGreaterThan(0);
      expect(entry.detail).not.toContain('message with');
    }
    expect(facts[0]?.observed).toBe(true);
  });
});
