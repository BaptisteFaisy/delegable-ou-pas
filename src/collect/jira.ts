/**
 * Chain "Historique Jira": implements `JiraGateway` (SPEC §17, SPEC §16.5,
 * DP-23, DP-24, DP-25).
 *
 * The adapter reads Jira through the shared transport (`http.ts`) and writes
 * back only the two custom fields the app owns; a refused write returns `false`,
 * never an exception (SPEC §17). A missing ticket → `null`, an empty field →
 * `''` / `[]` (SPEC §20 "données absentes = normales"). Every search is bounded
 * by a `limit` (SPEC §19 "aucune liste sans limite").
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { JiraGateway } from '../ports.js';
import type { AdfNode, JiraTicket, JiraTicketSummary } from '../types-graph.js';
import { createHttpClient, toHttpText, HttpError, type HttpInit } from './http.js';
import { parseDescriptionAdf } from './jira-adf.js';
import { parseCurrentStatus, statusHistoryFrom } from './jira-history.js';
import { parseIssueLinks } from './jira-links.js';

/** Fields read on a ticket (bounded: never `*all`, SPEC §19). */
const TICKET_FIELDS =
  'summary,status,issuetype,project,components,labels,description,created,updated,' +
  'customfield_10016,customfield_10020,customfield_10106';

/** Fields read on a search result (light summaries, SPEC §15, DP-24). */
const SUMMARY_FIELDS = 'summary,status,customfield_10016,customfield_10106';

/** Candidate custom fields for story points (project-dependent). */
const STORY_POINTS_FIELDS = ['customfield_10016', 'customfield_10106'] as const;

/** Custom field of the sprint (project-dependent, DP-24). */
const SPRINT_FIELD = 'customfield_10020';

/** The Forge Jira request function, structurally typed (injected as `unknown`). */
type JiraRequest = (path: string, init?: HttpInit) => Promise<unknown>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Resolves the Forge `requestJira` from the injected api (asUser > asApp > direct). */
function resolveRequestJira(api: unknown): JiraRequest | null {
  const a = asRecord(api);
  if (a === null) return null;
  if (typeof a['requestJira'] === 'function') return a['requestJira'] as JiraRequest;
  for (const scope of ['asUser', 'asApp'] as const) {
    const factory = a[scope];
    if (typeof factory === 'function') {
      const scoped = asRecord((factory as () => unknown)());
      if (scoped !== null && typeof scoped['requestJira'] === 'function') {
        return scoped['requestJira'] as JiraRequest;
      }
    }
  }
  return null;
}

/** A Jira custom field → string (a simple value, `value`/`name` of an object, else ''). */
export function customFieldText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const record = asRecord(value);
  if (record === null) return '';
  if (typeof record['value'] === 'string') return record['value'];
  if (typeof record['name'] === 'string') return record['name'];
  return '';
}

function storyPointsFrom(fields: Record<string, unknown>): number | null {
  for (const key of STORY_POINTS_FIELDS) {
    const raw = fields[key];
    const record = asRecord(raw);
    const numeric = record !== null ? Number(record['value']) : Number(raw);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function sprintIdFrom(fields: Record<string, unknown>): string {
  const raw = fields[SPRINT_FIELD];
  const candidates = Array.isArray(raw) ? raw : raw === null || raw === undefined ? [] : [raw];
  for (const preference of ['active', 'future', 'closed']) {
    for (const candidate of candidates) {
      const record = asRecord(candidate);
      if (record === null) continue;
      const id = str(record['id']);
      const state = str(record['state']);
      if (id !== '' && (state === '' || state === preference)) return id;
    }
  }
  return '';
}

/** Raw Jira ticket → `JiraTicket`, `null` when absent or unreadable. */
export function parseTicket(payload: unknown): JiraTicket | null {
  const root = asRecord(payload);
  if (root === null) return null;
  const fields = asRecord(root['fields']);
  if (fields === null) return null;
  const id = str(root['id']);
  const key = str(root['key']);
  if (id === '' || key === '') return null;
  const project = asRecord(fields['project']);
  const issuetype = asRecord(fields['issuetype']);
  const status = asRecord(fields['status']);
  const components = Array.isArray(fields['components'])
    ? (fields['components'] as unknown[]).map((c) => str(asRecord(c)?.['name'])).filter((n) => n !== '')
    : [];
  const labels = Array.isArray(fields['labels'])
    ? (fields['labels'] as unknown[]).filter((l): l is string => typeof l === 'string')
    : [];
  const customFields: Record<string, string> = {};
  for (const [name, value] of Object.entries(fields)) {
    if (!name.startsWith('customfield_')) continue;
    const text = customFieldText(value);
    if (text !== '') customFields[name] = text;
  }
  return {
    id,
    key,
    projectId: str(project?.['id']),
    projectKey: str(project?.['key']),
    summary: str(fields['summary']),
    description: parseDescriptionAdf(fields['description']) as AdfNode | null,
    status: str(status?.['name']),
    issueType: str(issuetype?.['name']),
    components,
    labels,
    storyPoints: storyPointsFrom(fields),
    sprintId: sprintIdFrom(fields),
    createdAt: str(fields['created']),
    updatedAt: str(fields['updated']),
    customFields,
  };
}

/** Raw search issue → `JiraTicketSummary`, `null` when unreadable. */
export function parseTicketSummary(payload: unknown): JiraTicketSummary | null {
  const root = asRecord(payload);
  if (root === null) return null;
  const fields = asRecord(root['fields']);
  const id = str(root['id']);
  const key = str(root['key']);
  if (id === '' || key === '') return null;
  const status = asRecord(fields?.['status']);
  return {
    id,
    key,
    summary: str(fields?.['summary']),
    status: str(status?.['name']),
    storyPoints: fields === null ? null : storyPointsFrom(fields),
  };
}

/** A Jira search response (`{ issues: [...] }`) → summaries. */
export function parseSearchResults(payload: unknown): JiraTicketSummary[] {
  const issues = asRecord(payload)?.['issues'];
  if (!Array.isArray(issues)) return [];
  const result: JiraTicketSummary[] = [];
  for (const issue of issues) {
    const summary = parseTicketSummary(issue);
    if (summary !== null) result.push(summary);
  }
  return result;
}

/** Builds the `JiraGateway` adapter (SPEC §17). */
export function createJiraGateway(api: unknown): JiraGateway {
  const request = resolveRequestJira(api);
  const client = createHttpClient();

  async function jiraJson<T>(path: string, init?: HttpInit): Promise<T | null> {
    if (request === null) return null;
    try {
      return await client.request<T>(`jira:${path}`, async () => toHttpText(await request(path, init)));
    } catch (error: unknown) {
      if (error instanceof HttpError) return null;
      return null;
    }
  }

  const issueFields = async (issueId: string, fieldList: string): Promise<Record<string, unknown> | null> =>
    asRecord(
      await jiraJson<unknown>(
        `/rest/api/3/issue/${encodeURIComponent(issueId)}?fields=${encodeURIComponent(fieldList)}`,
      ),
    );

  return {
    getTicket: async (issueIdOrKey) =>
      parseTicket(
        await jiraJson<unknown>(
          `/rest/api/3/issue/${encodeURIComponent(issueIdOrKey)}?fields=${encodeURIComponent(TICKET_FIELDS)}`,
        ),
      ),

    searchJql: async (jql, limit) =>
      parseSearchResults(
        await jiraJson<unknown>(
          `/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=${Math.max(0, limit)}` +
            `&fields=${encodeURIComponent(SUMMARY_FIELDS)}`,
        ),
      ),

    statusHistory: async (issueId) => {
      const changelog = await jiraJson<unknown>(
        `/rest/api/3/issue/${encodeURIComponent(issueId)}/changelog?maxResults=100`,
      );
      const ticket = await jiraJson<unknown>(
        `/rest/api/3/issue/${encodeURIComponent(issueId)}?fields=status`,
      );
      return statusHistoryFrom(issueId, parseCurrentStatus(ticket), changelog);
    },

    links: async (issueId) => parseIssueLinks(issueId, (await issueFields(issueId, 'issuelinks'))?.['issuelinks']),

    components: async (issueId) => {
      const list = (await issueFields(issueId, 'components'))?.['components'];
      return Array.isArray(list)
        ? (list as unknown[]).map((c) => str(asRecord(c)?.['name'])).filter((n) => n !== '')
        : [];
    },

    labels: async (issueId) => {
      const list = (await issueFields(issueId, 'labels'))?.['labels'];
      return Array.isArray(list) ? (list as unknown[]).filter((l): l is string => typeof l === 'string') : [];
    },

    descriptionAdf: async (issueId) =>
      parseDescriptionAdf((await issueFields(issueId, 'description'))?.['description']),

    readCustomField: async (issueId, fieldId) =>
      customFieldText((await issueFields(issueId, fieldId))?.[fieldId]),

    writeCustomField: async (issueId, fieldId, value) => {
      if (request === null) return false;
      try {
        await client.request<unknown>(
          `jira:PUT:/rest/api/3/issue/${issueId}`,
          async () =>
            toHttpText(
              await request(`/rest/api/3/issue/${encodeURIComponent(issueId)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fields: { [fieldId]: value } }),
              }),
            ),
        );
        return true;
      } catch {
        return false;
      }
    },

    sprintIssues: async (sprintId, limit) =>
      parseSearchResults(
        await jiraJson<unknown>(
          `/rest/agile/1.0/sprint/${encodeURIComponent(sprintId)}/issue?maxResults=${Math.max(0, limit)}` +
            `&fields=${encodeURIComponent(SUMMARY_FIELDS)}`,
        ),
      ),
  };
}