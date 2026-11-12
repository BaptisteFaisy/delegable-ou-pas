/**
 * Tests de l'adaptateur LLM (repli déterministe) et de la détection d'auteur
 * robot (SPEC §17, DP-06, DP-26, SPEC §5 source 2). Aucun réseau.
 */
import { describe, it, expect } from 'vitest';
import { createLlmGateway, extractText, parseJsonBlock } from '../../src/collect/llm.js';
import { isRobotAccount, authorIsBot } from '../../src/collect/identity.js';

function clientReturning(content: unknown) {
  return { chat: async () => ({ choices: [{ message: { content } }] }) };
}

describe('llm gateway', () => {
  it('extrait le texte d’une réponse fragmentée', () => {
    expect(extractText([{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }])).toBe('ab');
    expect(extractText('direct')).toBe('direct');
  });

  it('parse un bloc JSON, y compris markdown', () => {
    expect(parseJsonBlock<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonBlock<{ a: number }>('```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(parseJsonBlock('pas du json')).toBeNull();
  });

  it('classe la nature validée par le modèle', async () => {
    const gw = createLlmGateway(clientReturning(JSON.stringify({ nature: 'bugfix', rationale: 'court' })));
    const result = await gw.classifyNature('texte', ['bugfix', 'feature']);
    expect(result).toEqual({ nature: 'bugfix', rationale: 'court' });
  });

  it('repli déterministe quand le modèle rend une nature hors liste', async () => {
    const gw = createLlmGateway(clientReturning(JSON.stringify({ nature: 'inconnue' })));
    const result = await gw.classifyNature('texte', ['bugfix', 'feature']);
    expect(result.nature).toBe('bugfix');
    expect(result.rationale).toContain('Modèle indisponible');
  });

  it('repli quand le client est absent ou plante', async () => {
    const broken = { chat: async () => { throw new Error('panne'); } };
    const gw = createLlmGateway(broken);
    const result = await gw.classifyNature('texte', ['feature']);
    expect(result.nature).toBe('feature');
  });

  it('résume les causes d’échec, liste vide sans commentaire', async () => {
    const gw = createLlmGateway(clientReturning(JSON.stringify([{ cause: 'spec floue', count: 3 }])));
    expect(await gw.summarizeFailureCauses(['c1', 'c2'], 5)).toEqual([{ cause: 'spec floue', count: 3 }]);
    expect(await gw.summarizeFailureCauses([], 5)).toEqual([]);
  });

  it('borne et valide la sortie des causes', async () => {
    const gw = createLlmGateway(clientReturning(JSON.stringify([{ cause: '', count: 1 }, { cause: 'ok', count: 'x' }, { cause: 'valide', count: 2 }])));
    const causes = await gw.summarizeFailureCauses(['c'], 10);
    expect(causes).toEqual([{ cause: 'valide', count: 2 }]);
  });
});

describe('identité robot', () => {
  it('reconnaît les comptes robots', () => {
    expect(isRobotAccount('dependabot[bot]', '')).toBe(true);
    expect(isRobotAccount('', 'Renovate Bot')).toBe(true);
    expect(isRobotAccount('github-actions', '')).toBe(true);
  });

  it('ne marque pas un humain', () => {
    expect(isRobotAccount('acct-123', 'Alice Dupont')).toBe(false);
    expect(authorIsBot('', '')).toBe(false);
  });
});