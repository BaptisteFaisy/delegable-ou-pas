/**
 * Télémétrie OpenCode : les sessions réelles d'un agent de code deviennent
 * des faits du domaine (SPEC §5 source 1 « déclaration d'agent », SPEC §6,
 * SPEC §20).
 *
 * Ce module est PUR : ni `fs`, ni `sqlite`, ni réseau. Il transforme le jeu
 * de données versionné (`src/sample/opencode-real.json`, produit par
 * `tools/opencode/harvest.mjs`) en implication, en coût et en durée.
 *
 * Prudence SPEC §20 : ce que la donnée ne dit pas n'est pas mesuré. Une
 * session OpenCode ne dit rien d'une réouverture, ni d'un incident, ni d'une
 * revue : `clean` et `reopened` restent donc `false` — absence de preuve,
 * pas preuve du contraire.
 */
import type { Level, Source } from '../types.js';

/** Modèle réellement utilisé par l'agent (fournisseur + identifiant). */
export interface OpenCodeModel {
  readonly provider: string;
  readonly id: string;
}

/** Une session réelle d'agent, anonymisée et déterministe. */
export interface OpenCodeSession {
  /** Clé publique de la session : un hash stable, jamais l'identifiant brut. */
  readonly id: string;
  /** Nom de projet relatif (`Bureau/projet-x`), jamais un chemin personnel. */
  readonly project: string;
  readonly title: string;
  /** `build`, `general`, `explore`… : l'agent qui a fait le travail. */
  readonly agent: string;
  readonly model: OpenCodeModel;
  readonly costEuros: number;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly additions: number;
  readonly deletions: number;
  readonly filesTouched: number;
  readonly durationMs: number;
  readonly startedAt: string;
  readonly endedAt: string;
  /** Clé de ticket rattachée (`PROJ-123`), `null` quand on n'en connaît pas. */
  readonly issueKey: string | null;
}

/** Le jeu de données tel que versionné dans le dépôt. */
export interface OpenCodeDataset {
  readonly generatedAt: string;
  readonly source: string;
  readonly sessions: readonly OpenCodeSession[];
}

/** Le client qui a produit la déclaration. */
export const OPENCODE_CLIENT = 'opencode';

/** La source la plus sûre du SPEC §5 : une déclaration d'agent. */
export const OPENCODE_SOURCE: Source = 'mcp-declaration';

/** Le seul agent qui travaille sans conducteur humain : `build`. */
export const AGENT_AUTONOME = 'build';

const MS_PAR_HEURE = 3_600_000;

/** Étiquette d'un modèle : `fournisseur/identifiant`, jamais de barre orpheline. */
export function modelLabel(model: OpenCodeModel): string {
  const id = model.id.trim();
  const provider = model.provider.trim();
  if (id !== '' && provider !== '') return `${provider}/${id}`;
  if (id !== '') return id;
  if (provider !== '') return provider;
  return 'modèle inconnu';
}

/**
 * Implication d'une session : une session OpenCode est un agent qui travaille,
 * donc `autonomous` — `driven` quand ce n'est pas l'agent `build`, qui
 * travaille sous conduite (SPEC §5, SPEC §7 règle 4).
 */
export function involvementFromSession(session: OpenCodeSession): {
  readonly level: Level;
  readonly source: Source;
  readonly client: string;
  readonly model: string;
} {
  const level: Level = session.agent === AGENT_AUTONOME ? 'autonomous' : 'driven';
  return {
    level,
    source: OPENCODE_SOURCE,
    client: OPENCODE_CLIENT,
    model: modelLabel(session.model),
  };
}

/**
 * Ce qui est arrivé après : on ne connaît que la durée réelle du travail.
 * `clean` et `reopened` restent `false` — la donnée n'existe pas (SPEC §20).
 */
export function outcomeFromSession(session: OpenCodeSession): {
  readonly leadTimeH: number;
  readonly clean: boolean;
  readonly reopened: boolean;
} {
  return {
    leadTimeH: arrondirHeures(Math.max(0, session.durationMs) / MS_PAR_HEURE),
    clean: false,
    reopened: false,
  };
}

/** Coût réel et volume de jetons d'une session. */
export function costFromSession(session: OpenCodeSession): {
  readonly euros: number;
  readonly tokens: number;
} {
  return { euros: session.costEuros, tokens: session.tokensIn + session.tokensOut };
}

/** Part d'un modèle dans le jeu de données. */
export interface OpenCodeModelShare {
  readonly model: string;
  readonly sessions: number;
  readonly cost: number;
}

/** Le résumé réel du jeu de données. */
export interface OpenCodeSummary {
  readonly sessions: number;
  readonly totalCost: number;
  readonly totalTokens: number;
  readonly totalDurationH: number;
  readonly byModel: readonly OpenCodeModelShare[];
  readonly withTicket: number;
}

/**
 * Agrège les sessions : nombre, coût total, jetons, durée totale, répartition
 * par modèle et sessions rattachées à un ticket.
 */
export function summarise(sessions: readonly OpenCodeSession[]): OpenCodeSummary {
  const parModele = new Map<string, { sessions: number; cost: number }>();
  let totalCost = 0;
  let totalTokens = 0;
  let totalDurationMs = 0;
  let withTicket = 0;
  for (const session of sessions) {
    const cout = costFromSession(session);
    totalCost += cout.euros;
    totalTokens += cout.tokens;
    totalDurationMs += Math.max(0, session.durationMs);
    if (session.issueKey !== null && session.issueKey !== '') withTicket += 1;
    const modele = modelLabel(session.model);
    const part = parModele.get(modele) ?? { sessions: 0, cost: 0 };
    part.sessions += 1;
    part.cost += cout.euros;
    parModele.set(modele, part);
  }
  const byModel = [...parModele.entries()]
    .map(([model, part]) => ({ model, sessions: part.sessions, cost: arrondirEuros(part.cost) }))
    .sort((a, b) => b.sessions - a.sessions || (a.model < b.model ? -1 : 1));
  return {
    sessions: sessions.length,
    totalCost: arrondirEuros(totalCost),
    totalTokens,
    totalDurationH: arrondirHeures(totalDurationMs / MS_PAR_HEURE),
    byModel,
    withTicket,
  };
}

/** Arrondi au microeuro : le coût affiché est un coût, pas un flottant nu. */
function arrondirEuros(valeur: number): number {
  return Math.round(valeur * 1e6) / 1e6;
}

/** Arrondi à la minute : une durée de session s'exprime en heures (SPEC §6). */
function arrondirHeures(valeur: number): number {
  return Math.round(valeur * 100) / 100;
}

/* ------------------------------------------------------------- lecture JSON */

function objetOuNull(valeur: unknown): Record<string, unknown> | null {
  return typeof valeur === 'object' && valeur !== null ? (valeur as Record<string, unknown>) : null;
}

function texte(valeur: unknown): string {
  return typeof valeur === 'string' ? valeur : '';
}

function nombre(valeur: unknown): number {
  const brut = Number(valeur);
  return Number.isFinite(brut) ? brut : 0;
}

/** Une session lue depuis le JSON, `null` si l'enregistrement est inexploitable. */
function lireSession(valeur: unknown): OpenCodeSession | null {
  const objet = objetOuNull(valeur);
  if (!objet) return null;
  const modele = objetOuNull(objet['model']) ?? {};
  const cle = texte(objet['issueKey']);
  return {
    id: texte(objet['id']),
    project: texte(objet['project']),
    title: texte(objet['title']),
    agent: texte(objet['agent']),
    model: { provider: texte(modele['provider']), id: texte(modele['id']) },
    costEuros: nombre(objet['costEuros']),
    tokensIn: nombre(objet['tokensIn']),
    tokensOut: nombre(objet['tokensOut']),
    additions: nombre(objet['additions']),
    deletions: nombre(objet['deletions']),
    filesTouched: nombre(objet['filesTouched']),
    durationMs: nombre(objet['durationMs']),
    startedAt: texte(objet['startedAt']),
    endedAt: texte(objet['endedAt']),
    issueKey: cle === '' ? null : cle,
  };
}

/**
 * Lit le jeu de données versionné sans faire confiance à sa forme : une
 * session illisible est ignorée, pas fatale. Une donnée absente reste
 * absente (SPEC §20).
 */
export function parseDataset(brut: unknown): OpenCodeDataset {
  const objet = objetOuNull(brut);
  if (!objet) throw new Error('jeu de données OpenCode illisible : objet attendu');
  const sessionsBrutes = objet['sessions'];
  const sessions = Array.isArray(sessionsBrutes)
    ? sessionsBrutes.map(lireSession).filter((session): session is OpenCodeSession => session !== null)
    : [];
  return {
    generatedAt: texte(objet['generatedAt']),
    source: texte(objet['source']),
    sessions,
  };
}
