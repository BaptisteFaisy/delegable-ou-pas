/**
 * La session unifiée : la forme que prend une session d'agent, quel que soit
 * le client qui l'a exécutée (OpenCode, Claude Code, Codex…).
 *
 * Le contrat est dans `docs/CONTRACTS-REALITE.md`. Ce module en est la
 * version de code : un seul vocabulaire pour toute la donnée réelle, et la
 * règle qui compte — **absent = `-1`, jamais `0`**. Zéro veut dire « mesuré,
 * valait zéro » ; `-1` veut dire « on ne sait pas », et c'est une conclusion
 * qu'on peut afficher.
 *
 * Module pur : il transforme des objets en objets, sans toucher au disque.
 */
import type { OpenCodeSession } from './opencode.js';

/** Le client qui a réellement exécuté la session. */
export type Client = 'opencode' | 'claude-code' | 'codex' | 'copilot' | 'inconnu';

/** Le modèle réellement utilisé, avec son fournisseur. */
export interface Modele {
  readonly provider: string;
  readonly id: string;
}

/** D'où viennent les lignes ajoutées / supprimées / fichiers touchés. */
export type Attribution = 'exacte' | 'fenetre' | 'aucune';

/** Une session réelle, quelle qu soit sa source. */
export interface SessionReelle {
  readonly id: string;
  readonly client: Client;
  readonly projet: string;
  readonly titre: string;
  readonly agent: string;
  readonly modele: Modele;
  readonly coutEuros: number;
  readonly jetonsEntree: number;
  readonly jetonsSortie: number;
  readonly ajouts: number;
  readonly suppressions: number;
  readonly fichiersTouches: number;
  readonly dureeMs: number;
  readonly debut: string;
  readonly fin: string;
  readonly cleTicket: string | null;
  readonly attribution: Attribution;
}

/** La valeur d'une donnée absente : jamais confondue avec un zéro mesuré. */
export const INCONNU = -1;

/** Une session du bac à sable : la forme de `tools/lab/real-runs.json`. */
export interface SessionLab {
  readonly id: string;
  readonly project: string;
  readonly title: string;
  readonly agent: string;
  readonly model: { readonly provider: string; readonly id: string };
  readonly costEuros: number;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly additions: number;
  readonly deletions: number;
  readonly filesTouched: number;
  readonly durationMs: number;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly issueKey: string | null;
  readonly ticket?: string;
  readonly sha?: string;
}

/** Convertit une session OpenCode récoltée en session unifiée. */
export function depuisOpenCode(session: OpenCodeSession): SessionReelle {
  return {
    id: session.id,
    client: 'opencode',
    projet: session.project,
    titre: session.title,
    agent: session.agent,
    modele: { provider: session.model.provider, id: session.model.id },
    coutEuros: session.costEuros,
    jetonsEntree: session.tokensIn,
    jetonsSortie: session.tokensOut,
    // la base du poste ne porte pas les diffs : la donnée est inconnue
    ajouts: session.additions > 0 ? session.additions : INCONNU,
    suppressions: session.deletions > 0 ? session.deletions : INCONNU,
    fichiersTouches: session.filesTouched > 0 ? session.filesTouched : INCONNU,
    dureeMs: session.durationMs,
    debut: session.startedAt,
    fin: session.endedAt,
    cleTicket: session.issueKey,
    attribution: 'aucune',
  };
}

/** Convertit une session du bac à sable (ses diffs sont réels). */
export function depuisLab(session: SessionLab): SessionReelle {
  return {
    id: session.id,
    client: 'opencode',
    projet: session.project,
    titre: session.title,
    agent: session.agent,
    modele: { provider: session.model.provider, id: session.model.id },
    coutEuros: session.costEuros,
    jetonsEntree: session.tokensIn,
    jetonsSortie: session.tokensOut,
    ajouts: session.additions,
    suppressions: session.deletions,
    fichiersTouches: session.filesTouched,
    dureeMs: session.durationMs,
    debut: session.startedAt,
    fin: session.endedAt,
    cleTicket: session.issueKey ?? session.ticket ?? null,
    attribution: session.sha ? 'exacte' : 'aucune',
  };
}

/** Les jetons d'une session, entrée et sortie. */
export function jetons(session: SessionReelle): number {
  return session.jetonsEntree + session.jetonsSortie;
}

/** Le nombre de tickets distincts visés par une liste de sessions. */
export function ticketsDistincts(sessions: readonly SessionReelle[]): string[] {
  return [...new Set(sessions.map((session) => session.cleTicket).filter((cle): cle is string => cle !== null))]
    .sort();
}
