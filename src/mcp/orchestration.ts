/**
 * The orchestration kit: which published tool answers which step of an
 * agent's cycle, and the twenty-line client that walks it.
 *
 * The cycle is the one the specification describes (SPEC §9, §15, §27) :
 * ask before taking work, read the conditions, take the work, declare what
 * happened, hand over when needed. Each step names the tool that serves it
 * **today** — no tool is invented here, so the kit never drifts from the
 * registry (SPEC §15).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import { MCP_TOOL_KEYS, MCP_TOOL_VERBS } from '../types-mcp.js';

/** The steps of an agent's cycle, in order. */
export type CycleStep =
  | 'conseil'
  | 'conditions'
  | 'preuve'
  | 'passation'
  | 'essai'
  | 'carte'
  | 'cohorte'
  | 'calibration';

/** One tool, with the cycle step it serves and what it answers. */
export interface OrchestrationTool {
  readonly key: string;
  readonly verb: 'GET' | 'CREATE' | 'UPDATE';
  readonly step: CycleStep;
  readonly purpose: { readonly fr: string; readonly en: string };
}

/**
 * The nine published tools, mapped to the cycle (SPEC §15).
 *
 * The order follows the cycle, not the tool list: an orchestrator reads this
 * array top to bottom.
 */
export const ORCHESTRATION_TOOLS: readonly OrchestrationTool[] = [
  {
    key: 'should-delegate',
    verb: 'GET',
    step: 'conseil',
    purpose: {
      fr: 'Que faire de ce ticket : conseil, relecture renforcée, à garder, ou pas assez de recul.',
      en: 'What to do with this ticket: delegate, hardened review, keep, or not enough history.',
    },
  },
  {
    key: 'list-delegable-work',
    verb: 'GET',
    step: 'conseil',
    purpose: {
      fr: 'Les tickets à confier, du plus sûr au moins sûr.',
      en: 'The tickets to hand over, safest first.',
    },
  },
  {
    key: 'get-delegation-evidence',
    verb: 'GET',
    step: 'preuve',
    purpose: {
      fr: 'La preuve : cohorte, effectifs, fourchettes, tickets de référence.',
      en: 'The evidence: cohort, sample sizes, intervals, reference tickets.',
    },
  },
  {
    key: 'get-cohort',
    verb: 'GET',
    step: 'cohorte',
    purpose: {
      fr: 'Une cohorte en détail, époque par époque.',
      en: 'One cohort in detail, epoch by epoch.',
    },
  },
  {
    key: 'get-delegation-map',
    verb: 'GET',
    step: 'carte',
    purpose: {
      fr: 'La carte de délégation : quelles zones sont vertes, orange, rouges, grises.',
      en: 'The delegation map: which zones are green, orange, red, grey.',
    },
  },
  {
    key: 'get-calibration',
    verb: 'GET',
    step: 'calibration',
    purpose: {
      fr: 'Peut-on croire cette app : la justesse des recommandations passées.',
      en: 'Can you trust this app: the accuracy of past recommendations.',
    },
  },
  {
    key: 'record-involvement',
    verb: 'CREATE',
    step: 'conditions',
    purpose: {
      fr: 'Déclarer son niveau d’implication sur le ticket pris.',
      en: 'Declare your involvement level on the ticket you took.',
    },
  },
  {
    key: 'record-decision',
    verb: 'CREATE',
    step: 'conditions',
    purpose: {
      fr: 'Enregistrer la décision prise, suivie ou non, et sa raison.',
      en: 'Record the decision taken, followed or not, and why.',
    },
  },
  {
    key: 'report-takeover',
    verb: 'UPDATE',
    step: 'passation',
    purpose: {
      fr: 'Passer la main à un humain, avec la raison.',
      en: 'Hand the work over to a human, with the reason.',
    },
  },
];

/** The cycle steps, in the order an agent walks them. */
export const CYCLE_STEPS: readonly CycleStep[] = [
  'conseil',
  'conditions',
  'preuve',
  'carte',
  'cohorte',
  'calibration',
  'passation',
];

/** The tools serving one step of the cycle. */
export function toolsForStep(step: CycleStep): readonly OrchestrationTool[] {
  return ORCHESTRATION_TOOLS.filter((tool) => tool.step === step);
}

/**
 * The kit example: the twenty lines an orchestrator needs to walk the cycle.
 *
 * It is returned as **text** so that it is published as-is (the documentation
 * shows exactly what compiles) and so that a test can check it mentions every
 * tool it claims to use. It uses only published tools and only `fetch`.
 */
export function kitExample(): string {
  return `import { checkCompatibility, type McpEnvelope } from '@tradoooo/delegable-ou-pas/mcp';

// Un seul point d’entrée : l’enveloppe porte la version, la date et
// l’empreinte des données — une réponse se rejoue, un désaccord se tranche.
async function call<T>(tool: string, input: unknown): Promise<McpEnvelope<T>> {
  const response = await fetch(\`https://<votre-serveur>/rest/mcp/tools/\${tool}\`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const envelope = (await response.json()) as McpEnvelope<T>;
  const verdict = checkCompatibility(envelope.schemaVersion);
  if (!verdict.compatible) throw new Error(verdict.message.fr);
  return envelope;
}

// 1. Avant de prendre un ticket : que dit l’app ?
const advice = await call<{ value: string }>('should-delegate', { issueKey: 'PROJ-412' });
if (advice.result?.value === 'keep-human') throw new Error('à garder pour un humain');

// 2. La preuve qui soutient l’avis, et la cohorte qui la produit.
const evidence = await call('get-delegation-evidence', { issueKey: 'PROJ-412' });

// 3. Prendre le travail, puis déclarer son implication.
await call('record-involvement', { issueKey: 'PROJ-412', level: 'driven', client: 'orchestrator' });

// 4. Si un humain doit reprendre la main, le dire — et pourquoi.
if (needsHuman) await call('report-takeover', { issueKey: 'PROJ-412', reason: 'incident ouvert' });`;
}

/** True when every tool of the kit exists among the published tool keys. */
export function kitMatchesRegistry(toolKeys: readonly string[] = MCP_TOOL_KEYS): boolean {
  return ORCHESTRATION_TOOLS.every((tool) => toolKeys.includes(tool.key));
}

/** The verb of each tool of the kit, taken from the published registry. */
export function kitVerbs(): Readonly<Record<string, 'GET' | 'CREATE' | 'UPDATE'>> {
  const verbs: Record<string, 'GET' | 'CREATE' | 'UPDATE'> = {};
  ORCHESTRATION_TOOLS.forEach((tool) => { verbs[tool.key] = tool.verb; });
  return verbs;
}

/** True when the verbs of the kit agree with the published ones. */
export function kitVerbsMatchRegistry(): boolean {
  return ORCHESTRATION_TOOLS.every((tool) => MCP_TOOL_VERBS[tool.key as keyof typeof MCP_TOOL_VERBS] === tool.verb);
}
