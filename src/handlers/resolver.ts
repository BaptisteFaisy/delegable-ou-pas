/**
 * The unique resolver of the screens — SPEC §16, §17; DP-15.
 *
 * The manifest declares ONE resolver function for every UI Kit 2 module
 * (`jira:issuePanel`, `jira:projectPage`, `jira:projectSettingsPage`,
 * `jira:sprintAction`, `jira:dashboardGadget`). This file is the Forge wiring
 * only: it defines the methods the screens call (`src/ui/components/data.tsx`)
 * and routes them to `screens.ts`, where the answers are built. No business
 * logic lives here.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import Resolver from '@forge/resolver';
import type { Deps } from '../deps.js';
import { getDeps } from '../deps.js';
import { SCREEN_METHODS, routeScreen } from './screens.js';

/** One resolver call, as the Forge runtime hands it over. */
interface ResolverRequest {
  readonly payload: unknown;
  readonly context: unknown;
}

/** Builds the resolver bound to one dependency graph (tests inject fakes). */
export function createResolver(deps: Deps): Resolver {
  const resolver = new Resolver();
  for (const method of SCREEN_METHODS) {
    resolver.define(method, async (request: ResolverRequest) =>
      routeScreen(deps, method, request.payload, request.context),
    );
  }
  return resolver;
}

/** One lazy resolver for the Forge runtime: deps are built once, on first call. */
let shared: Resolver | null = null;

async function lazyResolver(): Promise<Resolver> {
  if (shared === null) shared = createResolver(await getDeps());
  return shared;
}

/** Test hook: drops the lazy resolver so the next call rebuilds it. */
export function resetResolver(): void {
  shared = null;
}

/**
 * The manifest entry `handlers/resolver.handler` (docs/CONTRACTS.md §6): the
 * definitions handler of the unique resolver, awaiting the shared assembly.
 */
export async function handler(payload: unknown, backendRuntimePayload?: Record<string, unknown>): Promise<unknown> {
  const resolver = await lazyResolver();
  return resolver.getDefinitions()(payload as Parameters<ReturnType<Resolver['getDefinitions']>>[0], backendRuntimePayload);
}
