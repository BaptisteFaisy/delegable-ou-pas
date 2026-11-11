/**
 * Tests of the five sources of involvement (SPEC §5, SPEC §13; DP-01, DP-03,
 * recipes 1, 2 and 3).
 */
import { describe, expect, it } from 'vitest';
import type { CommitFact, Involvement, Level, SourceCandidate } from '../../src/types.js';
import { LEVEL_ORDER } from '../../src/types.js';
import {
  bestCandidate,
  fromAdoptionDate,
  fromBotAuthor,
  fromClosureField,
  fromCommitMention,
  fromDeclaration,
  knownInvolvement,
  resolveInvolvement,
  signedShare,
} from '../../src/domain/involvement.js';

/** One commit fact; the message itself never reaches the domain (SPEC §17). */
function fact(overrides: Partial<CommitFact> = {}): CommitFact {
  return {
    issueId: 'PROJ-1',
    commitRef: 'commit-1',
    hasSignature: false,
    agentName: '',
    authorIsBot: false,
    committedAt: '2026-03-02T09:00:00Z',
    ...overrides,
  };
}

/** One declaration made through the MCP tool (SPEC §15). */
function declaration(level: Level) {
  return { issueKey: 'PROJ-1', level, client: 'claude-code', model: 'sonnet', session: 's-1' };
}

/** An involvement built by hand, for the health indicator. */
function involvement(level: Level): Involvement {
  return {
    issueId: 'PROJ-1',
    level,
    source: 'commit-mention',
    client: '',
    model: '',
    sessionRef: '',
    evidence: [],
    decidedAt: '2026-03-02T10:00:00Z',
  };
}

describe('sources de l’implication', () => {
  it('recette-01 — un commit qui porte une mention va dans le bras « avec agent », source « mention de commit »', () => {
    const candidate = fromCommitMention(
      [fact({ hasSignature: true, agentName: 'Claude Code' })],
      '2026-03-02T10:00:00Z',
    );
    expect(candidate).not.toBeNull();
    const resolved = resolveInvolvement(
      'PROJ-1',
      candidate === null ? [] : [candidate],
      '2026-03-02T10:00:00Z',
      '',
      '',
      '',
    );
    expect(resolved?.source).toBe('commit-mention');
    expect(resolved?.level).toBe('assisted');
    expect(LEVEL_ORDER.none).toBeLessThan(LEVEL_ORDER.assisted);
  });

  it('recette-02 — un ticket sans aucun élément reste inconnu et n’entre dans aucun bras', () => {
    const resolved = resolveInvolvement('PROJ-1', [], '2026-03-02T10:00:00Z', '', '', '');
    expect(resolved).toBeNull();
    expect(LEVEL_ORDER.unknown).toBeLessThan(LEVEL_ORDER.none);
  });

  it('recette-03 — un ticket clos avant la date d’adoption va dans le bras « sans agent »', () => {
    const candidate = fromAdoptionDate('2026-03-02T17:00:00Z', '2026-04-01T00:00:00Z');
    expect(candidate.level).toBe('none');
    expect(candidate.source).toBe('adoption-date');
    const resolved = resolveInvolvement('PROJ-1', [candidate], '2026-03-02T18:00:00Z', '', '', '');
    expect(resolved?.level).toBe('none');
  });

  it('retient la source la plus sûre et la rend', () => {
    const candidates: readonly SourceCandidate[] = [
      { source: 'adoption-date', level: 'unknown', evidence: '' },
      { source: 'commit-mention', level: 'assisted', evidence: '' },
      { source: 'mcp-declaration', level: 'driven', evidence: '' },
    ];
    expect(bestCandidate(candidates)?.source).toBe('mcp-declaration');
    expect(bestCandidate([])).toBeNull();
  });

  it('donne un niveau assistée et rend la part signée quand les commits sont mêlés', () => {
    const facts = [
      fact({ hasSignature: true, agentName: 'Claude Code' }),
      fact({ commitRef: 'commit-2', hasSignature: false }),
    ];
    expect(signedShare(facts)).toBe(0.5);
    const candidate = fromCommitMention(facts, '2026-03-02T10:00:00Z');
    expect(candidate?.level).toBe('assisted');
    expect(candidate?.evidence).toContain('signed-share:0.5');
  });

  it('laisse l’implication inconnue quand l’agent ne signe ni ne déclare', () => {
    expect(fromCommitMention([fact()], '2026-03-02T10:00:00Z')).toBeNull();
    expect(fromBotAuthor([fact()])).toBeNull();
    expect(resolveInvolvement('PROJ-1', [], '2026-03-02T10:00:00Z', '', '', '')).toBeNull();
  });

  it('ne donne aucun candidat de commit pour un ticket sans commit', () => {
    expect(fromBotAuthor([])).toBeNull();
    expect(fromCommitMention([], '2026-03-02T10:00:00Z')).toBeNull();
    expect(signedShare([])).toBe(0);
    expect(resolveInvolvement('PROJ-1', [], '2026-03-02T10:00:00Z', '', '', '')).toBeNull();
  });

  it('lit le niveau déclaré dans le champ de clôture', () => {
    expect(fromClosureField('Assistée')?.level).toBe('assisted');
    expect(fromClosureField('Aucune')?.level).toBe('none');
    expect(fromClosureField('Autonome')?.level).toBe('autonomous');
    expect(fromClosureField('')).toBeNull();
    expect(fromClosureField('je ne sais pas')).toBeNull();
  });

  it('déduit un candidat autonome d’un auteur robot', () => {
    const candidate = fromBotAuthor([fact({ authorIsBot: true })]);
    expect(candidate?.source).toBe('bot-author');
    expect(candidate?.level).toBe('autonomous');
  });

  it('ne dit rien d’un ticket clos après la date d’adoption', () => {
    expect(fromAdoptionDate('2026-04-02T17:00:00Z', '2026-04-01T00:00:00Z').level).toBe('unknown');
  });

  it('porte le niveau déclaré par l’outil MCP', () => {
    const candidate = fromDeclaration(declaration('driven'), '2026-03-02T10:00:00Z');
    expect(candidate.source).toBe('mcp-declaration');
    expect(candidate.level).toBe('driven');
    expect(candidate.evidence).toContain('declared-by:claude-code');
  });

  it('rend le taux d’implication connue pour la santé de l’app', () => {
    const rate = knownInvolvement([
      involvement('assisted'),
      involvement('none'),
      involvement('unknown'),
    ]);
    expect(rate.known).toBe(2);
    expect(rate.total).toBe(3);
    expect(rate.rate).toBeCloseTo(2 / 3);
    expect(knownInvolvement([]).rate).toBeNull();
  });
});