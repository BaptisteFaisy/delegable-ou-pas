/**
 * Tests of what happens after the ticket (SPEC §6, SPEC §21; DP-04, DP-17,
 * recipes 4 and 5).
 */
import { describe, expect, it } from 'vitest';
import type {
  IssueLink,
  NeighborBugFact,
  ReopeningFact,
  StatusChange,
  StatusHistory,
} from '../../src/types-graph.js';
import type { Involvement, Level } from '../../src/types.js';
import {
  computeOutcome,
  countCausedBugs,
  countIncidents,
  countNeighborBugs,
  detectTakeover,
  hadReopening,
  isAbandoned,
  isClean,
  leadTimeHours,
  linkCoverage,
} from '../../src/domain/outcome.js';

const WAITING: readonly string[] = ['En attente'];

/** One step of the status history (SPEC §6). */
function change(from: string, to: string, at: string): StatusChange {
  return { from, to, at };
}

/** The history of a ticket closed at 17:00, with four waiting hours. */
function closedHistory(): StatusHistory {
  return {
    issueId: 'PROJ-1',
    changes: [
      change('À faire', 'En cours', '2026-03-02T09:00:00Z'),
      change('En cours', 'En attente', '2026-03-02T11:00:00Z'),
      change('En attente', 'En cours', '2026-03-02T15:00:00Z'),
      change('En cours', 'Terminé', '2026-03-02T17:00:00Z'),
    ],
    closed: true,
    closedStatus: 'Terminé',
  };
}

/** One link between tickets (SPEC §6). */
function link(overrides: Partial<IssueLink> = {}): IssueLink {
  return {
    issueId: 'PROJ-1',
    linkedIssueId: 'PROJ-9',
    type: 'relates-to',
    linkedIsIncident: false,
    linkedIsBug: false,
    createdAt: '2026-03-20T10:00:00Z',
    ...overrides,
  };
}

/** One reopening detected in the history (SPEC §6). */
function reopening(overrides: Partial<ReopeningFact> = {}): ReopeningFact {
  return {
    issueId: 'PROJ-1',
    reopenedAt: '2026-03-10T09:00:00Z',
    durationMin: 120,
    counts: true,
    ...overrides,
  };
}

/** One neighbour bug (SPEC §6 "Bug voisin"). */
function neighbor(overrides: Partial<NeighborBugFact> = {}): NeighborBugFact {
  return {
    issueId: 'PROJ-1',
    bugIssueId: 'PROJ-10',
    component: 'facturation',
    createdAt: '2026-03-20T10:00:00Z',
    ...overrides,
  };
}

/** An involvement declaration, for the takeover (SPEC §6 "Reprise humaine"). */
function declared(level: Level): Involvement {
  return {
    issueId: 'PROJ-1',
    level,
    source: 'mcp-declaration',
    client: '',
    model: '',
    sessionRef: '',
    evidence: [],
    decidedAt: '2026-03-02T10:00:00Z',
  };
}

describe('ce qui arrive ensuite', () => {
  it('recette-04 — un ticket rouvert sous trente jours n’est pas une clôture propre', () => {
    const outcome = computeOutcome('PROJ-1', closedHistory(), [], [reopening()], WAITING);
    expect(outcome.reopened).toBe(true);
    expect(outcome.clean).toBe(false);
  });

  it('mesure le délai du premier passage « En cours » à la clôture, hors statuts d’attente', () => {
    expect(leadTimeHours(closedHistory(), WAITING)).toBe(4);
    expect(leadTimeHours(closedHistory(), [])).toBe(8);
  });

  it('écarte la réouverture administrative de huit minutes', () => {
    const administrative = reopening({
      reopenedAt: '2026-03-02T17:05:00Z',
      durationMin: 8,
      counts: false,
    });
    expect(hadReopening([administrative], '2026-03-02T17:00:00Z')).toBe(false);
    const unflagged = reopening({ durationMin: 8, counts: true });
    expect(hadReopening([unflagged], '2026-03-02T17:00:00Z')).toBe(false);
  });

  it('compte le bug relié par « est causé par » sous soixante jours', () => {
    const bug = link({ type: 'caused-by', linkedIsBug: true });
    expect(countCausedBugs([bug], '2026-03-02T17:00:00Z')).toBe(1);
    const old = link({ type: 'caused-by', linkedIsBug: true, createdAt: '2026-01-10T10:00:00Z' });
    expect(countCausedBugs([old], '2026-03-02T17:00:00Z')).toBe(0);
    expect(countCausedBugs([link({ linkedIsBug: true })], '2026-03-02T17:00:00Z')).toBe(0);
  });

  it('ne met jamais le bug voisin dans la clôture propre', () => {
    const neighbors: readonly NeighborBugFact[] = [neighbor()];
    expect(countNeighborBugs(neighbors, '2026-03-02T17:00:00Z')).toBe(1);
    const outcome = computeOutcome('PROJ-1', closedHistory(), [], [], WAITING);
    expect(outcome.neighborBugs).toBe(0);
    expect(outcome.clean).toBe(true);
    expect(isClean(false, 0, 0)).toBe(true);
  });

  it('casse la clôture propre sur un incident relié sous soixante jours', () => {
    const incident = link({ linkedIsIncident: true });
    expect(countIncidents([incident])).toBe(1);
    const outcome = computeOutcome('PROJ-1', closedHistory(), [incident], [], WAITING);
    expect(outcome.incidents).toBe(1);
    expect(outcome.clean).toBe(false);
  });

  it('casse la clôture propre sur un bug à la suite', () => {
    const bug = link({ type: 'causes', linkedIsBug: true });
    const outcome = computeOutcome('PROJ-1', closedHistory(), [bug], [], WAITING);
    expect(outcome.causedBugs).toBe(1);
    expect(outcome.clean).toBe(false);
  });

  it('rend la date à partir de laquelle le ticket est jugeable', () => {
    const outcome = computeOutcome('PROJ-1', closedHistory(), [], [], WAITING);
    expect(outcome.matureAt).toBe('2026-05-01T17:00:00.000Z');
  });

  it('dit abandonné un ticket annulé après avoir commencé', () => {
    const abandoned: StatusHistory = {
      issueId: 'PROJ-1',
      changes: [
        change('À faire', 'En cours', '2026-03-02T09:00:00Z'),
        change('En cours', 'Annulé', '2026-03-03T09:00:00Z'),
      ],
      closed: true,
      closedStatus: 'Annulé',
    };
    expect(isAbandoned(abandoned, WAITING)).toBe(true);
    expect(computeOutcome('PROJ-1', abandoned, [], [], WAITING).abandoned).toBe(true);
    const neverStarted: StatusHistory = {
      ...abandoned,
      changes: [change('À faire', 'Annulé', '2026-03-03T09:00:00Z')],
    };
    expect(isAbandoned(neverStarted, WAITING)).toBe(false);
  });

  it('rend la reprise humaine sans jamais rendre de nom', () => {
    const takeover = detectTakeover([declared('autonomous'), declared('driven')]);
    expect(takeover).toBe(true);
    expect(typeof takeover).toBe('boolean');
    expect(detectTakeover([declared('autonomous'), declared('autonomous')])).toBe(false);
    expect(detectTakeover([declared('assisted'), declared('driven')])).toBe(false);
    expect(detectTakeover([])).toBe(false);
  });

  it('signale une équipe qui ne relie jamais ses bugs', () => {
    const coverage = linkCoverage([
      { issueId: 'PROJ-1', links: [] },
      { issueId: 'PROJ-2', links: [link({ type: 'caused-by', linkedIsBug: true })] },
    ]);
    expect(coverage.linked).toBe(1);
    expect(coverage.total).toBe(2);
    expect(coverage.rate).toBe(0.5);
    expect(linkCoverage([]).rate).toBeNull();
  });

  it('laisse vide ce qui n’est pas encore mesurable', () => {
    const open: StatusHistory = {
      issueId: 'PROJ-1',
      changes: [change('À faire', 'En cours', '2026-03-02T09:00:00Z')],
      closed: false,
      closedStatus: '',
    };
    const outcome = computeOutcome('PROJ-1', open, [], [], WAITING);
    expect(outcome.closedAt).toBe('');
    expect(outcome.leadTimeH).toBe(0);
    expect(outcome.matureAt).toBe('');
    expect(outcome.clean).toBe(false);
  });
});