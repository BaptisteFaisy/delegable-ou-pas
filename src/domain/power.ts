/**
 * Power of the controlled trial (SPEC §11 "L'essai contrôlé", DP-27).
 *
 * The controlled trial is the only figure the app may call "proved"
 * (SPEC §7, SPEC §11 step 5). To deserve that word it needs two numbers
 * computed *before* the trial starts: how many tickets each arm must
 * receive, and whether the ticket flow of the team can deliver them in
 * time. When it cannot, the honest answer is "this trial is not feasible at
 * home", not a trial quietly under-powered (SPEC §11, SPEC §20).
 *
 * Sample size, two-sided, two proportions, normal approximation:
 *
 *   n per arm = [ z(1-alpha/2) * sqrt(2 * p0 * q0)
 *                 + z(power) * sqrt(p0 * q0 + p1 * q1) ]^2 / effect^2
 *
 * with `p0` the baseline rate and `p1 = p0 + effect` the rate the arm under
 * trial is supposed to reach. The null variance is anchored on the *known*
 * baseline (2 * p0 * q0) instead of the pooled one: it is the conservative
 * choice, so the planned trial is never smaller than the classic pooled
 * formula would give (140 per arm for 0.85 / 0.10 instead of 181). The
 * power actually reached is computed with the very same variances, so
 * `sampleSizePerArm` and `achievedPower` are two views of one model and
 * invert each other.
 *
 * The domain is pure: no `@forge/*`, no clock, no randomness, no npm
 * dependency. The normal law is implemented on the spot (Hart & West's
 * double-precision cdf, bisection for the quantile).
 */

/** Default significance level of the controlled trial (SPEC §11). */
export const DEFAULT_ALPHA: number = 0.05;

/** Default power the controlled trial aims at (SPEC §11). */
export const DEFAULT_POWER: number = 0.80;

/**
 * Longest window the app is willing to plan for (52 weeks).
 *
 * SPEC §11 step 2 runs a trial for four weeks; a *powered* trial needs more
 * room, and this is where the app stops being patient. Beyond a year the
 * plan says "not feasible here" instead of promising a trial that would
 * never end (SPEC §11, DP-27).
 */
export const DEFAULT_TRIAL_WEEKS: number = 52;

/** Steps of the bisections: enough for a double precision answer. */
const BISECTION_STEPS: number = 60;

/** Tolerance when comparing a reached power with the target. */
const POWER_EPSILON: number = 1e-9;

/**
 * The plan of a controlled trial, with the honest "not feasible" case.
 *
 * `feasible: false` means the ticket flow of the team cannot deliver the
 * required sample inside the window: the app must then say so rather than
 * offer a trial that cannot conclude (SPEC §11, SPEC §20).
 */
export interface PowerPlan {
  /** Baseline rate of the cohort under trial. */
  readonly baselineRate: number;
  /** Smallest effect the planned size can detect (absolute rate points). */
  readonly detectableEffect: number;
  /** Tickets required per arm, both arms together need twice that. */
  readonly nPerArm: number;
  /** Significance level used. */
  readonly alpha: number;
  /** Power really reached by the planned size. */
  readonly power: number;
  /** Whether the trial can be run at home inside the window. */
  readonly feasible: boolean;
  /** Weeks needed to collect the tickets, `null` when never reachable. */
  readonly weeksNeeded: number | null;
}

/** Input of `trialPlan`. */
export interface TrialPlanInput {
  /** Baseline rate of the cohort under trial. */
  readonly baselineRate: number;
  /** Tickets the team closes per week. */
  readonly ticketsPerWeek: number;
  /** Effect the trial must detect; without it the window sets the size. */
  readonly mde?: number;
  /** Significance level, default `DEFAULT_ALPHA`. */
  readonly alpha?: number;
  /** Target power, default `DEFAULT_POWER`. */
  readonly power?: number;
  /** Window of the trial in weeks, default `DEFAULT_TRIAL_WEEKS`. */
  readonly weeks?: number;
}

/** Keeps a fraction inside [0, 1]. */
function clamp01(value: number): number {
  if (value < 0) return 0;
  return value > 1 ? 1 : value;
}

/** Whether a value can be read as a rate. */
function isRate(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

/**
 * Upper tail of the standard normal law, `P(X > x)` for `x >= 0`.
 *
 * Hart & West's double-precision approximation (2005): the tail is computed
 * directly instead of `1 - cdf(x)`, so no digit is lost in the subtraction
 * when the boundary of a look is high (SPEC §11).
 */
function normalTail(x: number): number {
  if (x > 37) return 0;
  const exponential = Math.exp(-0.5 * x * x);
  if (x < 7.07106781186547) {
    let numerator = 3.52624965998911e-02 * x + 0.700383064443688;
    numerator = numerator * x + 6.37396220353165;
    numerator = numerator * x + 33.912866078383;
    numerator = numerator * x + 112.079291497871;
    numerator = numerator * x + 221.213596169931;
    numerator = numerator * x + 220.206867912376;
    let denominator = 8.83883476483184e-02 * x + 1.75566716318264;
    denominator = denominator * x + 16.064177579207;
    denominator = denominator * x + 86.7807322029461;
    denominator = denominator * x + 296.564248779674;
    denominator = denominator * x + 637.333633378831;
    denominator = denominator * x + 793.826512519948;
    denominator = denominator * x + 440.413735824752;
    return (exponential * numerator) / denominator;
  }
  let continued = x + 0.65;
  continued = x + 4 / continued;
  continued = x + 3 / continued;
  continued = x + 2 / continued;
  continued = x + 1 / continued;
  return exponential / continued / 2.506628274631;
}

/**
 * Upper tail of the standard normal law, `P(X > x)`.
 *
 * Exported because the sequential boundaries spend their alpha there, where
 * the tail is tiny and `1 - cdf(x)` would lose every useful digit.
 */
export function normalUpperTail(x: number): number {
  if (Number.isNaN(x)) return Number.NaN;
  if (x === Number.POSITIVE_INFINITY) return 0;
  if (x === Number.NEGATIVE_INFINITY) return 1;
  return x >= 0 ? normalTail(x) : 1 - normalTail(-x);
}

/** Cumulative distribution of the standard normal law. */
export function normalCdf(x: number): number {
  if (Number.isNaN(x)) return Number.NaN;
  if (x === Number.POSITIVE_INFINITY) return 1;
  if (x === Number.NEGATIVE_INFINITY) return 0;
  return x >= 0 ? 1 - normalTail(x) : normalTail(-x);
}

/**
 * Quantile of the standard normal law, without any dependency.
 *
 * Known values (tolerance 1e-4): 0.975 -> 1.959964 ; 0.95 -> 1.644854 ;
 * 0.5 -> 0 ; 0.025 -> -1.959964.
 *
 * Bounds, defined and documented, never a silent NaN: a probability of 0 or
 * less answers `-Infinity` (an impossible probability), 1 or more answers
 * `+Infinity`, and a NaN probability is a bug in the caller and throws.
 */
export function normalQuantile(p: number): number {
  if (Number.isNaN(p)) {
    throw new RangeError('normalQuantile: p must be a probability (SPEC §11).');
  }
  if (p <= 0) return Number.NEGATIVE_INFINITY;
  if (p >= 1) return Number.POSITIVE_INFINITY;
  let low = -12;
  let high = 12;
  for (let step = 0; step < 120 && high - low > 1e-15; step += 1) {
    const middle = (low + high) / 2;
    if (normalCdf(middle) < p) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

/** Variance of a rate: `p * (1 - p)`. */
function rateVariance(rate: number): number {
  return rate * (1 - rate);
}

/**
 * Rate of the arm under trial. The hypothesis of the product is "the agent
 * arm closes cleanly more often" (SPEC §11), so the effect counts upwards.
 */
function treatmentRate(baseline: number, effect: number): number {
  return baseline + effect;
}

/** Standard error of the difference under the null, anchored on the baseline. */
function nullStandardError(baseline: number, nPerArm: number): number {
  return Math.sqrt((2 * rateVariance(baseline)) / nPerArm);
}

/** Standard error of the difference under the alternative (fixed effect). */
function alternativeStandardError(baseline: number, effect: number, nPerArm: number): number {
  const treated = treatmentRate(baseline, effect);
  return Math.sqrt((rateVariance(baseline) + rateVariance(treated)) / nPerArm);
}

/**
 * Number of tickets required per arm to detect `mde` with the given alpha
 * and power (SPEC §11).
 *
 * `sampleSizePerArm(0.85, 0.10)` answers 181: the classic two-sided
 * planning formula, two-sided test, 5 % and 80 % by default.
 *
 * Defined edges: an invalid rate answers 0 (nothing to plan), an effect of
 * zero or less answers `Infinity` (no sample size detects nothing), and an
 * effect that does not fit above the baseline answers `Infinity` too (it
 * does not exist).
 */
export function sampleSizePerArm(
  baseline: number,
  mde: number,
  alpha: number = DEFAULT_ALPHA,
  power: number = DEFAULT_POWER,
): number {
  if (!isRate(baseline)) return 0;
  if (!Number.isFinite(mde) || mde <= 0) return Number.POSITIVE_INFINITY;
  if (baseline + mde > 1) return Number.POSITIVE_INFINITY;
  const nullTerm = normalQuantile(1 - alpha / 2) * nullStandardError(baseline, 1);
  const alternativeTerm = normalQuantile(power) * alternativeStandardError(baseline, mde, 1);
  const size = ((nullTerm + alternativeTerm) * (nullTerm + alternativeTerm)) / (mde * mde);
  return Math.ceil(size);
}

/**
 * Power really reached by `nPerArm` tickets per arm for a given effect
 * (SPEC §11).
 *
 * Two-sided: the trial concludes when the statistic crosses the boundary in
 * either direction, but the effect of interest is the upwards one.
 */
export function achievedPower(
  nPerArm: number,
  baseline: number,
  effect: number,
  alpha: number = DEFAULT_ALPHA,
): number {
  if (!Number.isFinite(nPerArm) || nPerArm <= 0) return 0;
  if (!isRate(baseline) || !Number.isFinite(effect) || effect < 0) return 0;
  if (baseline + effect > 1) return 0;
  const alternativeSe = alternativeStandardError(baseline, effect, nPerArm);
  if (alternativeSe <= 0) return 0;
  const critical = normalQuantile(1 - alpha / 2) * nullStandardError(baseline, nPerArm);
  const upper = (effect - critical) / alternativeSe;
  const lower = (-effect - critical) / alternativeSe;
  return clamp01(normalCdf(upper) + normalCdf(lower));
}

/**
 * Smallest effect detectable with `nPerArm` tickets per arm, by bisection
 * (SPEC §11). The number of iterations is bounded.
 *
 * When even the largest possible effect stays under-powered, the largest one
 * is returned: the caller compares the reached power with the target to
 * know that the trial is too small.
 */
export function detectableEffect(
  nPerArm: number,
  baseline: number,
  alpha: number = DEFAULT_ALPHA,
  power: number = DEFAULT_POWER,
): number {
  const maxEffect = isRate(baseline) ? 1 - baseline : 0;
  if (maxEffect <= 0) return 0;
  if (achievedPower(nPerArm, baseline, maxEffect, alpha) < power) return maxEffect;
  let low = 0;
  let high = maxEffect;
  for (let step = 0; step < BISECTION_STEPS; step += 1) {
    const middle = (low + high) / 2;
    if (achievedPower(nPerArm, baseline, middle, alpha) >= power) high = middle;
    else low = middle;
  }
  return high;
}

/** Weeks needed to collect the tickets of both arms, `null` if never. */
function weeksToCollect(nPerArm: number, ticketsPerWeek: number): number | null {
  if (!Number.isFinite(nPerArm) || nPerArm <= 0) return null;
  if (!Number.isFinite(ticketsPerWeek) || ticketsPerWeek <= 0) return null;
  return Math.ceil((2 * nPerArm) / ticketsPerWeek);
}

/**
 * Plan built from the volume the team can deliver in the window: the size
 * comes from the tickets, the detectable effect from the size.
 */
function planFromVolume(
  baseline: number,
  ticketsPerWeek: number,
  weeks: number,
  alpha: number,
  power: number,
): PowerPlan {
  const available = Math.floor(Math.max(0, ticketsPerWeek) * Math.max(0, weeks));
  const nPerArm = Math.floor(available / 2);
  const effect = detectableEffect(nPerArm, baseline, alpha, power);
  const reached = achievedPower(nPerArm, baseline, effect, alpha);
  return {
    baselineRate: baseline,
    detectableEffect: effect,
    nPerArm,
    alpha,
    power: reached,
    feasible: nPerArm > 0 && reached >= power - POWER_EPSILON,
    weeksNeeded: weeksToCollect(nPerArm, ticketsPerWeek),
  };
}

/**
 * The plan of a controlled trial: how many tickets per arm, which effect
 * that size detects, which power it reaches, and whether the team can run
 * it at home (SPEC §11, DP-27).
 *
 * With a minimum detectable effect, the size comes from the effect and
 * `feasible` says whether the ticket flow delivers it inside the window.
 * Without one, the window sets the size and the plan reports the effect
 * that size can detect.
 */
export function trialPlan(input: TrialPlanInput): PowerPlan {
  const alpha = input.alpha ?? DEFAULT_ALPHA;
  const power = input.power ?? DEFAULT_POWER;
  const weeks = input.weeks ?? DEFAULT_TRIAL_WEEKS;
  const baseline = input.baselineRate;
  const ticketsPerWeek = input.ticketsPerWeek;
  if (input.mde === undefined) {
    return planFromVolume(baseline, ticketsPerWeek, weeks, alpha, power);
  }
  const nPerArm = sampleSizePerArm(baseline, input.mde, alpha, power);
  const weeksNeeded = weeksToCollect(nPerArm, ticketsPerWeek);
  const feasible =
    Number.isFinite(nPerArm) &&
    nPerArm > 0 &&
    weeksNeeded !== null &&
    weeksNeeded <= weeks;
  return {
    baselineRate: baseline,
    detectableEffect: detectableEffect(nPerArm, baseline, alpha, power),
    nPerArm,
    alpha,
    power: achievedPower(nPerArm, baseline, input.mde, alpha),
    feasible,
    weeksNeeded,
  };
}
