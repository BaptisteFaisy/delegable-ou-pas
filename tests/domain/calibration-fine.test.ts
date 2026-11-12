/**
 * Tests of `src/domain/calibration-fine.ts` — SPEC §10 (calibration), DP-21
 * (the app must be able to be doubted), DP-17 (no person identifier),
 * SPEC §7 rule 3 (a rate carries its sample size and its interval), SPEC §20
 * (not enough hindsight is a value, not an absence).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_BINS, DEFAULT_MIN_PER_BUCKET, LOG_LOSS_CEILING, LOG_LOSS_EPSILON, NEUTRAL_AUC,
  NEUTRAL_AUC_NOTE, brierScore, calibrationByCohort, calibrationByPolicyVersion,
  calibrationVerdict, discrimination, logLoss, policyVersionReport, reliabilityCurve,
} from '../../src/domain/calibration-fine.js';
import type { CalibrationRecord } from '../../src/domain/calibration-fine.js';
import type { Recommendation } from '../../src/types-advice.js';

/** Fields a record may carry, and nothing else (DP-17). */
type RecordPatch = Partial<Pick<CalibrationRecord, 'policyVersion' | 'recommendation' | 'cohortKey'>>;

/** Builds a record; only the forecast and the observed outcome are mandatory. */
function rec(issueId: string, p: number, cleanClose: boolean, patch: RecordPatch = {}): CalibrationRecord {
  return {
    issueId,
    recommendation: patch.recommendation ?? 'delegate',
    predictedProbability: p,
    cleanClose,
    cohortKey: patch.cohortKey ?? 'bug|api|m',
    policyVersion: patch.policyVersion ?? 'v1',
  };
}

/** One slice of the main game: a cohort and its two advice buckets. */
interface GameSlice {
  readonly cohortKey: string;
  readonly entrusted: number;
  readonly entrustedClean: number;
  readonly kept: number;
  readonly keptClean: number;
}

const MAIN_SLICES: readonly GameSlice[] = [
  { cohortKey: 'bug|api|m', entrusted: 14, entrustedClean: 12, kept: 10, keptClean: 3 },
  { cohortKey: 'feature|ui|s', entrusted: 12, entrustedClean: 9, kept: 12, keptClean: 2 },
  { cohortKey: 'chore|docs|xs', entrusted: 6, entrustedClean: 5, kept: 6, keptClean: 4 },
];

/**
 * Builds one slice: the cleanest tickets carry the highest forecast, like an app
 * that is both calibrated and discriminating. Deterministic — no randomness.
 */
function sliceRecords(slice: GameSlice, policyVersion: string): CalibrationRecord[] {
  const rows: CalibrationRecord[] = [];
  const add = (rec0: Recommendation, count: number, clean: number, base: number): void => {
    for (let index = 0; index < count; index += 1) {
      const forecast = base + index * 0.01;
      const cleanClose = index >= count - clean;
      const patch = { policyVersion, recommendation: rec0, cohortKey: slice.cohortKey };
      rows.push(rec(`${slice.cohortKey}-${rec0}-${index}`, forecast, cleanClose, patch));
    }
  };
  add('delegate', slice.entrusted, slice.entrustedClean, 0.72);
  add('keep-human', slice.kept, slice.keptClean, 0.18);
  return rows;
}

/** The main game: 60 tickets, three cohorts, one policy version. */
const MAIN_GAME: readonly CalibrationRecord[] = MAIN_SLICES.flatMap((slice) => sliceRecords(slice, 'v3'));

/** Five bins, two of them empty: a hole stays a hole (SPEC §20). */
const HOLED_GAME: readonly CalibrationRecord[] = [
  rec('h-1', 0.05, false), rec('h-2', 0.1, true), rec('h-3', 0.5, true),
  rec('h-4', 0.55, false), rec('h-5', 0.85, true), rec('h-6', 0.9, false),
];

/** A version right every time, and a version wrong every time. */
const GOOD_VERSION: readonly CalibrationRecord[] = [
  rec('good-1', 1, true, { policyVersion: 'v1' }), rec('good-2', 1, true, { policyVersion: 'v1' }),
  rec('good-3', 0, false, { policyVersion: 'v1' }),
];
const BAD_VERSION: readonly CalibrationRecord[] = [
  rec('bad-1', 0, true, { policyVersion: 'v2' }), rec('bad-2', 0, true, { policyVersion: 'v2' }),
  rec('bad-3', 1, false, { policyVersion: 'v2' }),
];
const MIXED_VERSIONS: readonly CalibrationRecord[] = [...GOOD_VERSION, ...BAD_VERSION];

/** "Hand it over" and "keep it human" close equally well: nothing is established. */
const INCONCLUSIVE: readonly CalibrationRecord[] = [
  ...Array.from({ length: 24 }, (_unused, index) =>
    rec(`flat-delegate-${index}`, 0.5, index % 2 === 0, { recommendation: 'delegate' })),
  ...Array.from({ length: 24 }, (_unused, index) =>
    rec(`flat-keep-${index}`, 0.5, index % 2 === 0, { recommendation: 'keep-human' })),
];

/** Independent reference implementation of the Brier score, to prove the formula. */
function referenceBrier(records: readonly CalibrationRecord[]): number {
  const squared = (r: CalibrationRecord): number => Math.pow(r.predictedProbability - (r.cleanClose ? 1 : 0), 2);
  return records.reduce((sum, record) => sum + squared(record), 0) / records.length;
}

/* ------------------------------------------------------------------- Brier */

describe('brierScore — the mean squared error of the forecast (SPEC §10)', () => {
  it('is 0 on perfect predictions (1 for a clean closure, 0 otherwise)', () => {
    const perfect = [rec('p-1', 1, true), rec('p-2', 1, true), rec('p-3', 0, false), rec('p-4', 0, false)];
    expect(brierScore(perfect)).toBe(0);
  });

  it('is 0.25 on constant predictions of 0.5 and 1 when exactly wrong', () => {
    const constant = [rec('c-1', 0.5, true), rec('c-2', 0.5, false), rec('c-3', 0.5, true), rec('c-4', 0.5, false)];
    expect(brierScore(constant)).toBeCloseTo(0.25, 12);
    expect(brierScore([rec('w-1', 0, true), rec('w-2', 0, true)])).toBeCloseTo(1, 12);
  });

  it('stays inside [0, 1] on the main game and matches the reference formula', () => {
    const brier = brierScore(MAIN_GAME);
    expect(brier).toBeGreaterThanOrEqual(0);
    expect(brier).toBeLessThanOrEqual(1);
    expect(brier).toBeCloseTo(referenceBrier(MAIN_GAME), 12);
  });

  it('clips an out-of-range forecast instead of throwing', () => {
    expect(brierScore([rec('x-1', 1.4, true)])).toBe(0);
    expect(brierScore([rec('x-2', -0.3, false)])).toBe(0);
  });

  it('leaves out an unusable forecast and renders 0 when nothing is measurable', () => {
    expect(brierScore([rec('n-1', Number.NaN, true)])).toBe(0);
    expect(brierScore([rec('n-2', Number.NaN, true), rec('n-3', 1, true)])).toBe(0);
    expect(brierScore([])).toBe(0);
  });
});

/* ----------------------------------------------------------------- log-loss */

describe('logLoss — the penalised log-likelihood of the forecast (SPEC §10)', () => {
  it('is 0 on perfect predictions, up to the clipping epsilon', () => {
    // A forecast of exactly 1 is clipped to `1 - LOG_LOSS_EPSILON`, so the loss is
    // about 1e-15, not exactly 0: the clip is what keeps `log(0)` away.
    expect(logLoss([rec('l-1', 1, true), rec('l-2', 0, false)])).toBeCloseTo(0, 12);
    expect(logLoss([rec('l-1b', 1 - LOG_LOSS_EPSILON, true)])).toBeGreaterThan(0);
  });

  it('is ln(2) on constant predictions of 0.5', () => {
    expect(logLoss([rec('l-3', 0.5, true)])).toBeCloseTo(Math.log(2), 12);
  });

  it('never returns Infinity: a forecast of 0 on a clean closure is clipped', () => {
    const loss = logLoss([rec('l-4', 0, true)]);
    expect(Number.isFinite(loss)).toBe(true);
    expect(loss).toBeCloseTo(LOG_LOSS_CEILING, 9);
    expect(loss).toBeLessThanOrEqual(LOG_LOSS_CEILING);
    expect(LOG_LOSS_EPSILON).toBeGreaterThan(0);
  });

  it('stays inside [0, ceiling] on the main game and renders 0 when unusable', () => {
    const loss = logLoss(MAIN_GAME);
    expect(loss).toBeGreaterThan(0);
    expect(loss).toBeLessThanOrEqual(LOG_LOSS_CEILING);
    expect(logLoss([])).toBe(0);
    expect(logLoss([rec('l-5', Number.POSITIVE_INFINITY, true)])).toBe(0);
  });
});

/* ------------------------------------------------------- reliability curve */

describe('reliabilityCurve — the forecast against what happened (SPEC §10)', () => {
  it('renders one bin per slice of forecast, with its bounds', () => {
    const curve = reliabilityCurve(MAIN_GAME);
    expect(curve).toHaveLength(DEFAULT_BINS);
    expect(curve[0].predictedLow).toBe(0);
    expect(curve[9].predictedLow).toBeCloseTo(0.9, 12);
    expect(curve[9].predictedHigh).toBe(1);
  });

  it('gives every bin a sample size and an interval, never a bare rate', () => {
    for (const bin of reliabilityCurve(MAIN_GAME)) {
      expect(bin.observed.n).toBe(bin.n);
      expect(bin.observed.ciLow).toBeLessThanOrEqual(bin.observed.rate);
      expect(bin.observed.ciHigh).toBeGreaterThanOrEqual(bin.observed.rate);
    }
  });

  it('keeps an empty bin empty: a hole is information, not a value to interpolate', () => {
    const curve = reliabilityCurve(HOLED_GAME, 5);
    expect(curve).toHaveLength(5);
    const empty = curve.filter((bin) => bin.n === 0);
    expect(empty).toHaveLength(2);
    expect(empty.map((bin) => bin.bin)).toEqual([1, 3]);
    for (const bin of empty) {
      expect(bin.observed.n).toBe(0);
      expect(bin.observed.rate).toBe(0);
      expect(bin.observed.ciHigh).toBe(1);
    }
  });

  it('counts the tickets of the filled bins of the same game', () => {
    const curve = reliabilityCurve(HOLED_GAME, 5);
    expect(curve.map((bin) => bin.n)).toEqual([2, 0, 2, 0, 2]);
    expect(curve[0].observed.rate).toBeCloseTo(0.5, 12);
    expect(curve[2].observed.rate).toBeCloseTo(0.5, 12);
  });

  it('puts a forecast of 1 in the last bin and honours another bin count', () => {
    expect(reliabilityCurve([rec('b-1', 1, true)], 4)[3].n).toBe(1);
    expect(reliabilityCurve([rec('b-2', 1, true)], 4)[0].n).toBe(0);
    const curve = reliabilityCurve(MAIN_GAME, 4);
    expect(curve).toHaveLength(4);
    expect(curve[1].predictedHigh).toBeCloseTo(0.5, 12);
  });
});

/* ------------------------------------------------------ calibration cohorts */

describe('calibrationByCohort — one row per cohort (SPEC §10)', () => {
  it('renders one row per cohort, ordered by key, with its figures', () => {
    const rows = calibrationByCohort(MAIN_GAME);
    expect(rows.map((row) => row.cohortKey)).toEqual(['bug|api|m', 'chore|docs|xs', 'feature|ui|s']);
    expect(rows[0].n).toBe(24);
    expect(rows[0].observed.n).toBe(24);
    expect(rows[0].observed.rate).toBeCloseTo(15 / 24, 12);
    expect(rows[0].brier).toBeGreaterThanOrEqual(0);
    expect(rows[0].brier).toBeLessThanOrEqual(1);
  });

  it('says informative: false under the threshold, and still renders the figures', () => {
    const chore = calibrationByCohort(MAIN_GAME)[1];
    expect(chore.n).toBe(12);
    expect(chore.informative).toBe(false);
    expect(chore.observed.n).toBe(12);
    expect(chore.brier).toBeGreaterThanOrEqual(0);
  });

  it('moves the threshold with the argument', () => {
    expect(DEFAULT_MIN_PER_BUCKET).toBe(20);
    expect(calibrationByCohort(MAIN_GAME, 5).every((row) => row.informative)).toBe(true);
    expect(calibrationByCohort(MAIN_GAME, 100).every((row) => row.informative)).toBe(false);
  });

  it('never mixes two cohorts in one row', () => {
    const total = calibrationByCohort(MAIN_GAME).reduce((sum, row) => sum + row.n, 0);
    expect(total).toBe(MAIN_GAME.length);
  });
});

/* --------------------------------------------------- calibration by version */

describe('calibrationByPolicyVersion — one calibration per rule version (SPEC §10)', () => {
  it('renders the rows separated by version, never pooled', () => {
    const rows = calibrationByPolicyVersion(MIXED_VERSIONS);
    expect(rows.map((row) => row.cohortKey)).toEqual(['v1', 'v2']);
    expect(rows[0].brier).toBeCloseTo(0, 12);
    expect(rows[1].brier).toBeCloseTo(1, 12);
  });

  it('signals that several versions were mixed', () => {
    const report = policyVersionReport(MIXED_VERSIONS);
    expect(report.mixed).toBe(true);
    expect(report.versions).toEqual(['v1', 'v2']);
    expect(report.warning).toContain('v1');
    expect(report.warning).toContain('v2');
  });

  it('says nothing when a single version was measured', () => {
    const report = policyVersionReport(GOOD_VERSION);
    expect(report.mixed).toBe(false);
    expect(report.warning).toBe('');
    expect(report.rows).toHaveLength(1);
  });

  it('shows that pooling the versions would have hidden the difference', () => {
    expect(brierScore(MIXED_VERSIONS)).toBeCloseTo(0.5, 12);
    expect(brierScore(GOOD_VERSION)).toBeCloseTo(0, 12);
    expect(brierScore(BAD_VERSION)).toBeCloseTo(1, 12);
  });
});

/* --------------------------------------------------------- discrimination */

describe('discrimination — the AUC by the Mann-Whitney statistic (SPEC §10)', () => {
  it('is 1 when every clean closure was forecast above every dirty one', () => {
    const records = [rec('d-1', 0.9, true), rec('d-2', 0.8, true), rec('d-3', 0.2, false), rec('d-4', 0.1, false)];
    expect(discrimination(records)).toBe(1);
  });

  it('is 0 when the ranking is inverted', () => {
    const records = [rec('d-5', 0.1, true), rec('d-6', 0.2, true), rec('d-7', 0.8, false), rec('d-8', 0.9, false)];
    expect(discrimination(records)).toBe(0);
  });

  it('counts a tie as 0.5', () => {
    expect(discrimination([rec('d-9', 0.5, true), rec('d-10', 0.5, false)])).toBe(0.5);
    const mixed = [rec('d-11', 0.6, true), rec('d-12', 0.6, false), rec('d-13', 0.2, false)];
    expect(discrimination(mixed)).toBeCloseTo(0.75, 12);
  });

  it('is 0.5 when the forecast ranks nothing (one outcome observed everywhere)', () => {
    expect(discrimination([rec('d-14', 0.9, true), rec('d-15', 0.2, true)])).toBe(NEUTRAL_AUC);
    expect(discrimination([rec('d-16', 0.9, false), rec('d-17', 0.2, false)])).toBe(NEUTRAL_AUC);
  });

  it('is 0.5 on a known mixed case and stays inside [0, 1] on the main game', () => {
    const known = [rec('d-18', 0.7, true), rec('d-19', 0.3, false), rec('d-20', 0.9, false)];
    expect(discrimination(known)).toBeCloseTo(0.5, 12);
    const auc = discrimination(MAIN_GAME);
    expect(auc).toBeGreaterThan(0.5);
    expect(auc).toBeLessThanOrEqual(1);
  });
});

/* ------------------------------------------------------------- the verdict */

describe('calibrationVerdict — the rule of SPEC §10 (DP-21)', () => {
  it('is informative when "hand it over" closes clearly cleaner', () => {
    const verdict = calibrationVerdict(MAIN_GAME);
    expect(verdict.informative).toBe(true);
    expect(verdict.widenUnknown).toBe(false);
    expect(verdict.reason).toContain('« À confier »');
    expect(verdict.reason).toContain('n =');
  });

  it('widens the unknown when "hand it over" is not clearly better', () => {
    const verdict = calibrationVerdict(INCONCLUSIVE);
    expect(verdict.informative).toBe(false);
    expect(verdict.widenUnknown).toBe(true);
    expect(verdict.reason).toContain('ne fait pas nettement mieux');
  });

  it('widens the unknown when a bucket is under the threshold', () => {
    const verdict = calibrationVerdict(MAIN_GAME, { minPerBucket: 100 });
    expect(verdict.informative).toBe(false);
    expect(verdict.widenUnknown).toBe(true);
    expect(verdict.reason).toContain('100');
  });

  it('widens the unknown when there is nothing to measure', () => {
    const verdict = calibrationVerdict([]);
    expect(verdict.informative).toBe(false);
    expect(verdict.widenUnknown).toBe(true);
    expect(verdict.brier).toBe(0);
    expect(verdict.auc).toBe(NEUTRAL_AUC);
    expect(verdict.reason).toContain('rien à mesurer');
  });

  it('says out loud that a neutral AUC ranks nothing', () => {
    const records = [
      rec('v-1', 0.5, true, { recommendation: 'delegate' }),
      rec('v-2', 0.5, true, { recommendation: 'keep-human' }),
    ];
    const verdict = calibrationVerdict(records);
    expect(verdict.auc).toBe(NEUTRAL_AUC);
    expect(verdict.reason).toContain(NEUTRAL_AUC_NOTE);
  });

  it('renders the Brier score and the AUC of the records it judged', () => {
    const verdict = calibrationVerdict(MAIN_GAME);
    expect(verdict.brier).toBeCloseTo(brierScore(MAIN_GAME), 12);
    expect(verdict.auc).toBeCloseTo(discrimination(MAIN_GAME), 12);
  });
});

/* -------------------------------------------------------------- anonymity */

const FORBIDDEN_KEY = /(assignee|reporter|author|creator|actor|user|person|people|email|account|displayname|profile|owner|name)/i;
const FORBIDDEN_TEXT = /@|\b[A-Z][a-z]+\s[A-Z][a-z]+\b/;

/** Walks a rendered value and hands every key and every text to the callbacks. */
function walk(value: unknown, onKey: (key: string) => void, onText: (text: string) => void): void {
  if (typeof value === 'string') return onText(value);
  if (Array.isArray(value)) return value.forEach((item) => walk(item, onKey, onText));
  if (value === null || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    onKey(key);
    walk(child, onKey, onText);
  }
}

/** Everything the module renders, in one list (DP-17). */
function everyRendered(): readonly unknown[] {
  return [
    reliabilityCurve(MAIN_GAME), calibrationByCohort(MAIN_GAME), calibrationByPolicyVersion(MIXED_VERSIONS),
    policyVersionReport(MIXED_VERSIONS), calibrationVerdict(MAIN_GAME), calibrationVerdict(INCONCLUSIVE),
    calibrationVerdict([]), brierScore(MAIN_GAME), logLoss(MAIN_GAME), discrimination(MAIN_GAME),
  ];
}

/** Collects the keys or the texts of everything the module renders. */
function collected(pickKey: boolean): readonly string[] {
  const found: string[] = [];
  const onKey = (key: string): void => { if (pickKey) found.push(key); };
  const onText = (text: string): void => { if (!pickKey) found.push(text); };
  for (const rendered of everyRendered()) walk(rendered, onKey, onText);
  return found;
}

describe('DP-17 — nothing identifies a person', () => {
  it('renders no key that looks like a person identifier', () => {
    const keys = collected(true);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(key).not.toMatch(FORBIDDEN_KEY);
  });

  it('renders no text that looks like an identity', () => {
    const texts = collected(false);
    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) expect(text).not.toMatch(FORBIDDEN_TEXT);
  });

  it('takes only a ticket identifier and a cohort key as input', () => {
    const allowed = ['cleanClose', 'cohortKey', 'issueId', 'policyVersion', 'predictedProbability', 'recommendation'];
    for (const record of MAIN_GAME) expect(Object.keys(record).sort()).toEqual(allowed);
  });
});

/* ----------------------------------------------------------------- purity */

const SOURCE = readFileSync(new URL('../../src/domain/calibration-fine.ts', import.meta.url), 'utf8');

describe('the domain stays pure', () => {
  it('imports nothing from the Forge runtime and not the calibration of lot L4', () => {
    const imports = SOURCE.split('\n').filter((line) => line.startsWith('import ')).join('\n');
    expect(SOURCE.split('\n').filter((line) => line.startsWith('import '))).toHaveLength(3);
    expect(imports).not.toMatch(/@forge/);
    expect(imports).not.toMatch(/calibration\.js/);
  });

  it('has no clock, no randomness and no I/O', () => {
    expect(SOURCE).not.toContain('Date.now(');
    expect(SOURCE).not.toContain('Math.random(');
    expect(SOURCE).not.toContain('node:fs');
    expect(SOURCE).not.toContain('process.env');
  });
});
