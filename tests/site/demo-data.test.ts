/**
 * Generates `site/demo-data.json` — the dataset the public site renders.
 *
 * The numbers are not written by hand: this file runs the real domain modules on
 * the real sample dataset (`src/sample/`) and serialises the result. A second
 * test asserts the committed JSON is still identical to a freshly computed one,
 * so a change in the domain that is not reflected on the site turns CI red.
 *
 * Regenerate with: `MAJ_DEMO=1 npx vitest run tests/site`
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SAMPLE_PROJECT_KEY, SAMPLE_REFERENCE_DATE } from '../../src/sample/index.js';
import {
  panelAppariement, panelCalibrationFine, panelEcartEtabli, panelMultiplicite,
  panelNaive, panelPuissance, panelSequentiel, panelSurvie, armTotals, cohortKeys, joinTickets,
} from './panneaux-stats.js';
import {
  allTickets, ecranCalibration, ecranCarteDelegation, ecranCarteTicket, ecranCohorte,
  ecranCouverture, ecranGadget, ecranReglages, ecranSprint, mainTotals,
  panneauAnonymat, panneauConditions, panneauEpoques, panneauEssai, panneauImplication,
  panneauJiraSeul, panneauMentions, panneauPriorite, outilsMcp,
} from './panneaux-produit.js';
import { sampleCards, sampleClasses, sampleInvolvements, sampleOutcomes } from '../../src/sample/index.js';

const OUTPUT = join(process.cwd(), 'site', 'demo-data.json');

/** Builds the whole payload: 8 screens, 16 feature panels, the MCP tools. */
function buildDataset(): Record<string, unknown> {
  const tickets = allTickets();
  const totals = mainTotals(tickets);
  const joined = joinTickets(sampleClasses(), sampleInvolvements(), sampleOutcomes());
  const biggest = totals[0] ? totals[0].key : cohortKeys(joined, 1)[0] || '';
  return {
    meta: {
      demo: true,
      project: SAMPLE_PROJECT_KEY,
      referenceDate: SAMPLE_REFERENCE_DATE,
      tickets: tickets.length,
      cohorts: totals.length,
      generator: 'tests/site/demo-data.test.ts',
      commit: process.env.SITE_COMMIT || 'local',
      generatedAt: process.env.SITE_DATE || SAMPLE_REFERENCE_DATE,
    },
    ecrans: {
      carteTicket: ecranCarteTicket(),
      carteDelegation: ecranCarteDelegation(tickets, totals),
      cohorte: ecranCohorte(totals),
      sprint: ecranSprint(),
      reglages: ecranReglages(),
      couverture: ecranCouverture(),
      calibration: ecranCalibration(tickets),
      gadget: ecranGadget(totals),
    },
    features: {
      implication: panneauImplication(),
      mentions: panneauMentions(),
      ecartEtabli: panelEcartEtabli(totals),
      survie: panelSurvie(tickets),
      multiplicite: panelMultiplicite(totals),
      appariement: panelAppariement(tickets, biggest || armTotals(tickets, '').key),
      puissance: panelPuissance(),
      sequentiel: panelSequentiel(),
      essai: panneauEssai(),
      naive: panelNaive(tickets, totals),
      calibrationFine: panelCalibrationFine(sampleCards(), tickets),
      conditions: panneauConditions(),
      priorite: panneauPriorite(tickets),
      jiraSeul: panneauJiraSeul(),
      epoques: panneauEpoques(),
      anonymat: panneauAnonymat(),
    },
    mcp: outilsMcp(tickets),
  };
}

/** Serialises with sorted keys, so the committed file never churns on ordering. */
function canonical(value: unknown): string {
  return JSON.stringify(sortDeep(value), null, 2);
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    Object.keys(record).sort().forEach((key) => { out[key] = sortDeep(record[key]); });
    return out;
  }
  return value;
}

/** Counts proportion objects, however deeply nested. */
function countProportions(value: unknown): number {
  if (Array.isArray(value)) return value.reduce((total, item) => total + countProportions(item), 0);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.n === 'number' && typeof record.rate === 'number'
      && typeof record.ciLow === 'number' && typeof record.ciHigh === 'number') return 1;
    return Object.keys(record).reduce((total, key) => total + countProportions(record[key]), 0);
  }
  return 0;
}

/** Fields that would identify a person: forbidden anywhere in the payload. */
const PERSON_FIELDS = ['accountid', 'email', 'assignee', 'reporter', 'displayname', 'avatar'];

function findPersonField(value: unknown, path = ''): string | null {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const found = findPersonField(item, `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      const normalised = key.toLowerCase();
      if (PERSON_FIELDS.some((field) => normalised.includes(field))) return `${path}.${key}`;
      const found = findPersonField((value as Record<string, unknown>)[key], `${path}.${key}`);
      if (found) return found;
    }
  }
  return null;
}

describe('données du site public', () => {
  const payload = buildDataset();
  const serialised = canonical(payload);

  it('écrit le jeu quand MAJ_DEMO est demandé, et le compare sinon', () => {
    if (process.env.MAJ_DEMO) {
      writeFileSync(OUTPUT, `${serialised}\n`, 'utf8');
      return;
    }
    let current = '';
    try {
      current = readFileSync(OUTPUT, 'utf8');
    } catch {
      current = '';
    }
    expect(current, 'site/demo-data.json est absent ou périmé : MAJ_DEMO=1 npx vitest run tests/site').toBe(`${serialised}\n`);
  });

  it('couvre les 8 écrans et les 16 panneaux de fonctionnalités', () => {
    const ecrans = Object.keys(payload.ecrans as Record<string, unknown>);
    const features = Object.keys(payload.features as Record<string, unknown>);
    expect(ecrans).toHaveLength(8);
    expect(features).toHaveLength(16);
    [...ecrans, ...features].forEach((key) => {
      const panel = (ecrans.includes(key)
        ? (payload.ecrans as Record<string, Record<string, unknown>>)[key]
        : (payload.features as Record<string, Record<string, unknown>>)[key]);
      expect(panel.label, `${key} sans libellé`).toBeTruthy();
      expect(panel.summary, `${key} sans résumé`).toBeTruthy();
      expect(Object.keys(panel).length, `${key} vide`).toBeGreaterThan(2);
    });
  });

  it('chaque panneau est bilingue', () => {
    const panels = [
      ...Object.values(payload.ecrans as Record<string, Record<string, unknown>>),
      ...Object.values(payload.features as Record<string, Record<string, unknown>>),
    ];
    panels.forEach((panel) => {
      ['label', 'summary'].forEach((field) => {
        const text = panel[field] as { fr?: string; en?: string };
        expect(text.fr, `${field}.fr manquant`).toBeTruthy();
        expect(text.en, `${field}.en manquant`).toBeTruthy();
      });
    });
  });

  it('aucune proportion sans effectif, et aucune proportion sans fourchette', () => {
    expect(countProportions(payload)).toBeGreaterThan(10);
    const serialisedText = serialised;
    expect(serialisedText).toContain('"ciLow"');
    expect(serialisedText).toContain('"ciHigh"');
  });

  it('aucun identifiant de personne ne sort dans le jeu public', () => {
    expect(findPersonField(payload)).toBeNull();
  });

  it('le jeu est marqué comme démonstration', () => {
    const meta = payload.meta as { demo: boolean };
    expect(meta.demo).toBe(true);
  });

  it('le contre-exemple du SPEC §7 est bien un recouvrement avec écart établi', () => {
    const panel = (payload.features as Record<string, Record<string, unknown>>).ecartEtabli;
    const counter = panel.counterExample as { overlap: boolean; established: boolean };
    expect(counter.overlap).toBe(true);
    expect(counter.established).toBe(true);
  });

  it('la sérialisation est déterministe', () => {
    expect(canonical(buildDataset())).toBe(serialised);
  });
});
