/**
 * Recette 12 (SPEC §22) : « Aucun outil MCP ne renvoie de nom de personne. »
 * DP-15, DP-17 — transverse : les neuf outils sont balayés, via le registre,
 * par la garde d'anonymat de L1 (`isPersonSafe`), sur la base de référence.
 */
import { describe, expect, it } from 'vitest';
import { runTool } from '../../src/actions/registry.js';
import { isPersonSafe } from '../../src/domain/privacy.js';
import { MCP_TOOL_KEYS, type McpToolKey } from '../../src/types-mcp.js';
import { baseDepsFrais } from '../helpers/base.js';

/** One valid payload per tool, so the sweep reaches every answer shape. */
const PAYLOADS: Readonly<Record<McpToolKey, unknown>> = {
  'should-delegate': { issueKey: 'PROJ-412' },
  'list-delegable-work': { jql: 'project = PROJ', limit: 10 },
  'get-delegation-evidence': { issueKey: 'PROJ-412' },
  'get-delegation-map': { projectKey: 'PROJ' },
  'get-cohort': { projectKey: 'PROJ', nature: 'data-migration', zone: 'billing', size: 'M' },
  'get-calibration': { projectKey: 'PROJ' },
  'record-involvement': { issueKey: 'PROJ-412', level: 'driven', client: 'forge-cli', model: 'model-a', session: 's-1' },
  'record-decision': { issueKey: 'PROJ-412', decision: 'keep-human', reason: 'critères acceptés' },
  'report-takeover': { issueKey: 'PROJ-412', reason: 'boucle de l’agent' },
};

describe('recette-12 — aucun outil MCP ne renvoie de nom de personne', () => {
  it('les neuf outils passent le balayage d’anonymat', async () => {
    const deps = await baseDepsFrais();

    // Le balayage couvre bien les neuf outils du registre, sans oubli.
    expect([...Object.keys(PAYLOADS)].sort()).toEqual([...MCP_TOOL_KEYS].sort());

    for (const key of MCP_TOOL_KEYS) {
      const result = await runTool(deps, key, PAYLOADS[key]);
      expect(isPersonSafe(result.data), key).toBe(true);
      expect(isPersonSafe(result.error), key).toBe(true);
    }
  });
});
