#!/usr/bin/env node
/**
 * CLI — **les vrais diffs** : l'historique git d'un dépôt, rapproché des
 * sessions réelles.
 *
 * Ce script est le seul morceau qui touche au disque et à `git` : le module
 * `src/collect/diffs.ts` reste pur (CONTRATS-REALITE.md §4 règle 1). Ici on
 * lit l'historique, on apparie les sessions à leur fenêtre `[debut, fin]`, et
 * on écrit le résultat **uniquement** dans `--out`.
 *
 * Ce que la CLI ne fait pas :
 *  - elle ne modifie **jamais** `src/sample/opencode-real.json` (ni
 *    `site/demo-data.json`, ni `tools/lab/real-runs.json` : ce sont des
 *    fichiers générés, hors périmètre des lots) ;
 *  - elle n'écrit **jamais** le chemin du dépôt dans les données produites :
 *    seul le nom du projet *relatif* à la maison y figure ;
 *  - elle n'écrit **jamais** le nom d'un auteur de commit ;
 *  - elle n'attribue un diff qu'aux sessions dont le projet **est** le dépôt
 *    donné : une session lancée depuis un dossier parent reste `'aucune'`,
 *    parce qu'on ne sait pas dans quel dépôt elle a travaillé.
 *
 * Usage :
 *   node tools/opencode/diffs.mjs --repo <dépôt> --sessions <json d'entrée>
 *                                 --out <json de sortie> [--dry-run]
 *   node tools/opencode/diffs.mjs --help
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { attribuerDiffs, parseGitLogNumstat } from '../../src/collect/diffs.ts';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Fichiers générés : aucun lot n'y touche, la CLI non plus. */
const GENERES_INTERDITS = [
  'src/sample/opencode-real.json',
  'site/demo-data.json',
  'tools/lab/real-runs.json',
];

/** Le format de lecture : sha, date ISO, auteur — une ligne par commit. */
const FORMAT_LOG = 'commit %H%x09%aI%x09%an';

/** Timeout de la lecture de l'historique (un gros dépôt peut être lent). */
const TIMEOUT_LOG = 120_000;

/** Usage affiché sur `--help`. */
function usage() {
  return [
    'CLI — les vrais diffs : historique git d’un dépôt × sessions réelles.',
    '',
    'Usage :',
    '  node tools/opencode/diffs.mjs --repo <dépôt> --sessions <json> --out <json> [--dry-run]',
    '  node tools/opencode/diffs.mjs --help',
    '',
    'Options :',
    '  --repo <chemin>      dépôt git dont on lit l’historique (lecture seule)',
    '  --sessions <json>    sessions d’entrée : { "sessions": [...] } ou [...]',
    '  --out <json>         fichier de sortie (écrit seulement là)',
    '  --dry-run            écrit rien : affiche le résumé',
    '  --help, -h           cette aide',
    '',
    'Le niveau d’attribution par session :',
    '  exacte  — un seul commit dans la fenêtre [debut, fin]',
    '  fenetre — plusieurs commits dans la fenêtre (ambiguïté comptée)',
    '  aucune  — aucun commit : ajouts/suppressions/fichiersTouches valent -1',
  ].join('\n');
}

/** Les options de la ligne de commande. */
function analyserArgs(argv) {
  const options = { repo: '', sessions: '', out: '', dryRun: false, aide: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--repo') options.repo = argv[(index += 1)] ?? '';
    else if (arg === '--sessions') options.sessions = argv[(index += 1)] ?? '';
    else if (arg === '--out') options.out = argv[(index += 1)] ?? '';
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--help' || arg === '-h') options.aide = true;
    else throw new Error(`option inconnue : ${arg}`);
  }
  return options;
}

/**
 * La clé de projet d'un dépôt : son chemin **relatif** à la maison.
 * C'est la même convention que la récolte OpenCode (`Bureau/cardwake`),
 * donc les deux données se parlent sans jamais sortir un chemin absolu.
 */
function cleProjet(cheminDepot, maison) {
  const relatif = relative(maison, cheminDepot);
  if (relatif === '') return 'home';
  if (!relatif.startsWith('..') && !isAbsolute(relatif)) return relatif.split(sep).join('/');
  return 'externe';
}

/** L'historique `git log --numstat` du dépôt, en texte brut. */
function lireHistorique(depot) {
  try {
    return execFileSync(
      'git',
      ['-C', depot, 'log', '--numstat', '--no-merges', '--date=iso-strict', `--format=${FORMAT_LOG}`],
      { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: TIMEOUT_LOG },
    );
  } catch (err) {
    const detail = String(err?.stderr ?? err?.message ?? err).trim();
    // Un dépôt sans commit n'est pas une erreur : son historique est vide.
    if (detail.includes('does not have any commits')) return '';
    throw new Error(`historique illisible : ${detail}`);
  }
}

/** Les sessions d'entrée, quel que soit l'enveloppe du JSON. */
function lireSessions(chemin) {
  const brut = JSON.parse(readFileSync(chemin, 'utf8'));
  const liste = Array.isArray(brut) ? brut : Array.isArray(brut?.sessions) ? brut.sessions : [];
  return liste.filter((session) => session && typeof session === 'object');
}

/** Une session enrichie : les faits réels remplacent les zéros de la base. */
function enrichir(session, commits) {
  const attribution = attribuerDiffs(commits, { debut: String(session.startedAt ?? ''), fin: String(session.endedAt ?? '') });
  return {
    ...session,
    additions: attribution.ajouts,
    deletions: attribution.suppressions,
    filesTouched: attribution.fichiersTouches,
    attribution: attribution.attribution,
    commitsRetenus: attribution.commitsRetenus,
  };
}

/** Le résumé : des chiffres avec leur effectif, jamais seuls. */
function resumer(sessionsLues, commits, sessions) {
  const parNiveau = { exacte: 0, fenetre: 0, aucune: 0 };
  for (const session of sessions) parNiveau[session.attribution] += 1;
  return {
    sessionsLues,
    sessionsDuDepot: sessions.length,
    commitsLus: commits.length,
    enrichies: parNiveau.exacte + parNiveau.fenetre,
    exacte: parNiveau.exacte,
    fenetre: parNiveau.fenetre,
    aucune: parNiveau.aucune,
    horsDepot: sessionsLues - sessions.length,
  };
}

/** Refuse d'écrire un fichier généré : la CLI n'en produit aucun. */
function verifierSortie(chemin) {
  const absolu = resolve(chemin);
  for (const interdit of GENERES_INTERDITS) {
    if (absolu === resolve(RACINE, interdit)) {
      throw new Error(`${interdit} est un fichier généré : il est hors périmètre (CONTRATS-REALITE.md §5)`);
    }
  }
  return absolu;
}

/** Point d'entrée : lit, apparie, écrit (sauf `--dry-run`). */
function main(argv) {
  const options = analyserArgs(argv);
  if (options.aide) {
    console.log(usage());
    return 0;
  }
  if (!options.repo || !options.sessions || !options.out) {
    console.error(usage());
    throw new Error('--repo, --sessions et --out sont obligatoires');
  }
  const sortie = verifierSortie(options.out);
  const depot = resolve(options.repo);
  const cle = cleProjet(depot, homedir());
  const commits = parseGitLogNumstat(lireHistorique(depot));
  const sessionsLues = lireSessions(options.sessions);
  const sessions = sessionsLues
    .filter((session) => String(session.project ?? '') === cle)
    .map((session) => enrichir(session, commits));
  const resume = resumer(sessionsLues.length, commits, sessions);
  const contenu = {
    generatedAt: dernierHorodatage(commits),
    source: 'git-log-numstat',
    projet: cle,
    commitsLus: commits.length,
    sessions,
    resume,
  };
  if (!options.dryRun) writeFileSync(sortie, `${JSON.stringify(contenu, null, 2)}\n`, 'utf8');
  console.log(`projet : ${cle} — commits lus : ${commits.length}`);
  console.log(
    `sessions lues : ${resume.sessionsLues} — du dépôt : ${resume.sessionsDuDepot} — `
    + `exacte : ${resume.exacte} — fenetre : ${resume.fenetre} — aucune : ${resume.aucune}`,
  );
  console.log(options.dryRun ? 'dry-run : rien n’a été écrit' : `écrit : ${sortie}`);
  return 0;
}

/** L'horodatage le plus récent de l'historique, en UTC (pas d'horloge ici). */
function dernierHorodatage(commits) {
  let instantMax = Number.NaN;
  for (const commit of commits) {
    const instant = Date.parse(commit.date);
    if (Number.isFinite(instant) && (!Number.isFinite(instantMax) || instant > instantMax)) {
      instantMax = instant;
    }
  }
  return Number.isFinite(instantMax) ? new Date(instantMax).toISOString() : '';
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (err) {
  console.error(`::error::${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
}
