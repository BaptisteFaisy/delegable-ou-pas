/**
 * Public site — loader, language switch and dispatch.
 *
 * The page shows every feature of the product. It contains no business logic:
 * `demo-data.json` is produced by the real domain code (tests/site), and the
 * panels are rendered by `rendu-ecrans.js` (the eight screens) and
 * `rendu-panneaux.js` (the sixteen feature panels). Both expose a `mount`
 * function on `window`; when they are absent — or when the JSON has not been
 * generated yet — this file falls back to the panel's own `label` and `summary`,
 * so the page never shows a hole.
 *
 * Rule: files < 500 lines, functions < 50 lines. No dependency, no CDN.
 */
'use strict';

/** Current language; the switch writes it back to <html lang>. */
let LANG = 'fr';

/** The generated dataset, or null until/unless it loads. */
let DATA = null;

/** Picks the localised form of a value: a string, or { en, fr }. */
function t(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  return value[LANG] || value.en || value.fr || '';
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function clear(node) {
  while (node && node.firstChild) node.removeChild(node.firstChild);
}

/* ------------------------------------------------------------------ datasets */

/** Loads the generated dataset; a missing file is a normal state, not a crash. */
async function loadDemoData() {
  try {
    const response = await fetch('demo-data.json', { cache: 'no-store' });
    if (!response.ok) return null;
    const json = await response.json();
    return json && typeof json === 'object' ? json : null;
  } catch (error) {
    return null;
  }
}

/** One panel's data, looked up in `ecrans` then `features`, or null. */
function panelData(section, key) {
  if (!DATA) return null;
  const screens = DATA.ecrans || {};
  const features = DATA.features || {};
  return screens[key] || features[key] || null;
}

/* -------------------------------------------------------------------- format */

/** “83 %” — never printed alone: always with its sample size and interval. */
function pct(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  return `${Math.round(value * 100)} %`;
}

/** The only authorised rendering of a proportion (SPEC §7 rule 3). */
function rateWithEvidence(stat) {
  if (!stat || typeof stat.n !== 'number') return '—';
  const tickets = LANG === 'fr' ? 'tickets' : 'tickets';
  const between = LANG === 'fr' ? 'entre' : 'between';
  const and = LANG === 'fr' ? 'et' : 'and';
  return `${pct(stat.rate)} (${stat.n} ${tickets}, ${between} ${pct(stat.ciLow)} ${and} ${pct(stat.ciHigh)})`;
}

/* ------------------------------------------------------------------ the nav */

/** Builds the sticky table of contents from the panels present in the page. */
function buildNav() {
  const nav = document.getElementById('demo-nav');
  if (!nav) return;
  clear(nav);
  const groups = [
    { id: 'ecrans', label: { fr: 'Écrans', en: 'Screens' } },
    { id: 'fonctionnalites', label: { fr: 'Fonctionnalités', en: 'Features' } },
  ];
  groups.forEach((group) => {
    const container = document.getElementById(group.id);
    if (!container) return;
    const block = el('div', 'nav-group');
    block.appendChild(el('span', 'nav-title', t(group.label)));
    const list = el('div', 'nav-links');
    container.querySelectorAll('section.panel').forEach((panel) => {
      const heading = panel.querySelector('h3');
      if (!heading) return;
      const link = el('a', null, heading.textContent);
      link.href = `#${panel.id}`;
      list.appendChild(link);
    });
    block.appendChild(list);
    nav.appendChild(block);
  });
}

/* --------------------------------------------------------------- the panels */

/** Fallback: the panel's own label and summary, so nothing is ever blank. */
function renderFallback(panel, data) {
  const body = panel.querySelector('.panel-body');
  if (!body) return;
  clear(body);
  body.appendChild(el('p', 'demo-flag-inline',
    LANG === 'fr' ? 'données d’exemple' : 'sample data'));
  if (!data) {
    body.appendChild(el('p', 'pending',
      LANG === 'fr'
        ? 'Données en cours de génération — lance `MAJ_DEMO=1 npx vitest run tests/site`.'
        : 'Data being generated — run `MAJ_DEMO=1 npx vitest run tests/site`.'));
    return;
  }
  if (data.label) body.appendChild(el('p', 'panel-label', t(data.label)));
  if (data.summary) body.appendChild(el('p', 'panel-summary', t(data.summary)));
  body.appendChild(el('p', 'pending',
    LANG === 'fr'
      ? 'Le rendu détaillé de ce panneau arrive avec le lot des rendus.'
      : 'The detailed rendering of this panel arrives with the renderer lot.'));
}

/** Maps a panel id to its key in the dataset. */
function keyForPanel(id) {
  const screens = {
    'ecran-carte-ticket': 'carteTicket',
    'ecran-carte-delegation': 'carteDelegation',
    'ecran-cohorte': 'cohorte',
    'ecran-sprint': 'sprint',
    'ecran-reglages': 'reglages',
    'ecran-couverture': 'couverture',
    'ecran-calibration': 'calibration',
    'ecran-gadget': 'gadget',
  };
  const features = {
    'feat-implication': 'implication',
    'feat-mentions': 'mentions',
    'feat-ecart-etabli': 'ecartEtabli',
    'feat-survie': 'survie',
    'feat-multiplicite': 'multiplicite',
    'feat-appariement': 'appariement',
    'feat-puissance': 'puissance',
    'feat-sequentiel': 'sequentiel',
    'feat-essai': 'essai',
    'feat-naive': 'naive',
    'feat-calibration-fine': 'calibrationFine',
    'feat-conditions': 'conditions',
    'feat-priorite': 'priorite',
    'feat-jira-seul': 'jiraSeul',
    'feat-epoques': 'epoques',
    'feat-anonymat': 'anonymat',
  };
  return screens[id] || features[id] || null;
}

/** Every panel gets content: the dedicated renderer, or the fallback. */
function renderPanels() {
  const helpers = { t, el, clear, pct, rateWithEvidence, lang: () => LANG };
  const screens = window.DEMO_ECRANS;
  const panels = window.DEMO_PANNEAUX;
  document.querySelectorAll('section.panel').forEach((panel) => {
    const key = keyForPanel(panel.id);
    if (!key) return;
    const data = panelData(null, key);
    const renderer = panel.id.startsWith('ecran-') ? screens : panels;
    let done = false;
    if (renderer && typeof renderer.mountOne === 'function') {
      try {
        done = renderer.mountOne(panel, key, data, helpers) !== false;
      } catch (error) {
        done = false;
      }
    }
    if (!done) renderFallback(panel, data);
  });
  if (screens && typeof screens.mount === 'function' && DATA) {
    try { screens.mount(DATA, helpers); } catch (error) { /* le repli suffit */ }
  }
  if (panels && typeof panels.mount === 'function' && DATA) {
    try { panels.mount(DATA, helpers); } catch (error) { /* le repli suffit */ }
  }
}

/* ------------------------------------------------------- static sections */

/** The eight honesty rules, from the frozen sample module. */
function renderRules() {
  const root = document.getElementById('regles');
  const source = window.DONNEES;
  if (!root || !source) return;
  clear(root);
  source.HONESTY_RULES.forEach((rule) => {
    const item = el('li');
    item.setAttribute('data-fr', rule.fr);
    item.setAttribute('data-en', rule.en);
    item.textContent = t(rule);
    root.appendChild(item);
  });
}

/** The nine MCP tools: the generated call examples win, the sample module backs up. */
function renderTools() {
  const root = document.getElementById('outils-mcp');
  if (!root) return;
  clear(root);
  const tools = (DATA && DATA.mcp && DATA.mcp.tools) || (window.DONNEES && window.DONNEES.MCP_TOOLS) || [];
  const table = el('table', 'tools');
  const head = el('tr');
  ['clé / key', 'verbe / verb', 'entrées / inputs', 'retour / output'].forEach((label) => head.appendChild(el('th', null, label)));
  table.appendChild(head);
  tools.forEach((tool) => table.appendChild(toolRow(tool)));
  root.appendChild(table);
}

function toolRow(tool) {
  const row = el('tr');
  row.appendChild(el('td', null, tool.key));
  row.appendChild(el('td', `verb verb-${String(tool.verb).toLowerCase()}`, tool.verb));
  row.appendChild(el('td', null, tool.input || tool.inputs || ''));
  row.appendChild(el('td', null, t(tool.output)));
  return row;
}

/** A real MCP call, rendered as the orchestrator would receive it. */
function renderSampleCalls() {
  const panel = document.getElementById('mcp-appels');
  if (!panel) return;
  const body = panel.querySelector('.panel-body');
  clear(body);
  const calls = (DATA && DATA.mcp && DATA.mcp.sampleCalls) || [];
  if (!calls.length) {
    body.appendChild(el('p', 'pending',
      LANG === 'fr' ? 'Aucun appel d’exemple généré pour l’instant.' : 'No sample call generated yet.'));
    return;
  }
  calls.forEach((call) => {
    const block = el('div', 'call');
    block.appendChild(el('p', 'call-name', `${call.tool}(${JSON.stringify(call.input || {})})`));
    const pre = el('pre', 'call-output');
    pre.textContent = JSON.stringify(call.output, null, 2);
    block.appendChild(pre);
    body.appendChild(block);
  });
}

/** The three reference games, computed with the same Wilson function. */
function renderGames() {
  const root = document.getElementById('jeux-de-chiffres');
  const source = window.DONNEES;
  if (!root || !source) return;
  clear(root);
  const list = el('ul', 'games');
  source.REFERENCE_GAMES.forEach((game) => {
    const stat = source.wilson(game.successes, game.n);
    const item = el('li');
    item.append(`${t(game.label)} : `);
    item.appendChild(el('code', null, `${game.successes}/${game.n}`));
    item.append(` → ${rateWithEvidence(stat)}`);
    list.appendChild(item);
  });
  root.appendChild(list);
}

/** The Wilson calculator: same formula as the app, recomputed in the browser. */
function computeWilson() {
  const source = window.DONNEES;
  const output = document.getElementById('wilson-sortie');
  if (!source || !output) return;
  const successes = Number(document.getElementById('wilson-succes').value);
  const total = Number(document.getElementById('wilson-total').value);
  if (!Number.isFinite(successes) || !Number.isFinite(total) || total <= 0) {
    output.textContent = LANG === 'fr' ? 'effectif invalide' : 'invalid sample size';
    return;
  }
  if (successes < 0 || successes > total) {
    output.textContent = LANG === 'fr' ? 'succès hors bornes' : 'successes out of bounds';
    return;
  }
  const stat = source.wilson(successes, total);
  const threshold = LANG === 'fr' ? ' — sous le seuil : pas assez de recul' : ' — below the threshold: not enough history';
  output.textContent = rateWithEvidence(stat) + (stat.n < 20 ? threshold : '');
}

/** Provenance of the figures, in the footer: which commit, when, how many tickets. */
function renderMeta() {
  const node = document.getElementById('pied-meta');
  if (!node) return;
  clear(node);
  if (!DATA || !DATA.meta) {
    node.textContent = LANG === 'fr'
      ? 'Jeu d’exemple non généré sur cette publication.'
      : 'Sample dataset not generated in this publication.';
    return;
  }
  const meta = DATA.meta;
  node.textContent = (LANG === 'fr'
    ? `Jeu d’exemple · ${meta.tickets || '?'} tickets · généré le ${(meta.generatedAt || '').slice(0, 10)} · commit ${meta.commit || '?'} · démonstration : ${meta.demo ? 'oui' : 'non'}`
    : `Sample dataset · ${meta.tickets || '?'} tickets · generated ${(meta.generatedAt || '').slice(0, 10)} · commit ${meta.commit || '?'} · demo: ${meta.demo ? 'yes' : 'no'}`);
}

/* ----------------------------------------------------------------- language */

/** Swaps every [data-fr]/[data-en] text, then re-renders everything dynamic. */
function applyLanguage() {
  document.documentElement.lang = LANG;
  document.querySelectorAll('[data-fr][data-en]').forEach((node) => {
    node.textContent = node.getAttribute(LANG === 'fr' ? 'data-fr' : 'data-en');
  });
  document.querySelectorAll('[data-fr-ph][data-en-ph]').forEach((node) => {
    node.setAttribute('placeholder', node.getAttribute(LANG === 'fr' ? 'data-fr-ph' : 'data-en-ph'));
  });
  renderAll();
}

function renderAll() {
  buildNav();
  renderRules();
  renderGames();
  renderTools();
  renderSampleCalls();
  renderPanels();
  renderMeta();
  computeWilson();
}

function bindUi() {
  const button = document.getElementById('bascule-langue');
  if (button) {
    button.addEventListener('click', () => {
      LANG = LANG === 'fr' ? 'en' : 'fr';
      button.textContent = LANG === 'fr' ? 'EN' : 'FR';
      applyLanguage();
    });
  }
  const form = document.getElementById('calculette');
  if (form) {
    form.addEventListener('input', computeWilson);
    form.addEventListener('submit', (event) => event.preventDefault());
  }
}

async function boot() {
  bindUi();
  DATA = await loadDemoData();
  applyLanguage();
}

document.addEventListener('DOMContentLoaded', boot);
