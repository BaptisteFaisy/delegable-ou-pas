/**
 * Tests of the measured uncertainty.
 *
 * The point of the module: turn "41 % unknown" into something a team can act
 * on. The tests therefore check that the entropy is **monotone** (more spread,
 * more bits), that the reach is honest (it says when the data will never
 * arrive), that the flip probability travels as a proportion with its interval,
 * and that the report names its blockers instead of shrugging.
 */
import { describe, expect, it } from 'vitest';
import {
  flipProbability,
  ticketsToChangeConclusion,
  uncertaintyReport,
  unknownEntropy,
} from '../../src/domain/uncertainty.js';

describe('entropie de l’inconnu', () => {
  it('vaut zéro bits quand tous les niveaux sont identiques', () => {
    const entropy = unknownEntropy([{ level: 'none' }, { level: 'none' }]);
    expect(entropy.bits).toBe(0);
    expect(entropy.share).toBe(0);
    expect(entropy.ticketsToDecide).toBe(0);
  });

  it('croît quand la distribution s’étale', () => {
    const two = unknownEntropy([{ level: 'none' }, { level: 'none' }]);
    const three = unknownEntropy([{ level: 'none' }, { level: 'none' }, { level: 'unknown' }]);
    expect(three.bits).toBeGreaterThan(two.bits);
  });

  it('mesure la part d’inconnu et le nombre de tickets à lever', () => {
    const entropy = unknownEntropy([
      { level: 'unknown' }, { level: 'unknown' }, { level: 'none' }, { level: 'none' },
    ]);
    expect(entropy.share).toBeCloseTo(0.5, 4);
    expect(entropy.ticketsToDecide).toBe(2);
    expect(entropy.note.fr).toContain('50 %');
    expect(entropy.note.en).toContain('50 %');
  });

  it('un ticket à la fois, c’est un ticket à la fois', () => {
    const entropy = unknownEntropy([{ level: 'unknown' }], 3);
    expect(entropy.ticketsToDecide).toBe(1);
  });

  it('aucun ticket ne plante pas', () => {
    const entropy = unknownEntropy([]);
    expect(entropy.share).toBe(0);
    expect(entropy.bits).toBe(0);
  });
});

describe('combien de tickets pour conclure', () => {
  it('annonce ce qu’il manque', () => {
    const reach = ticketsToChangeConclusion({ n: 12, clean: 8, threshold: 20 });
    expect(reach.tickets).toBe(8);
    expect(reach.achievable).toBe(true);
    expect(reach.note.fr).toContain('8');
  });

  it('dit qu’une conclusion est possible au-dessus du seuil', () => {
    const reach = ticketsToChangeConclusion({ n: 30, clean: 24, threshold: 20 });
    expect(reach.tickets).toBe(0);
    expect(reach.achievable).toBe(false);
    expect(reach.note.en).toContain('threshold');
  });

  it('accepte une cible de clôture propre', () => {
    const reach = ticketsToChangeConclusion({ n: 30, clean: 24, threshold: 20, targetClean: 27 });
    expect(reach.tickets).toBe(0);
  });
});

describe('probabilité de bascule', () => {
  it('sort comme une proportion, avec effectif et fourchette', () => {
    const flip = flipProbability({ n: 26, clean: 18, unknownShare: 0.4 });
    expect(flip.n).toBe(26);
    expect(flip.rate).toBeCloseTo(Math.round(26 * 0.4) / 26, 4);
    expect(flip.ciLow).toBeLessThanOrEqual(flip.rate);
    expect(flip.ciHigh).toBeGreaterThanOrEqual(flip.rate);
  });

  it("la part non tranchée est ce qui peut faire basculer l'avis", () => {
    const flip = flipProbability({ n: 10, clean: 9, unknownShare: 0.5 });
    expect(flip.rate).toBeCloseTo(0.5, 4);
    expect(flip.rate).toBeLessThan(0.9);
  });

  it('reste bornée', () => {
    const flip = flipProbability({ n: 10, clean: 0, unknownShare: 1 });
    expect(flip.rate).toBeGreaterThanOrEqual(0);
    expect(flip.rate).toBeLessThanOrEqual(1);
  });
});

describe('rapport d’incertitude', () => {
  const unknown = unknownEntropy([{ level: 'unknown' }, { level: 'none' }]);

  it('nomme les blocages', () => {
    const report = uncertaintyReport({ unknown, conclusion: 'not-enough-data', cohortKey: 'a|b|M' });
    expect(report.canConclude).toBe(false);
    expect(report.blockers).toContain('pas assez de recul');
    expect(report.note.fr).toContain('On ne conclut pas');
  });

  it('dit quoi collecter ensuite', () => {
    const report = uncertaintyReport({ unknown, conclusion: 'not-enough-data', cohortKey: 'a|b|M' });
    expect(report.nextCollect.length).toBeGreaterThan(0);
    expect(report.nextCollect.join(' ')).toContain('a|b|M');
  });

  it('une conclusion qui tient ne bloque pas', () => {
    const known = unknownEntropy([{ level: 'none' }]);
    const report = uncertaintyReport({ unknown: known, conclusion: 'better', cohortKey: 'a|b|M' });
    expect(report.canConclude).toBe(true);
    expect(report.blockers).toHaveLength(0);
    expect(report.nextCollect.join(' ')).toContain('Rien');
  });

  it('trop d’inconnu est un blocage, même avec une conclusion', () => {
    const report = uncertaintyReport({ unknown, conclusion: 'better', cohortKey: 'a|b|M' });
    expect(report.blockers).toContain('implication trop souvent inconnue');
  });
});
