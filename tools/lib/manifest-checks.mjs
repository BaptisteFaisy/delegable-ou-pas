/**
 * Contrôles structurels du manifest — utilisés par tools/check-manifest.mjs.
 *
 * Ces contrôles complètent la validation JSON Schema : ils portent sur le
 * contrat métier du dépôt (les neuf outils MCP du SPEC §15, les références de
 * fonctions, l'existence des handlers, l'unicité des clés, les scopes).
 *
 * Règle : fichiers < 500 lignes, fonctions < 50 lignes.
 */
import fs from 'node:fs';
import path from 'node:path';

/** Les neuf outils MCP du §15, dans l'ordre du cahier : [clé, verbe]. */
export const EXPECTED_ACTIONS = [
  ['should-delegate', 'GET'],
  ['list-delegable-work', 'GET'],
  ['get-delegation-evidence', 'GET'],
  ['get-delegation-map', 'GET'],
  ['get-cohort', 'GET'],
  ['get-calibration', 'GET'],
  ['record-involvement', 'CREATE'],
  ['record-decision', 'CREATE'],
  ['report-takeover', 'UPDATE'],
];

const ALLOWED_INPUT_TYPES = new Set(['string', 'integer', 'number', 'boolean']);
const MODULE_KEY_RE = /^[a-zA-Z0-9_-]+$/;
const SCOPE_RE = /^[a-z][a-z0-9-]*:[a-z0-9.-]+(:[a-z0-9.-]+)?$/;
const HANDLER_RE = /^[a-zA-Z0-9][a-zA-Z0-9/_-]*\.[a-zA-Z0-9_$]+$/;
const INTERVALS = ['fiveMinute', 'hour', 'day', 'week'];

/* ------------------------------------------------------------------ rapport */

export function createReport() {
  const problems = [];
  const warnings = [];
  return {
    problems,
    warnings,
    fail(scope, message) {
      problems.push(`${scope} : ${message}`);
    },
    warn(scope, message) {
      warnings.push(`${scope} : ${message}`);
    },
  };
}

export function expect(condition, scope, message, report) {
  if (!condition) report.fail(scope, message);
  return Boolean(condition);
}

/* ------------------------------------------------------------------ outils */

export function moduleEntries(modules) {
  const entries = [];
  for (const [type, list] of Object.entries(modules ?? {})) {
    for (const entry of Array.isArray(list) ? list : []) entries.push({ type, entry });
  }
  return entries;
}

function functionKeys(modules) {
  const list = modules?.function ?? [];
  return new Set((Array.isArray(list) ? list : []).map((entry) => entry?.key));
}

/** Toutes les références à une fonction Forge contenues dans les modules. */
function referencedFunctions(modules) {
  const references = [];
  for (const { type, entry } of moduleEntries(modules)) {
    const scope = `modules.${type}.${entry?.key ?? '?'}`;
    if (typeof entry?.function === 'string') references.push({ scope, key: entry.function });
    for (const nested of ['resolver', 'config', 'edit', 'contextualConfiguration']) {
      const holder = entry?.[nested];
      const fn = holder?.function ?? holder?.resolver?.function;
      if (typeof fn === 'string') references.push({ scope: `${scope}.${nested}`, key: fn });
    }
  }
  return references;
}

/** Fichiers de souche annoncés par le contrat (docs/CONTRACTS.md §3). */
export function announcedStubs(repoRoot) {
  const contractsPath = path.join(repoRoot, 'docs/CONTRACTS.md');
  const stubs = new Set();
  if (!fs.existsSync(contractsPath)) return stubs;
  const text = fs.readFileSync(contractsPath, 'utf8');
  for (const match of text.matchAll(/src\/handlers\/[a-z0-9-]+\.tsx?/g)) stubs.add(match[0]);
  return stubs;
}

/* ------------------------------------------------------------------ app */

export function checkApp(manifest, report) {
  const app = manifest.app ?? {};
  if (!expect(typeof app.id === 'string', 'app.id', 'un identifiant ARI est obligatoire', report)) {
    return;
  }
  expect(
    /^ari:cloud:ecosystem::app\/\S+$/.test(app.id),
    'app.id',
    `doit ressembler à ari:cloud:ecosystem::app/<uuid> (trouvé « ${app.id} »)`,
    report,
  );
  if (app.id.includes('00000000-0000-0000-0000-000000000000')) {
    report.warn('app.id', 'identifiant provisoire : à remplacer par celui de `forge create`');
  }
  expect(
    typeof app.name === 'string' && app.name.trim().length > 0,
    'app.name',
    'obligatoire (1 à 50 caractères)',
    report,
  );
  const runtime = app.runtime ?? {};
  expect(runtime.name === 'nodejs22.x', 'app.runtime.name', 'doit valoir nodejs22.x', report);
  expect(runtime.architecture === 'x86_64', 'app.runtime.architecture', 'doit valoir x86_64', report);
  expect(runtime.memoryMB === 512, 'app.runtime.memoryMB', 'doit valoir 512', report);
  const compatibility = app.compatibility ?? {};
  expect(
    compatibility.jira?.required === true,
    'app.compatibility.jira.required',
    'doit valoir true (Jira est requis)',
    report,
  );
  expect(
    compatibility.confluence?.required === false,
    'app.compatibility.confluence.required',
    'doit valoir false (Confluence est optionnel)',
    report,
  );
}

/* --------------------------------------------------------------- modules */

export function checkModuleKeys(modules, report) {
  const seen = new Map();
  for (const { type, entry } of moduleEntries(modules)) {
    const key = entry?.key;
    if (!expect(typeof key === 'string' && key !== '', `modules.${type}`, 'clé de module obligatoire', report)) {
      continue;
    }
    expect(MODULE_KEY_RE.test(key), `modules.${type}.${key}`, 'clé invalide (^[a-zA-Z0-9_-]+$)', report);
    if (seen.has(key)) {
      report.fail(`modules.${type}.${key}`, `clé déjà utilisée par ${seen.get(key)}`);
    } else {
      seen.set(key, `modules.${type}`);
    }
  }
}

export function checkFunctionReferences(modules, report) {
  const known = functionKeys(modules);
  for (const { scope, key } of referencedFunctions(modules)) {
    expect(known.has(key), scope, `fonction « ${key} » absente de modules.function`, report);
  }
}

export function checkHandlers(modules, repoRoot, report) {
  const stubs = announcedStubs(repoRoot);
  const list = modules?.function ?? [];
  for (const entry of Array.isArray(list) ? list : []) {
    checkOneHandler(entry, repoRoot, stubs, report);
  }
}

function checkOneHandler(entry, repoRoot, stubs, report) {
  const scope = `modules.function.${entry?.key ?? '?'}`;
  const handler = entry?.handler;
  if (!expect(typeof handler === 'string' && handler !== '', scope, 'handler obligatoire', report)) return;
  if (!expect(HANDLER_RE.test(handler), scope, `handler invalide (« ${handler} »), attendu module.fonction`, report)) {
    return;
  }
  const [modulePath, exportName] = handler.split('.');
  const candidates = ['ts', 'tsx', 'js', 'jsx'].map((ext) => path.join(repoRoot, 'src', `${modulePath}.${ext}`));
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (found) {
    const source = fs.readFileSync(found, 'utf8');
    if (!new RegExp(`export[^\\n]*\\b${exportName}\\b`).test(source)) {
      report.warn(scope, `« ${exportName} » ne semble pas être exporté par ${path.relative(repoRoot, found)}`);
    }
    return;
  }
  const announced = `src/${modulePath}.ts`;
  if (stubs.has(announced)) {
    report.warn(scope, `handler ${announced} annoncé dans docs/CONTRACTS.md mais absent du dépôt (souche)`);
  } else {
    report.fail(scope, `handler introuvable : ${announced} n'existe pas et n'est pas annoncé`);
  }
}

/* --------------------------------------------------------------- actions */

export function checkActions(modules, report) {
  const list = Array.isArray(modules?.action) ? modules.action : [];
  const byKey = new Map(list.map((entry) => [entry?.key, entry]));
  for (const [key, verb] of EXPECTED_ACTIONS) {
    const entry = byKey.get(key);
    if (!expect(entry, 'modules.action', `action « ${key} » manquante (§15)`, report)) continue;
    expect(
      entry.actionVerb === verb,
      `modules.action.${key}`,
      `actionVerb doit valoir ${verb} (§15), trouvé « ${entry.actionVerb ?? 'absent'} »`,
      report,
    );
    expect(typeof entry.name === 'string' && entry.name !== '', `modules.action.${key}`, 'name obligatoire', report);
    expect(
      typeof entry.description === 'string' && entry.description !== '',
      `modules.action.${key}`,
      'description obligatoire (elle guide le LLM)',
      report,
    );
    expect(typeof entry.function === 'string', `modules.action.${key}`, 'function obligatoire', report);
    checkActionInputs(key, entry, report);
  }
  for (const entry of list) {
    if (entry?.key && !EXPECTED_ACTIONS.some(([key]) => key === entry.key)) {
      report.fail(`modules.action.${entry.key}`, 'action hors de la liste des neuf outils MCP du §15');
    }
  }
}

function checkActionInputs(key, entry, report) {
  const scope = `modules.action.${key}.inputs`;
  const inputs = entry?.inputs;
  if (!expect(inputs && typeof inputs === 'object', scope, 'inputs obligatoires', report)) return;
  for (const [name, input] of Object.entries(inputs)) {
    const inputScope = `${scope}.${name}`;
    expect(typeof input?.title === 'string' && input.title !== '', inputScope, 'title obligatoire', report);
    expect(
      ALLOWED_INPUT_TYPES.has(input?.type),
      inputScope,
      `type « ${input?.type} » non autorisé (§19 : string, integer, number, boolean)`,
      report,
    );
    expect(typeof input?.required === 'boolean', inputScope, 'required obligatoire (booléen)', report);
    expect(
      typeof input?.description === 'string' && input.description !== '',
      inputScope,
      'description obligatoire',
      report,
    );
  }
}

/* ------------------------------------------------------------------ Rovo */

export function checkRovo(modules, report) {
  const actionKeys = new Set((modules?.action ?? []).map((entry) => entry?.key));
  const mcpList = Array.isArray(modules?.['rovo:mcp']) ? modules['rovo:mcp'] : [];
  if (!expect(mcpList.length === 1, 'modules.rovo:mcp', 'un seul module rovo:mcp par app', report)) return;
  const mcp = mcpList[0];
  expect(
    typeof mcp?.name === 'string' && mcp.name.length <= 30,
    'modules.rovo:mcp',
    'name obligatoire (30 caractères max)',
    report,
  );
  const tools = Array.isArray(mcp?.tools) ? mcp.tools : [];
  for (const tool of tools) {
    expect(actionKeys.has(tool), 'modules.rovo:mcp.tools', `outil « ${tool} » sans action déclarée`, report);
  }
  for (const [key] of EXPECTED_ACTIONS) {
    expect(tools.includes(key), 'modules.rovo:mcp.tools', `outil « ${key} » absent (§15)`, report);
  }
  const agents = Array.isArray(modules?.['rovo:agent']) ? modules['rovo:agent'] : [];
  for (const agent of agents) {
    const scope = `modules.rovo:agent.${agent?.key ?? '?'}`;
    expect(typeof agent?.name === 'string' && agent.name.length <= 30, scope, 'name obligatoire (30 caractères max)', report);
    expect(typeof agent?.prompt === 'string' && agent.prompt !== '', scope, 'prompt obligatoire', report);
    for (const action of agent?.actions ?? []) {
      expect(actionKeys.has(action), `${scope}.actions`, `action « ${action} » non déclarée`, report);
    }
  }
}

/* ------------------------------------------------------------ ressources */

export function checkResources(modules, manifest, repoRoot, report) {
  const resources = Array.isArray(manifest?.resources) ? manifest.resources : [];
  const keys = new Set();
  for (const resource of resources) {
    const scope = `resources.${resource?.key ?? '?'}`;
    if (!expect(typeof resource?.key === 'string' && resource.key !== '', scope, 'clé obligatoire', report)) continue;
    expect(MODULE_KEY_RE.test(resource.key), scope, 'clé invalide (^[a-zA-Z0-9_-]+$)', report);
    expect(resource.key.length <= 23, scope, 'clé trop longue (23 caractères max)', report);
    expect(typeof resource?.path === 'string' && resource.path !== '', scope, 'path obligatoire', report);
    expect(!keys.has(resource.key), scope, 'clé de ressource déjà utilisée', report);
    keys.add(resource.key);
    if (!fs.existsSync(path.join(repoRoot, resource.path))) {
      report.warn(scope, `chemin ${resource.path} absent du dépôt (fichier d'un autre lot)`);
    }
  }
  checkResourceReferences(modules, keys, report);
}

function checkResourceReferences(modules, keys, report) {
  for (const { type, entry } of moduleEntries(modules)) {
    const scope = `modules.${type}.${entry?.key ?? '?'}`;
    const resource = entry?.resource;
    if (typeof resource === 'string') {
      expect(keys.has(resource), scope, `ressource « ${resource} » absente de la section resources`, report);
    }
    const icon = entry?.icon;
    if (typeof icon === 'string' && icon.startsWith('resource:')) {
      const referenced = icon.slice('resource:'.length).split(';')[0];
      expect(keys.has(referenced), scope, `icône « ${icon} » : ressource « ${referenced} » inconnue`, report);
    }
  }
}

/* ------------------------------------------------------------- permissions */

export function checkPermissions(manifest, report) {
  const scopes = manifest?.permissions?.scopes;
  if (!expect(Array.isArray(scopes) && scopes.length > 0, 'permissions.scopes', 'liste de scopes obligatoire', report)) {
    return;
  }
  const seen = new Set();
  for (const scope of scopes) {
    expect(typeof scope === 'string', 'permissions.scopes', 'chaque scope est une chaîne', report);
    expect(SCOPE_RE.test(scope), 'permissions.scopes', `scope « ${scope} » mal formé`, report);
    expect(!seen.has(scope), 'permissions.scopes', `scope « ${scope} » en double`, report);
    seen.add(scope);
  }
}

/* ------------------------------------------- formes propres à chaque module */

export function checkModuleShapes(modules, report) {
  checkUiAndValidatorShapes(modules, report);
  checkEventShapes(modules, report);
  checkStorageShapes(modules, report);
}

function checkUiAndValidatorShapes(modules, report) {
  const list = (type) => (Array.isArray(modules?.[type]) ? modules[type] : []);
  for (const entry of list('jira:workflowValidator')) {
    const scope = `modules.jira:workflowValidator.${entry?.key ?? '?'}`;
    expect(typeof entry?.name === 'string' && entry.name !== '', scope, 'name obligatoire', report);
    expect(typeof entry?.description === 'string' && entry.description !== '', scope, 'description obligatoire', report);
    expect(typeof entry?.function === 'string', scope, 'function obligatoire', report);
  }
  for (const type of ['jira:issuePanel', 'jira:projectPage', 'jira:projectSettingsPage']) {
    for (const entry of list(type)) {
      const scope = `modules.${type}.${entry?.key ?? '?'}`;
      expect(typeof entry?.title === 'string' && entry.title !== '', scope, 'title obligatoire', report);
      expect(typeof entry?.resource === 'string', scope, 'resource obligatoire', report);
      expect(typeof entry?.resolver?.function === 'string', scope, 'resolver.function obligatoire', report);
      if (entry?.render !== 'native') report.warn(scope, 'render: native absent (UI Kit 2)');
    }
  }
  for (const entry of list('jira:customField')) {
    const scope = `modules.jira:customField.${entry?.key ?? '?'}`;
    expect(typeof entry?.name === 'string' && entry.name !== '', scope, 'name obligatoire', report);
    expect(typeof entry?.type === 'string' && entry.type !== '', scope, 'type obligatoire', report);
    // « Recommandation » est écrite par l'app seule (lecture seule attendue) ;
    // « Implication d'agent » est remplie à la clôture (§5, DP-23) : elle ne
    // peut donc pas être en lecture seule. Avertissement, pas échec.
    if (entry?.readOnly !== true) report.warn(scope, 'champ non déclaré en lecture seule (attendu pour « Recommandation »)');
  }
}

function checkEventShapes(modules, report) {
  const list = (type) => (Array.isArray(modules?.[type]) ? modules[type] : []);
  for (const entry of list('webtrigger')) {
    const scope = `modules.webtrigger.${entry?.key ?? '?'}`;
    expect(typeof entry?.function === 'string', scope, 'function obligatoire', report);
    expect(entry?.response?.type === 'dynamic', scope, 'response.type doit valoir dynamic', report);
  }
  for (const entry of list('consumer')) {
    const scope = `modules.consumer.${entry?.key ?? '?'}`;
    expect(typeof entry?.queue === 'string' && entry.queue !== '', scope, 'queue obligatoire', report);
    expect(typeof entry?.function === 'string', scope, 'function obligatoire', report);
  }
  for (const entry of list('trigger')) {
    const scope = `modules.trigger.${entry?.key ?? '?'}`;
    expect(typeof entry?.function === 'string', scope, 'function obligatoire', report);
    expect(Array.isArray(entry?.events) && entry.events.length > 0, scope, 'events obligatoires', report);
  }
  for (const entry of list('scheduledTrigger')) {
    const scope = `modules.scheduledTrigger.${entry?.key ?? '?'}`;
    expect(typeof entry?.function === 'string', scope, 'function obligatoire', report);
    expect(INTERVALS.includes(entry?.interval), scope, 'intervalle invalide', report);
  }
}

function checkStorageShapes(modules, report) {
  const list = (type) => (Array.isArray(modules?.[type]) ? modules[type] : []);
  for (const entry of list('sql')) {
    const scope = `modules.sql.${entry?.key ?? '?'}`;
    expect(entry?.engine === 'mysql', scope, 'engine doit valoir mysql', report);
  }
  for (const entry of list('llm')) {
    const scope = `modules.llm.${entry?.key ?? '?'}`;
    expect(Array.isArray(entry?.model) && entry.model.length > 0, scope, 'model obligatoire (tableau)', report);
  }
}
