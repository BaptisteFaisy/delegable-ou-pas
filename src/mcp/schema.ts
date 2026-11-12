/**
 * The versioned envelope every MCP answer travels in.
 *
 * Why: an orchestrator calls this app months later, against a version it does
 * not know. Every answer therefore carries the schema version it was written
 * against, when it was computed, and the fingerprint of the data it was
 * computed on — so an answer can be replayed and a disagreement can be settled
 * on evidence rather than on opinion (SPEC §7, §15, §20).
 *
 * The fingerprint is **given** to the envelope, never computed here: the hash
 * lives in `src/domain/proof.ts` (the reproducible-proof feature), and this
 * module must not duplicate it.
 *
 * Rule: files < 500 lines, functions < 50 lines. No dependency, no network.
 */

/** Version of the envelope schema. Bump the minor when adding a field. */
export const SCHEMA_VERSION = '1.1.0';

/** The versions this build understands, oldest first. */
export const SUPPORTED_SCHEMA_VERSIONS: readonly string[] = ['1.0.0', '1.1.0'];

/**
 * One answer, versioned.
 *
 * `result` is the tool's own payload (`McpResult` of `src/types-mcp.ts` for the
 * nine published tools). It is `null` when the tool could not answer — missing
 * data is normal, not an error (SPEC §20).
 */
export interface McpEnvelope<T = unknown> {
  /** Version of this schema the answer was written against. */
  readonly schemaVersion: string;
  /** The tool that answered. */
  readonly tool: string;
  /** When the answer was computed (ISO 8601). */
  readonly computedAt: string;
  /** Fingerprint of the data the answer was computed on. */
  readonly dataFingerprint: string;
  /** The payload. */
  readonly result: T | null;
}

/** Wraps a payload in the versioned envelope. */
export function envelope<T>(
  tool: string,
  result: T | null,
  computedAt: string,
  dataFingerprint: string,
): McpEnvelope<T> {
  return {
    schemaVersion: SCHEMA_VERSION,
    tool,
    computedAt,
    dataFingerprint,
    result,
  };
}

/** True when the value looks like an envelope of this app. */
export function isEnvelope(value: unknown): value is McpEnvelope {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<McpEnvelope>;
  return typeof candidate.schemaVersion === 'string'
    && typeof candidate.tool === 'string'
    && typeof candidate.computedAt === 'string'
    && typeof candidate.dataFingerprint === 'string'
    && 'result' in candidate;
}

/** The compatibility verdict between an answer and the version we expect. */
export interface CompatibilityVerdict {
  readonly compatible: boolean;
  readonly major: number;
  readonly expected: number;
  readonly message: { readonly fr: string; readonly en: string };
}

/**
 * A major version is a break, a minor version is an addition: an orchestrator
 * built against 1.0 must keep working against 1.1, and must be told clearly
 * when it meets 2.0.
 */
export function checkCompatibility(schemaVersion: string, expectedMajor = 1): CompatibilityVerdict {
  const major = Number.parseInt(schemaVersion.split('.')[0] ?? '', 10);
  const compatible = Number.isFinite(major) && major === expectedMajor;
  return {
    compatible,
    major: Number.isFinite(major) ? major : -1,
    expected: expectedMajor,
    message: compatible
      ? { fr: `Version compatible (${schemaVersion}).`, en: `Compatible version (${schemaVersion}).` }
      : {
        fr: `Version incompatible : l'appelant attend ${expectedMajor}.x, il a reçu ${schemaVersion}.`,
        en: `Incompatible version: the caller expects ${expectedMajor}.x, it received ${schemaVersion}.`,
      },
  };
}

/** True when this build still understands a version it produced earlier. */
export function supports(schemaVersion: string): boolean {
  return SUPPORTED_SCHEMA_VERSIONS.includes(schemaVersion);
}
