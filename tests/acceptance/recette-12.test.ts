/**
 * Recette 12 (SPEC §22) : « Aucun outil MCP ne renvoie de nom de personne. »
 * DP-15, DP-17 — transverse : les neuf outils sont balayés, via le registre,
 * par la garde d'anonymat de L1 (`isPersonSafe`).
 */
import { describe, expect, it } from 'vitest';
import { runTool } from '../../src/actions/registry.js';
import { isPersonSafe } from '../../src/domain/privacy.js';
import { MCP_TOOL_KEYS, type McpToolKey } from '../../src/types-mcp.js';
import { sampleCard, sampleEpoch, sampleInvolvement, sampleSettings } from '../db/fixtures.js';
import { createTestApp, fakeTicket, seedTicket } from '../handlers/app-deps.js';

/** One valid payload per tool, so the sweep reaches every answer shape. */
const PAYLOADS: Readonly<Record<McpToolKey, unknown>> = {
  'should-delegate': { issueKey: 'PROJ-1' },
  'list-delegable-work': { jql: 'project = PROJ', limit: 10 },
  'get-delegation-evidence': { issueKey: 'PROJ-1' },
  'get-delegation-map': { projectKey: 'PROJ' },
  'get-cohort': { projectKey: 'PROJ', nature: 'migration', zone: 'billing', size: 'M' },
  'get-calibration': { projectKey: 'PROJ' },
  'record-involvement': { issueKey: 'PROJ-1', level: 'driven', client: 'forge-cli', model: 'model-a', session: 's-1' },
  'record-decision': { issueKey: 'PROJ-1', decision: 'keep-human', reason: 'critères acceptés' },
  'report-takeover': { issueKey: 'PROJ-1', reason: 'boucle de l’agent' },
};

describe('recette-12 — aucun outil MCP ne renvoie de nom de personne', () => {
  it('les neuf outils passent le balayage d’anonymat', async () => {
    const app = await createTestApp();
    await app.stores.settings.save(sampleSettings());
    await app.stores.epoch.save(sampleEpoch());
    await app.stores.recommendation.save(sampleCard('PROJ-1'));
    await app.stores.involvement.save(sampleInvolvement('PROJ-1'));
    seedTicket(app.jira, fakeTicket('PROJ-1', 'PROJ-1'));

    // Le balayage couvre bien les neuf outils du registre, sans oubli.
    expect([...Object.keys(PAYLOADS)].sort()).toEqual([...MCP_TOOL_KEYS].sort());

    for (const key of MCP_TOOL_KEYS) {
      const result = await runTool(app.deps, key, PAYLOADS[key]);
      expect(isPersonSafe(result.data), key).toBe(true);
      expect(isPersonSafe(result.error), key).toBe(true);
    }
  });
});
