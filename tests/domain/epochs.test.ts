/**
 * Tests of the epochs — DP-22, SPEC §7 rule 6, recipe 14, §21.
 *
 * One test per behaviour: a setup change opens a new epoch, a ticket goes to
 * its own epoch, nothing is mixed, the old figures are greyed out, never
 * deleted, and the same cohort can be compared between two epochs.
 */
import { describe, expect, it } from 'vitest';
import type { Epoch } from '../../src/types.js';
import {
  allEpochsAggregate,
  compareCohortBetweenEpochs,
  currentEpoch,
  epochAt,
  epochOfTicket,
  isOutdated,
  nextEpochIfChanged,
  opensNewEpoch,
  splitByEpoch,
  supersededEpochIds,
  type EpochTicket,
} from '../../src/domain/epochs.js';

function epoch(overrides: Partial<Epoch> = {}): Epoch {
  return {
    id: 'epoch-1',
    projectId: 'project-1',
    startsAt: '2026-09-01T00:00:00.000Z',
    label: 'mise en place',
    client: 'forge-agent',
    model: 'model-a',
    instructionsVersion: 'v1',
    ...overrides,
  };
}

function epochTicket(issueId: string, at: string): EpochTicket {
  return { issueId, projectId: 'project-1', at };
}

const EPOCHS: readonly Epoch[] = [
  epoch(),
  epoch({ id: 'epoch-2', startsAt: '2026-09-08T00:00:00.000Z', label: 'nouvelles consignes', instructionsVersion: 'v2' }),
  epoch({ id: 'epoch-3', startsAt: '2026-09-14T00:00:00.000Z', label: 'nouveau modèle, 14 septembre', model: 'model-b' }),
];

describe('epochs — recipe 14', () => {
  it('recette-14: a change of tool, of model or of instructions opens a new epoch', () => {
    const previous = EPOCHS[0];
    expect(opensNewEpoch(previous, 'forge-agent', 'model-a', 'v1')).toBe(false);
    expect(opensNewEpoch(previous, 'forge-agent', 'model-b', 'v1')).toBe(true);
    expect(opensNewEpoch(previous, 'autre-outil', 'model-a', 'v1')).toBe(true);
    expect(opensNewEpoch(previous, 'forge-agent', 'model-a', 'v2')).toBe(true);
  });

  it('recette-14: a model change in the middle of the window cuts the figures in two', () => {
    const opened = nextEpochIfChanged(EPOCHS[1], { client: 'forge-agent', model: 'model-b', instructionsVersion: 'v2' }, '2026-09-14T00:00:00.000Z', 'nouveau modèle, 14 septembre', 'epoch-3');
    expect(opened?.id).toBe('epoch-3');
    expect(opened?.model).toBe('model-b');
    const unchanged = nextEpochIfChanged(EPOCHS[1], { client: 'forge-agent', model: 'model-a', instructionsVersion: 'v2' }, '2026-09-14T00:00:00.000Z', 'rien', 'epoch-3');
    expect(unchanged).toBeNull();
  });

  it('opens the first epoch of a project, whatever the setup', () => {
    const first = nextEpochIfChanged(null, { client: 'forge-agent', model: 'model-a', instructionsVersion: 'v1' }, '2026-09-01T00:00:00.000Z', 'mise en place', 'epoch-1');
    expect(first?.id).toBe('epoch-1');
  });
});

describe('epochs — placing the work', () => {
  it('gives the epoch a date falls in', () => {
    expect(epochAt(EPOCHS, '2026-09-10T12:00:00.000Z')?.id).toBe('epoch-2');
    expect(epochAt(EPOCHS, '2026-09-14T00:00:00.000Z')?.id).toBe('epoch-3');
    expect(currentEpoch(EPOCHS)?.id).toBe('epoch-3');
    expect(currentEpoch([])).toBeNull();
  });

  it('leaves a date before the first epoch without an epoch, and keeps its tickets', () => {
    expect(epochAt(EPOCHS, '2026-08-01T00:00:00.000Z')).toBeNull();
    const slices = splitByEpoch([epochTicket('old', '2026-08-01T00:00:00.000Z')], EPOCHS);
    expect(slices).toHaveLength(1);
    expect(slices[0].epoch).toBeNull();
    expect(slices[0].beforeFirstEpoch).toBe(true);
    expect(slices[0].tickets.map((ticket) => ticket.issueId)).toEqual(['old']);
  });

  it('cuts a list of tickets by epoch, one cohort per epoch', () => {
    const slices = splitByEpoch(
      [
        epochTicket('a', '2026-09-02T10:00:00.000Z'),
        epochTicket('b', '2026-09-09T10:00:00.000Z'),
        epochTicket('c', '2026-09-15T10:00:00.000Z'),
        epochTicket('d', '2026-09-16T10:00:00.000Z'),
      ],
      EPOCHS,
    );
    expect(slices.map((slice) => slice.epoch?.id ?? null)).toEqual(['epoch-1', 'epoch-2', 'epoch-3']);
    expect(slices[2].tickets.map((ticket) => ticket.issueId)).toEqual(['c', 'd']);
    expect(slices.reduce((sum, slice) => sum + slice.tickets.length, 0)).toBe(4);
  });

  it('attributes a ticket to its epoch', () => {
    expect(epochOfTicket(epochTicket('c', '2026-09-15T10:00:00.000Z'), EPOCHS)?.id).toBe('epoch-3');
  });
});

describe('epochs — old figures', () => {
  it('greys out the figures of a previous epoch without deleting them', () => {
    const current = currentEpoch(EPOCHS);
    expect(isOutdated(EPOCHS[0], current)).toBe(true);
    expect(isOutdated(EPOCHS[2], current)).toBe(false);
    expect(isOutdated(EPOCHS[0], null)).toBe(false);
    expect(supersededEpochIds(EPOCHS, current)).toEqual(['epoch-1', 'epoch-2']);
  });

  it('compares the same cohort between two epochs, before and after', () => {
    const comparison = compareCohortBetweenEpochs(
      'les migrations de données',
      { epoch: EPOCHS[1], color: 'red' },
      { epoch: EPOCHS[2], color: 'orange' },
    );
    expect(comparison.superseded).toBe(true);
    expect(comparison.before?.color).toBe('red');
    expect(comparison.after?.color).toBe('orange');
    expect(comparison.message).toBe(
      "Depuis l'époque epoch-3 (nouveau modèle, 14 septembre), les migrations de données : du rouge au orange",
    );
  });

  it('says when the colour did not move, and when one side is missing', () => {
    expect(compareCohortBetweenEpochs('les tests', { epoch: EPOCHS[1], color: 'green' }, { epoch: EPOCHS[2], color: 'green' }).message)
      .toContain('reste vert');
    expect(compareCohortBetweenEpochs('les tests', null, { epoch: EPOCHS[2], color: 'grey' }).message).toContain('gris');
    expect(compareCohortBetweenEpochs('les tests', { epoch: EPOCHS[1], color: 'red' }, null).message).toContain("Jusqu'à");
    expect(compareCohortBetweenEpochs('les tests', null, null).message).toContain('aucune couleur connue');
  });

  it('marks an all-epochs aggregate as such, only when it is asked for', () => {
    const aggregate = allEpochsAggregate([
      { epochId: 'epoch-1', value: 12 },
      { epochId: 'epoch-2', value: 8 },
    ]);
    expect(aggregate.allEpochs).toBe(true);
    expect(aggregate.epochIds).toEqual(['epoch-1', 'epoch-2']);
    expect(aggregate.note).toContain('toutes époques');
    expect(splitByEpoch([epochTicket('a', '2026-09-02T10:00:00.000Z')], EPOCHS)[0].epoch?.id).toBe('epoch-1');
  });
});
