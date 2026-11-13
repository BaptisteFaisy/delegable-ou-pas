/**
 * Tests of the demo dataset coherence — DP-17, DP-20, SPEC §6, §13, §17, §24.
 *
 * The dataset must hold together: every fact points to a ticket that exists, no
 * date escapes the twelve months, the demo is marked as such everywhere, and no
 * person appears anywhere (SPEC §18 last line, recipe 12).
 */
import { describe, expect, it } from 'vitest';
import { DEMO_DATASET_LABEL } from '../../src/types.js';
import { isMature } from '../../src/domain/maturity.js';
import {
  SAMPLE_IS_MARKED_AS_DEMO,
  sampleCards,
  sampleClasses,
  sampleCommitFacts,
  sampleHistories,
  sampleInvolvements,
  sampleLinks,
  sampleOutcomes,
  sampleReviewFacts,
  sampleSettings,
  sampleTickets,
} from '../../src/sample/index.js';
import { ROBOT_ACCOUNT } from '../../src/sample/history.js';
import { FAMILIES } from '../../src/sample/issues.js';
import { SAMPLE_NOW, SAMPLE_WINDOW_END, SAMPLE_WINDOW_START, insideWindow } from '../../src/sample/project.js';
import { SEEDS } from './fixtures.js';

const TICKETS = sampleTickets();
const COMMIT_FACTS = sampleCommitFacts();
const REVIEW_FACTS = sampleReviewFacts();
const OUTCOMES = sampleOutcomes();
const INVOLVEMENTS = sampleInvolvements();
const CLASSES = sampleClasses();
const HISTORIES = sampleHistories();
const LINKS = sampleLinks();
const CARDS = sampleCards();

/** Every ticket id of the dataset. */
const IDS = new Set(TICKETS.map((ticket) => ticket.id));

describe('SPEC §24.1 — la cohérence du jeu', () => {
  it('douze mois d\'historique et un projet peuplé', () => {
    expect(TICKETS.length).toBe(SEEDS.length);
    expect(TICKETS.length).toBeGreaterThan(500);
    expect(new Set(TICKETS.map((ticket) => ticket.key)).size).toBe(TICKETS.length);
    expect(new Set(TICKETS.map((ticket) => ticket.id)).size).toBe(TICKETS.length);
  });

  it('chaque commit pointe un ticket existant', () => {
    expect(COMMIT_FACTS.length).toBeGreaterThan(0);
    expect(COMMIT_FACTS.every((fact) => IDS.has(fact.issueId))).toBe(true);
    expect(new Set(COMMIT_FACTS.map((fact) => fact.commitRef)).size).toBe(COMMIT_FACTS.length);
  });

  it('chaque relecture pointe un ticket existant, avec au moins deux commits', () => {
    expect(REVIEW_FACTS.length).toBeGreaterThan(0);
    expect(REVIEW_FACTS.every((fact) => IDS.has(fact.issueId))).toBe(true);
    for (const fact of REVIEW_FACTS) {
      const commits = COMMIT_FACTS.filter((commit) => commit.issueId === fact.issueId);
      expect(commits.length).toBeGreaterThanOrEqual(2);
      expect(fact.commitsAfterOpen).toBeLessThanOrEqual(commits.length);
    }
  });

  it('chaque résultat, implication, classement et historique pointe un ticket existant', () => {
    expect(OUTCOMES.every((outcome) => IDS.has(outcome.issueId))).toBe(true);
    expect(INVOLVEMENTS.every((item) => IDS.has(item.issueId))).toBe(true);
    expect(CLASSES.every((item) => IDS.has(item.issueId))).toBe(true);
    expect(HISTORIES.every((item) => IDS.has(item.issueId))).toBe(true);
    expect(OUTCOMES).toHaveLength(TICKETS.length);
    expect(INVOLVEMENTS).toHaveLength(TICKETS.length);
    expect(CLASSES).toHaveLength(TICKETS.length);
  });

  it('chaque lien pointe deux tickets qui existent', () => {
    expect(LINKS.length).toBeGreaterThan(0);
    for (const link of LINKS) {
      expect(IDS.has(link.issueId)).toBe(true);
      expect(IDS.has(link.linkedIssueId)).toBe(true);
      expect(link.issueId).not.toBe(link.linkedIssueId);
    }
  });

  it('chaque carte pointe un ticket existant', () => {
    expect(CARDS.length).toBeGreaterThan(0);
    expect(CARDS.every((card) => IDS.has(card.issueId))).toBe(true);
    expect(CARDS.every((card) => TICKETS.some((ticket) => ticket.key === card.issueKey))).toBe(true);
  });

  it('aucune date hors de la fenêtre de douze mois', () => {
    for (const ticket of TICKETS) {
      expect(insideWindow(ticket.createdAt)).toBe(true);
      expect(insideWindow(ticket.updatedAt)).toBe(true);
    }
    expect(COMMIT_FACTS.every((fact) => insideWindow(fact.committedAt))).toBe(true);
    expect(REVIEW_FACTS.every((fact) => insideWindow(fact.openedAt))).toBe(true);
    for (const outcome of OUTCOMES.filter((item) => item.closedAt !== '')) {
      expect(insideWindow(outcome.closedAt)).toBe(true);
    }
    expect(Date.parse(SAMPLE_WINDOW_START)).toBeLessThan(Date.parse(SAMPLE_WINDOW_END));
  });

  it('les tickets fermés avant la référence sont jugeables, les autres non', () => {
    const matured = OUTCOMES.filter((outcome) => isMature(outcome, SAMPLE_NOW));
    expect(matured.length).toBeGreaterThan(0);
    expect(matured.length).toBeLessThan(OUTCOMES.length);
    for (const outcome of matured) {
      expect(Date.parse(outcome.matureAt)).toBeLessThanOrEqual(Date.parse(SAMPLE_NOW));
    }
  });
});

describe('SPEC §24.1 — le catalogue des familles se tient', () => {
  it('chaque famille déclare autant d\'échecs que de tickets non propres', () => {
    for (const family of FAMILIES) {
      for (const arm of [family.agent, family.human]) {
        const declared =
          (arm.failures.reopened ?? 0) + (arm.failures.causedBugs ?? 0) + (arm.failures.abandoned ?? 0);
        expect(declared, `${family.id} ${arm.count}/${arm.clean}`).toBe(arm.count - arm.clean);
        expect(arm.failures.incidents ?? 0, family.id).toBeLessThanOrEqual(arm.failures.causedBugs ?? 0);
      }
    }
  });

  it('les fenêtres de dates tiennent dans les douze mois', () => {
    for (const family of FAMILIES) {
      expect(insideWindow(`${family.from}T12:00:00Z`), family.id).toBe(true);
      expect(insideWindow(`${family.to}T12:00:00Z`), family.id).toBe(true);
      expect(Date.parse(family.from)).toBeLessThanOrEqual(Date.parse(family.to));
    }
  });
});

describe('SPEC §5 — l\'implication inconnue est massive et honnête', () => {
  it('environ 41 % d\'implication inconnue', () => {
    const unknown = INVOLVEMENTS.filter((item) => item.level === 'unknown');
    const share = unknown.length / INVOLVEMENTS.length;
    expect(share).toBeGreaterThan(0.38);
    expect(share).toBeLessThan(0.44);
  });

  it('une implication inconnue ne porte ni client, ni modèle, ni session', () => {
    const unknown = INVOLVEMENTS.filter((item) => item.level === 'unknown');
    expect(unknown.every((item) => item.client === '' && item.model === '' && item.sessionRef === '')).toBe(true);
    expect(unknown.every((item) => item.source === 'adoption-date')).toBe(true);
  });

  it('les cinq niveaux et les cinq sources apparaissent dans le jeu', () => {
    const levels = new Set(INVOLVEMENTS.map((item) => item.level));
    const sources = new Set(INVOLVEMENTS.map((item) => item.source));
    expect(levels).toEqual(new Set(['none', 'assisted', 'driven', 'autonomous', 'unknown']));
    expect(sources).toEqual(
      new Set(['mcp-declaration', 'bot-author', 'commit-mention', 'closure-field', 'adoption-date']),
    );
  });
});

describe('DP-20 — le jeu est marqué comme démonstration partout', () => {
  it('le drapeau, les réglages et le jeu de données', () => {
    expect(SAMPLE_IS_MARKED_AS_DEMO).toBe(true);
    expect(sampleSettings().demo).toBe(true);
    expect(DEMO_DATASET_LABEL).toBe('demo-dataset');
  });

  it('chaque ticket porte le jeu de données de démonstration', () => {
    expect(TICKETS.every((ticket) => ticket.customFields.customfield_10022 === DEMO_DATASET_LABEL)).toBe(true);
    expect(TICKETS.every((ticket) => ticket.labels.includes('demo'))).toBe(true);
  });

  it('chaque carte porte le drapeau de démonstration', () => {
    expect(CARDS.every((card) => card.demo)).toBe(true);
  });
});

describe('DP-17 — aucune personne dans le jeu', () => {
  it('les seules identités sont des rôles et un compte robot', () => {
    const names = new Set(COMMIT_FACTS.map((fact) => fact.agentName).filter((name) => name !== ''));
    expect([...names]).toEqual([ROBOT_ACCOUNT]);
  });

  it('aucun texte du jeu ne porte une adresse ni un identifiant de personne', () => {
    const texts = [
      ...TICKETS.map((ticket) => `${ticket.summary}|${ticket.labels.join('|')}`),
      ...INVOLVEMENTS.flatMap((item) => [...item.evidence, item.client, item.model, item.sessionRef]),
      ...CARDS.flatMap((card) => [...card.reasons, ...card.failureCauses, ...card.conditions]),
    ];
    expect(texts.every((text) => !text.includes('@'))).toBe(true);
  });

  it('les faits de relecture portent un nombre de relecteurs, jamais un nom', () => {
    expect(REVIEW_FACTS.every((fact) => fact.reviewerCount >= 1)).toBe(true);
    expect(Object.keys(REVIEW_FACTS[0]).sort()).toEqual([
      'changesRequested', 'commentCount', 'commitsAfterOpen', 'issueId', 'mergedAt', 'openedAt',
      'prRef', 'reviewerCount',
    ]);
  });
});
