/**
 * Shared row <-> object codecs (SPEC §17, SPEC §18, DP-18).
 *
 * The single home of the JSON, boolean and cohort-key codecs; the family
 * files (`mapping-*.ts`) and `mapping.ts` (the barrel) both point here.
 *
 * The single JSON helper of the mapping layer: every family file
 * (`mapping-*.ts`) encodes and decodes through it, so a payload is written
 * the same stable way everywhere and a malformed or absent payload degrades
 * to `[]` / a fallback instead of throwing (SPEC §20 "données absentes").
 *
 * Conventions of the frozen rows (`src/types-persistence.ts`):
 * - booleans live in `INT` columns as 0/1;
 * - dates are ISO 8601 UTC strings, stored verbatim (lossless round trip);
 * - JSON payloads live in `TEXT` columns, serialized with sorted keys so the
 *   same object always produces the same text (stable upserts, DP-13).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { CohortKey } from '../types.js';

/** Recursively sorts object keys, so serialization is deterministic. */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = sortKeys(record[key]);
    }
    return sorted;
  }
  return value;
}

/** Stable JSON text of any payload (`TEXT` columns, SPEC §18). */
export function encodeJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

/** Parses a JSON array; anything absent or malformed degrades to `[]`. */
export function decodeJsonArray<T>(json: string | null | undefined): readonly T[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as readonly T[]) : [];
  } catch {
    return [];
  }
}

/** Parses a JSON object; anything absent or malformed degrades to `fallback`. */
export function decodeJsonObject<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    const parsed: unknown = JSON.parse(json);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as T;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

/** Evidence keys as stable JSON; never a free-text quote (SPEC §17). */
export function encodeEvidence(evidence: readonly string[]): string {
  return encodeJson(evidence);
}

/** Evidence keys back; absent or malformed JSON means no evidence: `[]`. */
export function decodeEvidence(json: string): readonly string[] {
  return decodeJsonArray<unknown>(json).filter(
    (item): item is string => typeof item === 'string',
  );
}

/** A boolean into its 0/1 column (SPEC §18 convention). */
export function toFlag(value: boolean): number {
  return value ? 1 : 0;
}

/** A 0/1 column back into a boolean; null/undefined means false. */
export function fromFlag(value: number | null | undefined): boolean {
  return typeof value === 'number' && value !== 0;
}

/** A column that may come back null, read as text: absent means `''`. */
export function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** A column that may come back null or text, read as a number: absent means 0. */
export function asNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return 0;
}

/** The cohort key as one stable JSON text (`cohort_key` columns). */
export function encodeCohortKey(key: CohortKey): string {
  return encodeJson({ level: key.level, nature: key.nature, size: key.size, zone: key.zone });
}

/** Fallback cohort when the stored key is absent or malformed (SPEC §20). */
export const EMPTY_COHORT_KEY: CohortKey = { level: 'nature', nature: '', zone: null, size: null };

/** A `cohort_key` column back into a `CohortKey`; nulls preserved as nulls. */
export function decodeCohortKey(json: string): CohortKey {
  const parsed = decodeJsonObject<Partial<CohortKey>>(json, {});
  const level = typeof parsed.level === 'string' ? parsed.level : EMPTY_COHORT_KEY.level;
  const nature = typeof parsed.nature === 'string' ? parsed.nature : '';
  const zone = typeof parsed.zone === 'string' ? parsed.zone : null;
  const size = typeof parsed.size === 'string' ? parsed.size : null;
  return { level: level as CohortKey['level'], nature, zone, size };
}
