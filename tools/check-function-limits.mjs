#!/usr/bin/env node
/**
 * Garde de taille des fonctions : moins de 50 lignes par fonction.
 *
 * Règle user (24 octobre 2026) : toute fonction fait moins de 50 lignes.
 * Garde portée de `merge-avec-contexte` (tools/check-function-limits.mjs),
 * adaptée à une app Forge TypeScript : racines `src/` et `tests/`, fichiers
 * générés exclus.
 *
 * Deux modes de mesure :
 *  - AST TypeScript (mode nominal) : `typescript` est importé dynamiquement
 *    depuis `node_modules`. S'il est résolvable, le fichier est parsé et
 *    chaque fonction est mesurée ;
 *  - repli heuristique (documenté, approximatif) : sans `typescript`, on
 *    masque commentaires et chaînes, puis on apparie les accolades. Il peut
 *    rater une forme exotique ; il ne se trompe pas sur la taille.
 *
 * Mesure : le nombre de LIGNES DE CODE de la fonction, c'est-à-dire les
 * lignes qui portent au moins un token hors commentaire et hors trivia. Un
 * commentaire ou une chaîne multiligne ne compte donc pas comme du code.
 *
 * Les fonctions passées en argument direct d'un appel (`describe(() => …)`,
 * `liste.map(x => …)`) ne sont pas mesurées : ce sont des blocs de données,
 * pas des fonctions de module.
 *
 * Usage : node tools/check-function-limits.mjs [--limite N] [--racine R]...
 * Codes : 0 = conforme, 1 = dépassement(s), 2 = erreur interne.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const LIMITE_DEFAUT = 50;
const RACINES_DEFAUT = ['src', 'tests'];
const EXTENSIONS = new Set(['.ts', '.tsx']);
const DOSSIERS_IGNORES = new Set([
  'node_modules', 'dist', 'build', 'coverage', '.git', '.next', 'out', '.npm-state', 'generated',
]);
const MOTIFS_GENERES = [
  /\.d\.ts$/, /\.generated\.[tj]sx?$/, /\.gen\.[tj]sx?$/, /\.min\.[tj]sx?$/, /\.pb\.[tj]s$/,
];
const MOTS_RESERVES = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'do', 'else', 'try', 'finally',
  'function', 'new', 'typeof', 'await', 'case', 'with', 'yield', 'await',
]);
const BASE = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Usage affiché sur demande. */
function usage() {
  return [
    'Garde de taille des fonctions (< 50 lignes).',
    'Usage : node tools/check-function-limits.mjs [--limite N] [--racine R]...',
    `  --limite N   limite en lignes (défaut ${LIMITE_DEFAUT})`,
    `  --racine R   racine à scanner, répétable (défaut ${RACINES_DEFAUT.join(', ')})`,
  ].join('\n');
}

/** Analyse les arguments de la ligne de commande. */
function analyserArgs(argv) {
  const options = { limite: LIMITE_DEFAUT, racines: null, aide: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--limite') {
      options.limite = Number(argv[i + 1]);
      i += 1;
    } else if (arg === '--racine') {
      options.racines = options.racines ?? [];
      options.racines.push(argv[i + 1]);
      i += 1;
    } else if (arg === '--aide' || arg === '-h') {
      options.aide = true;
    } else {
      throw new Error(`option inconnue : ${arg}`);
    }
  }
  if (!Number.isInteger(options.limite) || options.limite < 1) {
    throw new Error('--limite doit être un entier positif');
  }
  return options;
}

/** Charge `typescript` si le paquet est résolvable ; sinon `null`. */
async function chargerTypeScript() {
  try {
    const mod = await import('typescript');
    return mod.default ?? mod;
  } catch (err) {
    console.error(`::notice::TypeScript non résolvable (${err.message}) — repli heuristique`);
    return null;
  }
}

/** Vrai si le fichier est un source TypeScript à contrôler. */
function estFichierInteresse(chemin) {
  const nom = chemin.slice(chemin.lastIndexOf(sep) + 1);
  const extension = nom.slice(nom.lastIndexOf('.'));
  if (!EXTENSIONS.has(extension)) return false;
  return !MOTIFS_GENERES.some((motif) => motif.test(nom));
}

/** Liste les fichiers TypeScript d'une racine, en ignorant les générés. */
function listerFichiers(racine) {
  const trouve = [];
  const pile = [racine];
  while (pile.length > 0) {
    const courant = pile.pop();
    let entrees;
    try {
      entrees = readdirSync(courant, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entree of entrees) {
      const chemin = join(courant, entree.name);
      if (entree.isDirectory()) {
        if (!DOSSIERS_IGNORES.has(entree.name)) pile.push(chemin);
      } else if (entree.isFile() && estFichierInteresse(chemin)) {
        trouve.push(chemin);
      }
    }
  }
  return trouve.sort();
}

/** Chemin affichable : relatif au dépôt si possible, sinon absolu. */
function afficherChemin(chemin) {
  const rel = relative(BASE, chemin);
  return rel && !rel.startsWith('..') ? rel : chemin;
}

/** Lignes qui portent au moins un token de code (hors trivia). */
function lignesDeCode(source, ts, variante, arbre) {
  const lignes = new Set();
  const scanner = ts.createScanner(ts.ScriptTarget.ES2022, false, variante, source);
  let kind = scanner.scan();
  while (kind !== ts.SyntaxKind.EndOfFileToken) {
    const trivia = kind >= ts.SyntaxKind.FirstTriviaToken && kind <= ts.SyntaxKind.LastTriviaToken;
    if (!trivia) {
      lignes.add(arbre.getLineAndCharacterOfPosition(scanner.getTokenPos()).line);
    }
    kind = scanner.scan();
  }
  return lignes;
}

/** Vrai si le nœud est une fonction mesurable. */
function estFonction(ts, noeud) {
  return noeud.kind === ts.SyntaxKind.FunctionDeclaration
    || noeud.kind === ts.SyntaxKind.MethodDeclaration
    || noeud.kind === ts.SyntaxKind.FunctionExpression
    || noeud.kind === ts.SyntaxKind.ArrowFunction;
}

/** Une fonction fléchée passée en argument d'appel n'est pas mesurée. */
function estCallback(ts, noeud) {
  const fonction = noeud.kind === ts.SyntaxKind.ArrowFunction
    || noeud.kind === ts.SyntaxKind.FunctionExpression;
  return fonction && noeud.parent?.kind === ts.SyntaxKind.CallExpression;
}

/** Nom lisible d'une fonction, pour le rapport. */
function nommer(ts, noeud) {
  if (noeud.name?.text) return noeud.name.text;
  if (noeud.parent?.kind === ts.SyntaxKind.VariableDeclaration && noeud.parent.name?.text) {
    return noeud.parent.name.text;
  }
  if (noeud.parent?.kind === ts.SyntaxKind.PropertyAssignment) {
    return String(noeud.parent.name?.getText?.() ?? 'propriété');
  }
  return '<anonyme>';
}

/** Mesure les fonctions d'un fichier via l'AST TypeScript. */
function controlerAst(chemin, source, ts, limite) {
  const estTsx = chemin.endsWith('.tsx');
  const variante = estTsx ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard;
  const arbre = ts.createSourceFile(
    chemin, source, ts.ScriptTarget.ES2022, true, estTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const code = lignesDeCode(source, ts, variante, arbre);
  const depassements = [];
  const visite = (noeud) => {
    if (estFonction(ts, noeud) && !estCallback(ts, noeud)) {
      const debut = noeud.getStart(arbre);
      const fin = Math.max(noeud.getEnd() - 1, debut);
      const premiere = arbre.getLineAndCharacterOfPosition(debut).line;
      const derniere = arbre.getLineAndCharacterOfPosition(fin).line;
      let longueur = 0;
      for (let ligne = premiere; ligne <= derniere; ligne += 1) {
        if (code.has(ligne)) longueur += 1;
      }
      if (longueur > limite) {
        depassements.push({ ligne: premiere + 1, nom: nommer(ts, noeud), lignes: longueur });
      }
    }
    ts.forEachChild(noeud, visite);
  };
  visite(arbre);
  return depassements;
}

/** Remplace commentaires et chaînes par des espaces (retours à la ligne gardés). */
function masquer(source) {
  const out = source.split('');
  const n = source.length;
  let i = 0;
  while (i < n) {
    const c = source[i];
    if (c === '/' && source[i + 1] === '/') {
      while (i < n && source[i] !== '\n') { out[i] = ' '; i += 1; }
    } else if (c === '/' && source[i + 1] === '*') {
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] !== '\n') out[i] = ' ';
        i += 1;
      }
      if (i < n) out[i] = ' ';
      if (i + 1 < n) out[i + 1] = ' ';
      i += 2;
    } else if (c === '"' || c === "'" || c === '`') {
      const guillemet = c;
      i += 1;
      while (i < n) {
        if (source[i] === '\\') {
          out[i] = ' ';
          i += 1;
          if (i < n && source[i] !== '\n') out[i] = ' ';
          i += 1;
          continue;
        }
        if (source[i] === guillemet) { out[i] = ' '; i += 1; break; }
        if (source[i] !== '\n') out[i] = ' ';
        i += 1;
      }
    } else {
      i += 1;
    }
  }
  return out.join('');
}

/** Vrai si une ligne masquée ressemble au début d'une fonction. */
function estDebutFonction(ligne) {
  if (/\bfunction\s*\*?\s*[A-Za-z_$][\w$]*\s*\(/.test(ligne)) return true;
  if (/=>\s*\{/.test(ligne)) return true;
  if (/(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*(?::[^=]+)?=\s*(?:async\s+)?(?:function\b|\([^()]*\)\s*=>)/.test(ligne)) {
    return true;
  }
  const methode = /(?:^|[;{}\s])(?:(?:static|public|private|protected|readonly|async|get|set)\s+)*([A-Za-z_$][\w$]*)\s*\([^()]*\)\s*(?::[^;{=]+)?\{/.exec(ligne);
  return Boolean(methode) && !MOTS_RESERVES.has(methode[1]);
}

/** Nom approché d'une fonction, pour le rapport du repli heuristique. */
function nommerHeuristique(ligne) {
  const declaration = /\bfunction\s*\*?\s*([A-Za-z_$][\w$]*)/.exec(ligne);
  if (declaration) return declaration[1];
  const appel = /([A-Za-z_$][\w$]*)\s*\(/.exec(ligne);
  if (appel) return appel[1];
  return '<anonyme>';
}

/** Dernière ligne du bloc `{` ouvert sur la ligne donnée. */
function finDeBloc(lignes, index) {
  let profondeur = 0;
  let ouvert = false;
  for (let i = index; i < lignes.length; i += 1) {
    for (const c of lignes[i]) {
      if (c === '{') { profondeur += 1; ouvert = true; } else if (c === '}') profondeur -= 1;
    }
    if (ouvert && profondeur <= 0) return i;
  }
  return lignes.length - 1;
}

/** Nombre de lignes de code (non vides une fois masquées). */
function compterLignes(lignes, debut, fin) {
  let total = 0;
  for (let i = debut; i <= fin; i += 1) {
    if (lignes[i].trim() !== '') total += 1;
  }
  return total;
}

/** Mesure les fonctions d'un fichier par le repli heuristique. */
function controlerHeuristique(chemin, source, limite) {
  const masque = masquer(source).split('\n');
  const depassements = [];
  for (let index = 0; index < masque.length; index += 1) {
    const ligne = masque[index];
    if (!estDebutFonction(ligne)) continue;
    const fin = finDeBloc(masque, index);
    const longueur = compterLignes(masque, index, fin);
    if (longueur > limite) {
      depassements.push({ ligne: index + 1, nom: nommerHeuristique(ligne), lignes: longueur });
    }
    index = Math.max(index, fin);
  }
  return depassements;
}

/** Point d'entrée : scanne les racines et rapporte les dépassements. */
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
  const ts = await chargerTypeScript();
  const racines = (options.racines ?? RACINES_DEFAUT).map((r) => (isAbsolute(r) ? r : resolve(BASE, r)));
  const depassements = [];
  let total = 0;
  for (const racine of racines) {
    for (const chemin of listerFichiers(racine)) {
      total += 1;
      const source = readFileSync(chemin, 'utf8');
      const trouve = ts
        ? controlerAst(chemin, source, ts, options.limite)
        : controlerHeuristique(chemin, source, options.limite);
      for (const d of trouve) depassements.push({ ...d, fichier: afficherChemin(chemin) });
    }
  }
  for (const d of depassements) {
    console.log(`::error::${d.fichier}:${d.ligne} ${d.nom}() fait ${d.lignes} lignes (> ${options.limite}) — découper`);
  }
  const mode = ts ? 'AST TypeScript' : 'repli heuristique';
  console.log(`${total} fichier(s) contrôlé(s) [${mode}], ${depassements.length} fonction(s) hors limite (${options.limite} lignes)`);
  process.exit(depassements.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`::error::garde de fonctions : ${err.message}`);
  process.exit(2);
});
