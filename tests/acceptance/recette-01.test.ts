/**
 * Recette 1 (SPEC §22) : « Un ticket dont un commit porte une mention d'agent
 * est classé "avec agent", source "mention de commit". » DP-01.
 */
import { describe, expect, it } from 'vitest';
import { armOf } from '../../src/domain/cohort.js';
import { fromCommitMention, resolveInvolvement } from '../../src/domain/involvement.js';
import { armLabel, sourceLabel } from '../../src/viewmodel/common.js';
import { sampleCommitFact } from '../db/fixtures.js';
import { fr, ISSUE_ID } from './helpers.js';

const DECIDED_AT = '2026-03-02T18:00:00Z';

describe('recette-01 — une mention d’agent dans un commit', () => {
  it('classe le ticket « avec agent », source « mention de commit »', () => {
    const candidate = fromCommitMention([sampleCommitFact()], DECIDED_AT);
    expect(candidate?.source).toBe('commit-mention');

    const involvement = resolveInvolvement(
      ISSUE_ID,
      candidate === null ? [] : [candidate],
      DECIDED_AT,
      '',
      '',
      '',
    );
    expect(involvement?.source).toBe('commit-mention');
    expect(armOf(involvement?.level ?? 'unknown')).toBe('agent');

    // Le libellé affiché à l'écran est celui du SPEC (DP-01 : la source est montrée).
    expect(armLabel('agent', fr)).toBe('Avec un agent');
    expect(sourceLabel('commit-mention', fr)).toBe('mention dans un message de commit');
  });
});
