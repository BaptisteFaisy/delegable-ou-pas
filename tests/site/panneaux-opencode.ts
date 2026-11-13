/**
 * The real-data panel of the public site: the summary of the OpenCode sessions
 * harvested on a real machine (lot O1, `src/sample/opencode-real.json`).
 *
 * What is published: aggregates only — how many sessions, what they cost, how
 * many tokens they burned, how long they ran, how they split per model, and
 * how many of them carry a ticket key. No session title, no project name, no
 * identifier ever leaves this file: the harvest already scrubbed them
 * (`tools/opencode/harvest.mjs`), and only the figures the domain computes
 * (`src/collect/opencode.ts`) are published.
 *
 * The figures come from the domain, never from a note: `parseDataset` reads
 * the harvested file, `summarise` aggregates it.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseDataset, summarise } from '../../src/collect/opencode.js';
import type { OpenCodeDataset } from '../../src/collect/opencode.js';
import type { Panel } from './site-types.js';

/** The harvested file, read from the tree — never from a network. */
const FICHIER = fileURLToPath(new URL('../../src/sample/opencode-real.json', import.meta.url));

/** The harvested dataset, parsed by the domain (an unreadable file is an error). */
function harvested(): OpenCodeDataset {
  return parseDataset(JSON.parse(readFileSync(FICHIER, 'utf8')));
}

/**
 * Panel "the real data": the sessions an agent really ran, anonymised at the
 * harvest and reduced to aggregates here.
 */
export function panneauDonneesReelles(): Panel {
  const dataset = harvested();
  const resume = summarise(dataset.sessions);
  const modeles = resume.byModel.map((part) => ({
    modele: part.model,
    sessions: part.sessions,
    part: resume.sessions === 0 ? 0 : Math.round((part.sessions / resume.sessions) * 10000) / 10000,
    cout: part.cost,
  }));
  return {
    label: {
      fr: 'La donnée réelle : les sessions OpenCode récoltées',
      en: 'The real data: the harvested OpenCode sessions',
    },
    summary: {
      fr: 'Les sessions qu’un agent de code a réellement exécutées sur un poste de travail, '
        + 'anonymisées à la récolte (ni email, ni chemin, ni identifiant) et réduites ici à des '
        + 'agrégats. Les coûts affichés sont ceux qu’enregistre la base locale : nuls quand les '
        + 'modèles utilisés sont gratuits.',
      en: 'The sessions a coding agent really ran on a workstation, anonymised at harvest time '
        + '(no email, no path, no identifier) and reduced to aggregates here. The costs shown are '
        + 'the ones the local database records: zero when the models used are free ones.',
    },
    mention: {
      fr: 'données réelles, anonymisées',
      en: 'real data, anonymised',
    },
    recolte: {
      source: dataset.source,
      genereLe: dataset.generatedAt,
      fichier: 'src/sample/opencode-real.json',
    },
    sessions: resume.sessions,
    cout: resume.totalCost,
    jetons: resume.totalTokens,
    heures: resume.totalDurationH,
    modeles,
    tickets: resume.withTicket,
    note: {
      fr: 'Une session n’est rattachée à un ticket que si son titre ou ses messages portent une clé '
        + 'PROJ- : le chiffre affiché est donc le nombre réel de sessions rattachées, et il rend '
        + 'compte des tickets traités par un agent dans le bac à sable réel.',
      en: 'A session is attached to a ticket only when its title or its messages carry a PROJ- key: '
        + 'the figure shown is therefore the real number of attached sessions, and it accounts for '
        + 'the tickets worked on by an agent in the real sandbox.',
    },
  };
}
