/**
 * Attribution des **vrais diffs** à une session (lot « les vrais diffs »).
 *
 * Le trou que ce module ferme : la base SQLite d'OpenCode ne porte aucun
 * diff — `ajouts`, `suppressions` et `fichiersTouches` y valent `0` pour les
 * 865 sessions récoltées (CONTRATS-REALITE.md §2). Le module « signaux
 * faibles » (`src/domain/signals.ts`) n'a donc aucune donnée réelle à
 * exploiter : il ne tourne que sur du fictif.
 *
 * La donnée des diffs, elle, existe : elle est dans l'historique git des
 * dépôts réels (`git log --numstat`). Ce module fait le lien entre les deux,
 * **sans jamais mentir sur le lien** :
 *
 *  - un seul commit dans la fenêtre `[debut, fin]` → attribution `'exacte'` ;
 *  - plusieurs commits dans la fenêtre → attribution `'fenetre'`, diffs
 *    agrégés, et le nombre de commits retenus : l'ambiguïté est signalée,
 *    jamais cachée ;
 *  - aucun commit dans la fenêtre → attribution `'aucune'`, et les valeurs
 *    valent `-1` (« on ne sait pas »), **jamais** `0` (« mesuré, valait
 *    zéro ») ;
 *  - un commit hors de la fenêtre n'est **jamais** retenu : la fenêtre est
 *    une condition, pas une préférence.
 *
 * Ce module est PUR : ni `fs`, ni réseau, ni horloge non injectée. Il reçoit
 * les commits déjà lus (par le CLI `tools/opencode/diffs.mjs`) et rend
 * l'attribution.
 *
 * Règles : fichier < 500 lignes, fonctions < 50 lignes.
 */

/** D'où viennent les lignes ajoutées / supprimées / fichiers touchés. */
export type Attribution = 'exacte' | 'fenetre' | 'aucune';

/** La valeur « on ne sait pas » — jamais `0` (CONTRATS-REALITE.md §1). */
export const INCONNU = -1;

/** Un commit lu dans l'historique git : ce que git a dit, rien de plus. */
export interface CommitLu {
  /** Identifiant complet du commit (40 caractères hexadécimaux). */
  readonly sha: string;
  /** Nom de l'auteur, tel que git l'écrit. */
  readonly auteur: string;
  /** Date du commit, ISO 8601 (offset compris). */
  readonly date: string;
  /** Lignes ajoutées, comptées sur les fichiers texte. */
  readonly ajouts: number;
  /** Lignes supprimées, comptées sur les fichiers texte. */
  readonly suppressions: number;
  /** Chemins touchés, **relatifs au dépôt**. */
  readonly fichiers: readonly string[];
  /**
   * Vrai si le commit contient un fichier binaire : les lignes de ce fichier
   * ne sont pas comptables, le total est donc incomplet (et le dira).
   */
  readonly lignesInconnues: boolean;
}

/** La fenêtre d'une session : début et fin, en ISO 8601. */
export interface FenetreSession {
  readonly debut: string;
  readonly fin: string;
}

/** Ce que l'attribution dit d'une session. */
export interface AttributionDiffs {
  /** Le niveau d'attribution : `'exacte'`, `'fenetre'` ou `'aucune'`. */
  readonly attribution: Attribution;
  /** Lignes ajoutées : `-1` quand la donnée n'est pas connue. */
  readonly ajouts: number;
  /** Lignes supprimées : `-1` quand la donnée n'est pas connue. */
  readonly suppressions: number;
  /** Fichiers touchés : `-1` quand la donnée n'est pas connue. */
  readonly fichiersTouches: number;
  /** Nombre de commits retenus dans la fenêtre (0, 1, ou n). */
  readonly commitsRetenus: number;
  /** Les sha retenus, dans l'ordre de l'historique. */
  readonly shas: readonly string[];
  /** Vrai quand plusieurs commits se partagent la fenêtre. */
  readonly ambiguite: boolean;
}

/* --------------------------------------------------------- lecture du git log */

/** Le préfixe d'en-tête que pose la commande `git log` du CLI. */
const PREFIXE_COMMIT = 'commit ';

/** Un commit en cours de lecture, avant d'être figé. */
interface CommitEnCours {
  sha: string;
  auteur: string;
  date: string;
  ajouts: number;
  suppressions: number;
  fichiers: string[];
  lignesInconnues: boolean;
}

/** Une ligne d'en-tête : `commit <sha>\t<date>\t<auteur>`. */
function lireEntete(ligne: string): CommitEnCours | null {
  if (!ligne.startsWith(PREFIXE_COMMIT)) return null;
  const morceaux = ligne.slice(PREFIXE_COMMIT.length).split('\t');
  if (morceaux.length < 3) return null;
  const sha = morceaux[0].trim();
  if (!/^[0-9a-f]{7,40}$/.test(sha)) return null;
  return {
    sha,
    auteur: morceaux[2],
    date: morceaux[1].trim(),
    ajouts: 0,
    suppressions: 0,
    fichiers: [],
    lignesInconnues: false,
  };
}

/**
 * Une ligne de `numstat` : `<ajouts>\t<suppressions>\t<chemin>`.
 *
 * Un fichier binaire sort `-\t-\t<chemin>` : le fichier est bien touché, mais
 * ses lignes ne sont pas comptables. On le note (`lignesInconnues`) au lieu de
 * compter un zéro qui ferait croire à un diff vide.
 */
function ajouterNumstat(commit: CommitEnCours, ligne: string): void {
  const morceaux = ligne.split('\t');
  if (morceaux.length < 3) return;
  const ajouts = morceaux[0].trim();
  const suppressions = morceaux[1].trim();
  const chemin = morceaux.slice(2).join('\t');
  if (ajouts !== '-' && !/^\d+$/.test(ajouts)) return;
  if (suppressions !== '-' && !/^\d+$/.test(suppressions)) return;
  commit.fichiers.push(chemin);
  if (ajouts === '-' || suppressions === '-') {
    commit.lignesInconnues = true;
    return;
  }
  commit.ajouts += Number(ajouts);
  commit.suppressions += Number(suppressions);
}

/** Fige un commit en cours de lecture. */
function figer(commit: CommitEnCours): CommitLu {
  return {
    sha: commit.sha,
    auteur: commit.auteur,
    date: commit.date,
    ajouts: commit.ajouts,
    suppressions: commit.suppressions,
    fichiers: commit.fichiers,
    lignesInconnues: commit.lignesInconnues,
  };
}

/**
 * Parse une sortie `git log --numstat` en commits.
 *
 * La fonction est **pure** : elle transforme une chaîne en liste, sans lire
 * le disque, sans toucher l'horloge. Le CLI fournit la sortie ; les tests
 * fournissent un échantillon réel recopié dans le fichier de test.
 *
 * Les lignes qui ne sont ni un en-tête ni un `numstat` (lignes vides, séparateurs)
 * sont ignorées : un `git log` un peu différent ne doit pas faire échouer la
 * lecture.
 */
export function parseGitLogNumstat(sortie: string): CommitLu[] {
  const commits: CommitLu[] = [];
  let enCours: CommitEnCours | null = null;
  for (const ligne of sortie.split('\n')) {
    const entete = lireEntete(ligne);
    if (entete !== null) {
      if (enCours !== null) commits.push(figer(enCours));
      enCours = entete;
      continue;
    }
    if (enCours !== null && ligne.trim() !== '') ajouterNumstat(enCours, ligne);
  }
  if (enCours !== null) commits.push(figer(enCours));
  return commits;
}

/* --------------------------------------------------------------- attribution */

/** Millisecondes d'une date ISO ; `NaN` quand la date est illisible. */
function millisecondes(iso: string): number {
  const valeur = Date.parse(iso);
  return Number.isFinite(valeur) ? valeur : Number.NaN;
}

/**
 * Les commits qui tombent dans la fenêtre `[debut, fin]`, bornes incluses.
 *
 * Une date illisible (fenêtre ou commit) ne retient rien : on ne retient que
 * ce qu'on peut prouver.
 */
export function commitsDansFenetre(
  commits: readonly CommitLu[],
  fenetre: FenetreSession,
): CommitLu[] {
  const debut = millisecondes(fenetre.debut);
  const fin = millisecondes(fenetre.fin);
  if (!Number.isFinite(debut) || !Number.isFinite(fin) || fin < debut) return [];
  return commits.filter((commit) => {
    const date = millisecondes(commit.date);
    return Number.isFinite(date) && date >= debut && date <= fin;
  });
}

/** Le total des commits retenus : lignes et fichiers distincts. */
interface Agregat {
  readonly ajouts: number;
  readonly suppressions: number;
  readonly fichiers: number;
}

/**
 * Agrège les commits retenus.
 *
 * Dès qu'un seul commit contient un fichier binaire, le total des lignes est
 * incomplet : on rend `-1` (« on ne sait pas ») plutôt qu'un nombre faux. Le
 * nombre de fichiers, lui, reste connu : le binaire est un fichier touché.
 */
function agreger(commits: readonly CommitLu[]): Agregat {
  const fichiers = new Set<string>();
  let ajouts = 0;
  let suppressions = 0;
  let inconnues = false;
  for (const commit of commits) {
    for (const fichier of commit.fichiers) fichiers.add(fichier);
    ajouts += commit.ajouts;
    suppressions += commit.suppressions;
    if (commit.lignesInconnues) inconnues = true;
  }
  return {
    ajouts: inconnues ? INCONNU : ajouts,
    suppressions: inconnues ? INCONNU : suppressions,
    fichiers: fichiers.size,
  };
}

/** L'attribution « aucune » : on ne sait pas, donc `-1` partout. */
function aucuneAttribution(): AttributionDiffs {
  return {
    attribution: 'aucune',
    ajouts: INCONNU,
    suppressions: INCONNU,
    fichiersTouches: INCONNU,
    commitsRetenus: 0,
    shas: [],
    ambiguite: false,
  };
}

/**
 * Attribue les diffs d'un historique à une session.
 *
 * La règle tient en une phrase : **un seul commit dans la fenêtre → `'exacte'`,
 * plusieurs → `'fenetre'` (et l'ambiguïté est comptée), aucun → `'aucune'` et
 * `-1`**.
 */
export function attribuerDiffs(
  commits: readonly CommitLu[],
  fenetre: FenetreSession,
): AttributionDiffs {
  const retenus = commitsDansFenetre(commits, fenetre);
  if (retenus.length === 0) return aucuneAttribution();
  const total = agreger(retenus);
  return {
    attribution: retenus.length === 1 ? 'exacte' : 'fenetre',
    ajouts: total.ajouts,
    suppressions: total.suppressions,
    fichiersTouches: total.fichiers,
    commitsRetenus: retenus.length,
    shas: retenus.map((commit) => commit.sha),
    ambiguite: retenus.length > 1,
  };
}
