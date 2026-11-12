/**
 * Écran de couverture : assemble les faits de couverture d'un projet
 * (SPEC §16.6, SPEC §13, DP-19) à partir des magasins et des droits du graphe.
 *
 * `Coverage` porte : l'implication connue (connue/totale), l'état de chaque
 * droit du graphe, la dernière collecte (date + tranche) et le drapeau démo.
 * Aucun calcul métier : les magasins rendent les comptes, le graphe rend les
 * droits (un droit manquant → `missing`, jamais une exception, SPECIAL §19).
 *
 * Règle : fichiers < 500 lignes, fonctions < 50 lignes.
 */
import type {
  Clock,
  CoverageStore,
  GraphCursorStore,
  GraphGateway,
  InvolvementStore,
  SettingsStore,
} from '../ports.js';
import type { Coverage } from '../types-advice.js';
import type { GraphObjectType, GraphPermission } from '../types.js';
import { GRAPH_OBJECT_TYPES } from '../types.js';

/** Dépendances de l'écran de couverture (SPEC §16.6, DP-19). */
export interface CoverageBuildDeps {
  readonly involvement: Pick<InvolvementStore, 'countKnown' | 'countTotal'>;
  readonly cursors: GraphCursorStore;
  readonly settings: SettingsStore;
  readonly graph: GraphGateway;
  readonly clock: Clock;
}

/** La plus récente collecte enregistrée, ou '' avant la première. */
async function lastCollectionAt(cursors: GraphCursorStore, projectId: string): Promise<string> {
  const rows = await cursors.listByProject(projectId);
  let latest = '';
  for (const row of rows) {
    if (row.lastRunAt > latest) latest = row.lastRunAt;
  }
  return latest;
}

/** L'état de chaque droit du graphe, un par type d'objet (SPEC §19). */
async function permissionsOf(graph: GraphGateway, clock: Clock): Promise<GraphPermission[]> {
  const permissions: GraphPermission[] = [];
  for (const objectType of GRAPH_OBJECT_TYPES as readonly GraphObjectType[]) {
    permissions.push({ objectType, state: await graph.permission(objectType), testedAt: clock.now() });
  }
  return permissions;
}

/** Fabrique l'écran de couverture (SPEC §16.6, DP-19). */
export function createCoverageBuilder(deps: CoverageBuildDeps): {
  build(projectId: string): Promise<Coverage>;
  store: CoverageStore | null;
} {
  return {
    store: null,
    build: async (projectId) => {
      const settings = await deps.settings.get(projectId);
      const lastCollection = await lastCollectionAt(deps.cursors, projectId);
      const [knownIssues, totalIssues] = await Promise.all([
        deps.involvement.countKnown(projectId),
        deps.involvement.countTotal(projectId),
      ]);
      return {
        projectId,
        knownIssues,
        totalIssues,
        permissions: await permissionsOf(deps.graph, deps.clock),
        lastCollectionAt: lastCollection,
        lastCollectionOk: lastCollection !== '',
        demo: settings?.demo ?? false,
      };
    },
  };
}