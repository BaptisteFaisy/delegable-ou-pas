/**
 * Multiplicity correction for the delegation card: the card tests one cell
 * per cohort, and with 35 cells tested at alpha = 0.05, 1.75 false positives
 * are expected per project (DP-14). A green or red cell that means nothing is
 * worse than a grey one, so every cell carries its q-value and a flag saying
 * whether it survives the correction.
 *
 * Realises SPEC §7 rule 3 (a rate never travels alone: the q-value travels
 * with its rank and its p-value) and SPEC §7 rule 7 (no total without its
 * breakdown: the note renders `tested` AND `surviving` AND `expectedFalse`,
 * and the correction never hides a cell — information is added, never
 * removed). DP-14.
 *
 * The domain is pure: no `@forge/*`, no `Date.now()`, no `Math.random()`,
 * no network. Determinism: stable ordering, ties broken by `key`.
 */

/** Default false-discovery rate of the card (DP-14, SPEC §7). */
export const DEFAULT_FDR_ALPHA: number = 0.05;

/** The correction the card uses by default; Bonferroni is the fallback. */
export type MultiplicityMethod = 'benjamini-hochberg' | 'bonferroni';

/** A cell of the delegation card with the p-value it was tested at. */
export interface TestedCell {
  /** Stable identifier of the cell (cohort key); breaks ranking ties. */
  readonly key: string;
  /** Raw p-value of the cell's test; received, never computed here. */
  readonly pValue: number;
}

/** A tested cell enriched by the correction — nothing is removed from it. */
export interface AdjustedCell extends TestedCell {
  /** Rank by increasing p-value, 1 = most significant. */
  readonly rank: number;
  /** Benjamini-Hochberg q-value, monotone across ranks, bounded to 1. */
  readonly qValue: number;
  /** True when `qValue <= alpha`: the cell survives the correction. */
  readonly significant: boolean;
}

/** The sentence the card renders under the matrix (SPEC §7 rule 7). */
export interface MultiplicityNote {
  /** How many cells were tested — never hidden, even when none survives. */
  readonly tested: number;
  /** How many cells survive the correction. */
  readonly surviving: number;
  /** Expected number of false positives: `tested * alpha` (DP-14). */
  readonly expectedFalse: number;
  /** Which correction produced these figures. */
  readonly method: MultiplicityMethod;
}

/** Keeps a fraction inside [0, 1] — q-values are bounded to 1. */
function clamp01(value: number): number {
  if (value < 0) return 0;
  return value > 1 ? 1 : value;
}

/** Orders by increasing p-value; ties broken by `key` for determinism. */
function byPValueThenKey(a: TestedCell, b: TestedCell): number {
  if (a.pValue !== b.pValue) return a.pValue - b.pValue;
  if (a.key < b.key) return -1;
  return a.key > b.key ? 1 : 0;
}

/**
 * Benjamini-Hochberg step-up procedure controlling the false-discovery rate.
 *
 * The adjustment runs BACKWARDS, from the largest p-value down:
 * `q_i = min(q_{i+1}, m / i * p_i)`. Without this cumulative sweep the
 * q-values are not monotone and the correction is wrong — the classic trap
 * (a test covers it explicitly). Ties in p-value share the same q-value,
 * `m = 0` renders an empty list, and q-values are bounded to 1.
 *
 * Every input cell comes back (SPEC §7 rule 7): the correction flags a cell
 * that does not survive, it never hides one.
 */
export function benjaminiHochberg(
  cells: readonly TestedCell[],
  alpha: number = DEFAULT_FDR_ALPHA,
): readonly AdjustedCell[] {
  if (cells.length === 0) return [];
  const ordered = [...cells].sort(byPValueThenKey);
  const m = ordered.length;
  const qValues: number[] = ordered.map((cell, index) =>
    clamp01((m * clamp01(cell.pValue)) / (index + 1)),
  );
  for (let i = m - 2; i >= 0; i -= 1) {
    qValues[i] = Math.min(qValues[i], qValues[i + 1]);
  }
  return ordered.map((cell, index) => ({
    key: cell.key,
    pValue: cell.pValue,
    rank: index + 1,
    qValue: qValues[index],
    significant: qValues[index] <= alpha,
  }));
}

/**
 * Bonferroni-adjusted p-value: `min(1, p * m)` — the more conservative
 * fallback, offered as an option next to the default Benjamini-Hochberg
 * (DP-14). With one test or fewer there is nothing to correct.
 */
export function bonferroni(pValue: number, tests: number): number {
  const p = clamp01(pValue);
  return tests <= 1 ? p : Math.min(1, p * tests);
}

/**
 * How many false positives the card expects by sheer luck: `tests * alpha`.
 * With 35 cells tested at alpha = 0.05 this is 1.75 — the figure rendered
 * under the matrix so a lone green cell is never read as a proof (DP-14).
 */
export function expectedFalsePositives(
  tests: number,
  alpha: number = DEFAULT_FDR_ALPHA,
): number {
  return Math.max(0, tests) * alpha;
}

/**
 * The breakdown the card must render: "35 cells tested, 6 survive the
 * correction, 1.75 false positives expected" — a total always comes with its
 * decomposition (SPEC §7 rule 7), and the number tested is never dropped even
 * when nothing survives.
 */
export function multiplicityNote(
  cells: readonly TestedCell[],
  adjusted: readonly AdjustedCell[],
  alpha: number = DEFAULT_FDR_ALPHA,
): MultiplicityNote {
  let surviving = 0;
  for (const cell of adjusted) {
    if (cell.significant) surviving += 1;
  }
  return {
    tested: cells.length,
    surviving,
    expectedFalse: expectedFalsePositives(cells.length, alpha),
    method: 'benjamini-hochberg',
  };
}
