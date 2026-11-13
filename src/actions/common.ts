/**
 * Shared plumbing of the nine MCP tools — SPEC §15, §19, §20; DP-15, DP-17.
 *
 * Everything a tool needs around its frozen signature lives here, once:
 * - the `McpResult` envelope: a failure is a short typed error, never an
 *   exception escaping the tool (SPEC §20);
 * - input validation: type, bounds, `limit` capped (SPEC §15, SPEC §19);
 * - the anonymity guard: no tool accepts or returns a person name, every
 *   answer is swept by L1 `privacy.ts` before it leaves (recipe 12, DP-17);
 * - the bounded constants: no list without a `LIMIT` (SPEC §18, §19).
 *
 * Error texts are typed codes with a bilingual one-line message (EN/FR), so
 * the MCP answers stay short while the screens localize through L8 i18n.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { McpResult, McpToolKey } from '../types-mcp.js';
import { MCP_TOOL_KEYS } from '../types-mcp.js';
import type { ProjectSettings } from '../types-advice.js';
import type { Deps } from '../deps.js';
import { personIdentifierLeak } from '../domain/privacy.js';

/* ------------------------------------------------------------- constants */

/** Default page size of a tool list (SPEC §19: no unbounded list). */
export const DEFAULT_LIMIT = 50;
/** Hard cap of the `limit` input (SPEC §19, `action` under 55 s). */
export const MAX_LIMIT = 100;
/** Cap of the project list read by a tool or a trigger (SPEC §19). */
export const PROJECT_LIST_LIMIT = 100;
/** Cap of the per-project lists a read tool may pull from the cache. */
export const CACHE_LIST_LIMIT = 500;
/** Cap of the JQL string accepted by `list-delegable-work`. */
export const MAX_JQL_LENGTH = 2000;
/** Cap of the free-text inputs (reason, client, model, session). */
export const MAX_TEXT_LENGTH = 500;

/* ---------------------------------------------------------- typed errors */

/** The typed error codes of the tools, with a short bilingual message. */
export const MCP_ERRORS = {
  'invalid-input': 'Invalid input / Entrée invalide',
  'unknown-tool': 'Unknown tool / Outil inconnu',
  'privacy-leak': 'Answer withheld: person identifier / Réponse retenue : identifiant de personne',
  'internal-error': 'Internal error / Erreur interne',
} as const;

/** The typed error codes an answer may carry. */
export type McpErrorCode = keyof typeof MCP_ERRORS;

/** A successful envelope: `data` may still be `null` — absence is normal. */
export function ok<T>(data: T | null): McpResult<T> {
  return { ok: true, error: '', data };
}

/** A failed envelope: a short typed reason, no payload (SPEC §20). */
export function fail<T>(code: McpErrorCode): McpResult<T> {
  return { ok: false, error: MCP_ERRORS[code], data: null };
}

/* ------------------------------------------------------------ validation */

/** Reads a record out of an unknown payload; `{}` when it is not one. */
export function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Readonly<Record<string, unknown>>;
}

/** True for a `PROJ-123`-shaped ticket key (SPEC §15 inputs are simple). */
export function isIssueKey(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z][A-Za-z0-9]+-\d+$/.test(value);
}

/** Reads and bounds a string input; `null` when absent or too long. */
export function textOf(value: unknown, maxLength = MAX_TEXT_LENGTH): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.length > maxLength) return null;
  return trimmed;
}

/** Reads a required string input; `null` when missing or invalid. */
export function requiredText(value: unknown, maxLength = MAX_TEXT_LENGTH): string | null {
  return textOf(value, maxLength);
}

/** Reads the `limit` input: an integer in `[1, MAX_LIMIT]`, defaulted. */
export function limitOf(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return DEFAULT_LIMIT;
  if (value < 1) return 1;
  return Math.min(value, MAX_LIMIT);
}

/** True when a string is one of the accepted values. */
export function oneOf(value: unknown, allowed: readonly string[]): value is string {
  return typeof value === 'string' && allowed.includes(value);
}

/** True for an MCP tool key coming from a payload or a module key. */
export function isToolKey(value: unknown): value is McpToolKey {
  return typeof value === 'string' && (MCP_TOOL_KEYS as readonly string[]).includes(value);
}

/** `fn-should-delegate` → `should-delegate`; already-clean keys pass. */
export function toolKeyFromModule(moduleKey: unknown): McpToolKey | null {
  if (typeof moduleKey !== 'string') return null;
  const bare = moduleKey.startsWith('fn-') ? moduleKey.slice(3) : moduleKey;
  return isToolKey(bare) ? bare : null;
}

/* ------------------------------------------------------- anonymity guard */

/**
 * Sweeps one answer with the L1 guard before it leaves the app: a payload
 * carrying a person identifier is withheld, not sent (recipe 12, DP-17,
 * SPEC §18 last line). The leak path is logged, never returned.
 */
export function guardResult<T>(deps: Deps, tool: McpToolKey, result: McpResult<T>): McpResult<T> {
  if (!result.ok || result.data === null) return result;
  const leak = personIdentifierLeak(result.data);
  if (leak === null) return result;
  deps.logger.log('warn', `mcp privacy leak withheld: ${tool} at ${leak}`);
  return fail<T>('privacy-leak');
}

/* ------------------------------------------------------- project lookup */

/**
 * Finds the settings of a project by its human key (`PROJ`): the stores are
 * keyed by project id, the tools receive keys (SPEC §15). `null` when the
 * project is unknown — absence is normal (SPEC §20).
 */
export async function settingsByKey(deps: Deps, projectKey: string): Promise<ProjectSettings | null> {
  const projects = await deps.settings.list(PROJECT_LIST_LIMIT);
  return projects.find((settings) => settings.projectKey === projectKey) ?? null;
}

/** The `demo` flag of a project; false when its settings are absent. */
export async function isDemoProject(deps: Deps, projectId: string): Promise<boolean> {
  const settings = await deps.settings.get(projectId);
  return settings?.demo ?? false;
}

/** A successful envelope with no payload: absence is normal (SPEC §20). */
export function empty<T>(): McpResult<T> {
  return { ok: true, error: '', data: null };
}
