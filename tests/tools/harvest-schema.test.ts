/**
 * The harvest reads whatever schema the local OpenCode database uses.
 *
 * OpenCode 2.x has coexisted two generations of tables: the current one
 * (`session_v2` + `session_message`) and the older one (`session` + `part`).
 * The harvest must read the current one when it is there — otherwise the
 * "real data" silently freezes at the date of the migration — and still read
 * the older one when it is all there is.
 *
 * These tests build both schemas in a temporary directory and run the real
 * script against them. No network, no live database.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const SCRIPT = fileURLToPath(new URL('../../tools/opencode/harvest.mjs', import.meta.url));

/** `node:sqlite` est expérimental : le test s'en passe sans lui. */
const requirer = createRequire(import.meta.url);
const sqlite = (() => {
  try {
    return requirer('node:sqlite') as { DatabaseSync: new (path: string) => unknown };
  } catch {
    return null;
  }
})();
const avecSqlite = sqlite !== null;

interface BaseTest {
  exec: (sql: string) => void;
  prepare: (sql: string) => {
    run: (...args: unknown[]) => void;
  };
}

interface SessionLigne {
  readonly id: string;
  readonly directory: string;
  readonly title: string;
  readonly agent: string | null;
  readonly model: string | null;
  readonly cost: number;
  readonly tokens_input: number;
  readonly tokens_output: number;
  readonly time_created: number;
  readonly time_updated: number;
}

/** The session columns the harvest reads, in the order it declares them. */
const COLONNES = 'id, directory, title, agent, model, cost, tokens_input, tokens_output, '
  + 'summary_additions, summary_deletions, summary_files, time_created, time_updated';

const RACINE = mkdtempSync(join(tmpdir(), 'recolte-schema-'));
const ESPACE = join(RACINE, 'espace');
const SORTIE = join(RACINE, 'sortie.json');

/** Builds a session row with the fields the harvest reads. */
function session(part: Partial<SessionLigne>): SessionLigne {
  return {
    id: 'ses_aaaaaaaaaaaa0001',
    directory: ESPACE,
    title: 'Une session de test',
    agent: 'build',
    model: '{"id":"space-bunny-free","providerID":"opencode"}',
    cost: 0,
    tokens_input: 10,
    tokens_output: 5,
    time_created: 1_757_000_000_000,
    time_updated: 1_757_003_600_000,
    ...part,
  };
}

/** Writes a session row into a table, with the columns the harvest reads. */
function ecrireSession(db: BaseTest, table: string, ligne: SessionLigne): void {
  db.prepare(`INSERT INTO ${table} (${COLONNES}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?)`)
    .run(ligne.id, ligne.directory, ligne.title, ligne.agent, ligne.model, ligne.cost,
      ligne.tokens_input, ligne.tokens_output, ligne.time_created, ligne.time_updated);
}

/** Runs the harvest against a database file and returns the parsed dataset. */
function recolter(base: string): { sessions: Array<Record<string, unknown>> } {
  execFileSync(process.execPath, [SCRIPT, '--db', base, '--home', ESPACE, '--out', SORTIE], { encoding: 'utf8' });
  return JSON.parse(readFileSync(SORTIE, 'utf8'));
}

/** Opens a database file with the experimental SQLite module. */
function ouvrir(chemin: string): BaseTest {
  const module = sqlite as { DatabaseSync: new (path: string) => unknown };
  return new module.DatabaseSync(chemin) as BaseTest;
}
beforeAll(() => {
  mkdirSync(ESPACE, { recursive: true });
});

afterAll(() => {
  rmSync(RACINE, { recursive: true, force: true });
});

describe('récolte — schéma actuel (session_v2 + session_message)', () => {
  const BASE = join(RACINE, 'courant.db');

  beforeAll(() => {
    if (!avecSqlite) return;
    const db = ouvrir(BASE);
    db.exec(`CREATE TABLE session_v2 (${COLONNES}, project_id TEXT, parent_id TEXT)`);
    db.exec('CREATE TABLE session_message (id TEXT, session_id TEXT, type TEXT, seq INTEGER, data TEXT)');
    ecrireSession(db, 'session_v2', session({ id: 'ses_aaaaaaaaaaaa0001', title: 'PROJ-101 corriger la CLI' }));
    ecrireSession(db, 'session_v2', session({
      id: 'ses_bbbbbbbbbbbb0002',
      title: 'Session sans agent ni modèle',
      agent: null,
      model: null,
      time_updated: 1_757_007_200_000,
    }));
    db.prepare('INSERT INTO session_message (id, session_id, type, seq, data) VALUES (?, ?, ?, ?, ?)')
      .run('msg_1', 'ses_bbbbbbbbbbbb0002', 'assistant', 0,
        JSON.stringify({ agent: 'build', model: { id: 'combo/cheap', providerID: 'inferhub' }, content: [{ type: 'text', text: 'Le ticket PROJ-202 est traité.' }] }));
    db.prepare('INSERT INTO session_message (id, session_id, type, seq, data) VALUES (?, ?, ?, ?, ?)')
      .run('msg_2', 'ses_bbbbbbbbbbbb0002', 'user', 1, JSON.stringify({ text: 'Travailler sur PROJ-202.' }));
  });

  it.skipIf(!avecSqlite)('lit les sessions de la table courante', () => {
    const sessions = recolter(BASE).sessions;
    expect(sessions).toHaveLength(2);
    const ids = sessions.map((s) => String(s.id));
    expect(ids.every((id) => /^oc_[0-9a-f]{16}$/.test(id))).toBe(true);
  });

  it.skipIf(!avecSqlite)('rétablit l’agent et le modèle absents depuis le tour assistant', () => {
    const complete = recolter(BASE).sessions
      .find((s) => String(s.title) === 'Session sans agent ni modèle');
    expect(complete).toBeDefined();
    expect(complete?.['agent']).toBe('build');
    expect(complete?.['model']).toEqual({ provider: 'inferhub', id: 'combo/cheap' });
  });

  it.skipIf(!avecSqlite)('retrouve la clé de ticket dans les messages comme dans le titre', () => {
    const tickets = recolter(BASE).sessions.map((s) => s['issueKey']);
    expect(tickets).toContain('PROJ-101');
    expect(tickets).toContain('PROJ-202');
  });
});

describe('récolte — schéma hérité (session + part)', () => {
  const BASE = join(RACINE, 'heritage.db');

  beforeAll(() => {
    if (!avecSqlite) return;
    const db = ouvrir(BASE);
    db.exec(`CREATE TABLE session (${COLONNES}, project_id TEXT)`);
    db.exec('CREATE TABLE part (id TEXT, session_id TEXT, message_id TEXT, type TEXT, data TEXT)');
    ecrireSession(db, 'session', session({ id: 'ses_cccccccccccc0003', title: 'Session du schéma hérité' }));
    db.prepare('INSERT INTO part (id, session_id, message_id, type, data) VALUES (?, ?, ?, ?, ?)')
      .run('prt_1', 'ses_cccccccccccc0003', 'msg_9', 'text', JSON.stringify({ type: 'text', text: 'Le ticket PROJ-303 avance.' }));
  });

  it.skipIf(!avecSqlite)('lit encore le schéma ancien quand il est le seul présent', () => {
    const sessions = recolter(BASE).sessions;
    expect(sessions).toHaveLength(1);
    expect(sessions[0]['issueKey']).toBe('PROJ-303');
  });
});
