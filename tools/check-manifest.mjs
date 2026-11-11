#!/usr/bin/env node
/**
 * Garde du manifest Forge — « Délégable ou pas ? » (SPEC §15, §16, §17, §19).
 *
 * Usage : node tools/check-manifest.mjs [chemin/vers/manifest.yml]
 * Sortie : code 0 si le manifest est conforme, 1 sinon (messages précis).
 *
 * Contrôles faits :
 *   1. le manifest contre le schéma @forge/manifest (repli : contrôles maison) ;
 *   2. les 9 outils MCP du §15 : présence, verbe, entrées
 *      (string/integer/number/boolean) ;
 *   3. chaque `function:` référencée existe dans `modules.function`, et chaque
 *      handler existe dans le projet (ou est une souche annoncée dans
 *      docs/CONTRACTS.md) ;
 *   4. unicité des clés de module, des ressources, des scopes ;
 *   5. `rovo:mcp` ne liste que des actions déclarées.
 *
 * Racine du projet : les chemins du manifest (handlers `src/…`, ressources
 * `static/…`, contrat `docs/CONTRACTS.md`) sont résolus depuis le DOSSIER QUI
 * CONTIENT le manifest. Pour `manifest.yml` à la racine du dépôt, c'est le
 * dépôt ; pour une fixture de test (`tests/tools/fixtures/manifest.yml`), c'est
 * le dossier de la fixture — les tests n'ont donc pas à dépendre d'un manifest
 * de dépôt qui n'existe pas encore.
 *
 * Écart de version assumé : le schéma local (@forge/manifest 1.5.x) précède la
 * CLI Forge 14.2 — il ne connaît ni `app.compatibility` ni
 * `app.runtime.{name,architecture,memoryMB}`. Ces deux blocs sont retirés
 * avant la validation JSON Schema, puis vérifiés à la main (checkApp).
 *
 * Règle : fichiers < 500 lignes, fonctions < 50 lignes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { parseMiniYaml } from './lib/mini-yaml.mjs';
import {
  checkActions,
  checkApp,
  checkFunctionReferences,
  checkHandlers,
  checkModuleKeys,
  checkModuleShapes,
  checkPermissions,
  checkResources,
  checkRovo,
  createReport,
} from './lib/manifest-checks.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const repoRequire = createRequire(path.join(REPO_ROOT, 'package.json'));

/** Schéma officiel : le dépôt d'abord, l'app sœur en repli. */
const SCHEMA_PATHS = [
  path.join(REPO_ROOT, 'node_modules/@forge/manifest/out/schema/manifest-schema.json'),
  path.join(process.env.HOME ?? '/root', 'Bureau/preuve-a-l-appui/node_modules/@forge/manifest/out/schema/manifest-schema.json'),
];

/* --------------------------------------------------------- chargement YAML */

/**
 * Charge le YAML : paquet `yaml`, sinon `js-yaml`, sinon le parseur maison
 * (tools/lib/mini-yaml.mjs, limites documentées dans son en-tête).
 * FORCE_MINI_YAML=1 force le repli — utilisé par les tests.
 */
function loadYaml(text) {
  if (process.env.FORCE_MINI_YAML !== '1') {
    const fromPackage = loadYamlWithPackage(text);
    if (fromPackage) return fromPackage;
  }
  return { data: parseMiniYaml(text), parser: 'mini' };
}

function loadYamlWithPackage(text) {
  for (const name of ['yaml', 'js-yaml']) {
    let mod;
    try {
      mod = repoRequire(name);
    } catch (error) {
      if (error && error.code === 'MODULE_NOT_FOUND') continue;
      throw error;
    }
    const data = name === 'yaml' ? mod.parse(text) : mod.load(text);
    return { data, parser: name };
  }
  return null;
}

/* ------------------------------------------------------------- schéma JSON */

function resolveSchemaPath() {
  for (const candidate of SCHEMA_PATHS) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Le schéma local ne connaît pas `app.compatibility` ni
 * `app.runtime.{name,architecture,memoryMB}` (versions antérieures à la CLI
 * Forge 14.2) : on les retire pour la validation, puis on les vérifie à la main.
 */
function sanitizeForSchema(manifest) {
  const copy = structuredClone(manifest);
  const app = copy.app ?? {};
  delete app.compatibility;
  if (app.runtime && typeof app.runtime === 'object') {
    const runtime = { ...app.runtime };
    delete runtime.name;
    delete runtime.architecture;
    delete runtime.memoryMB;
    app.runtime = runtime;
  }
  copy.app = app;
  return copy;
}

function validateAgainstSchema(manifest, schemaPath) {
  let Ajv;
  try {
    Ajv = repoRequire('ajv');
  } catch (error) {
    if (error && error.code === 'MODULE_NOT_FOUND') {
      return { available: false, ok: false, errors: [] };
    }
    throw error;
  }
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  // `logger: false` : le schéma Forge mélange `$ref` et mots-clés voisins,
  // ce qui fait bavarder Ajv sans conséquence sur la validation.
  const ajv = new Ajv({ allErrors: true, logger: false });
  const validate = ajv.compile(schema);
  const ok = validate(sanitizeForSchema(manifest));
  const errors = (validate.errors ?? []).map((error) => `${error.dataPath || '(racine)'} : ${error.message}`);
  return { available: true, ok, errors };
}

/* ------------------------------------------------------------------- main */

function runStructuralChecks(manifest, projectRoot, report) {
  const modules = manifest.modules ?? {};
  checkApp(manifest, report);
  checkModuleKeys(modules, report);
  checkModuleShapes(modules, report);
  checkFunctionReferences(modules, report);
  checkHandlers(modules, projectRoot, report);
  checkActions(modules, report);
  checkRovo(modules, report);
  checkResources(modules, manifest, projectRoot, report);
  checkPermissions(manifest, report);
}

function runSchemaCheck(manifest, report) {
  const schemaPath = resolveSchemaPath();
  if (!schemaPath) {
    report.warn('schéma', 'schéma @forge/manifest introuvable : contrôles structurels seuls');
    return 'absent';
  }
  const result = validateAgainstSchema(manifest, schemaPath);
  if (!result.available) {
    report.warn('schéma', 'ajv absent du dépôt : contrôles structurels seuls');
    return 'ajv absent';
  }
  if (!result.ok) {
    for (const error of result.errors.slice(0, 20)) report.fail('schéma', error);
    return 'non conforme';
  }
  return 'conforme';
}

function readManifest(argv) {
  const manifestPath = path.resolve(argv[2] ?? path.join(REPO_ROOT, 'manifest.yml'));
  if (!fs.existsSync(manifestPath)) {
    console.error(`KO — manifest introuvable : ${manifestPath}`);
    process.exit(1);
  }
  const text = fs.readFileSync(manifestPath, 'utf8');
  try {
    const loaded = loadYaml(text);
    return { manifestPath, manifest: loaded.data ?? {}, parser: loaded.parser };
  } catch (error) {
    console.error(`KO — YAML illisible : ${error.message}`);
    process.exit(1);
  }
}

function main() {
  const { manifestPath, manifest, parser } = readManifest(process.argv);
  const projectRoot = path.dirname(manifestPath);
  const report = createReport();
  const schemaState = runSchemaCheck(manifest, report);
  runStructuralChecks(manifest, projectRoot, report);

  if (report.problems.length > 0) {
    const shown = path.relative(REPO_ROOT, manifestPath) || manifestPath;
    console.error(`KO — ${report.problems.length} problème(s) dans ${shown} :`);
    for (const problem of report.problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  const modules = manifest.modules ?? {};
  const actionCount = (modules.action ?? []).length;
  const toolCount = (modules['rovo:mcp'] ?? []).flatMap((entry) => entry?.tools ?? []).length;
  const functionCount = (modules.function ?? []).length;
  console.log(
    `OK — manifest conforme (schéma ${schemaState}, ${actionCount} actions, ${toolCount} outils MCP, ${functionCount} fonctions, parseur YAML ${parser}).`,
  );
  for (const warning of report.warnings) console.log(`  ! ${warning}`);
}

main();
