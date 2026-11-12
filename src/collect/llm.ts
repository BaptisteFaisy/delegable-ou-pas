/**
 * `LlmGateway` adapter: text-only model calls (SPEC §17 "Nature", SPEC §12
 * "causes d'échec", DP-06, DP-26).
 *
 * Two calls only: `classifyNature` and `summarizeFailureCauses`. The model sees
 * a short text, the app keeps a short result; no ticket text is ever logged
 * (SPEC §18, DP-17). Every call is bounded (short prompt, small completion
 * budget, JSON validated). On an unavailable model, a failure or invalid JSON:
 * `classifyNature` raises a typed `LlmError` so the caller can fall back to
 * rules only (`classifyNatureSafely` returns null), and `summarizeFailureCauses`
 * returns an empty list — never an exception that would block collection
 * (SPEC §20 "données absentes = normales").
 *
 * `@forge/llm` is imported lazily so the module does not crash off-runtime.
 * `src/collect/` is the only place allowed to import `@forge/llm` (SPEC §17).
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { FailureCause, LlmGateway, NatureClassification } from '../ports.js';
import type { Nature } from '../types.js';
import { withTimeout } from './http.js';

export const DEFAULT_LLM_MODEL = 'claude-sonnet-4-5';

/** A failure of the model call, typed so the caller can fall back (SPEC §19). */
export type LlmErrorKind = 'unavailable' | 'invalid';

export class LlmError extends Error {
  readonly kind: LlmErrorKind;

  constructor(kind: LlmErrorKind, message: string) {
    super(message);
    this.name = 'LlmError';
    this.kind = kind;
  }
}

/** The minimal Forge LLM surface the adapter needs (injectable, testable). */
export interface ForgeLlmClient {
  chat(prompt: {
    model: string;
    temperature?: number;
    max_completion_tokens?: number;
    messages: { role: 'system' | 'user'; content: string }[];
  }): Promise<{ choices?: { message?: { content?: unknown } }[] }>;
}

/** Extracts text from a model answer (a plain string or text fragments). */
export function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => (typeof part === 'string' ? part : String((part as { text?: unknown })?.text ?? '')))
    .join('');
}

/** Parses a JSON value, including inside a fenced ```json … ``` block. */
export function parseJsonBlock<T>(text: string): T | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const match = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(trimmed);
    if (match && match[1] !== undefined) {
      try {
        return JSON.parse(match[1]) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** Lazy load of the Forge client (does not crash off-runtime). */
async function resolveForgeLlmClient(): Promise<ForgeLlmClient | null> {
  try {
    const mod = (await import('@forge/llm')) as { chat: ForgeLlmClient['chat'] };
    return typeof mod.chat === 'function' ? { chat: (prompt) => mod.chat(prompt) } : null;
  } catch {
    return null;
  }
}

function asClient(llm: unknown): ForgeLlmClient | null {
  if (llm !== null && typeof llm === 'object' && typeof (llm as ForgeLlmClient).chat === 'function') {
    return llm as ForgeLlmClient;
  }
  return null;
}

/** One bounded model call: short prompt, deadline, returns text or null. */
async function callModel(
  client: ForgeLlmClient | null,
  timeoutMs: number,
  system: string,
  user: string,
): Promise<string | null> {
  if (client === null) return null;
  try {
    const response = await withTimeout(
      () =>
        client.chat({
          model: DEFAULT_LLM_MODEL,
          temperature: 0.1,
          max_completion_tokens: 400,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      timeoutMs,
    );
    return extractText(response.choices?.[0]?.message?.content);
  } catch {
    return null;
  }
}

function validateNature(raw: unknown, natures: readonly Nature[]): Nature | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const candidate = raw.trim();
  return natures.includes(candidate) ? candidate : null;
}

function sanitizeCauses(raw: unknown, limit: number): FailureCause[] {
  if (!Array.isArray(raw)) return [];
  const result: FailureCause[] = [];
  for (const item of raw) {
    if (item === null || typeof item !== 'object') continue;
    const cause = (item as { cause?: unknown }).cause;
    const count = Number((item as { count?: unknown }).count);
    if (typeof cause !== 'string' || cause.trim() === '' || !Number.isFinite(count)) continue;
    result.push({ cause: cause.trim(), count: Math.max(0, Math.floor(count)) });
    if (result.length >= limit) break;
  }
  return result;
}

/**
 * Calls the model and validates its answer; `null` means "no usable model
 * answer" (client absent, timeout, invalid JSON, nature out of list) so the
 * caller applies the deterministic fallback (DP-06, SPEC §20).
 */
async function classifyWithModel(
  getClient: () => Promise<ForgeLlmClient | null>,
  text: string,
  natures: readonly Nature[],
  timeoutMs: number,
): Promise<NatureClassification | null> {
  const client = await getClient();
  if (client === null) return null;
  const system =
    'Classify this ticket into exactly one declared nature. ' +
    'Output ONLY JSON: {"nature": "<one of the list>", "rationale": "<one short sentence>"}.';
  const user = JSON.stringify({ text, natures });
  const raw = await callModel(client, timeoutMs, system, user);
  if (raw === null) return null;
  const parsed = parseJsonBlock<{ nature?: unknown; rationale?: unknown }>(raw);
  const nature = validateNature(parsed?.nature, natures);
  if (nature === null) return null;
  return { nature, rationale: typeof parsed?.rationale === 'string' ? parsed.rationale.trim() : '' };
}

/** The deterministic fallback: first declared nature, bilingual rationale. */
function fallbackClassification(natures: readonly Nature[]): NatureClassification | null {
  if (natures.length === 0) return null;
  return {
    nature: natures[0],
    rationale:
      'Modèle indisponible : repli déterministe sur la première nature déclarée. ' +
      'Model unavailable: deterministic fallback to the first declared nature.',
  };
}

/** Builds the `LlmGateway` adapter (SPEC §17, DP-06, DP-26). */
export function createLlmGateway(llm: unknown, timeoutMs = 20000): LlmGateway {
  const injected = asClient(llm);
  let resolvedClient: ForgeLlmClient | null = injected;
  const getClient = async (): Promise<ForgeLlmClient | null> => {
    if (resolvedClient === null && injected === null) resolvedClient = await resolveForgeLlmClient();
    return resolvedClient;
  };

  return {
    classifyNature: async (text, natures): Promise<NatureClassification> => {
      const classified = await classifyWithModel(getClient, text, natures, timeoutMs);
      if (classified !== null) return classified;
      // Deterministic fallback: the first declared nature, so a missing or
      // invalid model answer never blocks the collection (DP-06, SPEC §20).
      const fallback = fallbackClassification(natures);
      if (fallback !== null) return fallback;
      throw new LlmError('unavailable', 'model did not answer and no nature is declared');
    },

    summarizeFailureCauses: async (comments, limit): Promise<FailureCause[]> => {
      const bounded = comments.slice(0, Math.max(0, limit));
      if (bounded.length === 0) return [];
      const client = await getClient();
      if (client === null) return [];
      const system =
        'Summarize the causes of failure from these reopening comments. ' +
        'Output ONLY a JSON array: [{"cause": "<short label>", "count": <number>}].';
      const user = JSON.stringify({ comments: bounded });
      const raw = await callModel(client, timeoutMs, system, user);
      if (raw === null) return [];
      return sanitizeCauses(parseJsonBlock<unknown>(raw), limit);
    },
  };
}

/**
 * Classifies with the model, falling back to rules only when the call fails:
 * `null` means "no model answer", so the caller keeps the rule classification
 * (SPEC §17 "repli règles seules", DP-06).
 */
export async function classifyNatureSafely(
  gateway: LlmGateway,
  text: string,
  natures: readonly Nature[],
): Promise<NatureClassification | null> {
  try {
    return await gateway.classifyNature(text, natures);
  } catch (error: unknown) {
    if (error instanceof LlmError) return null;
    return null;
  }
}