/**
 * Source brute de la récolte OpenCode : la base SQLite locale, quel que soit
 * son schéma. OpenCode 2.x a coexistence deux générations de tables :
 *
 *   - schéma actuel : `session_v2` (les sessions) + `session_message` (chaque
 *     message porte `{ "text": "…" }` pour un tour utilisateur, ou
 *     `{ "content": [ { "type": "text" | "reasoning" | "tool", "text": "…" } ] }`
 *     pour un tour assistant) ;
 *   - schéma hérité : `session` + `part` (une partie de message, de forme
 *     `{ "type": "text", "text": "…" }`).
 *
 * Ce module ne juge pas : il lit ce qui existe, préfère le schéma actuel et
 * retombe sur l'ancien. La base n'est jamais écrite (`mode=ro` + `readOnly`).
 *
 * Il répare aussi un trou du schéma actuel : certaines lignes de `session_v2`
 * n'ont ni `agent` ni `model`, alors que le tour assistant qui les a produites
 * les porte. On rétablit ces deux champs depuis le premier message assistant
 * qui les déclare — c'est de la donnée réelle, pas une invention.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Colonnes de session lues, identiques entre `session` et `session_v2`. */
const COLONNES =
  'id, directory, title, agent, model, cost, tokens_input, tokens_output, ' +
  'summary_additions, summary_deletions, summary_files, time_created, time_updated';

/** Taille des lots de paramètres : SQLite refuse les requêtes à l'infini. */
const TAILLE_LOT = 400;

/** Ouvre la base en lecture seule : elle n'est jamais écrite. */
async function ouvrirBase(chemin) {
  const { DatabaseSync } = await import('node:sqlite');
  return new DatabaseSync(`${pathToFileURL(chemin).href}?mode=ro`, { readOnly: true });
}

/** Vrai quand la table existe dans ce schéma. */
function tableExiste(db, nom) {
  return db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).get(nom) !== undefined;
}

/** Nom de la table des sessions : la génération actuelle en priorité. */
function tableSessions(db) {
  return tableExiste(db, 'session_v2') ? 'session_v2' : 'session';
}

/** Nom de la table des messages : la génération actuelle en priorité. */
function tableMessages(db) {
  return tableExiste(db, 'session_message') ? 'session_message' : 'part';
}

/** Les textes qu'un message porte, dans les trois formes connues. */
function textesDeMessage(data) {
  let objet;
  try {
    objet = JSON.parse(String(data));
  } catch {
    return [];
  }
  if (!objet || typeof objet !== 'object') return [];
  const textes = [];
  if (typeof objet.text === 'string') textes.push(objet.text);
  if (Array.isArray(objet.content)) {
    for (const partie of objet.content) {
      if (partie && typeof partie === 'object' && typeof partie.text === 'string') textes.push(partie.text);
    }
  }
  return textes;
}

/** Les textes d'un message qui portent une clé de ticket. */
function textesAvecTicket(data) {
  return textesDeMessage(data).filter((texte) => /\bPROJ-\d+\b/.test(texte));
}

/** Textes porteurs de ticket par session, lus dans la table des messages. */
function lireTextes(db, tableMess, ids) {
  const parSession = new Map();
  for (let debut = 0; debut < ids.length; debut += TAILLE_LOT) {
    const lot = ids.slice(debut, debut + TAILLE_LOT);
    const trous = lot.map(() => '?').join(',');
    const lignes = db
      .prepare(`SELECT session_id, data FROM ${tableMess} WHERE data LIKE ? AND session_id IN (${trous})`)
      .all('%PROJ-%', ...lot);
    for (const ligne of lignes) {
      const textes = textesAvecTicket(ligne.data);
      if (textes.length === 0) continue;
      const liste = parSession.get(ligne.session_id) ?? [];
      liste.push(...textes);
      parSession.set(ligne.session_id, liste);
    }
  }
  return parSession;
}

/** L'agent et le modèle qu'un tour assistant déclare, quand il les porte. */
function agentModeleDuMessage(data) {
  let objet;
  try {
    objet = JSON.parse(String(data));
  } catch {
    return null;
  }
  if (!objet || typeof objet !== 'object') return null;
  const agent = typeof objet.agent === 'string' ? objet.agent : '';
  const modele = objet.model && typeof objet.model === 'object' && objet.model.id ? objet.model : null;
  if (agent === '' && modele === null) return null;
  return {
    agent,
    model: modele === null ? '' : JSON.stringify({ id: modele.id, providerID: modele.providerID ?? modele.provider ?? '' }),
  };
}

/**
 * Rétablit `agent` et `model` depuis le tour assistant qui les porte, quand la
 * ligne de session ne les a pas. Ne touche qu'aux lignes lacunaires : toute
 * valeur déjà présente est conservée telle quelle.
 */
function completerAgentModele(db, tableMess, lignes) {
  if (tableMess !== 'session_message') return;
  const lacunaires = lignes.filter((ligne) => !ligne.agent || !ligne.model);
  if (lacunaires.length === 0) return;
  const ids = lacunaires.map((ligne) => String(ligne.id));
  const parSession = new Map();
  for (let debut = 0; debut < ids.length; debut += TAILLE_LOT) {
    const lot = ids.slice(debut, debut + TAILLE_LOT);
    const trous = lot.map(() => '?').join(',');
    const messages = db
      .prepare(`SELECT session_id, data FROM ${tableMess} WHERE type = 'assistant' AND session_id IN (${trous}) ORDER BY session_id, seq`)
      .all(...lot);
    for (const message of messages) {
      if (parSession.has(message.session_id)) continue;
      const trouve = agentModeleDuMessage(message.data);
      if (trouve !== null) parSession.set(message.session_id, trouve);
    }
  }
  for (const ligne of lacunaires) {
    const complete = parSession.get(String(ligne.id));
    if (!complete) continue;
    if (!ligne.agent && complete.agent) ligne.agent = complete.agent;
    if (!ligne.model && complete.model) ligne.model = complete.model;
  }
}

/**
 * Lit les sessions brutes de la base, avec leurs textes de message porteurs de
 * ticket, dans le schéma détecté (actuel, sinon hérité).
 */
export async function lireSessions(cheminBase) {
  const db = await ouvrirBase(cheminBase);
  try {
    const tableSess = tableSessions(db);
    const tableMess = tableMessages(db);
    const lignes = db.prepare(`SELECT ${COLONNES} FROM ${tableSess}`).all();
    completerAgentModele(db, tableMess, lignes);
    const textes = lireTextes(db, tableMess, lignes.map((ligne) => String(ligne.id)));
    return lignes.map((ligne) => ({ ...ligne, texts: textes.get(String(ligne.id)) ?? [] }));
  } finally {
    db.close();
  }
}

/** Sessions brutes depuis un fichier JSON (jeu de test, inspection). */
export function lireJson(chemin) {
  const brut = readFileSync(chemin, 'utf8');
  const sessions = JSON.parse(brut);
  const liste = Array.isArray(sessions) ? sessions : sessions.sessions;
  if (!Array.isArray(liste)) throw new Error('JSON de sessions invalide : tableau attendu');
  return liste;
}
