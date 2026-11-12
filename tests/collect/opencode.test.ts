/**
 * Tests de la télémétrie OpenCode (lot O1).
 *
 * Deux volets : le domaine pur (`src/collect/opencode.ts`), qui transforme
 * une session en implication, en coût et en durée ; et la récolte
 * (`tools/opencode/harvest.mjs`), qui produit un jeu de données trié,
 * déterministe et sans donnée personnelle.
 *
 * Aucun réseau, aucune base vivante : les fixtures sont construites dans le
 * test, dans un répertoire temporaire.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  costFromSession,
  involvementFromSession,
  modelLabel,
  outcomeFromSession,
  parseDataset,
  summarise,
} from '../../src/collect/opencode.js';
import type { OpenCodeSession } from '../../src/collect/opencode.js';

const SCRIPT = fileURLToPath(new URL('../../tools/opencode/harvest.mjs', import.meta.url));
const JEU_VERSIONNE = fileURLToPath(new URL('../../src/sample/opencode-real.json', import.meta.url));
const LOGIN = basename(homedir());
const MOTIF_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const MOTIF_ID_SESSION = /\b(?:ses|msg|prt)_[A-Za-z0-9]{6,}/;

/** Une session de fixture : trois agents, trois modèles, des durées vraies. */
function fixture(part: Partial<OpenCodeSession>): OpenCodeSession {
  return {
    id: 'oc_fixture0000000001',
    project: 'Bureau/projet-x',
    title: 'Corriger le crash au démarrage',
    agent: 'build',
    model: { provider: 'opencode', id: 'space-bunny-free' },
    costEuros: 0,
    tokensIn: 0,
    tokensOut: 0,
    additions: 0,
    deletions: 0,
    filesTouched: 0,
    durationMs: 3_600_000,
    startedAt: '2026-09-01T10:00:00.000Z',
    endedAt: '2026-09-01T11:00:00.000Z',
    issueKey: null,
    ...part,
  };
}

const SESSION_BUILD = fixture({
  id: 'oc_fixture0000000001',
  costEuros: 0.12,
  tokensIn: 1000,
  tokensOut: 200,
  durationMs: 3_600_000,
  issueKey: 'PROJ-101',
});
const SESSION_GENERAL = fixture({
  id: 'oc_fixture0000000002',
  agent: 'general',
  model: { provider: 'openrouter', id: 'some/model' },
  costEuros: 0.03,
  tokensIn: 500,
  tokensOut: 50,
  durationMs: 1_800_000,
});
const SESSION_EXPLORE = fixture({
  id: 'oc_fixture0000000003',
  agent: 'explore',
  costEuros: 0.05,
  tokensIn: 800,
  tokensOut: 100,
  durationMs: 5_400_000,
  issueKey: 'PROJ-102',
});

describe('implication d’une session OpenCode', () => {
  it('traite l’agent `build` comme un travail autonome', () => {
    expect(involvementFromSession(SESSION_BUILD)).toEqual({
      level: 'autonomous',
      source: 'mcp-declaration',
      client: 'opencode',
      model: 'opencode/space-bunny-free',
    });
  });

  it('traite les autres agents comme un travail conduit', () => {
    expect(involvementFromSession(SESSION_GENERAL).level).toBe('driven');
    expect(involvementFromSession(SESSION_EXPLORE).level).toBe('driven');
  });

  it('nomme le modèle réellement utilisé', () => {
    expect(involvementFromSession(SESSION_GENERAL).model).toBe('openrouter/some/model');
    expect(modelLabel({ provider: '', id: 'solo' })).toBe('solo');
    expect(modelLabel({ provider: 'fournisseur', id: '' })).toBe('fournisseur');
    expect(modelLabel({ provider: '', id: '' })).toBe('modèle inconnu');
  });
});

describe('issue d’une session OpenCode', () => {
  it('donne la durée réelle en heures', () => {
    expect(outcomeFromSession(SESSION_BUILD)).toEqual({ leadTimeH: 1, clean: false, reopened: false });
    expect(outcomeFromSession(SESSION_GENERAL).leadTimeH).toBe(0.5);
    expect(outcomeFromSession(SESSION_EXPLORE).leadTimeH).toBe(1.5);
  });

  it('laisse la réouverture et la propreté inconnues (SPEC §20)', () => {
    const issue = outcomeFromSession(SESSION_BUILD);
    expect(issue.clean).toBe(false);
    expect(issue.reopened).toBe(false);
  });

  it('donne le coût réel et le volume de jetons', () => {
    expect(costFromSession(SESSION_BUILD)).toEqual({ euros: 0.12, tokens: 1200 });
    expect(costFromSession(SESSION_GENERAL)).toEqual({ euros: 0.03, tokens: 550 });
  });
});

describe('résumé du jeu de données', () => {
  it('agrège sessions, coût, jetons, durée et tickets', () => {
    const resume = summarise([SESSION_BUILD, SESSION_GENERAL, SESSION_EXPLORE]);
    expect(resume.sessions).toBe(3);
    expect(resume.totalCost).toBe(0.2);
    expect(resume.totalTokens).toBe(2650);
    expect(resume.totalDurationH).toBe(3);
    expect(resume.withTicket).toBe(2);
  });

  it('répartit les sessions par modèle, la plus nombreuse d’abord', () => {
    const resume = summarise([SESSION_BUILD, SESSION_GENERAL, SESSION_EXPLORE]);
    expect(resume.byModel).toEqual([
      { model: 'opencode/space-bunny-free', sessions: 2, cost: 0.17 },
      { model: 'openrouter/some/model', sessions: 1, cost: 0.03 },
    ]);
  });

  it('résume un jeu vide sans échouer', () => {
    const resume = summarise([]);
    expect(resume.sessions).toBe(0);
    expect(resume.byModel).toEqual([]);
    expect(resume.totalDurationH).toBe(0);
  });
});

describe('lecture du jeu de données', () => {
  it('lit les sessions et refuse un contenu illisible', () => {
    const dataset = parseDataset({
      generatedAt: '2026-09-01T11:00:00.000Z',
      source: 'opencode',
      sessions: [SESSION_BUILD, 'pas une session'],
    });
    expect(dataset.source).toBe('opencode');
    expect(dataset.sessions).toHaveLength(1);
    expect(() => parseDataset('n’importe quoi')).toThrow();
  });

  it('traite une clé de ticket absente comme absente', () => {
    const dataset = parseDataset({
      generatedAt: '',
      source: 'opencode',
      sessions: [{ ...SESSION_BUILD, issueKey: '' }],
    });
    expect(dataset.sessions[0].issueKey).toBeNull();
  });
});

describe('récolte (tools/opencode/harvest.mjs)', () => {
  const racine = mkdtempSync(join(tmpdir(), 'recolte-opencode-'));
  const espace = join(racine, 'espace');
  const projet = join(espace, 'projet-x');
  const banc = join(racine, 'banc');
  const brut = join(racine, 'brut.json');
  const sortie = join(racine, 'sortie.json');

  afterAll(() => {
    rmSync(racine, { recursive: true, force: true });
  });

  it('écrit un jeu trié, haché et sans donnée personnelle', () => {
    mkdirSync(projet, { recursive: true });
    mkdirSync(banc, { recursive: true });
    writeFileSync(
      brut,
      JSON.stringify([
        {
          id: 'ses_aaaabbbbccccdddd1111',
          directory: projet,
          title: 'Contacter alice@example.com pour le ticket',
          agent: 'build',
          model: JSON.stringify({ id: 'space-bunny-free', providerID: 'opencode' }),
          cost: 0.5,
          tokens_input: 120,
          tokens_output: 30,
          summary_additions: 4,
          summary_deletions: 1,
          summary_files: 2,
          time_created: 1_757_000_000_000,
          time_updated: 1_757_003_600_000,
          texts: ['Le ticket PROJ-77 est prêt.'],
        },
        {
          id: 'ses_eeeeffffgggghhhh2222',
          directory: espace,
          title: `Reprise du chat ses_eeeeffffgggghhhh2222 sur ${LOGIN}/projets`,
          agent: 'general',
          model: JSON.stringify({ id: 'autre-modele', providerID: 'openrouter' }),
          cost: 0,
          tokens_input: 10,
          tokens_output: 2,
          time_created: 1_757_003_600_000,
          time_updated: 1_757_003_700_000,
        },
        {
          id: 'ses_iiiiijjjjkkkkllll3333',
          directory: join(espace, 'disparu'),
          title: 'Projet disparu',
          agent: 'build',
          model: JSON.stringify({ id: 'x', providerID: 'opencode' }),
          time_created: 1_757_003_700_000,
          time_updated: 1_757_003_800_000,
        },
        {
          id: 'ses_mmmmnnnnoooopppp4444',
          directory: banc,
          title: 'Banc d’essai hors espace',
          agent: 'build',
          model: JSON.stringify({ id: 'x', providerID: 'opencode' }),
          time_created: 1_757_003_800_000,
          time_updated: 1_757_003_900_000,
        },
      ]),
      'utf8',
    );

    execFileSync(process.execPath, [SCRIPT, '--from-json', brut, '--home', espace, '--out', sortie], {
      encoding: 'utf8',
    });

    const brutSortie = readFileSync(sortie, 'utf8');
    const dataset = parseDataset(JSON.parse(brutSortie));

    expect(dataset.sessions).toHaveLength(2);
    const ids = dataset.sessions.map((session) => session.id);
    expect(ids).toEqual([...ids].sort());
    expect(ids.every((id) => /^oc_[0-9a-f]{16}$/.test(id))).toBe(true);
    expect(brutSortie).not.toContain('ses_');
    expect(brutSortie).not.toContain(LOGIN);
    expect(brutSortie).not.toMatch(MOTIF_EMAIL);
    expect(dataset.sessions.map((session) => session.project).sort()).toEqual(['home', 'projet-x']);
    const avecTicket = dataset.sessions.find((session) => session.issueKey === 'PROJ-77');
    expect(avecTicket).toBeDefined();
    expect(avecTicket?.costEuros).toBe(0.5);
    expect(avecTicket?.durationMs).toBe(3_600_000);
  });

  it('produit le même fichier à chaque passage', () => {
    const premiere = readFileSync(sortie, 'utf8');
    execFileSync(process.execPath, [SCRIPT, '--from-json', brut, '--home', espace, '--out', sortie], {
      encoding: 'utf8',
    });
    expect(readFileSync(sortie, 'utf8')).toBe(premiere);
  });

  it('affiche un résumé sans rien écrire en mode simulation', () => {
    const sortieSimulation = join(racine, 'simulation.json');
    const journal = execFileSync(
      process.execPath,
      [SCRIPT, '--from-json', brut, '--home', espace, '--out', sortieSimulation, '--dry-run'],
      { encoding: 'utf8' },
    );
    expect(journal).toContain('sessions retenues');
    expect(journal).toContain('coût total');
    expect(existsSync(sortieSimulation)).toBe(false);
  });
});

describe('le jeu de données versionné', () => {
  const brut = readFileSync(JEU_VERSIONNE, 'utf8');
  const dataset = parseDataset(JSON.parse(brut));

  it('contient des sessions réelles, triées et uniques', () => {
    expect(dataset.sessions.length).toBeGreaterThan(0);
    expect(dataset.source).toBe('opencode');
    const ids = dataset.sessions.map((session) => session.id);
    expect(ids).toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ne contient aucune donnée personnelle', () => {
    expect(brut).not.toContain(LOGIN);
    expect(brut).not.toContain('/home/');
    expect(brut).not.toMatch(MOTIF_EMAIL);
    expect(brut).not.toMatch(MOTIF_ID_SESSION);
    expect(dataset.sessions.every((session) => /^oc_[0-9a-f]{16}$/.test(session.id))).toBe(true);
    expect(dataset.sessions.every((session) => !session.project.startsWith('/'))).toBe(true);
  });

  it('donne un résumé cohérent avec le fichier', () => {
    const resume = summarise(dataset.sessions);
    expect(resume.sessions).toBe(dataset.sessions.length);
    expect(resume.totalCost).toBe(
      Math.round(dataset.sessions.reduce((somme, s) => somme + s.costEuros, 0) * 1e6) / 1e6,
    );
    expect(resume.byModel.length).toBeGreaterThan(0);
    expect(resume.totalDurationH).toBeGreaterThan(0);
  });
});
