/**
 * The public site floor, traversed on the reference database.
 *
 * Covers: DP-20, DP-24.
 *
 * The committed `site/demo-data.json` is regenerated from the base and covers
 * the 35 panels (8 screens + 27 features); its figures are the base's, and the
 * data is marked as a demonstration.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { base, inconnus } from '../helpers/base.js';

interface Demonstration {
  meta: { tickets: number; demo: boolean; project: string };
  ecrans: Record<string, unknown>;
  features: Readonly<Record<string, unknown>>;
  mcp: Readonly<Record<string, unknown>>;
}

function demonstration(): Demonstration {
  return JSON.parse(readFileSync(join(process.cwd(), 'site', 'demo-data.json'), 'utf8'));
}

describe('le site public sur la base', () => {
  it('couvre les 35 panneaux : 8 écrans et 27 fonctionnalités', () => {
    const donnee = demonstration();
    expect(Object.keys(donnee.ecrans)).toHaveLength(8);
    expect(Object.keys(donnee.features)).toHaveLength(27);
    expect(donnee.mcp).toBeTruthy();
  });

  it('est marqué comme démonstration et porte le nombre de tickets de la base', () => {
    const donnee = demonstration();
    expect(donnee.meta.demo).toBe(true);
    expect(donnee.meta.project).toBe('PROJ');
    expect(donnee.meta.tickets).toBe(base().tickets.length);
  });

  it('sert les six chiffres du SPEC §8 pour la carte de PROJ-412', () => {
    const donnee = demonstration();
    const panneau = donnee.ecrans.carteTicket as { card: { agent: { n: number; rate: number; ciLow: number; ciHigh: number }; human: { n: number; rate: number; ciLow: number; ciHigh: number }; value: string; confidence: string } };
    expect(panneau.card.agent.n).toBe(26);
    expect(panneau.card.agent.rate).toBeCloseTo(0.69, 2);
    expect(panneau.card.human.n).toBe(31);
    expect(panneau.card.human.rate).toBeCloseTo(0.87, 2);
    expect(panneau.card.value).toBe('delegate-with-review');
    expect(panneau.card.confidence).toBe('medium');
  });

  it('sert la part d’implication inconnue de la base', () => {
    const donnee = demonstration();
    const panneau = donnee.features.implication as { sources: { tickets: number }[] };
    const total = panneau.sources.reduce((sum, source) => sum + source.tickets, 0);
    // The site counts the unknown among the sources, like the base does.
    expect(total).toBe(base().involvements.length);
    expect(inconnus().length).toBeGreaterThan(0);
  });
});