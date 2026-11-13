/**
 * Tests du jeu de données RÉEL (lot O1) : les 854 sessions OpenCode récoltées
 * sur cette machine, versionnées dans `src/sample/opencode-real.json`.
 *
 * Le reste de la suite teste des fixtures, et c'est normal : un test doit être
 * reproductible. Mais un jeu de données réel doit, lui, être **vérifié par la
 * suite** — c'est ce fichier-ci qui empêche une récolte périmée, tronquée ou
 * mal anonymisée de passer en silence (c'est exactement le trou du 12 novembre :
 * la table lue était figée, le fichier produit était bien formé, juste vieux).
 *
 * Aucun réseau, aucune base vivante ici : le test porte sur le fichier
 * versionné. La preuve en direct est dans `tools/prove-real.mjs`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
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

const JEU = fileURLToPath(new URL('../../src/sample/opencode-real.json', import.meta.url));
const MOTIF_TICKET = /^PROJ-\d+$/;

function jeuReel(): readonly OpenCodeSession[] {
  const brut = readFileSync(JEU, 'utf8');
  return parseDataset(JSON.parse(brut)).sessions;
}

describe('jeu de données réel — volume et diversité', () => {
  it('contient un volume de sessions réel, pas un jeu de démonstration', () => {
    const sessions = jeuReel();
    expect(sessions.length).toBeGreaterThanOrEqual(100);
    const modeles = new Set(sessions.map((session) => modelLabel(session.model)));
    expect(modeles.size).toBeGreaterThanOrEqual(5);
    const agents = new Set(sessions.map((session) => session.agent));
    expect(agents.size).toBeGreaterThanOrEqual(3);
  });

  it('couvre plusieurs mois : la récolte n’est pas d’hier', () => {
    const sessions = jeuReel();
    const dates = sessions.map((session) => Date.parse(session.startedAt)).sort((a, b) => a - b);
    expect(dates[0]).toBeGreaterThan(0);
    const etendueJours = (dates[dates.length - 1] - dates[0]) / 86_400_000;
    expect(etendueJours).toBeGreaterThan(30);
  });
});

describe('jeu de données réel — passage dans les modules', () => {
  it('donne à chaque session un niveau d’implication et une source', () => {
    for (const session of jeuReel()) {
      const implication = involvementFromSession(session);
      expect(['autonomous', 'driven']).toContain(implication.level);
      expect(implication.source).toBe('mcp-declaration');
      expect(implication.client).toBe('opencode');
      expect(implication.model.length).toBeGreaterThan(0);
    }
  });

  it('distingue l’agent autonome du piloté sur la donnée réelle', () => {
    const sessions = jeuReel();
    const autonomes = sessions.filter((session) => session.agent === 'build');
    const pilotes = sessions.filter((session) => session.agent !== 'build');
    expect(autonomes.length).toBeGreaterThan(0);
    expect(pilotes.length).toBeGreaterThan(0);
    expect(involvementFromSession(autonomes[0]).level).toBe('autonomous');
    expect(involvementFromSession(pilotes[0]).level).toBe('driven');
  });

  it('ne prétend jamais qu’un résultat est propre ou rouvert', () => {
    for (const session of jeuReel()) {
      const issue = outcomeFromSession(session);
      expect(issue.clean).toBe(false);
      expect(issue.reopened).toBe(false);
      expect(Number.isFinite(issue.leadTimeH)).toBe(true);
      expect(issue.leadTimeH).toBeGreaterThanOrEqual(0);
    }
  });

  it('donne un coût et un volume de jetons non négatifs', () => {
    const sessions = jeuReel();
    let jetons = 0;
    for (const session of sessions) {
      const cout = costFromSession(session);
      expect(cout.euros).toBeGreaterThanOrEqual(0);
      expect(cout.tokens).toBeGreaterThanOrEqual(0);
      jetons += cout.tokens;
    }
    expect(jetons).toBe(summarise(sessions).totalTokens);
  });
});

describe('jeu de données réel — cohérence interne', () => {
  it('résume exactement le fichier qu’il a lu', () => {
    const sessions = jeuReel();
    const resume = summarise(sessions);
    expect(resume.sessions).toBe(sessions.length);
    expect(resume.withTicket).toBe(sessions.filter((session) => session.issueKey !== null).length);
    const sommeParModele = resume.byModel.reduce((total, part) => total + part.sessions, 0);
    expect(sommeParModele).toBe(sessions.length);
    const parts = resume.byModel.map((part) => part.sessions);
    expect([...parts].sort((a, b) => b - a)).toEqual(parts);
  });

  it('ne rattache que des tickets vrais', () => {
    const sessions = jeuReel();
    const avecTicket = sessions.filter((session) => session.issueKey !== null);
    expect(avecTicket.length).toBeGreaterThan(0);
    for (const session of avecTicket) {
      expect(session.issueKey).toMatch(MOTIF_TICKET);
      expect(session.title.length).toBeGreaterThan(0);
    }
  });

  it('ne laisse aucun chemin de fichier fuir dans les données', () => {
    for (const session of jeuReel()) {
      expect(session.project.startsWith('/')).toBe(false);
      expect(session.project).not.toContain('home/');
    }
  });
});
