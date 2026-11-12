/**
 * Tests of the demo documents — DP-20, SPEC §24.1.
 *
 * The figures quoted by `docs/DEMO-DATA.md` are the figures the dataset
 * produces: no number is written by hand in the document, this test recomputes
 * every `FIG-nn` row and fails when the document drifts away from the game.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { percent } from '../../src/domain/stats.js';
import type { Seed } from '../../src/sample/issues.js';
import { sampleEpochs } from '../../src/sample/epochs.js';
import {
  sampleCards,
  sampleCommitFacts,
  sampleInvolvements,
  sampleLinks,
  sampleOutcomes,
  sampleReviewFacts,
  sampleSeeds,
  sampleTickets,
  sampleTrial,
} from '../../src/sample/index.js';
import { cleanOf } from '../../src/sample/outcomes.js';
import { boundsOf, conclusionOf, figuresOf } from './fixtures.js';

const read = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../../docs/${name}`, import.meta.url)), 'utf8');

const DOC = read('DEMO-DATA.md');
const JUDGES = read('JUDGES.md');
const VIDEO = read('VIDEO-SCRIPT.md');

/** The document as one line: the quoted phrases may wrap in the markdown. */
function flat(text: string): string {
  return text.replace(/\s+/g, ' ');
}
const SEEDS: readonly Seed[] = sampleSeeds();
const TICKETS = sampleTickets();
const INVOLVEMENTS = sampleInvolvements();
const OUTCOMES = sampleOutcomes();
const UNKNOWN = INVOLVEMENTS.filter((item) => item.level === 'unknown').length;

/** One `FIG-nn` row of the document: the key and the cells that follow. */
interface DocRow {
  readonly key: string;
  readonly cells: readonly string[];
}

/** Every `FIG-nn` row of the document, in order. */
function rowsOf(width: number): readonly DocRow[] {
  return [...DOC.matchAll(/^\| (FIG-\d+) \|(.+)\|$/gm)]
    .map((match) => ({ key: match[1], cells: match[2].split('|').map((cell) => cell.trim()) }))
    .filter((row) => row.cells.length === width);
}

/** The distinct cohorts of the dataset: nature · zone · taille · époque. */
function cohorts(): readonly (readonly Seed[])[] {
  const groups = new Map<string, Seed[]>();
  for (const seed of SEEDS) {
    const key = `${seed.epochId}|${seed.nature}|${seed.zone}|${seed.size}`;
    groups.set(key, [...(groups.get(key) ?? []), seed]);
  }
  return [...groups.values()];
}

/** The cohorts the app cannot conclude on (SPEC §7 rule 4). */
function greyCohorts(): readonly (readonly Seed[])[] {
  return cohorts().filter((tickets) => conclusionOf(figuresOf(tickets)) === 'not-enough-data');
}

/** The tickets of the cohort a label of the document names. */
function cohortOfLabel(label: string): readonly Seed[] {
  const [nature, zone, size, epoch] = label.split('·').map((cell) => cell.trim());
  const epochId = `epoch-${epoch.replace('époque', '').trim()}`;
  return SEEDS.filter((seed) =>
    seed.nature === nature && seed.zone === zone && seed.size === size && seed.epochId === epochId);
}

/** The single-value figures the document announces, recomputed from the game. */
function expectedCounts(): Readonly<Record<string, string>> {
  return {
    'FIG-01': String(TICKETS.length),
    'FIG-02': String(sampleCommitFacts().length),
    'FIG-03': String(sampleReviewFacts().length),
    'FIG-04': String(sampleLinks().length),
    'FIG-05': String(sampleEpochs().length),
    'FIG-06': String(UNKNOWN),
    'FIG-07': `${Math.round((UNKNOWN / INVOLVEMENTS.length) * 100)} %`,
    'FIG-08': String(OUTCOMES.filter((outcome) => outcome.closedAt !== '').length),
    'FIG-09': String(OUTCOMES.filter((outcome) => outcome.closedAt === '').length),
    'FIG-10': String(OUTCOMES.filter((outcome) => outcome.clean).length),
    'FIG-11': String(OUTCOMES.filter((outcome) => outcome.reopened).length),
    'FIG-12': String(cohorts().length),
    'FIG-13': String(greyCohorts().length),
    'FIG-14': String(sampleCards().length),
    'FIG-15': sampleTrial().state === 'running' ? '1' : '0',
    'FIG-16': String(new Set(TICKETS.map((ticket) => ticket.sprintId)).size),
  };
}

describe('docs/DEMO-DATA.md — les effectifs annoncés sont ceux du jeu', () => {
  const rows = rowsOf(2);
  const expected = expectedCounts();

  it('le document porte les deux tableaux de chiffres', () => {
    expect(rows.length).toBe(Object.keys(expected).length);
    expect(rowsOf(6)).toHaveLength(12);
  });

  for (const row of rows) {
    it(`${row.key} — ${row.cells[0]}`, () => {
      expect(expected[row.key], `${row.key} absent du calcul`).toBeDefined();
      expect(row.cells[1], `${row.key} ${row.cells[0]}`).toBe(expected[row.key]);
    });
  }
});

describe('docs/DEMO-DATA.md — les cohortes annoncées sont celles du jeu', () => {
  const rows = rowsOf(6);

  for (const row of rows) {
    it(`${row.key} — ${row.cells[0]} · ${row.cells[1]}`, () => {
      const figures = figuresOf(cohortOfLabel(row.cells[0]));
      const agent = row.cells[1] === 'avec agent';
      const stat = agent ? figures.agent : figures.human;
      const lead = agent ? figures.agentLead : figures.humanLead;
      expect(stat, `${row.key} bras vide`).not.toBeNull();
      expect(String(stat?.n), `${row.key} effectif`).toBe(row.cells[2]);
      expect(percent(stat?.rate ?? 0), `${row.key} taux`).toBe(row.cells[3]);
      const [low, high] = boundsOf(stat ?? { n: 0, rate: 0, ciLow: 0, ciHigh: 0 });
      expect(`[${low} ; ${high}]`, `${row.key} fourchette`).toBe(row.cells[4]);
      expect(`${lead?.medianH} h`, `${row.key} délai médian`).toBe(row.cells[5]);
    });
  }
});

/** The three cohorts every demo document quotes. */
function quotedCohorts() {
  return {
    spec7: figuresOf(cohortOfLabel('bugfix · api · M · époque 2')),
    red: figuresOf(cohortOfLabel('data-migration · billing · M · époque 2')),
    unbalanced: figuresOf(cohortOfLabel('external-integration · api · L · époque 2')),
    proj412: figuresOf(cohortOfLabel('data-migration · billing · M · époque 3')),
  };
}

/** A median delay in days, the way the French documents write it. */
function daysFr(hours: number): string {
  const days = hours / 24;
  return days >= 2 ? `${String(days).replace('.', ',')} jours` : `${String(days).replace('.', ',')} jour`;
}

/** A median delay in days, the way the English script writes it. */
function daysEn(hours: number): string {
  return `${hours / 24} days`;
}

/** The rate line of one arm, as the documents quote it. */
function rateLine(stat: { n: number; rate: number; ciLow: number; ciHigh: number }): string {
  const [low, high] = boundsOf(stat);
  return `${percent(stat.rate)} entre ${low} et ${high}`;
}

describe('docs/JUDGES.md et docs/VIDEO-SCRIPT.md — aucun nombre écrit à la main', () => {
  const { spec7, red, unbalanced, proj412 } = quotedCohorts();
  const agent = proj412.agent;
  const human = proj412.human;
  const reopened = proj412.agentTickets.filter((seed) => seed.failure.reopened).length;
  const failures = proj412.agentTickets.filter((seed) => !cleanOf(seed)).length;
  const share = Math.round((UNKNOWN / INVOLVEMENTS.length) * 100);

  it('les effectifs et la part d\'inconnu du guide des juges', () => {
    expect(JUDGES).toContain(`${TICKETS.length} tickets`);
    expect(JUDGES).toContain(`${share} % des tickets ont une implication inconnue`);
    expect(JUDGES).toContain(`${greyCohorts().length} cohortes sur ${cohorts().length}`);
  });

  it('la carte de PROJ-412 dans le guide des juges', () => {
    expect(agent).not.toBeNull();
    expect(human).not.toBeNull();
    expect(JUDGES).toContain(`(${agent?.n} avec agent, ${human?.n} sans`);
    expect(JUDGES).toContain(`${rateLine(agent!)} contre ${percent(human!.rate)} entre ${boundsOf(human!)[0]} et ${boundsOf(human!)[1]}`);
    expect(JUDGES).toContain(`${daysFr(proj412.agentLead?.medianH ?? 0)} contre ${daysFr(proj412.humanLead?.medianH ?? 0)}`);
    expect(JUDGES).toContain(`${reopened} réouvertures sur ${failures}`);
  });

  it('les cohortes citées par le guide des juges', () => {
    expect(JUDGES).toContain(`${percent(red.agent!.rate)} contre ${percent(red.human!.rate)}`);
    expect(JUDGES).toContain(`${percent(spec7.agent!.rate)} contre ${percent(spec7.human!.rate)}`);
    expect(flat(JUDGES)).toContain(`${unbalanced.agent!.n} tickets avec agent, ${unbalanced.human!.n} sans`);
  });

  it('le scénario de la vidéo cite les mêmes chiffres, en anglais', () => {
    expect(flat(VIDEO)).toContain(`${agent?.n} tickets with an agent, ${human?.n}`);
    expect(flat(VIDEO)).toContain(`${percent(agent!.rate)} with an agent (between ${boundsOf(agent!)[0]} and ${boundsOf(agent!)[1]} %)`);
    expect(flat(VIDEO)).toContain(`${percent(human!.rate)} without`);
    expect(flat(VIDEO)).toContain(`${daysEn(proj412.agentLead?.medianH ?? 0)} with an agent, ${daysEn(proj412.humanLead?.medianH ?? 0)} without`);
    expect(flat(VIDEO)).toContain(`${reopened} reopenings out of ${failures}`);
    expect(flat(VIDEO)).toContain(`${percent(red.agent!.rate)} [${boundsOf(red.agent!)[0]} ; ${boundsOf(red.agent!)[1]}] contre ${percent(red.human!.rate)} [${boundsOf(red.human!)[0]} ; ${boundsOf(red.human!)[1]}]`);
    expect(flat(VIDEO)).toContain(`${greyCohorts().length} cohortes grises sur ${cohorts().length}`);
  });
});

describe('docs/DEMO-DATA.md — les époques annoncées sont celles du jeu', () => {
  it('les trois débuts d\'époque du tableau §3.2', () => {
    const epochs = sampleEpochs();
    for (const epoch of epochs) {
      expect(DOC, epoch.id).toContain(`| \`${epoch.id}\` | ${epoch.startsAt} |`);
    }
    expect(DOC).toContain('nouveau modèle, 14 septembre');
  });

  it('la part d\'implication inconnue annoncée est celle du jeu', () => {
    const share = Math.round((UNKNOWN / INVOLVEMENTS.length) * 100);
    expect(DOC).toContain(`| FIG-07 | part d'implication inconnue | ${share} % |`);
  });
});
