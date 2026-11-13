/**
 * Tests of the versioned envelope and of the orchestration kit.
 *
 * What matters here: an orchestrator must be able to tell what it is talking
 * to, must not silently accept a version it does not understand, and the kit
 * must never name a tool the app does not publish.
 */
import { describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  SUPPORTED_SCHEMA_VERSIONS,
  checkCompatibility,
  envelope,
  isEnvelope,
  supports,
} from '../../src/mcp/schema.js';
import {
  CYCLE_STEPS,
  ORCHESTRATION_TOOLS,
  kitExample,
  kitMatchesRegistry,
  kitVerbsMatchRegistry,
  toolsForStep,
} from '../../src/mcp/orchestration.js';
import { MCP_TOOL_KEYS, MCP_TOOL_VERBS } from '../../src/types-mcp.js';

describe('enveloppe versionnée', () => {
  it('porte la version, l’outil, la date et l’empreinte des données', () => {
    const answer = envelope('should-delegate', { value: 'delegate' }, '2026-12-01T09:00:00Z', 'fp-123');
    expect(answer.schemaVersion).toBe(SCHEMA_VERSION);
    expect(answer.tool).toBe('should-delegate');
    expect(answer.computedAt).toBe('2026-12-01T09:00:00Z');
    expect(answer.dataFingerprint).toBe('fp-123');
    expect(answer.result).toEqual({ value: 'delegate' });
  });

  it('accepte une absence de données sans la transformer en erreur', () => {
    const answer = envelope('get-calibration', null, '2026-12-01T09:00:00Z', 'fp-123');
    expect(answer.result).toBeNull();
    expect(isEnvelope(answer)).toBe(true);
  });

  it('reconnaît une enveloppe et refuse le reste', () => {
    expect(isEnvelope(envelope('x', null, 'd', 'f'))).toBe(true);
    expect(isEnvelope({ ok: true, error: '', data: null })).toBe(false);
    expect(isEnvelope(null)).toBe(false);
    expect(isEnvelope('nope')).toBe(false);
  });

  it('traite une rupture de version majeure comme une incompatibilité', () => {
    expect(checkCompatibility('1.1.0').compatible).toBe(true);
    expect(checkCompatibility('1.0.0').compatible).toBe(true);
    const major = checkCompatibility('2.0.0');
    expect(major.compatible).toBe(false);
    expect(major.major).toBe(2);
    expect(major.message.fr).toContain('incompatible');
    expect(major.message.en).toContain('Incompatible');
  });

  it('connaît encore les versions qu’il a produites', () => {
    expect(supports('1.0.0')).toBe(true);
    expect(supports('0.9.0')).toBe(false);
    expect(SUPPORTED_SCHEMA_VERSIONS).toContain(SCHEMA_VERSION);
  });
});

describe('kit d’orchestration', () => {
  it('ne nomme que des outils publiés', () => {
    expect(kitMatchesRegistry()).toBe(true);
    ORCHESTRATION_TOOLS.forEach((tool) => {
      expect(MCP_TOOL_KEYS).toContain(tool.key);
    });
  });

  it('conserve les verbes publiés', () => {
    expect(kitVerbsMatchRegistry()).toBe(true);
    ORCHESTRATION_TOOLS.forEach((tool) => {
      expect(MCP_TOOL_VERBS[tool.key as keyof typeof MCP_TOOL_VERBS]).toBe(tool.verb);
    });
  });

  it('couvre le cycle et chaque étape a au moins un outil', () => {
    CYCLE_STEPS.forEach((step) => {
      expect(toolsForStep(step).length, `étape ${step}`).toBeGreaterThan(0);
    });
    // Neuf outils, sept étapes : plusieurs outils peuvent servir la même étape
    // (conseil, conditions), mais aucune étape du cycle ne reste sans outil.
    const covered = new Set(ORCHESTRATION_TOOLS.map((tool) => tool.step));
    expect(covered.size).toBe(CYCLE_STEPS.length);
    CYCLE_STEPS.forEach((step) => { expect(covered.has(step)).toBe(true); });
  });

  it('donne un exemple qui cite les outils du cycle', () => {
    const example = kitExample();
    expect(example).toContain('should-delegate');
    expect(example).toContain('get-delegation-evidence');
    expect(example).toContain('record-involvement');
    expect(example).toContain('report-takeover');
    expect(example).toContain('checkCompatibility');
    // Un exemple d’orchestrateur ne prend pas de ticket sans conseil.
    expect(example.indexOf('should-delegate')).toBeLessThan(example.indexOf('record-involvement'));
  });

  it('a des libellés bilingues partout', () => {
    ORCHESTRATION_TOOLS.forEach((tool) => {
      expect(tool.purpose.fr.length).toBeGreaterThan(10);
      expect(tool.purpose.en.length).toBeGreaterThan(10);
    });
  });
});
