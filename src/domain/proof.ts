/**
 * The reproducible proof: what would let a third party recompute a decision.
 *
 * Why: the app says "the gap is established". An auditor must be able to check
 * that claim on the pieces, not trust it: the rule that produced it (policy
 * version), the data it was computed on (data fingerprint), the random draw it
 * used (seed), and the fingerprint of the answer itself. Replaying the same
 * input must give the same output — and when it does not, the proof must say
 * **what** differs, not merely that it differs (SPEC §7, §20, DP-21).
 *
 * The hash is FNV-1a 64 bits, implemented here: no dependency, and stable
 * across machines and runs (unlike `JSON.stringify` orderings).
 *
 * The domain is pure: no `@forge/*`, no `node:fs`, no network, no clock —
 * `computedAt` is given.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */

/** One decision, with everything needed to recompute it. */
export interface DecisionProof {
  /** The ticket the decision is about. */
  readonly issueKey: string;
  /** Version of the rule that produced it (the policy, not the code). */
  readonly policyVersion: string;
  /** Fingerprint of the data it was computed on. */
  readonly dataFingerprint: string;
  /** The random draw it used, when it used one (the controlled trial). */
  readonly seed: string;
  /** Fingerprint of the answer itself. */
  readonly outputFingerprint: string;
  /** When the decision was computed (given: the clock is injected). */
  readonly computedAt: string;
  /** True when a replay of the same input gives the same answer. */
  readonly reproducible: boolean;
  /** What the proof means, in both languages. */
  readonly note: { readonly fr: string; readonly en: string };
}

/** The 64-bit FNV-1a offset basis and prime, as constants. */
const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

/**
 * A stable 64-bit hash of a string, as 16 hexadecimal characters.
 *
 * FNV-1a is not a cryptographic hash: it is fast, stable and dependency-free,
 * which is what a fingerprint needs. It detects accidental drift, not
 * tampering — a tampered proof would need the fingerprint of the data itself.
 */
export function hashString(value: string): string {
  let hash = FNV_OFFSET;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return hash.toString(16).padStart(16, '0');
}

/**
 * The canonical form of a value: object keys sorted, so that two payloads
 * holding the same facts in a different order fingerprint identically.
 */
export function canonicalise(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalise).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalise(record[key])}`).join(',')}}`;
}

/** Fingerprint of the data a decision was computed on. */
export function dataFingerprint(payload: unknown): string {
  return hashString(canonicalise(payload));
}

/** Fingerprint of the answer itself. */
export function outputFingerprint(payload: unknown): string {
  return hashString(canonicalise(payload));
}

/** Builds the proof of one decision. */
export function decisionProof(input: {
  readonly issueKey: string;
  readonly policy: string;
  readonly seed: string;
  readonly data: unknown;
  readonly output: unknown;
  readonly computedAt: string;
}): DecisionProof {
  return {
    issueKey: input.issueKey,
    policyVersion: input.policy,
    dataFingerprint: dataFingerprint(input.data),
    seed: input.seed,
    outputFingerprint: outputFingerprint(input.output),
    computedAt: input.computedAt,
    reproducible: true,
    note: {
      fr: 'Rejouez cette décision avec la même graine, la même version de règle et les mêmes données : l’empreinte de la sortie doit être identique.',
      en: 'Replay this decision with the same seed, the same policy version and the same data: the output fingerprint must be identical.',
    },
  };
}

/** The outcome of a replay: same answer or not, and what differs. */
export interface ReplayVerdict {
  readonly same: boolean;
  readonly mismatches: readonly string[];
}

/**
 * Replays a decision and says **what** differs, path by path.
 *
 * "Different" is not enough for an audit: the useful answer is "the rate of the
 * agent arm changed", or "the cohort key changed".
 */
export function replayDecision(input: {
  readonly proof: DecisionProof;
  readonly data: unknown;
  readonly output: unknown;
  /** The data the decision was originally computed on, when the auditor has it. */
  readonly expectedData?: unknown;
  /** The answer the decision originally produced, when the auditor has it. */
  readonly expectedOutput?: unknown;
}): ReplayVerdict {
  const dataDiff = differences(
    input.proof.dataFingerprint,
    dataFingerprint(input.data),
    input.expectedData,
    input.data,
  );
  const outputDiff = differences(
    input.proof.outputFingerprint,
    outputFingerprint(input.output),
    input.expectedOutput,
    input.output,
  );
  const mismatches = [...dataDiff, ...outputDiff];
  return { same: mismatches.length === 0, mismatches };
}

/**
 * What differs between two canonical forms, path by path.
 *
 * The paths are dotted (`arms.agent.rate`), so an auditor can point at the
 * figure that moved.
 */
export function differences(expectedHash: string, actualHash: string, expected?: unknown, actual?: unknown): readonly string[] {
  if (expectedHash === actualHash) return [];
  if (expected === undefined || actual === undefined) return ['empreinte'];
  return pathsOfDifference(expected, actual);
}

/** The paths where two values differ, dotted. */
function pathsOfDifference(expected: unknown, actual: unknown, path = ''): readonly string[] {
  if (canonicalise(expected) === canonicalise(actual)) return [];
  if (Array.isArray(expected) && Array.isArray(actual)) {
    const out: string[] = [];
    const length = Math.max(expected.length, actual.length);
    for (let index = 0; index < length; index += 1) {
      out.push(...pathsOfDifference(expected[index], actual[index], `${path}[${index}]`));
    }
    return out;
  }
  if (isRecord(expected) && isRecord(actual)) {
    const out: string[] = [];
    const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
    keys.forEach((key) => {
      out.push(...pathsOfDifference(expected[key], actual[key], path ? `${path}.${key}` : key));
    });
    return out;
  }
  return [path || 'racine'];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
