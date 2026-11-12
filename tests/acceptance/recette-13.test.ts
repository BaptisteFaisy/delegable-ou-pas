/**
 * Recette 13 (SPEC §22) : « list-delegable-work ne renvoie que des tickets
 * "à confier". » DP-15 — de bout en bout, via le registre, sur le fake Jira.
 */
import { describe, expect, it } from 'vitest';
import { runTool } from '../../src/actions/registry.js';
import type { ListDelegableWorkOutput } from '../../src/types-mcp.js';
import { sampleCard, sampleEpoch, sampleSettings } from '../db/fixtures.js';
import { createTestApp, fakeSummary } from '../handlers/app-deps.js';

describe('recette-13 — list-delegable-work', () => {
  it('ne renvoie que des tickets « à confier », les plus sûrs d’abord', async () => {
    const app = await createTestApp();
    await app.stores.settings.save(sampleSettings());
    await app.stores.epoch.save(sampleEpoch());

    const cards = [
      { ...sampleCard('PROJ-1'), value: 'delegate', confidence: 'medium' },
      { ...sampleCard('PROJ-2'), value: 'keep-human', confidence: 'high' },
      { ...sampleCard('PROJ-3'), value: 'not-enough-data', confidence: 'low' },
      { ...sampleCard('PROJ-4'), value: 'delegate-with-review', confidence: 'high' },
      { ...sampleCard('PROJ-5'), value: 'delegate', confidence: 'high' },
    ] as const;
    for (const card of cards) {
      app.jira.search.push(fakeSummary(card.issueId, card.issueKey));
      await app.stores.recommendation.save(card);
    }

    const result = await runTool(app.deps, 'list-delegable-work', { jql: 'project = PROJ', limit: 10 });
    expect(result.ok).toBe(true);
    const output = result.data as ListDelegableWorkOutput;
    // Ni « à garder », ni « pas assez de recul », ni « relecture renforcée ».
    expect(output.items.map((item) => item.issueKey)).toEqual(['PROJ-5', 'PROJ-1']);
  });
});
