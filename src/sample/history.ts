/**
 * SPEC §6, §17 · DP-20 — the life of one demo ticket.
 *
 * One module turns a seed into what the app reads of a ticket: the Jira facts,
 * the classification, the involvement, the status history and the reopenings.
 * It is pure: no `@forge/*`, no database, no clock of its own (SPEC §24.1).
 *
 * The delay a ticket carries excludes the waiting statuses (SPEC §6 "Délai"),
 * and the date a ticket becomes judgeable is computed by `src/domain/maturity.ts`
 * — the rule lives in the domain, this module only produces the facts.
 */
import type { AdfNode, JiraTicket, ReopeningFact, StatusChange, StatusHistory } from '../types-graph.js';
import type { Epoch, Involvement, IssueClass } from '../types.js';
import type { Seed } from './issues.js';
import { sampleEpochs } from './epochs.js';
import { SAMPLE_DEMO_LABEL, SAMPLE_PROJECT_ID, SAMPLE_PROJECT_KEY, addHours, contentHash } from './project.js';

/** The Jira custom field that carries the involvement level (SPEC §5, DP-23). */
export const FIELD_INVOLVEMENT = 'customfield_10021';

/** The Jira custom field that marks the demo dataset (SPEC §13, DP-20). */
export const FIELD_DATASET = 'customfield_10022';

/** The robot account of the demo: a role, never a person (SPEC §18, DP-17). */
export const ROBOT_ACCOUNT = 'agent-bot-1';

/**
 * The description of a ticket, in ADF (SPEC §16).
 *
 * `null` when the family declares no description: the app then says the
 * acceptance criteria are missing instead of inventing them (SPEC §8, DP-12).
 */
export function descriptionAdf(summary: string, hasDescription: boolean): AdfNode | null {
  if (!hasDescription) return null;
  const criteria = [
    "critères d'acceptation vérifiés par un test / acceptance criteria checked by a test",
    "rejeu possible sur l'environnement de démonstration / replayable on the demo environment",
  ];
  return {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: summary }] },
      {
        type: 'bulletList',
        content: criteria.map((criterion) => ({
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: criterion }] }],
        })),
      },
    ],
  };
}

/** The custom fields of one demo ticket (SPEC §16.5, DP-23, DP-25). */
function customFieldsOf(seed: Seed): Readonly<Record<string, string>> {
  const fields: Record<string, string> = { [FIELD_DATASET]: SAMPLE_DEMO_LABEL };
  if (seed.source === 'closure-field') fields[FIELD_INVOLVEMENT] = seed.level;
  return fields;
}

/** One demo ticket, as the app reads it from Jira (SPEC §17 "Historique Jira"). */
export function ticketOf(seed: Seed): JiraTicket {
  return {
    id: seed.id,
    key: seed.key,
    projectId: SAMPLE_PROJECT_ID,
    projectKey: SAMPLE_PROJECT_KEY,
    summary: seed.summary,
    description: descriptionAdf(seed.summary, seed.hasDescription),
    status: seed.status,
    issueType: seed.issueType,
    components: [seed.component],
    labels: [...seed.labels],
    storyPoints: seed.storyPoints,
    sprintId: seed.sprintId,
    createdAt: seed.createdAt,
    updatedAt: seed.updatedAt,
    customFields: customFieldsOf(seed),
  };
}

/** Every demo ticket (SPEC §24.1: twelve months, one populated project). */
export function sampleTickets(seeds: readonly Seed[]): readonly JiraTicket[] {
  return seeds.map(ticketOf);
}

/** The classification of one demo ticket (SPEC §14 DP-06, SPEC §18 `issue_class`). */
export function classOf(seed: Seed): IssueClass {
  return {
    issueId: seed.id,
    nature: seed.nature,
    zone: seed.zone,
    size: seed.size,
    classifiedBy: seed.classifiedBy,
    contentHash: contentHash(`${seed.summary}|${seed.nature}|${seed.zone}`),
    sizeEstimated: seed.sizeEstimated,
  };
}

/** Every classification of the demo dataset. */
export function sampleClasses(seeds: readonly Seed[]): readonly IssueClass[] {
  return seeds.map(classOf);
}

/** The structured evidence keys of one source (SPEC §17: keys, never a quote). */
function evidenceOf(seed: Seed): readonly string[] {
  switch (seed.source) {
    case 'mcp-declaration':
      return ['tool:code-agent', 'session-declared'];
    case 'bot-author':
      return [`author:${ROBOT_ACCOUNT}`];
    case 'commit-mention':
      return [`mention:${ROBOT_ACCOUNT}`];
    case 'closure-field':
      return [`field:${FIELD_INVOLVEMENT}`];
    case 'adoption-date':
      return ['adoption-date-window'];
  }
}

/** The epoch a seed belongs to; the first one when it cannot be found. */
function epochOf(seed: Seed, epochs: readonly Epoch[]): Epoch {
  return epochs.find((epoch) => epoch.id === seed.epochId) ?? epochs[0];
}

/**
 * The involvement of one demo ticket (SPEC §5, SPEC §18 table `involvement`).
 *
 * An unknown involvement stays unknown: the client, the model and the session
 * stay empty rather than being invented (DP-01, DP-03).
 */
export function involvementOf(seed: Seed, epochs: readonly Epoch[]): Involvement {
  const epoch = epochOf(seed, epochs);
  const known = seed.level !== 'unknown';
  return {
    issueId: seed.id,
    level: seed.level,
    source: seed.source,
    client: known ? epoch.client : '',
    model: known ? epoch.model : '',
    sessionRef: seed.source === 'mcp-declaration' ? `demo-session-${seed.key.toLowerCase()}` : '',
    evidence: evidenceOf(seed),
    decidedAt: seed.closedAt === '' ? seed.updatedAt : seed.closedAt,
  };
}

/** Every involvement of the demo dataset (SPEC §5: one row per ticket). */
export function sampleInvolvements(
  seeds: readonly Seed[],
  epochs: readonly Epoch[] = sampleEpochs(),
): readonly Involvement[] {
  return seeds.map((seed) => involvementOf(seed, epochs));
}

/**
 * The status history of one ticket (SPEC §6 "Délai", SPEC §17 "Historique Jira").
 *
 * A ticket that waited carries a `Blocked` step: the waiting time does not
 * count in the delay (SPEC §6 "Délai").
 */
export function statusHistoryOf(seed: Seed): StatusHistory {
  if (seed.closedAt === '') {
    const changes: readonly StatusChange[] = [{ from: 'À faire', to: 'En cours', at: seed.createdAt }];
    return { issueId: seed.id, changes, closed: false, closedStatus: '' };
  }
  const startedAt = addHours(seed.closedAt, -seed.leadTimeH);
  const changes: StatusChange[] = [{ from: 'À faire', to: 'En cours', at: startedAt }];
  if (seed.position % 9 === 4) {
    const blockedAt = addHours(seed.closedAt, -Math.round(seed.leadTimeH / 2));
    changes.push({ from: 'En cours', to: 'Blocked', at: blockedAt });
    changes.push({ from: 'Blocked', to: 'En cours', at: addHours(blockedAt, 6) });
  }
  if (seed.failure.reopened) {
    const firstClose = addHours(seed.closedAt, -24);
    changes.push({ from: 'En cours', to: 'Terminé', at: firstClose });
    changes.push({ from: 'Terminé', to: 'En cours', at: addHours(firstClose, 6) });
  } else {
    changes.push({ from: 'En cours', to: 'En relecture', at: addHours(seed.closedAt, -6) });
  }
  changes.push({ from: 'En cours', to: seed.closedStatus, at: seed.closedAt });
  return { issueId: seed.id, changes, closed: true, closedStatus: seed.closedStatus };
}

/** Every status history of the demo dataset. */
export function sampleHistories(seeds: readonly Seed[]): readonly StatusHistory[] {
  return seeds.map(statusHistoryOf);
}

/**
 * The reopenings of one ticket (SPEC §6 "Réouverture").
 *
 * A reopening shorter than ten minutes is administrative and does not count
 * (SPEC §6, "Réouvertures administratives").
 */
export function reopeningsOf(seed: Seed): readonly ReopeningFact[] {
  if (seed.reopenedAt === '') return [];
  return [{
    issueId: seed.id,
    reopenedAt: seed.reopenedAt,
    durationMin: seed.reopenDurationMin,
    counts: seed.reopenDurationMin >= 10,
  }];
}

/** Every reopening of the demo dataset. */
export function sampleReopenings(seeds: readonly Seed[]): readonly ReopeningFact[] {
  return seeds.flatMap(reopeningsOf);
}
