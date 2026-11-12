/**
 * The involvement floor, traversed on the reference database.
 *
 * Covers: DP-01, DP-02, DP-03, DP-23.
 *
 * The five sources of SPEC §5 read the base; the retained level is the best
 * source; the unknown share is close to 40 %; an unknown involvement is never
 * counted as "without an agent".
 */
import { describe, expect, it } from 'vitest';
import { base, inconnus } from '../helpers/base.js';
import { LEVELS, SOURCES } from '../../src/types.js';
import { armOf } from '../../src/domain/cohort.js';
import { knownInvolvement, resolveInvolvement } from '../../src/domain/involvement.js';
import { unknownShare } from '../../src/domain/privacy.js';
import { FIELD_INVOLVEMENT } from '../../src/sample/history.js';

describe('l’implication lue sur la base', () => {
  it('couvre les cinq niveaux et les cinq sources du SPEC §5', () => {
    const current = base();
    const levels = new Set(current.involvements.map((item) => item.level));
    const sources = new Set(current.involvements.map((item) => item.source));
    expect([...levels].sort()).toEqual([...LEVELS].sort());
    expect([...sources].sort()).toEqual([...SOURCES].sort());
  });

  it('lit la source retenue, jamais un inconnu déguisé en « sans agent »', () => {
    // PROJ-540 is the "mute agent" case: no signature, no declaration.
    const p540 = base().tickets.find((ticket) => ticket.key === 'PROJ-540');
    expect(p540?.level).toBe('unknown');
    expect(armOf(p540!.level)).toBeNull();
    // PROJ-531 has mixed commits: signed and unsigned, level "assisted".
    const p531 = base().tickets.find((ticket) => ticket.key === 'PROJ-531');
    expect(p531?.level).toBe('assisted');
    expect(armOf(p531!.level)).toBe('agent');
  });

  it('rend l’inconnue ≈ 40 % du jeu, hors de tout bras', () => {
    const current = base();
    const share = unknownShare(current.involvements);
    expect(Math.round(share.rate * 100)).toBeGreaterThanOrEqual(39);
    expect(Math.round(share.rate * 100)).toBeLessThanOrEqual(43);
    // The known share is the complement, with its own size and interval.
    const known = knownInvolvement(current.involvements);
    expect(known.n).toBe(current.involvements.length);
    expect(known.rate).toBeCloseTo((current.involvements.length - inconnus().length) / current.involvements.length, 2);
    expect(known.ciLow).toBeLessThan(known.rate);
    expect(known.rate).toBeLessThan(known.ciHigh);
  });

  it('préremplit le champ d’implication à la clôture depuis la base', () => {
    // The closure field carries the declared level (SPEC §5 source 5, DP-23).
    const declared = base().tickets.filter((ticket) => ticket.source === 'closure-field' && ticket.level !== 'unknown');
    expect(declared.length).toBeGreaterThan(0);
    for (const ticket of declared) {
      expect(ticket.jira.customFields[FIELD_INVOLVEMENT]).toBe(ticket.level);
    }
  });

  it('arbitre la meilleure source, dans l’ordre du SPEC §5', () => {
    const wala = base().involvements.find((item) => item.source === 'mcp-declaration');
    expect(wala).toBeDefined();
    const resolved = resolveInvolvement(wala!.issueId, [
      { source: 'adoption-date', level: 'unknown', evidence: '' },
      { source: 'mcp-declaration', level: wala!.level, evidence: 'tool:code-agent' },
    ], base().now, wala!.client, wala!.model, wala!.sessionRef);
    expect(resolved?.source).toBe('mcp-declaration');
    expect(resolved?.level).toBe(wala!.level);
  });
});