/**
 * The collection floor, traversed on the reference database.
 *
 * Covers: DP-04, DP-05, DP-18.
 *
 * Jira history and a fake graph feed the raw facts; the slices are cut and
 * resumed on the base's own ticket ids, and a real slice run stores the commit
 * facts and moves the cursor — the very chain a user session drives.
 */
import { describe, expect, it } from 'vitest';
import {
  base,
  baseDepsFrais,
  casLimite,
  ticketDe,
} from '../helpers/base.js';
import { BASE_ID } from '../helpers/base.js';
import { collectJiraOnly, cleanClosureFromFacts } from '../../src/collect/jira-only.js';
import { planSlice, resumeKey } from '../../src/collect/graph-plan.js';
import { runIngestSlice } from '../../src/handlers/ingest.js';
import { computeOutcome } from '../../src/domain/outcome.js';
import { hasAcceptanceCriteria } from '../../src/collect/jira-adf.js';
import { SAMPLE_WAITING_STATUSES } from '../../src/sample/project.js';

describe('la collecte sur la base', () => {
  it('tire les faits bruts de l’historique et des liens du jeu', () => {
    const current = base();
    const ticket = ticketDe('PROJ-412');
    const history = current.histories.find((item) => item.issueId === ticket.id);
    const links = current.links.filter((link) => link.issueId === ticket.id);
    const reopenings = current.reopenings.filter((item) => item.issueId === ticket.id);
    expect(history).toBeDefined();
    const outcome = computeOutcome(ticket.id, history!, links, reopenings, SAMPLE_WAITING_STATUSES);
    // The recomputed outcome agrees with what the dataset stores (SPEC §6).
    expect(outcome.closedAt).toBe(ticket.outcome.closedAt);
    expect(outcome.reopened).toBe(ticket.outcome.reopened);
    expect(outcome.incidents).toBe(ticket.outcome.incidents);
    expect(outcome.clean).toBe(ticket.outcome.clean);
  });

  it('lit les critères d’acceptation d’une description de la base', () => {
    const p523 = casLimite('PROJ-523');
    expect(p523.ticket).toBeDefined();
    // PROJ-523 is the "no acceptance criteria" case of the dataset.
    const without = p523.ticket!.jira;
    const history = base().histories.find((item) => item.issueId === p523.ticket!.id);
    const links = base().links.filter((link) => link.issueId === p523.ticket!.id);
    const facts = collectJiraOnly(history!, links, without.description, null, { waiting: SAMPLE_WAITING_STATUSES });
    expect(facts.acceptanceCriteria).toBe(false);
    // Every ticket of the base still reads through the guard (SPEC §8).
    expect(hasAcceptanceCriteria(without.description)).toBe(false);
  });

  it('ne conclut jamais « clôture propre » sur un ticket lié à un incident', () => {
    const p509 = casLimite('PROJ-509');
    const ticket = p509.ticket!;
    const links = base().links.filter((link) => link.issueId === ticket.id);
    const history = base().histories.find((item) => item.issueId === ticket.id);
    const reopenings = base().reopenings.filter((item) => item.issueId === ticket.id);
    const outcome = computeOutcome(ticket.id, history!, links, reopenings, []);
    expect(outcome.incidents).toBeGreaterThan(0);
    expect(cleanClosureFromFacts(collectJiraOnly(history!, links, ticket.jira.description, null))).toBe(false);
  });

  it('coupe une tranche puis reprend après le curseur de la base', () => {
    const ids = base().tickets.map((ticket) => ticket.id);
    const first = planSlice(ids, '', 25);
    expect(first.issueIds).toHaveLength(25);
    expect(first.complete).toBe(false);
    const resumed = planSlice(ids, resumeKey('', first.lastIssueId), 25);
    expect(resumed.issueIds[0]).not.toBe(first.issueIds[0]);
    // The resume cursor is the last id actually collected (DP-18).
    expect(resumeKey('', first.lastIssueId)).toBe(first.lastIssueId);
    expect(resumeKey('PROJ-1', first.lastIssueId)).toBe('PROJ-1');
  });

  it('mesure la relecture depuis le graphe, sans nommer personne', async () => {
    const deps = await baseDepsFrais();
    const store = deps.stores;
    const reviews = await store.reviewFact.listByProject(BASE_ID, 200);
    expect(reviews.length).toBeGreaterThan(0);
    const avecPR = reviews.find((fact) => fact.reviewerCount > 0);
    expect(avecPR).toBeDefined();
    // Only counts are kept: a review fact names nobody (SPEC §6, DP-05, DP-17).
    expect(Object.keys(avecPR!).sort()).toEqual([
      'changesRequested', 'commentCount', 'commitsAfterOpen', 'issueId', 'mergedAt', 'openedAt', 'prRef', 'reviewerCount',
    ]);
  });

  it('stocke les faits de commit et avance le curseur sur un vrai passage', async () => {
    const deps = await baseDepsFrais();
    const job = {
      projectId: BASE_ID,
      objectType: 'commit' as const,
      fromIssueId: '',
      sliceSize: 8,
      enqueuedAt: base().now,
    };
    const slice = await runIngestSlice(deps, job);
    expect(slice.issueIds).toHaveLength(8);
    const cursor = await deps.stores.graphCursor.get(BASE_ID, 'commit');
    expect(cursor?.lastIssueId).toBe(slice.lastIssueId);
    // A new passage resumes where the cursor stopped: no ticket twice.
    const again = await runIngestSlice(deps, { ...job, fromIssueId: cursor?.lastIssueId ?? '' });
    expect(again.issueIds.find((id) => slice.issueIds.includes(id))).toBeUndefined();
  });
});