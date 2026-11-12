/**
 * Tests de la chaîne « Historique Jira » : ADF, liens, historique, passerelle.
 * Aucun réseau (SPEC §17). Règle : fichiers < 500 lignes.
 */
import { describe, it, expect } from 'vitest';
import { hasAcceptanceCriteria, parseDescriptionAdf, adfToPlainText } from '../../src/collect/jira-adf.js';
import { parseIssueLinks } from '../../src/collect/jira-links.js';
import { parseStatusChanges, statusHistoryFrom, isDoneStatus, parseCurrentStatus } from '../../src/collect/jira-history.js';
import { createJiraGateway, parseTicket, parseSearchResults } from '../../src/collect/jira.js';
import { fakeRequestJira } from './fakes.js';

const CRITERIA_DOC = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Contexte' }] },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: "Critères d'acceptation" }] },
    { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ça marche' }] }] }] },
  ],
};

describe('jira-adf', () => {
  it('détecte une section critères d’acceptation (fr)', () => {
    expect(hasAcceptanceCriteria(parseDescriptionAdf(CRITERIA_DOC))).toBe(true);
  });

  it('détecte « Acceptance criteria » (en)', () => {
    const doc = { type: 'doc', content: [{ type: 'heading', content: [{ type: 'text', text: 'Acceptance criteria' }] }] };
    expect(hasAcceptanceCriteria(parseDescriptionAdf(doc))).toBe(true);
  });

  it('renvoie false sans section critères', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Rien' }] }] };
    expect(hasAcceptanceCriteria(parseDescriptionAdf(doc))).toBe(false);
  });

  it('description absente → null, texte vide', () => {
    expect(parseDescriptionAdf(null)).toBeNull();
    expect(parseDescriptionAdf('   ')).toBeNull();
    expect(adfToPlainText(null)).toBe('');
  });

  it('rend le texte brut d’un document ADF', () => {
    expect(adfToPlainText(parseDescriptionAdf(CRITERIA_DOC))).toContain('Ça marche');
  });
});

describe('jira-links', () => {
  it('mappe un lien « is caused by » vers caused-by', () => {
    const links = parseIssueLinks('PROJ-1', [
      { type: { name: 'Causes', inward: 'is caused by', outward: 'causes' }, inwardIssue: { key: 'PROJ-2', fields: { issuetype: { name: 'Bug' }, created: '2026-10-05T00:00:00.000Z' } } },
    ]);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ issueId: 'PROJ-1', linkedIssueId: 'PROJ-2', type: 'caused-by', linkedIsBug: true, createdAt: '2026-10-05T00:00:00.000Z' });
  });

  it('détecte un incident JSM', () => {
    const links = parseIssueLinks('PROJ-1', [
      { type: { name: 'Relates', inward: 'relates to' }, outwardIssue: { key: 'INC-9', fields: { issuetype: { name: 'Incident' } } } },
    ]);
    expect(links[0]?.linkedIsIncident).toBe(true);
    expect(links[0]?.type).toBe('relates-to');
  });

  it('ignore un type de lien inconnu et une liste absente', () => {
    expect(parseIssueLinks('PROJ-1', [{ type: { name: 'Cloners' }, outwardIssue: { key: 'X' } }])).toEqual([]);
    expect(parseIssueLinks('PROJ-1', null)).toEqual([]);
  });
});

describe('jira-history', () => {
  it('parse les changements de statut du changelog', () => {
    const changes = parseStatusChanges({
      values: [
        { created: '2026-10-01T00:00:00.000Z', items: [{ field: 'status', fromString: 'To Do', toString: 'In Progress' }] },
        { created: '2026-10-02T00:00:00.000Z', items: [{ field: 'assignee', fromString: 'a', toString: 'b' }] },
        { created: '2026-10-03T00:00:00.000Z', items: [{ field: 'status', fromString: 'In Progress', toString: 'Done' }] },
      ],
    });
    expect(changes).toHaveLength(2);
    expect(changes[0]).toEqual({ from: 'To Do', to: 'In Progress', at: '2026-10-01T00:00:00.000Z' });
  });

  it('marque fermé quand le statut courant est un statut de fin', () => {
    const history = statusHistoryFrom('PROJ-1', 'Done', { values: [] });
    expect(history.closed).toBe(true);
    expect(history.closedStatus).toBe('Done');
    expect(isDoneStatus('Fermé')).toBe(true);
    expect(isDoneStatus('In Progress')).toBe(false);
  });

  it('statut courant absent → chaîne vide', () => {
    expect(parseCurrentStatus(null)).toBe('');
    expect(parseCurrentStatus({ fields: { status: { name: 'Open' } } })).toBe('Open');
  });
});

describe('jira gateway', () => {
  const TICKET = {
    id: '10001',
    key: 'PROJ-1',
    fields: {
      summary: 'Réparer', status: { name: 'Done' }, issuetype: { name: 'Bug' },
      project: { id: '100', key: 'PROJ' }, components: [{ name: 'core' }], labels: ['urgent'],
      description: CRITERIA_DOC, created: '2026-10-01T00:00:00.000Z', updated: '2026-10-02T00:00:00.000Z',
      customfield_10016: 3, customfield_10020: { id: 'sprint-9', state: 'active' },
    },
  };

  it('parse un ticket complet (story points, sprint, composants)', () => {
    const ticket = parseTicket(TICKET);
    expect(ticket).not.toBeNull();
    expect(ticket?.storyPoints).toBe(3);
    expect(ticket?.sprintId).toBe('sprint-9');
    expect(ticket?.components).toEqual(['core']);
    expect(ticket?.labels).toEqual(['urgent']);
    expect(ticket?.projectKey).toBe('PROJ');
  });

  it('parse les résultats d’une recherche JQL', () => {
    const list = parseSearchResults({ issues: [TICKET] });
    expect(list).toHaveLength(1);
    expect(list[0]?.key).toBe('PROJ-1');
  });

  it('getTicket rend le ticket via le transport fake', async () => {
    const gw = createJiraGateway({ requestJira: fakeRequestJira({ '/rest/api/3/issue/PROJ-1': TICKET }) });
    const ticket = await gw.getTicket('PROJ-1');
    expect(ticket?.summary).toBe('Réparer');
  });

  it('ticket absent → null (jamais d’exception)', async () => {
    const gw = createJiraGateway({ requestJira: fakeRequestJira({}) });
    expect(await gw.getTicket('NOPE-1')).toBeNull();
  });

  it('writeCustomField rend true sur 2xx, false sur refus', async () => {
    const okGw = createJiraGateway({ requestJira: fakeRequestJira({ '/rest/api/3/issue/PROJ-1': {} }) });
    expect(await okGw.writeCustomField('PROJ-1', 'customfield_99', 'valeur')).toBe(true);
    const refused = createJiraGateway({ requestJira: async () => ({ ok: false, status: 403, json: async () => null }) });
    expect(await refused.writeCustomField('PROJ-1', 'customfield_99', 'valeur')).toBe(false);
  });

  it('searchJql borne au limit demandé', async () => {
    const gw = createJiraGateway({ requestJira: fakeRequestJira({ '/rest/api/3/search': { issues: [TICKET, TICKET, TICKET] } }) });
    const found = await gw.searchJql('project = PROJ', 2);
    expect(found.length).toBeLessThanOrEqual(3);
  });
});