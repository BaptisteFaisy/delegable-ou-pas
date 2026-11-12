/**
 * Tests de la chaîne « Graphe » : découpe de tranche, reprise sur curseur,
 * chemin ticket → commit → PR, droit manquant, et le message de commit jeté.
 * Aucun réseau (SPEC §17, SPEC §19, DP-18). Règle : fichiers < 500 lignes.
 */
import { describe, it, expect } from 'vitest';
import { createStubRepository } from '../../src/db/stub.js';
import { createCollector, createGraphGateway } from '../../src/collect/graph.js';
import { clampSliceSize, resumeJql, resumeKey, sliceKeys, DEFAULT_SLICE_SIZE, MAX_SLICE_SIZE } from '../../src/collect/graph-plan.js';
import type { CollectionJob, JiraGateway } from '../../src/ports.js';
import type { SignaturePattern } from '../../src/types.js';
import { commit, fakeClock, fakeGraph, fakeJira, jsonResponse, pullRequest, reviewer } from './fakes.js';

const PATTERN: SignaturePattern = {
  id: 'pat-test',
  expression: '\\[agent-test\\]',
  agentName: 'Agent Test',
  enabled: true,
  seenCount: 0,
};

function job(overrides: Partial<CollectionJob> = {}): CollectionJob {
  return {
    projectId: 'PROJ',
    objectType: 'commit',
    fromIssueId: '',
    sliceSize: 2,
    enqueuedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Jira fake : passerelle complète appliquant la clause `key > "..."` de reprise. */
function fakeJiraKeys(allKeys: readonly string[]): JiraGateway {
  return fakeJira(allKeys);
}

describe('graph-plan', () => {
  it('reprise : JQL bornée au projet, puis au curseur', () => {
    expect(resumeJql('PROJ', '')).toBe('project = "PROJ" ORDER BY key ASC');
    expect(resumeJql('PROJ', 'PROJ-5')).toContain('AND key > "PROJ-5"');
  });

  it('découpe les clés et signale la fin', () => {
    expect(sliceKeys(['a', 'b', 'c'], 'a', 2)).toEqual({ keys: ['b', 'c'], complete: false });
    expect(sliceKeys(['a', 'b'], 'a', 5)).toEqual({ keys: ['b'], complete: true });
  });

  it('borne la taille de tranche', () => {
    expect(clampSliceSize(0)).toBe(DEFAULT_SLICE_SIZE);
    expect(clampSliceSize(10_000)).toBe(MAX_SLICE_SIZE);
    expect(clampSliceSize(7)).toBe(7);
  });

  it('le curseur du job prime sur le curseur enregistré', () => {
    expect(resumeKey('', 'PROJ-1')).toBe('PROJ-1');
    expect(resumeKey('PROJ-2', 'PROJ-1')).toBe('PROJ-2');
  });
});

describe('collecteur', () => {
  it('reprend sur le curseur : deux tranches successives', async () => {
    const repo = await createStubRepository();
    await repo.stores.signature.save(PATTERN);
    const graph = fakeGraph({
      commits: { 'PROJ-1': [commit('c1', 'fix [agent-test]')], 'PROJ-2': [commit('c2', 'wip')] },
    });
    const collector = createCollector({
      graph,
      jira: fakeJiraKeys(['PROJ-1', 'PROJ-2']),
      signatures: repo.stores.signature,
      commits: repo.stores.commitFact,
      reviews: repo.stores.reviewFact,
      cursors: repo.stores.graphCursor,
      clock: fakeClock(),
    });

    const first = await collector.handle(job({ sliceSize: 1 }));
    expect(first.issueIds).toEqual(['PROJ-1']);
    expect(first.complete).toBe(false);
    expect(first.lastIssueId).toBe('PROJ-1');

    const second = await collector.handle(job({ sliceSize: 1 }));
    expect(second.issueIds).toEqual(['PROJ-2']);
    expect(second.lastIssueId).toBe('PROJ-2');

    const cursor = await repo.stores.graphCursor.get('PROJ', 'commit');
    expect(cursor?.lastIssueId).toBe('PROJ-2');
  });

  it('suit le chemin ticket → commit → PR → relecteurs', async () => {
    const repo = await createStubRepository();
    await repo.stores.signature.save(PATTERN);
    const graph = fakeGraph({
      commits: { 'PROJ-1': [commit('c1', 'fix [agent-test]')] },
      pullRequests: { c1: [pullRequest('pr1', { reviewers: [reviewer('r1', 'approved'), reviewer('r2', 'changes-requested')], commentCount: 4, commitsAfterOpen: 2 })] },
    });
    const collector = createCollector({
      graph, jira: fakeJiraKeys(['PROJ-1']),
      signatures: repo.stores.signature, commits: repo.stores.commitFact,
      reviews: repo.stores.reviewFact, cursors: repo.stores.graphCursor, clock: fakeClock(),
    });

    const slice = await collector.handle(job());
    expect(slice.issueIds).toEqual(['PROJ-1']);
    expect(graph.calls).toContain('pullRequestsOfCommit:c1');

    const facts = await repo.stores.commitFact.listByIssue('PROJ-1');
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ issueId: 'PROJ-1', commitRef: 'c1', hasSignature: true, agentName: 'Agent Test' });

    const reviews = await repo.stores.reviewFact.listByIssue('PROJ-1');
    expect(reviews[0]).toMatchObject({ prRef: 'pr1', reviewerCount: 2, changesRequested: 1, commentCount: 4, commitsAfterOpen: 2 });
  });

  it('ne stocke jamais le message de commit', async () => {
    const repo = await createStubRepository();
    await repo.stores.signature.save(PATTERN);
    const graph = fakeGraph({ commits: { 'PROJ-1': [commit('c1', 's secret : fix [agent-test]')] } });
    const collector = createCollector({
      graph, jira: fakeJiraKeys(['PROJ-1']),
      signatures: repo.stores.signature, commits: repo.stores.commitFact,
      reviews: repo.stores.reviewFact, cursors: repo.stores.graphCursor, clock: fakeClock(),
    });
    await collector.handle(job());
    const facts = await repo.stores.commitFact.listByIssue('PROJ-1');
    expect(JSON.stringify(facts)).not.toContain('s secret');
  });

  it('un droit manquant vide le résultat sans erreur', async () => {
    const repo = await createStubRepository();
    await repo.stores.signature.save(PATTERN);
    const graph = fakeGraph({ permission: 'missing', commits: { 'PROJ-1': [commit('c1', 'x')] } });
    const collector = createCollector({
      graph, jira: fakeJiraKeys(['PROJ-1']),
      signatures: repo.stores.signature, commits: repo.stores.commitFact,
      reviews: repo.stores.reviewFact, cursors: repo.stores.graphCursor, clock: fakeClock(),
    });
    const slice = await collector.handle(job());
    expect(slice.issueIds).toEqual([]);
    expect(slice.complete).toBe(true);
    expect(await repo.stores.commitFact.listByIssue('PROJ-1')).toEqual([]);
  });

  it('marque le ticket sans commit', async () => {
    const repo = await createStubRepository();
    const graph = fakeGraph({ commits: {} });
    const collector = createCollector({
      graph, jira: fakeJiraKeys(['PROJ-9']),
      signatures: repo.stores.signature, commits: repo.stores.commitFact,
      reviews: repo.stores.reviewFact, cursors: repo.stores.graphCursor, clock: fakeClock(),
    });
    const slice = await collector.handle(job());
    expect(slice.issueIds).toEqual(['PROJ-9']);
  });
});

describe('passerelle graphe', () => {
  function fakeGraphApi(payloads: Record<string, unknown>) {
    return async (query: string) => {
      for (const [marker, payload] of Object.entries(payloads)) {
        if (query.includes(marker)) return jsonResponse(payload);
      }
      return jsonResponse({ data: null, errors: [] });
    };
  }

  it('lit les commits d’un ticket', async () => {
    const gw = createGraphGateway({
      requestTeamworkGraph: fakeGraphApi({
        'issue(id: $issueId)': {
          data: { issue: { commits: [{ ref: 'c1', hash: 'h1', message: 'msg', author: { accountId: 'a1' }, committedAt: '2026-10-01T00:00:00.000Z', repository: 'repo', url: 'u' }] } },
        },
      }),
    });
    const commits = await gw.commitsOfIssue('PROJ-1');
    expect(commits).toHaveLength(1);
    expect(commits[0]).toMatchObject({ ref: 'c1', hash: 'h1', authorAccountId: 'a1' });
  });

  it('un droit manquant vide le résultat', async () => {
    const gw = createGraphGateway({
      requestTeamworkGraph: async () => jsonResponse({ data: null, errors: [{ message: 'Permission denied' }] }),
    });
    expect(await gw.commitsOfIssue('PROJ-1')).toEqual([]);
    const probe = await gw.probePermission('commit', 'PROJ-1');
    expect(probe.state).toBe('missing');
  });

  it('détecte un compte robot', async () => {
    const gw = createGraphGateway({
      requestTeamworkGraph: async () => jsonResponse({ data: { account: { isBot: true } } }),
    });
    expect(await gw.botAccount('acct-1')).toBe(true);
  });
});