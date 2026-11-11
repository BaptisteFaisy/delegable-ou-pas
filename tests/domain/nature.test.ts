/**
 * Tests of the classification of a ticket — DP-06, SPEC §14, §19, §21.
 *
 * One test per behaviour; the model is a fake that counts its calls, so the
 * "one call per text" rule is checked, not trusted.
 */
import { describe, expect, it } from 'vitest';
import type { FailureCause, IssueClassStore, LlmGateway, NatureClassification } from '../../src/ports.js';
import type { IssueClass, Nature } from '../../src/types.js';
import { NATURE_NO_CODE } from '../../src/types.js';
import type { JiraTicket } from '../../src/types-graph.js';
import {
  classifyByRules,
  classifyTicket,
  classifyWithModel,
  contentHash,
  natureFromLabels,
  sizeFromSimilarDurations,
  sizeFromStoryPoints,
  ticketText,
  zoneOf,
} from '../../src/domain/nature.js';

const SIZES = ['S', 'M', 'L', 'XL'] as const;

function ticket(overrides: Partial<JiraTicket> = {}): JiraTicket {
  return {
    id: 'issue-1',
    key: 'PAY-1',
    projectId: 'project-1',
    projectKey: 'PAY',
    summary: 'Le formulaire de paiement plante',
    description: null,
    status: 'Done',
    issueType: 'Bug',
    components: ['front'],
    labels: [],
    storyPoints: 3,
    sprintId: '',
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-02T08:00:00.000Z',
    customFields: {},
    ...overrides,
  };
}

/** Keeps the classifications by fingerprint, like the store of SPEC §18. */
class FakeClassStore implements IssueClassStore {
  readonly rows: IssueClass[] = [];
  saves = 0;

  async get(issueId: string): Promise<IssueClass | null> {
    return this.rows.find((row) => row.issueId === issueId) ?? null;
  }

  async save(issueClass: IssueClass): Promise<void> {
    this.saves += 1;
    this.rows.push(issueClass);
  }

  async listByProject(_projectId: string, limit: number): Promise<IssueClass[]> {
    return this.rows.slice(0, limit);
  }

  async getByContentHash(_projectId: string, hash: string): Promise<IssueClass | null> {
    return this.rows.find((row) => row.contentHash === hash) ?? null;
  }
}

/** A model that counts its calls, to prove the result is kept (DP-06). */
class CountingLlm implements LlmGateway {
  calls = 0;

  constructor(private readonly nature: Nature = 'refactor') {}

  async classifyNature(_text: string, _natures: readonly Nature[]): Promise<NatureClassification> {
    this.calls += 1;
    return { nature: this.nature, rationale: 'le titre parle de dettes techniques' };
  }

  async summarizeFailureCauses(_comments: readonly string[], _limit: number): Promise<FailureCause[]> {
    return [];
  }
}

const NATURES: readonly Nature[] = ['bugfix', 'ui-change', 'data-migration', 'refactor', 'tests', 'configuration', 'external-integration', NATURE_NO_CODE];

describe('nature — classification', () => {
  it('classifies by the ticket type before any model call', async () => {
    const llm = new CountingLlm();
    const store = new FakeClassStore();
    const result = await classifyTicket(ticket(), { llm, store, natures: NATURES });
    expect(result?.nature).toBe('bugfix');
    expect(result?.classifiedBy).toBe('rules');
    expect(llm.calls).toBe(0);
    expect(store.saves).toBe(1);
  });

  it('keeps the result by fingerprint: two calls on the same text make one model call', async () => {
    const llm = new CountingLlm('data-migration');
    const store = new FakeClassStore();
    const first = ticket({ id: 'issue-1', issueType: 'Task', summary: 'Reprendre le module de facturation' });
    const second = ticket({ id: 'issue-2', key: 'PAY-2', issueType: 'Task', summary: 'Reprendre le module de facturation' });
    expect(ticketText(first)).toBe(ticketText(second));

    const firstResult = await classifyTicket(first, { llm, store, natures: NATURES });
    const secondResult = await classifyTicket(second, { llm, store, natures: NATURES });

    expect(llm.calls).toBe(1);
    expect(firstResult?.classifiedBy).toBe('model');
    expect(secondResult?.nature).toBe('data-migration');
    expect(secondResult?.issueId).toBe('issue-2');
    expect(store.saves).toBe(1);
  });

  it('falls back to the rules alone when no model is available', async () => {
    const store = new FakeClassStore();
    const result = await classifyTicket(ticket({ issueType: 'Task', summary: 'Reprendre le module' }), {
      llm: null,
      store,
      natures: NATURES,
    });
    expect(result).toBeNull();

    const ruled = await classifyTicket(ticket({ labels: ['migration'] }), { llm: null, store, natures: NATURES });
    expect(ruled?.nature).toBe('data-migration');
    expect(ruled?.classifiedBy).toBe('rules');
  });

  it('reads the nature from the labels and from the ticket type', () => {
    expect(natureFromLabels(['migration'], 'Task')).toBe('data-migration');
    expect(natureFromLabels(['ui'], 'Story')).toBe('ui-change');
    expect(natureFromLabels([], 'Bug')).toBe('bugfix');
    expect(natureFromLabels([], 'Story')).toBeNull();
  });

  it('gives its own nature to the work without commit', () => {
    expect(natureFromLabels(['documentation'], 'Task')).toBe(NATURE_NO_CODE);
    expect(classifyByRules(ticket({ issueType: 'Task', labels: ['outillage'] }))?.nature).toBe(NATURE_NO_CODE);
  });

  it('puts a ticket without commit out of the code cohorts', async () => {
    const result = await classifyTicket(ticket({ issueType: 'Bug' }), {
      llm: null,
      store: null,
      natures: NATURES,
      hasNoCommit: true,
    });
    expect(result?.nature).toBe(NATURE_NO_CODE);
  });

  it('gives the same fingerprint to the same text and another one otherwise', () => {
    expect(contentHash('même texte')).toBe(contentHash('même texte'));
    expect(contentHash('même texte')).not.toBe(contentHash('autre texte'));
    expect(contentHash('')).toMatch(/^fnv1a-[0-9a-f]{8}$/);
  });

  it('classifies with the model and keeps the fingerprint it was given', () => {
    const result = classifyWithModel(ticket(), { nature: 'refactor', rationale: 'r' }, 'fnv1a-12345678');
    expect(result.classifiedBy).toBe('model');
    expect(result.nature).toBe('refactor');
    expect(result.contentHash).toBe('fnv1a-12345678');
    expect(result.zone).toBe('front');
  });

  it('refuses a nature the project does not declare', async () => {
    const llm = new CountingLlm('invented-nature');
    const result = await classifyTicket(ticket({ issueType: 'Task', summary: 'Travail divers' }), {
      llm,
      store: new FakeClassStore(),
      natures: ['bugfix'],
    });
    expect(result).toBeNull();
    expect(llm.calls).toBe(1);
  });
});

describe('nature — zone and size', () => {
  it('takes the zone from the components, then from the project fields', () => {
    expect(zoneOf(ticket({ components: ['back', 'front'] }))).toBe('back');
    expect(zoneOf(ticket({ components: [], customFields: { zone: 'paiement' } }))).toBe('paiement');
    expect(zoneOf(ticket({ components: [] }))).toBe('');
  });

  it('keeps the declared size when the story points exist', () => {
    const declared = sizeFromStoryPoints(8, SIZES);
    expect(declared).toEqual({ size: 'L', estimated: false });
  });

  it('estimates the size when the story points are missing', () => {
    const estimated = sizeFromStoryPoints(null, SIZES);
    expect(estimated.estimated).toBe(true);
    expect(estimated.size).toBe('M');
  });

  it('estimates the size from the duration of the similar tickets', () => {
    const fromDurations = sizeFromSimilarDurations(30, SIZES);
    expect(fromDurations).toEqual({ size: 'L', estimated: true });
    expect(sizeFromSimilarDurations(null, SIZES).estimated).toBe(true);
  });

  it('reads a size the project declared on the ticket itself', async () => {
    const result = await classifyTicket(ticket({ customFields: { taille: 'XS' }, storyPoints: null }), {
      llm: null,
      store: null,
      natures: NATURES,
    });
    expect(result?.size).toBe('XS');
    expect(result?.sizeEstimated).toBe(false);
  });

  it('estimates the size of a ticket without any measure', async () => {
    const result = await classifyTicket(ticket({ storyPoints: null }), { llm: null, store: null, natures: NATURES });
    expect(result?.sizeEstimated).toBe(true);
  });
});
