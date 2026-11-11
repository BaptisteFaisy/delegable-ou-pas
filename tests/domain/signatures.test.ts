/**
 * Tests of the commit-mention catalogue (SPEC §5 "Les mentions de commit",
 * SPEC §17, SPEC §19; DP-02).
 */
import { describe, expect, it } from 'vitest';
import type { GraphCommit, SignatureScanInput } from '../../src/types-graph.js';
import type { SignaturePattern } from '../../src/types.js';
import {
  CONFIRMATION_NOTE,
  DEFAULT_PATTERN_IDS,
  defaultPatterns,
  matchesAny,
  normalizeMessage,
  patternNote,
  scanCommits,
  scanMessage,
} from '../../src/domain/signatures.js';

/** One graph commit, with the message the collector reads then drops. */
function commit(message: string, committedAt = '2026-03-02T09:00:00Z'): GraphCommit {
  return {
    ref: 'commit-1',
    hash: 'hash-1',
    message,
    authorIsBot: false,
    authorAccountId: 'account-1',
    committedAt,
    repository: 'demo',
    url: 'https://example.test/commit-1',
  };
}

/** One scan input, with the default catalogue. */
function scanInput(message: string): SignatureScanInput {
  return { message, patterns: defaultPatterns() };
}

describe('catalogue des mentions de commit', () => {
  it('couvre Claude Code, Codex, Cursor et Copilot, dont la forme autonome', () => {
    const patterns = defaultPatterns();
    expect(patterns.map(pattern => pattern.agentName)).toEqual([
      'Copilot (agent autonome)',
      'Claude Code',
      'Codex',
      'Cursor',
      'Copilot',
    ]);
    expect(patterns.every(pattern => pattern.enabled)).toBe(true);
    expect(patterns.every(pattern => pattern.seenCount === 0)).toBe(true);
  });

  it('demande à l’équipe de confirmer chaque motif par défaut', () => {
    for (const id of DEFAULT_PATTERN_IDS) {
      expect(patternNote(id)).toBe(CONFIRMATION_NOTE);
    }
    expect(patternNote('motif-personnalise')).toBe('');
  });

  it('trouve une mention Co-authored-by quelle que soit la casse et les espaces', () => {
    expect(matchesAny('Co-authored-by: Claude <noreply@anthropic.com>', defaultPatterns())).toEqual({
      found: true,
      agentName: 'Claude Code',
      patternId: 'claude-code',
    });
    expect(matchesAny('co-AUTHORED  by:  codex <codex@openai.com>', defaultPatterns()).agentName).toBe(
      'Codex',
    );
  });

  it('ne trouve aucune mention dans un message ordinaire', () => {
    const match = matchesAny('fix: correct the rounding of the invoice', defaultPatterns());
    expect(match.found).toBe(false);
    expect(match.agentName).toBe('');
    expect(match.patternId).toBe('');
  });

  it('ignore un motif désactivé', () => {
    const patterns: readonly SignaturePattern[] = defaultPatterns().map(pattern =>
      pattern.id === 'claude-code' ? { ...pattern, enabled: false } : pattern,
    );
    expect(scanMessage({ message: 'Co-authored-by: Claude <x>', patterns }).found).toBe(false);
  });

  it('ignore un motif invalide au lieu de lever une erreur', () => {
    const patterns: readonly SignaturePattern[] = [
      { id: 'casse', expression: '(', agentName: 'Cassé', enabled: true, seenCount: 0 },
    ];
    expect(scanMessage({ message: 'Co-authored-by: Claude', patterns }).found).toBe(false);
  });

  it('ne laisse jamais sortir le message du commit', () => {
    const message = 'feat: add the export\nCo-authored-by: Claude <noreply@anthropic.com>\njeton-secret-42';
    const match = scanMessage(scanInput(message));
    expect(match.found).toBe(true);
    expect(JSON.stringify(match)).not.toContain('jeton-secret-42');
    expect(Object.keys(match).sort()).toEqual(['agentName', 'found', 'patternId']);
  });

  it('trouve la mention effacée par le squash dans les commits de branche', () => {
    const scan = scanCommits(
      [commit('feat: add the export', '2026-03-02T09:00:00Z'), commit('Co-authored-by: Cursor <cursor@cursor.sh>')],
      defaultPatterns(),
    );
    expect(scan.match.found).toBe(true);
    expect(scan.match.agentName).toBe('Cursor');
  });

  it('rend les mentions réellement vues pour que l’équipe les confirme', () => {
    const scan = scanCommits(
      [
        commit('Co-authored-by: Codex <codex@openai.com>', '2026-03-02T09:00:00Z'),
        commit('Co-authored-by: Codex <codex@openai.com>', '2026-03-04T09:00:00Z'),
      ],
      defaultPatterns(),
    );
    expect(scan.seen).toEqual([
      { patternId: 'codex', agentName: 'Codex', seenCount: 2, lastSeenAt: '2026-03-04T09:00:00Z' },
    ]);
  });

  it('normalise le message en NFC et unifie les fins de ligne', () => {
    expect(normalizeMessage('a\r\nb\rc')).toBe('a\nb\nc');
    expect(normalizeMessage('e\u0301')).toBe('\u00e9');
  });
});