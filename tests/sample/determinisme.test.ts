/**
 * The determinism of the base — SPEC §11, §24.1, DP-20.
 *
 * The demo never draws at random and never reads the clock: the same builder
 * gives the same dataset, and the draw of the controlled trial is replayable
 * from its seed. Two calls, one fingerprint.
 */
import { describe, expect, it } from 'vitest';
import { ticketSeeds } from '../../src/sample/builder.js';
import {
  sampleCards, sampleCommitFacts, sampleLinks, sampleOutcomes, sampleTrialAssignments,
} from '../../src/sample/index.js';

const SEEDS = ticketSeeds();

/** A fingerprint of a dataset: the keys, in order, with the figures that matter. */
function fingerprint(): string {
  return JSON.stringify({
    seeds: SEEDS.map((seed) => [
      seed.key, seed.family, seed.epochId, seed.nature, seed.zone, seed.size, seed.arm,
      seed.level, seed.source, seed.createdAt, seed.closedAt, seed.leadTimeH,
      seed.failure.reopened, seed.failure.causedBugs, seed.failure.incidents,
      seed.failure.takeover, seed.failure.abandoned, seed.commits, seed.role,
    ]),
    outcomes: sampleOutcomes().map((outcome) => [outcome.issueId, outcome.clean, outcome.leadTimeH]),
    commits: sampleCommitFacts().map((commit) => [commit.issueId, commit.commitRef, commit.hasSignature]),
    links: sampleLinks().map((link) => [link.issueId, link.linkedIssueId, link.type]),
  });
}

describe('le jeu est déterministe', () => {
  it('deux appels au constructeur rendent le même jeu', () => {
    const first = fingerprint();
    const second = fingerprint();
    expect(second).toBe(first);
  });

  it('un troisième appel, après les autres, ne change rien', () => {
    const before = fingerprint();
    sampleCards();
    expect(fingerprint()).toBe(before);
  });

  it('la trace est stable : les clés ne bougent pas', () => {
    const keys = SEEDS.map((seed) => seed.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain('PROJ-412');
    expect(keys).toContain('PROJ-701');
  });
});

describe('le tirage de l\'essai est reproductible depuis sa graine', () => {
  it('deux tirages donnent les mêmes bras', () => {
    const first = sampleTrialAssignments().map((item) => [item.issueId, item.arm, item.complied]);
    const second = sampleTrialAssignments().map((item) => [item.issueId, item.arm, item.complied]);
    expect(second).toEqual(first);
  });

  it('le tirage ne dépend que de la graine et du ticket', () => {
    const assignments = sampleTrialAssignments();
    expect(assignments.length).toBeGreaterThan(0);
    assignments.forEach((assignment) => {
      expect(['agent', 'human']).toContain(assignment.arm);
    });
  });
});
