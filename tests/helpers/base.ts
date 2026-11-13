/**
 * The single entry point to the reference database — SPEC §13, §24; DP-20.
 *
 * One module, one base: the tests read the tickets, the cohorts, the cards,
 * the trial and the store of the demo dataset through this file, and never
 * rebuild a game by hand. Everything here is recomposed from `src/sample/` and
 * `src/db/` — no duplicated figure, no network, no clock.
 *
 * The named selectors (`verte`, `orange`, `rouge`, `grise`, `desequilibree`,
 * `masquee`) pick a cohort by the property it demonstrates, in the words of the
 * base (`SCENARIOS`/`CAS_LIMITES`), so the names are stable and meaningful.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { Deps } from '../../src/deps.js';
import type { Stores } from '../../src/db/stores.js';
import type { Recommendation, RecommendationCard } from '../../src/types-advice.js';
import type { McpResult, McpToolKey } from '../../src/types-mcp.js';
import { runTool } from '../../src/actions/registry.js';
import { cardForIssue } from '../../src/handlers/recompute.js';
import {
  base,
  baseFacts,
  casLimite,
  censures,
  cohorte,
  cohorteParAvis,
  cohortes,
  essai,
  epoques,
  inconnus,
  ticketDe,
} from './base-facts.js';
import type { CohorteVue } from './base-facts.js';
import { baseDeps, baseDepsFrais, baseStore, baseStoreFrais } from './base-store.js';

export type { Base, CasVue, CohorteVue, EssaiVue, Ticket } from './base-facts.js';
export type { Store } from './base-store.js';
export { BASE_ID, BASE_PROJECT_KEY } from './base-store.js';

export {
  base,
  baseFacts,
  baseStore,
  baseStoreFrais,
  baseDeps,
  baseDepsFrais,
  casLimite,
  censures,
  cohorte,
  cohorteParAvis,
  cohortes,
  essai,
  epoques,
  inconnus,
  ticketDe,
};

/** The cohort of the base that advises « À confier à un agent » (SPEC §8). */
export function verte(): Readonly<CohorteVue> {
  return cohorteParAvis('delegate');
}

/** The cohort of the base that advises « Agent, relecture renforcée ». */
export function orange(): Readonly<CohorteVue> {
  return cohorteParAvis('delegate-with-review');
}

/** The cohort of the base that advises « À garder pour un humain ». */
export function rouge(): Readonly<CohorteVue> {
  return cohorteParAvis('keep-human');
}

/** The cohort of the base the app cannot conclude on for lack of effectives. */
export function grise(): Readonly<CohorteVue> {
  return cohortes().find((view) =>
    view.recommandation === 'not-enough-data' && view.balance.balanced
      && view.agent.length > 0 && view.human.length > 0) ?? cohorteParAvis('not-enough-data');
}

/** A cohort of the base whose two arms are too different to compare (DP-10). */
export function desequilibree(): Readonly<CohorteVue> {
  const found = cohortes().find((view) =>
    view.balance.balanced === false && view.agent.length > 0 && view.human.length > 0);
  if (found === undefined) throw new Error('base: no unbalanced cohort');
  return found;
}

/** A cohort of the base carried by fewer than three people (SPEC §7 rule 8). */
export function masquee(): Readonly<CohorteVue> {
  const found = cohortes().find((view) =>
    view.masked && view.agent.length > 0 && view.human.length > 0);
  if (found === undefined) throw new Error('base: no masked cohort');
  return found;
}

/** The card of one ticket of the base, computed by the product (SPEC §8). */
export async function carteDe(issueKey: string): Promise<RecommendationCard | null> {
  const current = base();
  const ticket = current.tickets.find((item) => item.key === issueKey);
  if (ticket === undefined) return null;
  const deps = await baseDeps();
  return cardForIssue(deps, current.settings, ticket.id, baseFacts());
}

/** One of the nine MCP tools of SPEC §15, called on the base. */
export async function outilMcp(cle: McpToolKey, entree: unknown): Promise<McpResult<unknown>> {
  const deps = await baseDeps();
  return runTool(deps, cle, entree);
}

/** The recommendation of the named cohort (SPEC §8 table). */
export function avisDe(view: Readonly<CohorteVue>): Recommendation {
  return view.recommandation;
}

/** The stores of the base, typed (SPEC §18). */
export type BaseStore = Stores;

/** The dependencies of the base, typed (SPEC §17). */
export type BaseDeps = Deps;