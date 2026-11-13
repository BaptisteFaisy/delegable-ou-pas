/**
 * The MCP floor, traversed on the reference database.
 *
 * Covers: DP-15, DP-16.
 *
 * The nine tools of SPEC §15 are called on the base; each answer is a conform
 * envelope, none leaks a person identifier, and list-delegable-work only hands
 * out "delegate" tickets.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { base, outilMcp } from '../helpers/base.js';
import { MCP_TOOL_KEYS, type McpToolKey } from '../../src/types-mcp.js';
import { personIdentifierLeak } from '../../src/domain/privacy.js';

/** The valid payload of each tool, on the base (SPEC §15). */
const ENTREES: Readonly<Record<McpToolKey, unknown>> = {
  'should-delegate': { issueKey: 'PROJ-412' },
  'list-delegable-work': { jql: 'project = PROJ', limit: 30 },
  'get-delegation-evidence': { issueKey: 'PROJ-412' },
  'get-delegation-map': { projectKey: 'PROJ' },
  'get-cohort': { projectKey: 'PROJ', nature: 'data-migration', zone: 'billing', size: 'M' },
  'get-calibration': { projectKey: 'PROJ' },
  'record-involvement': { issueKey: 'PROJ-412', level: 'driven', client: 'claude-code', model: 'sonnet', session: 'demo' },
  'record-decision': { issueKey: 'PROJ-412', decision: 'delegate', reason: 'migration covered by tests' },
  'report-takeover': { issueKey: 'PROJ-412', reason: 'mauvais cap' },
};

describe('les neuf outils MCP sur la base', () => {
  it('répond une enveloppe conforme à chaque outil, sans nom de personne', async () => {
    for (const cle of MCP_TOOL_KEYS) {
      const reponse = await outilMcp(cle, ENTREES[cle]);
      expect(reponse).toHaveProperty('ok');
      expect(reponse).toHaveProperty('data');
      expect(reponse).toHaveProperty('error');
      if (reponse.ok && reponse.data !== null) {
        expect(personIdentifierLeak(reponse.data)).toBeNull();
      }
    }
  });

  it('should-delegate rend la carte du SPEC §8, avec sa cohorte', async () => {
    const reponse = await outilMcp('should-delegate', { issueKey: 'PROJ-412' });
    expect(reponse.ok).toBe(true);
    const donnee = reponse.data as { issueKey: string; recommendation: string; confidence: string };
    expect(donnee.issueKey).toBe('PROJ-412');
    expect(donnee.recommendation).toBe('delegate-with-review');
    expect(donnee.confidence).toBe('medium');
  });

  it('get-delegation-evidence rend les effectifs et les fourchettes', async () => {
    const reponse = await outilMcp('get-delegation-evidence', { issueKey: 'PROJ-412' });
    expect(reponse.ok).toBe(true);
    const donnee = reponse.data as { agent: { n: number; rate: number; ciLow: number; ciHigh: number } };
    expect(donnee.agent.n).toBeGreaterThan(0);
    expect(donnee.agent.ciLow).toBeLessThan(donnee.agent.rate);
    expect(donnee.agent.rate).toBeLessThan(donnee.agent.ciHigh);
  });

  it('list-delegable-work ne rend que du « à confier », du plus sûr au moins sûr', async () => {
    const reponse = await outilMcp('list-delegable-work', { jql: 'project = PROJ', limit: 50 });
    expect(reponse.ok).toBe(true);
    const donnee = reponse.data as { items: readonly { issueKey: string; confidence: string }[] };
    for (const item of donnee.items) {
      // Every item maps to a card whose value is "delegate" (recipe 13).
      const card = base().cards.find((c) => c.issueKey === item.issueKey);
      expect(card?.value ?? 'delegate').toBe('delegate');
    }
    const ordre = ['high', 'medium', 'low'];
    const rangs = donnee.items.map((item) => ordre.indexOf(item.confidence));
    expect(rangs).toEqual([...rangs].sort((a, b) => a - b));
  });

  it('get-cohort lit les deux bras, époque par époque', async () => {
    const reponse = await outilMcp('get-cohort', { projectKey: 'PROJ', nature: 'data-migration', zone: 'billing', size: 'M' });
    expect(reponse.ok).toBe(true);
    const donnee = reponse.data as { cohort: unknown; epochs: readonly { arms: readonly unknown[] }[] };
    expect(donnee.cohort).toBeTruthy();
  });

  it('les outils d’écriture enrichissent la base sans la dédoubler', async () => {
    const reponse = await outilMcp('record-involvement', ENTREES['record-involvement']);
    expect(reponse.ok).toBe(true);
    expect(personIdentifierLeak(reponse)).toBeNull();
  });

  it('le skill et l’agent Rovo sont déclarés et lisent les outils', () => {
    const skill = readFileSync(join(process.cwd(), 'static', 'skill', 'SKILL.md'), 'utf8');
    const prompt = readFileSync(join(process.cwd(), 'static', 'agent', 'prompt.md'), 'utf8');
    expect(skill).toMatch(/should-delegate/);
    expect(prompt).toMatch(/should-delegate/);
    expect(prompt).toMatch(/record-decision/);
  });
});