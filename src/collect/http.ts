/**
 * Transport partagé des adaptateurs de collecte (SPEC §17 « quatre chaînes »,
 * SPEC §20 « données absentes »).
 *
 * Trois choses vivent ici pour qu'aucun adaptateur ne les recopie
 * (« zéro duplication ») :
 *   1. la borne de délai et de tentatives de tout appel externe (SPEC §20 :
 *      rien ne doit pendre, un échec borné retourne une valeur de repli) ;
 *   2. la lecture sûre d'une réponse : un non-2xx ou un corps illisible devient
 *      `null`, jamais une exception qui remonterait au domaine ;
 *   3. les transports par défaut branchés sur `@forge/api`, injectables pour
 *      que les tests ne touchent jamais le réseau.
 *
 * `src/collect/` est le seul endroit du dépôt autorisé à importer `@forge/api`.
 * Règle : fichiers < 500 lignes, fonctions < 50 lignes.
 */
import api from '@forge/api';
import type { RequestInit, Response, Route } from '@forge/api';

/** Délai maximal d'un appel externe (ms). Borne basse : SPEC §20. */
export const DEFAULT_TIMEOUT_MS = 5_000;

/** Nombre maximal de tentatives, après la première (retries). */
export const MAX_RETRIES = 2;

/** Ce qu'un adaptateur lit d'une réponse Forge (rien de plus). */
export type HttpResponse = Pick<Response, 'ok' | 'status' | 'json'> & {
  text?: () => Promise<string>;
};

/** Transport produit Forge : `requestJira` / `requestConfluence`. */
export type ProductRequest = (url: Route, init?: RequestInit) => Promise<HttpResponse>;

/** Transport HTTP hors produit (liens libres) : `api.fetch`. */
export type ExternalFetch = (url: string, init?: RequestInit) => Promise<HttpResponse>;

/** Catégorie d'une erreur réseau, pour décider d'une nouvelle tentative. */
export type HttpErrorKind = 'timeout' | 'network' | 'http';

/** Erreur typée d'un transport HTTP (SPEC §20 : jamais d'exception opaque). */
export class HttpError extends Error {
  constructor(
    readonly kind: HttpErrorKind,
    readonly status: number | null,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** Une route Forge valide à partir d'un chemin relatif du produit. */
export function routePath(path: string): Route {
  return { value: path };
}

/** Délai court entre deux tentatives (borné, déterministe). */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Borne une promesse dans le temps. Le timer est toujours nettoyé, donc aucun
 * test ne laisse de minuterie pendante ; le travail lancé reste en vol mais son
 * résultat est ignoré (l'appelant a déjà sa valeur de repli).
 */
export async function withTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const limit = Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.floor(timeoutMs) : 1;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_never, reject) => {
    timer = setTimeout(() => reject(new HttpError('timeout', null, `délai dépassé après ${limit} ms`)), limit);
  });
  try {
    return await Promise.race([work(controller.signal), deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** `RequestInit` JSON : le signal est ajouté par le transport borné. */
export function jsonInit(method: string, body?: unknown): RequestInit {
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
  return body === undefined
    ? { method, headers }
    : { method, headers, body: JSON.stringify(body) };
}

/** Lit un corps JSON sur un 2xx ; `null` sinon ou si le corps n'est pas du JSON. */
export async function readJsonOrNull<T>(response: HttpResponse | null): Promise<T | null> {
  if (!response || !response.ok) return null;
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/** Lit un corps texte si disponible sur un 2xx ; `null` sinon. */
export async function readTextOrNull(response: HttpResponse | null): Promise<string | null> {
  if (!response || !response.ok || typeof response.text !== 'function') return null;
  try {
    return await response.text();
  } catch {
    return null;
  }
}

/** Vrai quand la réponse relève d'une nouvelle tentative (timeout, réseau, 5xx). */
function isRetryable(error: HttpError): boolean {
  if (error.kind === 'timeout' || error.kind === 'network') return true;
  return error.status !== null && error.status >= 500;
}

/** Alias of the Forge `RequestInit` used by the adapters (SPEC §17). */
export type HttpInit = RequestInit;

/** True when the value looks like a Forge HTTP response. */
function asHttpResponse(value: unknown): HttpResponse | null {
  if (value === null || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record['ok'] !== 'boolean' || typeof record['status'] !== 'number') return null;
  if (typeof record['json'] !== 'function') return null;
  return value as HttpResponse;
}

/**
 * Renders the text of a raw call result: a string passes through, a Forge
 * response is read (`text` when available, `json` otherwise) and any other
 * body is serialized. A non-2xx raises a typed error (SPEC §20).
 */
export async function toHttpText(value: unknown): Promise<string> {
  if (typeof value === 'string') return value;
  const response = asHttpResponse(value);
  if (response !== null) {
    if (!response.ok) throw new HttpError('http', response.status, `HTTP ${response.status}`);
    if (typeof response.text === 'function') return await response.text();
    return JSON.stringify(await response.json()) ?? '';
  }
  return value === null || value === undefined ? '' : JSON.stringify(value) ?? '';
}

/** Parses a text body: JSON when possible, raw text otherwise (SPEC §20). */
function parseBody<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

/**
 * Bounded retry loop shared by every external call; raises typed errors so the
 * caller decides the fallback (SPEC §20: bounded failure, never an opaque one).
 */
export async function withRetries<T>(work: () => Promise<T>): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await work();
    } catch (error) {
      const typed = error instanceof HttpError ? error : new HttpError('network', null, String(error));
      attempt += 1;
      if (attempt > MAX_RETRIES || !isRetryable(typed)) throw typed;
      await delay(200 * attempt);
    }
  }
}

/** A bounded client around a thunk producing text (timeout + retries). */
export interface HttpClient {
  request<T>(label: string, work: () => Promise<string>): Promise<T>;
}

/** Builds the shared client every adapter goes through (zero duplication). */
export function createHttpClient(timeoutMs: number = DEFAULT_TIMEOUT_MS): HttpClient {
  return {
    request: async <T>(_label: string, work: () => Promise<string>): Promise<T> => {
      const text = await withRetries(() => withTimeout(() => work(), timeoutMs));
      return parseBody<T>(text);
    },
  };
}

/**
 * Appelle un transport JSON avec délai borné et tentatives limitées
 * (SPEC §20 : un échec borné rend `null`, jamais une exception).
 */
export async function requestJson<T>(
  transport: ProductRequest | ExternalFetch,
  url: Route | string,
  init?: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<T | null> {
  try {
    return await withRetries(async () => {
      const response = await withTimeout(
        (signal) => transport(url as never, { ...init, signal }),
        timeoutMs,
      );
      const body = await readJsonOrNull<T>(response);
      if (body !== null || (response.ok && response.status >= 200 && response.status < 300)) {
        return body;
      }
      throw new HttpError('http', response.status, `HTTP ${response.status}`);
    });
  } catch {
    return null;
  }
}

/**
 * Effectue un appel et rend `true` sur un 2xx (écriture Jira, SPEC §17 :
 * un refus d'écriture rend `false`, jamais une exception).
 */
export async function requestOk(
  transport: ProductRequest | ExternalFetch,
  url: Route | string,
  init?: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<boolean> {
  try {
    const response = await withTimeout(
      (signal) => transport(url as never, { ...init, signal }),
      timeoutMs,
    );
    return response.ok;
  } catch {
    return false;
  }
}

/** Fabrique les transports par défaut, liés au runtime Forge. */
export function createForgeTransports(): {
  requestJira: ProductRequest;
  fetch: ExternalFetch;
} {
  return {
    requestJira: (url, init) => api.asApp().requestJira(url, init),
    fetch: (url, init) => api.fetch(url, init),
  };
}

/** Transport Jira par défaut (créé à la demande, jamais à l'import). */
export function defaultJiraRequest(): ProductRequest {
  return createForgeTransports().requestJira;
}

/** Transport HTTP externe par défaut (créé à la demande). */
export function defaultExternalFetch(): ExternalFetch {
  return createForgeTransports().fetch;
}