/**
 * Recette 14 (SPEC §22) : « Un changement d'époque sépare les statistiques. »
 * DP-22 — SPEC §7 règle 6 : rien ne se mélange entre deux époques, et les
 * tickets d'avant la première époque gardent leur propre tranche.
 */
import { describe, expect, it } from 'vitest';
import { epochOfTicket, splitByEpoch } from '../../src/domain/epochs.js';
import type { EpochTicket } from '../../src/domain/epochs.js';
import { sampleEpoch } from '../db/fixtures.js';

const EPOCH_1 = sampleEpoch('ep-1'); // ouverte le 14 septembre
const EPOCH_2 = { ...sampleEpoch('ep-2'), startsAt: '2026-10-15T00:00:00.000Z' };
const EPOCHS = [EPOCH_1, EPOCH_2];

function ticket(issueId: string, at: string): EpochTicket {
  return { issueId, projectId: 'PROJ', at };
}

describe('recette-14 — un changement d’époque sépare les statistiques', () => {
  it('range chaque ticket dans son époque, sans rien mélanger ni jeter', () => {
    const slices = splitByEpoch(
      [
        ticket('a', '2026-09-20T10:00:00Z'),
        ticket('b', '2026-10-16T10:00:00Z'),
        ticket('c', '2026-08-01T10:00:00Z'), // avant la première époque
      ],
      EPOCHS,
    );
    expect(slices).toHaveLength(3);

    const idsOf = (epochId: string | null): readonly string[] =>
      slices
        .filter((slice) => (slice.epoch?.id ?? null) === epochId)
        .flatMap((slice) => slice.tickets.map((item) => item.issueId));

    expect(idsOf('ep-1')).toEqual(['a']);
    expect(idsOf('ep-2')).toEqual(['b']);
    expect(idsOf(null)).toEqual(['c']);

    const before = slices.find((slice) => slice.beforeFirstEpoch);
    expect(before?.tickets.map((item) => item.issueId)).toEqual(['c']);
    expect(epochOfTicket(ticket('b', '2026-10-16T10:00:00Z'), EPOCHS)?.id).toBe('ep-2');
  });
});
