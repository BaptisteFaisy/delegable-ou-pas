/**
 * SPEC §6, §17 · DP-20 — what happened afterwards, and the links between tickets.
 *
 * The outcome of one ticket is what the app measures once the ticket is closed:
 * the delay, the reopening, the bugs that followed, the incidents, the human
 * takeover and the abandonment (SPEC §6). The date at which the ticket becomes
 * judgeable is computed by `src/domain/maturity.ts`: the rule lives in the
 * domain, this module only produces the facts (zero duplication).
 *
 * The links are the evidence behind the counts: a bug caused by the ticket, a
 * neighbouring bug, an open incident (SPEC §6, SPEC §17).
 */
import type { Outcome } from '../types.js';
import type { IssueLink } from '../types-graph.js';
import { judgeableAt } from '../domain/maturity.js';
import type { Seed } from './issues.js';
import { OPEN_SHOWCASE } from './issues.js';
import { CAS_LIMITES } from './cas-limites.js';
import { SAMPLE_PROJECT_ID, addDays, issueIdOfKey } from './project.js';

/** The family whose tickets are the bugs the dataset links to (SPEC §6). */
export const BUG_FAMILY = 'e3-caused-bugs';

/** True when nothing went wrong with a closed ticket (SPEC §6 "Clôture propre"). */
export function cleanOf(seed: Seed): boolean {
  const failure = seed.failure;
  return (
    seed.closedAt !== '' &&
    !failure.reopened &&
    failure.causedBugs === 0 &&
    failure.incidents === 0 &&
    !failure.abandoned
  );
}

/** What happened to one demo ticket (SPEC §18 table `outcome`). */
export function outcomeOf(seed: Seed): Outcome {
  const closed = seed.closedAt !== '';
  const outcome: Outcome = {
    issueId: seed.id,
    closedAt: seed.closedAt,
    leadTimeH: closed ? seed.leadTimeH : 0,
    reopened: seed.failure.reopened,
    causedBugs: seed.failure.causedBugs,
    neighborBugs: seed.neighborBugs,
    incidents: seed.failure.incidents,
    takeover: seed.failure.takeover,
    abandoned: seed.failure.abandoned,
    clean: cleanOf(seed),
    matureAt: '',
  };
  return { ...outcome, matureAt: closed ? judgeableAt(outcome) : '' };
}

/** Every outcome of the demo dataset. */
export function sampleOutcomes(seeds: readonly Seed[]): readonly Outcome[] {
  return seeds.map(outcomeOf);
}

/** The links to an open incident: the guardrail of SPEC §8, DP-12. */
function incidentLinks(seeds: readonly Seed[]): readonly IssueLink[] {
  return seeds.flatMap((seed) => {
    const spec = OPEN_SHOWCASE.find((candidate) => candidate.key === seed.key);
    if (spec === undefined || spec.linkedIssueKey === '') return [];
    return [{
      issueId: seed.id,
      linkedIssueId: issueIdOfKey(spec.linkedIssueKey),
      type: 'relates-to' as const,
      linkedIsIncident: true,
      linkedIsBug: false,
      createdAt: seed.createdAt,
    }];
  });
}

/**
 * The links to the bugs that followed (SPEC §6 "Bug à la suite", "Bug voisin").
 *
 * A bug can be caused by several tickets: the demo cycles over the bug family
 * instead of inventing one bug per failure.
 */
function bugLinks(seeds: readonly Seed[], bugs: readonly Seed[]): readonly IssueLink[] {
  if (bugs.length === 0) return [];
  const links: IssueLink[] = [];
  let cursor = 0;
  for (const seed of seeds) {
    const caused = seed.failure.causedBugs;
    const neighbors = seed.neighborBugs;
    for (let index = 0; index < caused + neighbors; index += 1) {
      const bug = bugs[(cursor + index) % bugs.length];
      links.push({
        issueId: seed.id,
        linkedIssueId: bug.id,
        type: index < caused ? 'caused-by' : 'relates-to',
        linkedIsIncident: false,
        linkedIsBug: true,
        createdAt: addDays(seed.closedAt === '' ? seed.updatedAt : seed.closedAt, 3),
      });
    }
    cursor += caused + neighbors;
  }
  return links;
}

/**
 * The links the named tickets declare (SPEC §6, SPEC §21).
 *
 * A ticket linked to an open incident carries the guardrail of SPEC §8; the
 * link points to a ticket of the base, never to a person.
 */
function casLinks(seeds: readonly Seed[]): readonly IssueLink[] {
  const links: IssueLink[] = [];
  for (const cas of CAS_LIMITES) {
    const seed = seeds.find((candidate) => candidate.key === cas.key);
    if (seed === undefined) continue;
    for (const link of cas.adjust.links ?? []) {
      links.push({
        issueId: seed.id,
        linkedIssueId: issueIdOfKey(link.to),
        type: link.type,
        linkedIsIncident: link.linkedIsIncident,
        linkedIsBug: link.linkedIsBug,
        createdAt: seed.createdAt,
      });
    }
  }
  return links;
}

/** Every link between the tickets of the demo dataset. */
export function sampleLinks(seeds: readonly Seed[]): readonly IssueLink[] {
  const bugs = seeds.filter((seed) => seed.family === BUG_FAMILY);
  return [...incidentLinks(seeds), ...casLinks(seeds), ...bugLinks(seeds, bugs)];
}

/** The internal id of the project every demo fact carries (SPEC §18). */
export function demoProjectId(): string {
  return SAMPLE_PROJECT_ID;
}
