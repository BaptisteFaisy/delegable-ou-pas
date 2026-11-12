/**
 * The coherence of the base — SPEC §17, §18, §24.1, DP-17.
 *
 * Every fact points at a fact that exists, every date stays inside the twelve
 * months of the window, no person appears (only roles and robot accounts) and
 * the dataset says everywhere that it is a demo.
 */
import { describe, expect, it } from 'vitest';
import {
  sampleCards, sampleClasses, sampleCommitFacts, sampleInvolvements, sampleLinks, sampleOutcomes,
  sampleReviewFacts, sampleSeeds, sampleSettings, sampleTickets,
} from '../../src/sample/index.js';
import { FIELD_DATASET } from '../../src/sample/history.js';
import { SAMPLE_DEMO_LABEL, SAMPLE_WINDOW_END, SAMPLE_WINDOW_START } from '../../src/sample/project.js';

const SEEDS = sampleSeeds();
const TICKETS = sampleTickets();
const COMMITS = sampleCommitFacts();
const REVIEWS = sampleReviewFacts();
const LINKS = sampleLinks();
const IDS = new Set(SEEDS.map((seed) => seed.id));
const KEYS = new Set(SEEDS.map((seed) => seed.key));

describe('les faits pointent des faits qui existent', () => {
  it('chaque commit pointe un ticket existant', () => {
    expect(COMMITS.length).toBeGreaterThan(0);
    COMMITS.forEach((commit) => expect(IDS.has(commit.issueId)).toBe(true));
  });

  it('chaque pull request pointe un ticket existant et ses commits', () => {
    expect(REVIEWS.length).toBeGreaterThan(0);
    for (const review of REVIEWS) {
      expect(IDS.has(review.issueId)).toBe(true);
      const seed = SEEDS.find((candidate) => candidate.id === review.issueId);
      expect(review.commitsAfterOpen).toBeLessThanOrEqual(seed?.commits ?? 0);
    }
  });

  it('chaque lien pointe deux tickets existants', () => {
    for (const link of LINKS) {
      expect(IDS.has(link.issueId)).toBe(true);
      expect(IDS.has(link.linkedIssueId)).toBe(true);
    }
  });

  it('chaque référence d\'une carte existe', () => {
    for (const card of sampleCards()) {
      card.referenceIssueKeys.forEach((key) => expect(KEYS.has(key)).toBe(true));
    }
  });

  it('chaque classe, implication et résultat porte un ticket existant', () => {
    sampleClasses().forEach((item) => expect(IDS.has(item.issueId)).toBe(true));
    sampleInvolvements().forEach((item) => expect(IDS.has(item.issueId)).toBe(true));
    sampleOutcomes().forEach((item) => expect(IDS.has(item.issueId)).toBe(true));
  });
});

describe('aucune date hors de la fenêtre de douze mois', () => {
  const inside = (value: string): boolean => value >= SAMPLE_WINDOW_START && value <= `${SAMPLE_WINDOW_END}T23:59:59Z`;

  it('les tickets, les commits, les relectures et les réouvertures', () => {
    for (const seed of SEEDS) {
      expect(inside(seed.createdAt), `${seed.key} créé hors fenêtre`).toBe(true);
      expect(inside(seed.closedAt) || seed.closedAt === '').toBe(true);
      expect(inside(seed.reopenedAt) || seed.reopenedAt === '').toBe(true);
    }
    COMMITS.forEach((commit) => expect(inside(commit.committedAt)).toBe(true));
    REVIEWS.forEach((review) => {
      expect(inside(review.openedAt)).toBe(true);
      expect(review.mergedAt === '' || inside(review.mergedAt)).toBe(true);
    });
  });
});

describe('aucun identifiant de personne', () => {
  it('les rôles sont dev-1, dev-2, dev-3 et les robots agent-bot-*', () => {
    const roles = new Set(SEEDS.map((seed) => seed.role));
    roles.forEach((role) => expect(role).toMatch(/^(dev-[123]|agent-bot-[0-9]+)$/));
    const agents = new Set(COMMITS.map((commit) => commit.agentName).filter((name) => name !== ''));
    agents.forEach((name) => expect(name).toMatch(/^agent-bot-[0-9]+$/));
  });

  it('aucun nom, aucune adresse, aucun compte dans le jeu', () => {
    const serialised = JSON.stringify({ seeds: SEEDS, tickets: TICKETS, links: LINKS });
    expect(serialised).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}/i);
    expect(serialised).not.toMatch(/displayName|avatar|email|accountId|assignee|reporter/i);
  });
});

describe('le jeu est marqué comme démonstration', () => {
  it('chaque ticket porte l\'étiquette de démonstration', () => {
    TICKETS.forEach((ticket) => {
      expect(ticket.labels).toContain('demo');
      expect(ticket.customFields[FIELD_DATASET]).toBe(SAMPLE_DEMO_LABEL);
    });
  });

  it('les réglages, les cartes et le lien de la base disent la même chose', () => {
    expect(sampleSettings().demo).toBe(true);
    sampleCards().forEach((card) => expect(card.demo).toBe(true));
  });
});
