/**
 * Le panneau « Nos preuves » du site public.
 *
 * Ce panneau publie ce que la machine a **réellement constaté** sur son
 * environnement : les huit preuves de `tools/prove-real.mjs`, leur verdict et
 * leurs chiffres. Le fichier lu est la version JSON des preuves
 * (`src/sample/preuves-reelles.json`), produite par la même passe : aucun
 * chemin, aucun nom, aucun identifiant n'y entre — seulement des nombres.
 *
 * Pourquoi c'est sur le site : une preuve que personne ne voit ne prouve
 * rien. Le site est la seule porte du projet qui s'ouvre sans installation.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Panel } from './site-types.js';

const FICHIER = fileURLToPath(new URL('../../src/sample/preuves-reelles.json', import.meta.url));

interface PreuveVersionnee {
  readonly nom: string;
  readonly ok: boolean;
  readonly chiffres: Record<string, number>;
}

interface RecuPreuves {
  readonly genereLe: string;
  readonly source: string;
  readonly preuves: readonly PreuveVersionnee[];
}

/** Le reçu des preuves, lu dans l'arbre — jamais sur le réseau. */
function recu(): RecuPreuves {
  return JSON.parse(readFileSync(FICHIER, 'utf8')) as RecuPreuves;
}

/** Les libellés d'une preuve, en français et en anglais. */
const LIBELLES: Record<string, { fr: string; en: string }> = {
  'base-opencode': {
    fr: 'La base de sessions de l’agent existe sur la machine',
    en: 'The agent session database exists on the machine',
  },
  'recolte-fraiche': {
    fr: 'La récolte rejouée à l’instant donne au moins les sessions publiées',
    en: 'The harvest replayed now gives at least the published sessions',
  },
  'jeu-versionne': {
    fr: 'Le jeu de données publié est volumineux et sans donnée personnelle',
    en: 'The published dataset is large and free of personal data',
  },
  'lab-commits': {
    fr: 'Le bac à sable contient de vrais commits signés d’un agent',
    en: 'The sandbox holds real commits signed by an agent',
  },
  'lab-journal': {
    fr: 'Le journal du lab colle aux commits réels',
    en: 'The lab journal matches the real commits',
  },
  'lab-attribution': {
    fr: 'Chaque session est bien attribuée à son ticket',
    en: 'Each session is correctly attributed to its ticket',
  },
  'coherence-site': {
    fr: 'Le site public affiche les mêmes chiffres que le dépôt',
    en: 'The public site shows the same figures as the repository',
  },
  'lab-rejouable': {
    fr: 'Le lab se relance',
    en: 'The sandbox can be replayed',
  },
};

/** Une preuvepubliée : son nom, son verdict, ses chiffres. */
interface PreuvePubliee {
  readonly nom: string;
  readonly libelle: { fr: string; en: string };
  readonly ok: boolean;
  readonly chiffres: ReadonlyArray<{ nom: string; valeur: number }>;
}

/** Les chiffres publiés, avec un nom lisible — les nombres restent intacts. */
const NOMS_CHIFFRES: Record<string, string> = {
  tailleOctets: 'taille de la base (octets)',
  sessionsFraiches: 'sessions récoltées à l’instant',
  sessionsVersionnees: 'sessions publiées',
  ecart: 'écart à rejouer',
  sessions: 'sessions',
  avecTicket: 'rattachées à un ticket',
  jetons: 'jetons',
  heures: 'heures d’exécution',
  modeles: 'modèles',
  commitsAvecTicket: 'commits avec une clé de ticket',
  commitsAvecMention: 'commits signés d’un agent',
  shaAbsents: 'commits introuvables',
  sansCommit: 'sessions sans commit',
  attribuees: 'sessions attribuées',
  siteSessions: 'sessions affichées par le site',
  siteTickets: 'tickets affichés par le site',
  depotSessions: 'sessions dans le dépôt',
  depotTickets: 'tickets dans le dépôt',
  tickets: 'tickets listés',
};

/** Le panneau : les huit preuves, leur verdict et leurs chiffres. */
export function panneauPreuves(): Panel {
  const recuPreuves = recu();
  const preuves: PreuvePubliee[] = recuPreuves.preuves.map((preuve) => ({
    nom: preuve.nom,
    libelle: LIBELLES[preuve.nom] ?? { fr: preuve.nom, en: preuve.nom },
    ok: preuve.ok,
    chiffres: Object.entries(preuve.chiffres).map(([nom, valeur]) => ({ nom: NOMS_CHIFFRES[nom] ?? nom, valeur })),
  }));
  const reussies = preuves.filter((preuve) => preuve.ok).length;
  return {
    label: {
      fr: 'Nos preuves : ce que la machine a réellement constaté',
      en: 'Our proofs: what the machine actually observed',
    },
    summary: {
      fr: `Huit preuves sont jouées en direct contre l’environnement de la machine — la base de `
        + `sessions de l’agent, la récolte rejouée à l’instant, le bac à sable et ses commits, la `
        + `cohérence du site avec le dépôt. ${reussies} sur ${preuves.length} sont vertes au moment `
        + `de la publication. Ce sont des mesures, pas des intentions : le reçu complet est dans le `
        + `dépôt, et le script qui les produit est public.`,
      en: `Eight proofs are played live against the machine's environment — the agent session `
        + `database, the harvest replayed now, the sandbox and its commits, the site's agreement `
        + `with the repository. ${reussies} of ${preuves.length} are green at publication time. These `
        + `are measurements, not intentions: the full receipt is in the repository and the script `
        + `that produces it is public.`,
    },
    mention: {
      fr: 'mesuré sur la machine',
      en: 'measured on the machine',
    },
    genereLe: recuPreuves.genereLe,
    reussies,
    preuves,
  };
}
