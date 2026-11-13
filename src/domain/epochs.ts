/**
 * Epochs: one period per agent setup — DP-22.
 *
 * SPEC §4 "Époque", §7 rule 6 (one epoch at a time, never mixed), §12 "the map"
 * (what changed since an epoch), recipe 14 (a change of tool, of model or of
 * instructions opens a new epoch and separates the figures), §21 (a model change
 * in the middle of the window: the old figures stay visible, greyed out).
 *
 * Pure domain: no clock is read here, every date is given by the caller.
 */
import type { Epoch } from '../types.js';
import type { MapColor } from '../types-advice.js';

/* --------------------------------------------------------------------- epochs */

/** The three things that define an agent setup (SPEC §4 "Époque"). */
export interface EpochSetup {
  readonly client: string;
  readonly model: string;
  readonly instructionsVersion: string;
}

function epochTime(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * The epoch a date falls in: the last one that started at or before it.
 *
 * Null before the first epoch — the figures of that time stay visible, greyed
 * out, and are never deleted (SPEC §7 rule 6).
 */
export function epochAt(epochs: readonly Epoch[], at: string): Epoch | null {
  const target = epochTime(at);
  let found: Epoch | null = null;
  for (const epoch of epochs) {
    if (epochTime(epoch.startsAt) <= target) {
      if (found === null || epochTime(epoch.startsAt) >= epochTime(found.startsAt)) found = epoch;
    }
  }
  return found;
}

/** The current epoch: the last one that started; null when there is none. */
export function currentEpoch(epochs: readonly Epoch[]): Epoch | null {
  let found: Epoch | null = null;
  for (const epoch of epochs) {
    if (found === null || epochTime(epoch.startsAt) >= epochTime(found.startsAt)) found = epoch;
  }
  return found;
}

/**
 * True when an epoch is not the current one: its figures are greyed out, but
 * they stay on the screen (SPEC §21, DP-22).
 *
 * With no current epoch known, nothing is outdated.
 */
export function isOutdated(epoch: Epoch, current: Epoch | null): boolean {
  if (current === null) return false;
  return epoch.id !== current.id;
}

/** The ids of the epochs whose figures are superseded, never deleted. */
export function supersededEpochIds(epochs: readonly Epoch[], current: Epoch | null): readonly string[] {
  return epochs.filter((epoch) => isOutdated(epoch, current)).map((epoch) => epoch.id);
}

/**
 * True when a setup change opens a new epoch (recipe 14): a change of tool, of
 * model or of instructions separates the figures.
 */
export function opensNewEpoch(
  previous: Epoch,
  client: string,
  model: string,
  instructionsVersion: string,
): boolean {
  return (
    previous.client !== client ||
    previous.model !== model ||
    previous.instructionsVersion !== instructionsVersion
  );
}

/** Builds an epoch from a setup; the id comes from the caller, never from here. */
export function epochFromSetup(
  id: string,
  projectId: string,
  startsAt: string,
  label: string,
  setup: EpochSetup,
): Epoch {
  return {
    id,
    projectId,
    startsAt,
    label,
    client: setup.client,
    model: setup.model,
    instructionsVersion: setup.instructionsVersion,
  };
}

/**
 * The epoch a setup change opens; null when nothing changed (recipe 14).
 *
 * The first epoch of a project is always new.
 */
export function nextEpochIfChanged(
  previous: Epoch | null,
  setup: EpochSetup,
  startsAt: string,
  label: string,
  id: string,
): Epoch | null {
  if (previous !== null && !opensNewEpoch(previous, setup.client, setup.model, setup.instructionsVersion)) {
    return null;
  }
  return epochFromSetup(id, previous?.projectId ?? '', startsAt, label, setup);
}

/* ------------------------------------------------------------- splitting work */

/** A ticket placed on a time line: what an epoch needs to take it. */
export interface EpochTicket {
  readonly issueId: string;
  readonly projectId: string;
  /** The date that places the ticket in an epoch (its closure, usually). */
  readonly at: string;
}

/** One epoch and the tickets that belong to it. */
export interface EpochSlice {
  /** Null for the tickets that predate the first epoch: kept, greyed out. */
  readonly epoch: Epoch | null;
  readonly tickets: readonly EpochTicket[];
  readonly beforeFirstEpoch: boolean;
}

/** The epoch a ticket belongs to; null before the first epoch. */
export function epochOfTicket(ticket: EpochTicket, epochs: readonly Epoch[]): Epoch | null {
  return epochAt(epochs, ticket.at);
}

/**
 * Cuts a list of tickets by epoch (SPEC §7 rule 6).
 *
 * Nothing is dropped: the tickets that predate the first epoch keep their own
 * slice, marked as such.
 */
export function splitByEpoch(
  tickets: readonly EpochTicket[],
  epochs: readonly Epoch[],
): readonly EpochSlice[] {
  const slices = new Map<string, { readonly epoch: Epoch | null; readonly tickets: EpochTicket[] }>();
  const order: string[] = [];
  for (const ticket of tickets) {
    const epoch = epochOfTicket(ticket, epochs);
    const id = epoch === null ? '' : epoch.id;
    const slice = slices.get(id);
    if (slice === undefined) {
      slices.set(id, { epoch, tickets: [ticket] });
      order.push(id);
    } else {
      slice.tickets.push(ticket);
    }
  }
  return order.map((id) => {
    const slice = slices.get(id);
    return { epoch: slice?.epoch ?? null, tickets: slice?.tickets ?? [], beforeFirstEpoch: slice?.epoch === null };
  });
}

/* ------------------------------------------------------- comparing two epochs */

/** The colour a cohort had in one epoch (SPEC §12). */
export interface EpochCohortColor {
  readonly epoch: Epoch;
  readonly color: MapColor;
}

/** The same cohort seen in two epochs: what changed, and what is superseded. */
export interface EpochCohortComparison {
  readonly cohortLabel: string;
  readonly before: EpochCohortColor | null;
  readonly after: EpochCohortColor | null;
  /** The old figures stay on the screen, greyed out (SPEC §21). */
  readonly superseded: boolean;
  readonly message: string;
}

const COLOR_WORDS: Readonly<Record<MapColor, string>> = {
  green: 'vert',
  orange: 'orange',
  red: 'rouge',
  grey: 'gris',
};

function epochWords(point: EpochCohortColor): string {
  return point.epoch.label === '' ? `l'époque ${point.epoch.id}` : `l'époque ${point.epoch.id} (${point.epoch.label})`;
}

function comparisonMessage(
  cohortLabel: string,
  before: EpochCohortColor | null,
  after: EpochCohortColor | null,
): string {
  if (before !== null && after !== null) {
    const move = before.color === after.color
      ? `reste ${COLOR_WORDS[after.color]}`
      : `du ${COLOR_WORDS[before.color]} au ${COLOR_WORDS[after.color]}`;
    return `Depuis ${epochWords(after)}, ${cohortLabel} : ${move}`;
  }
  if (after !== null) return `Depuis ${epochWords(after)}, ${cohortLabel} : ${COLOR_WORDS[after.color]}`;
  if (before !== null) return `Jusqu'à ${epochWords(before)}, ${cohortLabel} : ${COLOR_WORDS[before.color]}`;
  return `${cohortLabel} : aucune couleur connue`;
}

/**
 * Compares one cohort between two epochs, for the screen (SPEC §12):
 * "since epoch 3 (new model, 14 September), the data migrations went from red
 * to orange".
 *
 * Both sides are kept: the previous figures are marked superseded, never
 * deleted (DP-22).
 */
export function compareCohortBetweenEpochs(
  cohortLabel: string,
  before: EpochCohortColor | null,
  after: EpochCohortColor | null,
): EpochCohortComparison {
  return {
    cohortLabel,
    before,
    after,
    superseded: before !== null && after !== null,
    message: comparisonMessage(cohortLabel, before, after),
  };
}

/* -------------------------------------------------------- all-epochs aggregate */

/**
 * An aggregate over every epoch: it exists only when it is asked for, and it
 * says so (SPEC §7 rule 6 — the figures never mix two epochs by themselves).
 */
export interface AllEpochsAggregate<T> {
  readonly allEpochs: true;
  readonly epochIds: readonly string[];
  readonly values: readonly { readonly epochId: string; readonly value: T }[];
  readonly note: string;
}

/** Marks a set of per-epoch values as an explicit all-epochs aggregate. */
export function allEpochsAggregate<T>(
  parts: readonly { readonly epochId: string; readonly value: T }[],
): AllEpochsAggregate<T> {
  return {
    allEpochs: true,
    epochIds: parts.map((part) => part.epochId),
    values: parts,
    note: 'agrégat toutes époques, demandé explicitement : il mélange des époques différentes',
  };
}
