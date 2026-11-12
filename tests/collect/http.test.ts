/**
 * Tests du transport partagé : délai borné, tentatives limitées, erreurs
 * typées, lecture sûre des corps (SPEC §20 « données absentes », DP-18).
 * Aucun réseau : les transports sont des bouchons déterministes.
 */
import { describe, it, expect } from 'vitest';
import {
  HttpError,
  MAX_RETRIES,
  createHttpClient,
  jsonInit,
  readJsonOrNull,
  readTextOrNull,
  requestJson,
  requestOk,
  routePath,
  toHttpText,
  withRetries,
  withTimeout,
} from '../../src/collect/http.js';
import { jsonResponse } from './fakes.js';

describe('http — délai borné', () => {
  it('rend le résultat quand le travail finit à temps', async () => {
    await expect(withTimeout(async () => 'ok', 500)).resolves.toBe('ok');
  });

  it('lève une erreur typée « timeout » à l’échéance', async () => {
    const pending = new Promise<string>(() => {});
    await expect(withTimeout(() => pending, 10)).rejects.toMatchObject({ kind: 'timeout' });
  });
});

describe('http — toHttpText', () => {
  it('laisse passer une chaîne telle quelle', async () => {
    expect(await toHttpText('brut')).toBe('brut');
  });

  it('lit une réponse Forge : text() sinon json()', async () => {
    const withText = { ok: true, status: 200, json: async () => ({ a: 1 }), text: async () => '{"a":1}' };
    expect(await toHttpText(withText)).toBe('{"a":1}');
    expect(await toHttpText(jsonResponse({ a: 1 }))).toBe(JSON.stringify({ a: 1 }));
  });

  it('lève une erreur typée avec le statut sur un non-2xx', async () => {
    await expect(toHttpText(jsonResponse(null, false, 403))).rejects.toMatchObject({
      kind: 'http',
      status: 403,
    });
  });

  it('sérialise un corps brut, rend « données absentes » vide', async () => {
    expect(await toHttpText({ b: 2 })).toBe('{"b":2}');
    expect(await toHttpText(null)).toBe('');
    expect(await toHttpText(undefined)).toBe('');
  });
});

describe('http — client partagé', () => {
  it('parse un texte JSON, sinon rend le texte brut', async () => {
    const client = createHttpClient(500);
    expect(await client.request<Record<string, number>>('json', async () => '{"n":1}')).toEqual({ n: 1 });
    expect(await client.request<string>('texte', async () => 'pas du json')).toBe('pas du json');
  });

  it('borne aussi le travail qui ne répond jamais', async () => {
    const client = createHttpClient(10);
    await expect(
      client.request<string>('lent', () => new Promise<string>(() => {})),
    ).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('retente un échec serveur, au plus MAX_RETRIES, puis lève typé', async () => {
    let attempts = 0;
    const client = createHttpClient(500);
    await expect(
      client.request<never>('instable', async () => {
        attempts += 1;
        throw new HttpError('http', 503, 'HTTP 503');
      }),
    ).rejects.toBeInstanceOf(HttpError);
    expect(attempts).toBe(MAX_RETRIES + 1);
  });

  it('ne retente pas une erreur client (4xx)', async () => {
    let attempts = 0;
    const client = createHttpClient(500);
    await expect(
      client.request<never>('refusé', async () => {
        attempts += 1;
        throw new HttpError('http', 403, 'HTTP 403');
      }),
    ).rejects.toMatchObject({ kind: 'http', status: 403 });
    expect(attempts).toBe(1);
  });
});

describe('http — withRetries', () => {
  it('retente une erreur réseau puis réussit', async () => {
    let attempts = 0;
    const value = await withRetries(async () => {
      attempts += 1;
      if (attempts < 2) throw new HttpError('network', null, 'coupure');
      return 'ok';
    });
    expect(value).toBe('ok');
    expect(attempts).toBe(2);
  });

  it('type une erreur opaque en « network »', async () => {
    await expect(
      withRetries(async (): Promise<never> => {
        throw new Error('panne');
      }),
    ).rejects.toMatchObject({ kind: 'network' });
  });
});

describe('http — transports JSON', () => {
  it('requestJson rend le corps sur 2xx, null sur refus ou panne', async () => {
    expect(await requestJson<{ ok: number }>(async () => jsonResponse({ ok: 1 }), routePath('/x'))).toEqual({ ok: 1 });
    expect(await requestJson(async () => jsonResponse(null, false, 403), routePath('/x'))).toBeNull();
  });

  it('requestOk rend true seulement sur 2xx', async () => {
    expect(await requestOk(async () => jsonResponse({}, true, 204), routePath('/x'))).toBe(true);
    expect(await requestOk(async () => jsonResponse(null, false, 500), routePath('/x'))).toBe(false);
  });

  it('jsonInit porte méthode, en-têtes JSON et corps sérialisé', () => {
    const init = jsonInit('PUT', { a: 1 });
    expect(init.method).toBe('PUT');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(init.body).toBe('{"a":1}');
    expect(jsonInit('GET').body).toBeUndefined();
  });

  it('readJsonOrNull / readTextOrNull rendent null sur corps invalide', async () => {
    expect(await readJsonOrNull<{ a: number }>(jsonResponse({ a: 1 }))).toEqual({ a: 1 });
    const brokenJson = {
      ok: true,
      status: 200,
      json: async (): Promise<never> => {
        throw new Error('pas json');
      },
    };
    expect(await readJsonOrNull(brokenJson)).toBeNull();
    expect(await readTextOrNull(jsonResponse(null, false, 404))).toBeNull();
    expect(await readTextOrNull(null)).toBeNull();
  });
});
