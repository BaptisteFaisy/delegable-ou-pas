/**
 * Tests of the Jira-only fallback: what the app reads when it has no right on
 * the graph (SPEC §17, SPEC §21, SPEC §26; DP-03, DP-04, DP-19).
 */
import { describe, expect, it } from 'vitest';
import type { AdfNode, IssueLink, StatusChange, StatusHistory } from '../../src/types-graph.js';
import type { Level } from '../../src/types.js';
import {
  cleanClosureFromFacts,
  collectJiraOnly,
  involvementWithoutGraph,
} from '../../src/collect/jira-only.js';

const WAITING: readonly string[] = ['En attente'];

/** One step of the status history (SPEC §6). */
function change(from: string, to: string, at: string): StatusChange {
  return { from, to, at };
}

/** The history of a ticket closed at 17:00, with four hours of waiting. */
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

/** One link between the ticket and another one (SPEC §6). */
function link(overrides: Partial<IssueLink>): IssueLink {
  return {
    issueId: 'PROJ-1',
    linkedIssueId: 'PROJ-2',
    type: 'relates-to',
    linkedIsIncident: false,
    linkedIsBug: false,
    createdAt: '2026-03-05T10:00:00Z',
    ...overrides,
  };
}

/** A description carrying an acceptance criteria block (SPEC §8). */
function descriptionWithCriteria(): AdfNode {
  return {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: "Critères d'acceptation" }],
      },
      {
        type: 'bulletList',
        content: [{ type: 'listItem', content: [{ type: 'text', text: 'le ticket se ferme tout seul' }] }],
      },
    ],
  };
}

describe('Jira seul : ce que l’app lit sans aucun droit sur le graphe', () => {
  it('lit le délai, les réouvertures, les bugs et les incidents', () => {
    const facts = collectJiraOnly(closedHistory(), [], null, null, { waiting: WAITING });
    expect(facts.issueId).toBe('PROJ-1');
    expect(facts.leadTimeH).toBe(4);
    expect(facts.reopened).toBe(false);
    expect(facts.causedBugs).toBe(0);
    expect(facts.incidents).toBe(0);
    expect(facts.acceptanceCriteria).toBe(false);
    expect(facts.declaredLevel).toBeNull();
  });

  it('ne fabrique pas de délai pour un ticket ouvert ou sans historique', () => {
    const open: StatusHistory = { ...closedHistory(), closed: false, closedStatus: '' };
    expect(collectJiraOnly(open, [], null, null).leadTimeH).toBeNull();
    const empty: StatusHistory = { ...closedHistory(), changes: [] };
    expect(collectJiraOnly(empty, [], null, null).leadTimeH).toBeNull();
  });

  it('voit une réouverture et casse la clôture propre', () => {
    const reopened: StatusHistory = {
      ...closedHistory(),
      changes: [
        ...closedHistory().changes,
        change('Terminé', 'En cours', '2026-03-03T09:00:00Z'),
      ],
    };
    const facts = collectJiraOnly(reopened, [], null, null);
    expect(facts.reopened).toBe(true);
    expect(cleanClosureFromFacts(facts)).toBe(false);
  });

  it('met de côté une réouverture administrative de moins de dix minutes', () => {
    const administrative: StatusHistory = {
      ...closedHistory(),
      changes: [
        ...closedHistory().changes,
        change('Terminé', 'En cours', '2026-03-02T17:05:00Z'),
        change('En cours', 'Terminé', '2026-03-02T17:10:00Z'),
      ],
    };
    expect(collectJiraOnly(administrative, [], null, null).reopened).toBe(false);
  });

  it('compte les bugs à la suite et les incidents, qui portent la clôture propre', () => {
    const links: readonly IssueLink[] = [
      link({ linkedIssueId: 'PROJ-9', type: 'causes', linkedIsBug: true }),
      link({ linkedIssueId: 'PROJ-10', linkedIsIncident: true }),
    ];
    const facts = collectJiraOnly(closedHistory(), links, null, null);
    expect(facts.causedBugs).toBe(1);
    expect(facts.incidents).toBe(1);
    expect(cleanClosureFromFacts(facts)).toBe(false);
  });

  it('lit les critères d’acceptation et le niveau déclaré', () => {
    const facts = collectJiraOnly(
      closedHistory(),
      [],
      descriptionWithCriteria(),
      'driven' satisfies Level,
    );
    expect(facts.acceptanceCriteria).toBe(true);
    expect(facts.declaredLevel).toBe('driven');
  });

  it('ne peut pas rendre une charge de relecture : la mesure n’existe pas', () => {
    const facts = collectJiraOnly(closedHistory(), [], descriptionWithCriteria(), null);
    const keys = Object.keys(facts);
    expect(keys).not.toContain('reviewLoad');
    expect(keys).not.toContain('reviewFacts');
    expect(keys).not.toContain('review');
  });
});

describe('Jira seul : l’implication sans le graphe', () => {
  it('prend le champ déclaré quand il existe', () => {
    expect(involvementWithoutGraph('assisted', null, '2026-03-02T17:00:00Z')).toEqual({
      level: 'assisted',
      source: 'closure-field',
    });
  });

  it('déduit “sans agent” d’une clôture antérieure à l’adoption', () => {
    expect(involvementWithoutGraph(null, '2026-03-01T00:00:00Z', '2026-02-25T17:00:00Z')).toEqual({
      level: 'none',
      source: 'adoption-date',
    });
  });

  it('laisse l’inconnu après la date d’adoption', () => {
    expect(involvementWithoutGraph(null, '2026-03-01T00:00:00Z', '2026-03-05T17:00:00Z')).toEqual({
      level: 'unknown',
      source: 'adoption-date',
    });
  });

  it('ne fabrique aucune source quand rien n’est déclaré ni daté', () => {
    expect(involvementWithoutGraph(null, null, '2026-03-05T17:00:00Z')).toEqual({
      level: 'unknown',
      source: null,
    });
    expect(involvementWithoutGraph(null, null, null)).toEqual({ level: 'unknown', source: null });
  });
});