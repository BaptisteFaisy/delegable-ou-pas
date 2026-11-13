#!/usr/bin/env node
/**
 * Récolte de la télémétrie OpenCode (lot O1 — « la vraie donnée OpenCode »).
 *
 * Ce script est le seul morceau qui touche au disque : il lit la base
 * SQLite des sessions d'OpenCode en LECTURE SEULE, trie, hache, nettoie et
 * écrit un jeu de données versionnable, déterministe et sans donnée
 * personnelle. Le domaine (`src/collect/opencode.ts`) reste pur : il ne fait
 * que transformer ce jeu de données en faits.
 *
 * Règles :
 *  - la base n'est jamais écrite (`file:…?mode=ro` + `readOnly: true`) ;
 *  - aucun identifiant de session en clair, aucun chemin personnel, aucun nom
 *    d'utilisateur dans le fichier produit ;
 *  - même base ⇒ même fichier (tri stable, `generatedAt` dérivé des données) ;
 *  - `--dry-run` affiche le résumé et n'écrit rien.
 *
 * Usage :
 *   node tools/opencode/harvest.mjs [--db <base>] [--out <fichier>]
 *                                  [--home <répertoire>] [--from-json <fichier>]
 *                                  [--dry-run]
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lireJson, lireSessions } from './source-db.mjs';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE_DEFAUT = resolve(RACINE, 'src', 'sample', 'opencode-real.json');
const BASE_DEFAUT = resolve(homedir(), '.local', 'share', 'opencode', 'opencode.db');
/** Clé de ticket : le motif du SPEC, chiffres obligatoires. */
const MOTIF_TICKET = /\bPROJ-\d+\b/;
const LONGUEUR_TITRE = 160;
const MS_PAR_HEURE = 3_600_000;

/* ------------------------------------------------------------------ filtres */

/**
 * Motifs qui ne doivent jamais atteindre le dépôt public : email, clé
 * d'API, jeton, identifiant de session, chemin absolu, hachage long.
 */
const REGLE_TITRE = [
  { motif: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, nom: 'email' },
  { motif: /\bsk-[A-Za-z0-9_-]{16,}/g, nom: 'clé API' },
  { motif: /\bsk_[a-f0-9]{24,}/g, nom: 'clé API' },
  { motif: /\bgh[pousr]_[A-Za-z0-9]{16,}/g, nom: 'jeton GitHub' },
  { motif: /\bgithub_pat_[A-Za-z0-9_]{16,}/g, nom: 'jeton GitHub' },
  { motif: /\bglpat-[A-Za-z0-9_-]{16,}/g, nom: 'jeton GitLab' },
  { motif: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g, nom: 'jeton Slack' },
  { motif: /\bAIza[A-Za-z0-9_-]{20,}/g, nom: 'clé Google' },
  { motif: /\bBearer\s+[A-Za-z0-9._~+/-]{12,}=*/g, nom: 'en-tête Bearer' },
  { motif: /\b(?:ses|msg|prt|pt)_[A-Za-z0-9]{6,}/g, nom: 'identifiant de session' },
  { motif: /\b[0-9a-fA-F]{24,}\b/g, nom: 'empreinte' },
  { motif: /\b[A-Za-z0-9+/]{32,}={0,2}\b/g, nom: 'chaîne longue' },
  { motif: /(?<![\w.-])\/[A-Za-z0-9._~%-]*[A-Za-z][A-Za-z0-9._~%-]*(?:\/[A-Za-z0-9._~%-]+)*/g, nom: 'chemin' },
];

/** Les mêmes motifs, sans l'option globale : `test` doit rester sans état. */
const REGLE_VERIFICATION = REGLE_TITRE.map((regle) => ({
  nom: regle.nom,
  motif: new RegExp(regle.motif.source, regle.motif.flags.replace('g', '')),
}));

/** La place d'un texte qui ressemble à un secret : remplacée, jamais coupée. */
const REMPLACEMENT = '[…]';

/* -------------------------------------------------------------------- util */

/** Vrai quand `enfant` est `parent` ou l'un de ses descendants. */
function estSous(enfant, parent) {
  const rel = relative(parent, enfant);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/** Vrai quand le chemin est un répertoire présent sur le disque. */
function estRepertoire(chemin) {
  try {
    return existsSync(chemin) && statSync(chemin).isDirectory();
  } catch {
    return false;
  }
}

/** Hash stable et court : la clé publique d'une session, jamais son id. */
function hacher(id) {
  return `oc_${createHash('sha256').update(String(id)).digest('hex').slice(0, 16)}`;
}

/** Entier sûr : une valeur absente ou fausse ne doit pas casser l'agrégat. */
function entier(valeur) {
  const nombre = Number(valeur);
  return Number.isFinite(nombre) ? Math.round(nombre) : 0;
}

/** Réel arrondi : le coût est affiché en euros, pas au nanoeuro. */
function euros(valeur) {
  const nombre = Number(valeur);
  if (!Number.isFinite(nombre)) return 0;
  return Math.round(nombre * 1e6) / 1e6;
}

/** Horodatage ISO : la base parle en millisecondes. */
function iso(ms) {
  return new Date(entier(ms)).toISOString();
}

/* ---------------------------------------------------------------- anonymat */

/**
 * Logins à effacer : celui de l'espace de travail déclaré et celui de la
 * machine. Le dépôt est public : un nom d'utilisateur n'y a pas sa place.
 */
function logins(maison) {
  const candidats = new Set();
  for (const racine of [maison, homedir()]) {
    const nom = basename(racine);
    if (nom !== '' && nom !== '.' && nom !== sep) candidats.add(nom);
  }
  return [...candidats];
}

/**
 * Nettoie un titre de session : plus aucune clé, aucun email, aucun
 * identifiant, aucun chemin, aucun nom d'utilisateur. Le titre reste lisible,
 * il perd seulement ce qui n'a pas sa place dans un dépôt public.
 */
function nettoyerTitre(titre, maison) {
  let texte = String(titre ?? '');
  for (const regle of REGLE_TITRE) texte = texte.replace(regle.motif, REMPLACEMENT);
  for (const login of logins(maison)) {
    const echappe = login.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    texte = texte.replace(new RegExp(`\\b${echappe}\\b`, 'gi'), REMPLACEMENT);
  }
  texte = texte.replace(/\s+/g, ' ').trim();
  if (texte.length > LONGUEUR_TITRE) texte = `${texte.slice(0, LONGUEUR_TITRE - 1).trimEnd()}…`;
  return texte;
}

/**
 * Vrai si un texte ressemble encore à une donnée personnelle : garde-fou
 * final, appliqué au champ `title` avant écriture.
 */
function contientDonneePersonnelle(texte, maison) {
  if (REGLE_VERIFICATION.some((regle) => regle.motif.test(texte))) return true;
  return logins(maison).some((login) => new RegExp(`\\b${login}\\b`, 'i').test(texte));
}

/* ----------------------------------------------------------------- projet */

/**
 * Nom de projet public : le chemin du travail, relatif à la maison, jamais
 * absolu. `/home/qui/Bureau/projet-x` devient `Bureau/projet-x`.
 */
function nomProjet(directory, maison) {
  if (directory === maison) return 'home';
  const rel = relative(maison, directory);
  if (rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)) return rel.split(sep).join('/');
  return 'externe';
}

/**
 * Raison d'exclusion d'une session, ou `null` si elle est retenue : le
 * répertoire doit exister et être dans l'espace de travail.
 */
function raisonExclusion(directory, maison) {
  if (!estRepertoire(directory)) return 'absent';
  if (estSous(directory, maison)) return null;
  if (estSous(directory, tmpdir())) return 'tmp';
  return 'hors-espace';
}

/* ------------------------------------------------------------------ modèle */

/** Modèle lu dans la colonne JSON de la base : fournisseur + identifiant. */
function lireModele(brut) {
  let brutModele = brut.model;
  if (typeof brutModele === 'string') {
    try {
      brutModele = JSON.parse(brutModele);
    } catch {
      brutModele = null;
    }
  }
  const enregistrement = brutModele && typeof brutModele === 'object' ? brutModele : {};
  return {
    provider: String(enregistrement.providerID ?? enregistrement.provider ?? ''),
    id: String(enregistrement.id ?? enregistrement.modelID ?? ''),
  };
}

/** Étiquette d'un modèle : `fournisseur/identifiant`, jamais de barre orpheline. */
function etiqueterModele(modele) {
  const id = String(modele.id ?? '').trim();
  const provider = String(modele.provider ?? '').trim();
  if (id !== '' && provider !== '') return `${provider}/${id}`;
  if (id !== '') return id;
  if (provider !== '') return provider;
  return 'modèle inconnu';
}

/* ------------------------------------------------------------------ ticket */

/** Première clé de ticket trouvée dans une liste de textes. */
function extraireTicket(textes) {
  for (const texte of textes) {
    if (typeof texte !== 'string') continue;
    const trouve = MOTIF_TICKET.exec(texte);
    if (trouve) return trouve[0];
  }
  return null;
}

/* -------------------------------------------------------------- construction */

/** Une session publique, prête à écrire. */
function construireSession(brut, maison) {
  const titre = nettoyerTitre(brut.title, maison);
  const modele = lireModele(brut);
  const textes = Array.isArray(brut.texts) ? brut.texts : [];
  return {
    id: hacher(brut.id),
    project: nomProjet(String(brut.directory ?? ''), maison),
    title: contientDonneePersonnelle(titre, maison) ? REMPLACEMENT : titre,
    agent: String(brut.agent ?? ''),
    model: modele,
    costEuros: euros(brut.cost),
    tokensIn: entier(brut.tokens_input),
    tokensOut: entier(brut.tokens_output),
    additions: entier(brut.summary_additions),
    deletions: entier(brut.summary_deletions),
    filesTouched: entier(brut.summary_files),
    durationMs: Math.max(0, entier(brut.time_updated) - entier(brut.time_created)),
    startedAt: iso(brut.time_created),
    endedAt: iso(brut.time_updated),
    issueKey: extraireTicket([String(brut.title ?? ''), ...textes]),
  };
}

/** Tri stable : la clé publique d'abord, donc le fichier ne bouge pas. */
function trier(sessions) {
  return [...sessions].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Transformation complète : filtrage, tri, jeu de données + exclusions. */
function transformer(brutes, maison) {
  const sessions = [];
  const exclus = { absent: 0, tmp: 0, 'hors-espace': 0 };
  for (const brut of brutes) {
    const raison = raisonExclusion(String(brut.directory ?? ''), maison);
    if (raison) {
      exclus[raison] += 1;
      continue;
    }
    sessions.push(construireSession(brut, maison));
  }
  const triees = trier(sessions);
  const dernier = triees.reduce((max, s) => Math.max(max, Date.parse(s.endedAt)), 0);
  const dataset = {
    generatedAt: new Date(dernier).toISOString(),
    source: 'opencode',
    sessions: triees,
  };
  return { dataset, exclus };
}

/* ------------------------------------------------------------------ lecture */

/** Sessions brutes depuis la base (schéma détecté) ou depuis un fichier JSON. */
async function lireSource(cheminBase, cheminJson) {
  if (cheminJson) return lireJson(cheminJson);
  return lireSessions(cheminBase);
}

/* ------------------------------------------------------------------ résumé */

/** Agrégats réels : sessions, coût, jetons, durée, répartition par modèle. */
function agreger(sessions) {
  const parModele = new Map();
  let cout = 0;
  let jetons = 0;
  let duree = 0;
  let tickets = 0;
  for (const session of sessions) {
    cout += session.costEuros;
    jetons += session.tokensIn + session.tokensOut;
    duree += session.durationMs;
    if (session.issueKey !== null) tickets += 1;
    const cle = etiqueterModele(session.model);
    parModele.set(cle, (parModele.get(cle) ?? 0) + 1);
  }
  const modeles = [...parModele.entries()].sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1));
  return { cout, jetons, duree, tickets, modeles };
}

/** Affiche le résumé réel : c'est la preuve que la récolte a produit des faits. */
function afficherResume(dataset, exclus, ecrit) {
  const agregats = agreger(dataset.sessions);
  const nombre = (valeur) => valeur.toLocaleString('fr-FR');
  console.log(`Récolte OpenCode — ${ecrit ? 'fichier écrit' : 'simulation (rien écrit)'}`);
  console.log(`  sessions retenues : ${nombre(dataset.sessions.length)}`);
  console.log(`  coût total        : ${nombre(Math.round(agregats.cout * 1e6) / 1e6).replace('.', ',')} €`);
  console.log(`  jetons (entrée+sortie) : ${nombre(agregats.jetons)}`);
  console.log(`  durée totale      : ${nombre(Math.round((agregats.duree / MS_PAR_HEURE) * 100) / 100)} h`);
  console.log(`  avec clé de ticket: ${nombre(agregats.tickets)}`);
  console.log('  répartition par modèle :');
  for (const [modele, sessions] of agregats.modeles) {
    console.log(`    ${modele} : ${nombre(sessions)} session(s)`);
  }
  console.log(`  écartées          : absent ${exclus.absent}, tmp ${exclus.tmp}, hors-espace ${exclus['hors-espace']}`);
  console.log(`  horodatage retenu : ${dataset.generatedAt}`);
}

/**
 * Sérialise le jeu de données : une session par ligne. Le fichier reste
 * lisible (une session = une ligne) et le diff reste jouable.
 */
function serialiser(dataset) {
  const corps = dataset.sessions.map((session) => `    ${JSON.stringify(session)}`);
  return [
    '{',
    `  "generatedAt": ${JSON.stringify(dataset.generatedAt)},`,
    `  "source": ${JSON.stringify(dataset.source)},`,
    '  "sessions": [',
    corps.join(',\n'),
    '  ]',
    '}',
    '',
  ].join('\n');
}

/* --------------------------------------------------------------------- CLI */

/** Usage affiché sur demande. */
function usage() {
  return [
    'Récolte de la télémétrie OpenCode.',
    'Usage : node tools/opencode/harvest.mjs [options]',
    '  --db <fichier>      base SQLite des sessions (défaut : celle de la machine)',
    '  --out <fichier>     jeu de données écrit (défaut : src/sample/opencode-real.json)',
    '  --home <répertoire> racine de l’espace de travail (défaut : la maison)',
    '  --from-json <fichier>  lit des sessions brutes en JSON au lieu de la base',
    '  --dry-run           affiche le résumé sans rien écrire',
    '  --help              cette aide',
  ].join('\n');
}

/** Analyse des arguments : options simples, sans dépendance. */
function analyserArgs(argv) {
  const options = {
    base: BASE_DEFAUT,
    sortie: SORTIE_DEFAUT,
    maison: homedir(),
    entree: null,
    simulation: false,
    aide: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--db') options.base = resolve(argv[++i] ?? '');
    else if (arg === '--out') options.sortie = resolve(argv[++i] ?? '');
    else if (arg === '--home') options.maison = resolve(argv[++i] ?? '');
    else if (arg === '--from-json') options.entree = resolve(argv[++i] ?? '');
    else if (arg === '--dry-run') options.simulation = true;
    else if (arg === '--help' || arg === '-h') options.aide = true;
    else throw new Error(`option inconnue : ${arg}`);
  }
  return options;
}

/** Point d'entrée : récolte, transformation, écriture ou résumé. */
async function main() {
  let options;
  try {
    options = analyserArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`::error::${err.message}`);
    console.error(usage());
    process.exit(2);
  }
  if (options.aide) {
    console.log(usage());
    return;
  }
  const brutes = await lireSource(options.base, options.entree);
  const { dataset, exclus } = transformer(brutes, options.maison);
  if (options.simulation) {
    afficherResume(dataset, exclus, false);
    return;
  }
  mkdirSync(dirname(options.sortie), { recursive: true });
  writeFileSync(options.sortie, serialiser(dataset), 'utf8');
  afficherResume(dataset, exclus, true);
  console.log(`  fichier            : ${options.sortie}`);
}

main().catch((err) => {
  console.error(`::error::récolte impossible : ${err.message}`);
  process.exit(1);
});
