/**
 * Sonde de couverture du graphe : distingue « pas de droit » de « pas de
 * données » pour chaque type d'objet (SPEC §17, SPEC §19, DP-19, recette 15).
 *
 * La sonde teste un ticket dont la réponse est connue : si la lecture rend des
 * données, le droit existe ; si elle rend vide alors que le droit est accordé,
 * il n'y a pas de données ; si le droit manque, le graphe le vide (SPEC §19).
 *
 * Ce module orchestre uniquement (`graph`), aucun calcul métier.
 * Règle : fichiers < 500 lignes, fonctions < 50 lignes.
 */
import type { GraphGateway, Clock } from '../ports.js';
import type { GraphObjectType } from '../types.js';

/** Les quatre états affichés à l'écran de couverture (SPEC §17, recette 15). */
export type CoverageProbeState = 'ok' | 'missing-right' | 'no-data' | 'unknown';

/** Le résultat d'une sonde, avec la preuve (ce que le ticket a rendu). */
export interface CoverageProbe {
  objectType: GraphObjectType;
  state: CoverageProbeState;
  /** Le ticket de sonde et ce qu'il a rendu (preuve, SPEC §17). */
  testedAt: string;
  evidence: number;
}

/** Dépendances de la sonde de couverture (SPEC §19, DP-19). */
export interface CoverageProberDeps {
  readonly graph: GraphGateway;
  readonly clock: Clock;
}

/** Le nombre de données lues sur le ticket de sonde, par type d'objet. */
async function evidenceOf(
  graph: GraphGateway,
  objectType: GraphObjectType,
  knownIssueId: string,
): Promise<number> {
  if (objectType === 'user') {
    const firstCommit = (await graph.commitsOfIssue(knownIssueId))[0];
    if (!firstCommit || firstCommit.authorAccountId === '') return 0;
    const answered = await graph.botAccount(firstCommit.authorAccountId);
    return answered ? 1 : 1; // le droit répond, quelle que soit la réponse
  }
  const commits = await graph.commitsOfIssue(knownIssueId);
  if (objectType === 'commit' || objectType === 'issue') return commits.length;
  let total = 0;
  for (const commit of commits) {
    total += (await graph.pullRequestsOfCommit(commit.ref)).length;
  }
  return total;
}

/** Fabrique la sonde de couverture (recette 15). */
export function createCoverageProber(deps: CoverageProberDeps): {
  probe(objectType: GraphObjectType, knownIssueId: string): Promise<CoverageProbe>;
} {
  return {
    probe: async (objectType, knownIssueId) => {
      const permission = await deps.graph.probePermission(objectType, knownIssueId);
      const evidence = await evidenceOf(deps.graph, objectType, knownIssueId);
      const state: CoverageProbeState =
        permission.state === 'missing'
          ? 'missing-right'
          : permission.state === 'unknown'
            ? 'unknown'
            : evidence > 0
              ? 'ok'
              : 'no-data';
      return {
        objectType,
        state,
        testedAt: permission.testedAt,
        evidence,
      };
    },
  };
}