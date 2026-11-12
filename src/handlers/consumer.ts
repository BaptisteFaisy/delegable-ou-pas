/**
 * The graph collection consumer — SPEC §17 "Graphe : la session d'un
 * utilisateur", §19; DP-18.
 *
 * The slice worker itself is the frozen L5 collector (`createCollector`): it
 * works one bounded slice, stores the commit and review facts, and moves the
 * resume cursor. This file only wires it to the shared dependency graph —
 * zero duplication. A missing right empties the slice instead of raising
 * (recipe 15), inside the collector.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { Consumer } from '../ports.js';
import type { Deps } from '../deps.js';
import { createCollector } from '../collect/graph.js';

/** Builds the slice consumer on the shared deps (SPEC §17, DP-18). */
export function createGraphConsumer(deps: Deps): Consumer {
  return createCollector({
    graph: deps.graph,
    jira: deps.jira,
    signatures: deps.stores.signature,
    commits: deps.stores.commitFact,
    reviews: deps.stores.reviewFact,
    cursors: deps.stores.graphCursor,
    clock: deps.clock,
  });
}
