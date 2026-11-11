/**
 * Public site renderer — no framework, no build step, no network call.
 *
 * Reads `window.DONNEES` (donnees.js) and fills the demo sections: the ticket
 * card, the delegation map, the cohort detail, the calibration, the coverage
 * screen, the epochs and the nine MCP tools. Also drives the Wilson interval
 * calculator so a visitor can check the published figures by hand, and the
 * FR/EN switch (SPEC §20: interface in English and in French).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
'use strict';

const D = window.DONNEES;

/** Current language; the switch writes it back to <html lang>. */
let LANG = 'fr';

/** Picks the localised form of a value: a string, or { en, fr }. */
function t(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  return value[LANG] || value.en || '';
}

/** “83 %” — a rate is never printed without its sample size next to it. */
function pct(value) {
  return `${Math.round(value * 100)} %`;
}

/** The only authorised rendering of a proportion: rate + n + interval (§7 rule 3). */
function rateWithEvidence(stat) {
  return `${pct(stat.rate)} (${stat.n} ${LANG === 'fr' ? 'tickets' : 'tickets'}, `
    + `${LANG === 'fr' ? 'entre' : 'between'} ${pct(stat.ciLow)} ${LANG === 'fr' ? 'et' : 'and'} ${pct(stat.ciHigh)})`;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/* ------------------------------------------------------------ the ticket card */

const RECOMMENDATION_LABEL = {
  delegate: { en: 'Delegate to an agent', fr: 'À confier à un agent' },
  'review-hardened': { en: 'Agent, hardened review', fr: 'Agent, relecture renforcée' },
  'keep-human': { en: 'Keep with a human', fr: 'À garder pour un humain' },
  'not-enough-data': { en: 'Not enough history', fr: 'Pas assez de recul' },
};

function renderTicketCard() {
  const root = document.getElementById('carte-ticket');
  if (!root) return;
  clear(root);
  const card = TICKET();
  root.appendChild(card);
}

/** Builds the card of SPEC §8: cohort, figures, references, conditions, trust. */
function TICKET() {
  const c = D.TICKET_CARD;
  const box = el('div', 'card ticket-card');
  box.appendChild(el('div', 'demo-flag', LANG === 'fr' ? 'données d’exemple' : 'sample data'));
  box.appendChild(el('h3', 'ticket-key', `${c.key} · ${t(c.title)}`));

  const reco = el('p', `reco reco-${c.recommendation}`);
  reco.append(`${LANG === 'fr' ? 'Recommandation' : 'Recommendation'} : `);
  reco.appendChild(el('strong', null, t(RECOMMENDATION_LABEL[c.recommendation])));
  box.appendChild(reco);

  const cohorte = c.cohort;
  box.appendChild(el('p', 'line',
    `${LANG === 'fr' ? 'Cohorte' : 'Cohort'} : ${t(cohorte.nature)} · ${t(cohorte.zone)} · `
    + `${LANG === 'fr' ? 'taille' : 'size'} ${cohorte.size} `
    + `(${cohorte.armAgent.n} ${LANG === 'fr' ? 'avec agent' : 'with agent'}, `
    + `${cohorte.armHuman.n} ${LANG === 'fr' ? 'sans' : 'without'})`));

  box.appendChild(el('p', 'line',
    `${LANG === 'fr' ? 'Clôture propre' : 'Clean close'} : ${rateWithEvidence(c.cleanClose.agent)} `
    + `${LANG === 'fr' ? 'avec agent' : 'with agent'}, ${rateWithEvidence(c.cleanClose.human)} `
    + `${LANG === 'fr' ? 'sans' : 'without'}`));

  box.appendChild(el('p', 'line',
    `${LANG === 'fr' ? 'Délai médian' : 'Median lead time'} : ${c.medianLead.agentDays} `
    + `${LANG === 'fr' ? 'jour avec agent' : 'day with agent'}, ${c.medianLead.humanDays} `
    + `${LANG === 'fr' ? 'jours sans' : 'days without'}`));

  box.appendChild(el('p', 'line warn',
    `${LANG === 'fr' ? 'Ce qui a mal tourné avec agent' : 'What went wrong with an agent'} : ${t(c.whatWentWrong)}`));

  box.appendChild(el('p', 'line',
    `${LANG === 'fr' ? 'Tickets de référence' : 'Reference tickets'} : ${c.references.join(', ')}`));

  const conditions = el('p', 'line');
  conditions.append(`${LANG === 'fr' ? 'Conditions' : 'Conditions'} : `);
  conditions.append(t(c.conditions).join(LANG === 'fr' ? ' · ' : ' · '));
  box.appendChild(conditions);

  box.appendChild(el('p', 'line',
    `${LANG === 'fr' ? 'Confiance' : 'Confidence'} : ${t(c.confidence)}`));

  box.appendChild(el('p', 'line muted',
    `${LANG === 'fr' ? 'Implication relevée' : 'Detected involvement'} : ${t(c.involvement.level)} `
    + `— ${LANG === 'fr' ? 'source' : 'source'} : ${t(c.involvement.source)}`));
  box.appendChild(el('p', 'line muted',
    `${LANG === 'fr' ? 'Décision enregistrée' : 'Recorded decision'} : ${t(c.decision.text)}`));
  box.appendChild(el('p', 'advice',
    LANG === 'fr'
      ? 'Un avis, pas un ordre : la recommandation ne bloque rien, et la décision prise est enregistrée.'
      : 'An opinion, not an order: the recommendation blocks nothing, and the decision taken is recorded.'));
  return box;
}

/* --------------------------------------------------------- the delegation map */

const COLOUR_LABEL = {
  delegate: { en: 'delegate', fr: 'à confier' },
  'review-hardened': { en: 'hardened review', fr: 'relecture renforcée' },
  'keep-human': { en: 'keep human', fr: 'à garder' },
  unknown: { en: 'we do not know', fr: 'on ne sait pas' },
};

function renderMap() {
  const root = document.getElementById('carte-delegation');
  if (!root) return;
  clear(root);
  const table = el('table', 'matrix');
  const head = el('tr');
  head.appendChild(el('th', null, LANG === 'fr' ? 'nature ↓ / zone →' : 'nature ↓ / zone →'));
  D.MAP_ZONES.forEach((zone) => head.appendChild(el('th', null, t(zone.label))));
  table.appendChild(head);
  D.MAP_NATURES.forEach((nature) => table.appendChild(mapRow(nature)));
  root.appendChild(table);
  root.appendChild(mapLegend());
}

function mapRow(nature) {
  const row = el('tr');
  row.appendChild(el('th', null, t(nature.label)));
  D.MAP_ZONES.forEach((zone) => {
    const cell = D.MAP_CELLS.find((c) => c.nature === nature.id && c.zone === zone.id);
    const td = el('td', cell ? `cell cell-${cell.colour}` : 'cell cell-unknown');
    td.title = cell
      ? `${t(COLOUR_LABEL[cell.colour])} — n = ${cell.n}`
      : t(COLOUR_LABEL.unknown);
    td.textContent = cell ? String(cell.n) : '·';
    row.appendChild(td);
  });
  return row;
}

function mapLegend() {
  const legend = el('p', 'legend');
  Object.keys(COLOUR_LABEL).forEach((colour) => {
    const chip = el('span', `chip chip-${colour}`, t(COLOUR_LABEL[colour]));
    legend.appendChild(chip);
  });
  const note = el('span', 'legend-note',
    LANG === 'fr'
      ? ' Chaque case porte l’effectif des deux bras. Le gris est une réponse, pas un vide.'
      : ' Each cell carries the sample size of both arms. Grey is an answer, not a blank.');
  legend.appendChild(note);
  return legend;
}

/* ---------------------------------------------------------- the cohort detail */

function renderCohort() {
  const root = document.getElementById('cohorte');
  if (!root) return;
  clear(root);
  const c = D.COHORT_DETAIL;
  const box = el('div', 'card');
  box.appendChild(el('h3', null,
    `${t(MAP_NATURES.find((n) => n.id === c.nature).label)} · `
    + `${t(MAP_ZONES.find((z) => z.id === c.zone).label)} · ${LANG === 'fr' ? 'taille' : 'size'} ${c.size}`));
  box.appendChild(el('p', 'muted', `${t(c.epoch)} · ${LANG === 'fr' ? 'conclusion' : 'conclusion'} : ${t(c.conclusionText)}`));

  const table = el('table', 'arms');
  table.appendChild(armRow(LANG === 'fr' ? 'avec agent' : 'with agent', c.arms.agent, c.medianLeadH.agent, c.reviewLoad.agent));
  table.appendChild(armRow(LANG === 'fr' ? 'sans agent' : 'without agent', c.arms.human, c.medianLeadH.human, c.reviewLoad.human));
  box.appendChild(table);

  box.appendChild(el('p', 'line',
    `${LANG === 'fr' ? 'Bras équilibrés' : 'Balanced arms'} : ${c.balance.ok ? '✓' : '✗'} · `
    + `${LANG === 'fr' ? 'personnes distinctes' : 'distinct people'} : ${c.peopleCount} `
    + `(${LANG === 'fr' ? '≥ 3, la cohorte est affichée' : '≥ 3, so the cohort is shown'})`));

  const causes = el('p', 'line');
  causes.append(`${LANG === 'fr' ? 'Ce qui ferait passer la case à l’orange' : 'What would move the cell to orange'} : `);
  causes.append(t(c.causes).join(' · '));
  box.appendChild(causes);
  box.appendChild(el('p', 'line muted',
    `${LANG === 'fr' ? 'Fondement' : 'Evidence'} : ${c.tickets.join(', ')}`));
  root.appendChild(box);
}

function armRow(label, stat, medianH, review) {
  const row = el('tr');
  row.appendChild(el('th', null, label));
  row.appendChild(el('td', null, rateWithEvidence(stat)));
  row.appendChild(el('td', null, `${(medianH / 24).toFixed(1)} ${LANG === 'fr' ? 'j' : 'd'}`));
  row.appendChild(el('td', null, review.toFixed(1)));
  return row;
}

/* -------------------------------------------------------- calibration, epochs */

function renderCalibration() {
  const root = document.getElementById('calibration');
  if (!root) return;
  clear(root);
  const box = el('div', 'card');
  box.appendChild(el('p', D.CALIBRATION_VERDICT.ok ? 'verdict ok' : 'verdict bad', t(D.CALIBRATION_VERDICT.text)));
  const table = el('table', 'calibration');
  const head = el('tr');
  [
    LANG === 'fr' ? 'recommandation donnée' : 'recommendation given',
    LANG === 'fr' ? 'clôture propre constatée' : 'clean close observed',
    LANG === 'fr' ? 'effectif' : 'sample size',
  ].forEach((label) => head.appendChild(el('th', null, label)));
  table.appendChild(head);
  D.CALIBRATION.forEach((row) => table.appendChild(calibrationRow(row)));
  box.appendChild(table);
  root.appendChild(box);
}

function calibrationRow(row) {
  const tr = el('tr');
  tr.appendChild(el('td', null, t(RECOMMENDATION_LABEL[row.recommendation] || { en: row.recommendation, fr: row.recommendation })));
  tr.appendChild(el('td', null, `${row.clean} / 100`));
  tr.appendChild(el('td', null, String(row.n)));
  return tr;
}

function renderEpochs() {
  const root = document.getElementById('epoques');
  if (!root) return;
  clear(root);
  const list = el('ul', 'epochs');
  D.EPOCHS.forEach((epoch) => {
    const item = el('li');
    item.appendChild(el('strong', null, t(epoch.label)));
    item.append(` — ${epoch.from} · ${t(epoch.note)}`);
    list.appendChild(item);
  });
  root.appendChild(list);
}

/* ------------------------------------------------------------ coverage, tools */

function renderCoverage() {
  const root = document.getElementById('couverture');
  if (!root) return;
  clear(root);
  const box = el('div', 'card');
  box.appendChild(el('p', 'line',
    `${LANG === 'fr' ? 'Implication connue' : 'Known involvement'} : ${pct(D.COVERAGE.knownInvolvementShare)} `
    + `· ${LANG === 'fr' ? 'dernière collecte' : 'last collection'} : ${t(D.COVERAGE.lastCollection)}`));
  const list = el('ul', 'permissions');
  D.COVERAGE.permissions.forEach((permission) => {
    const item = el('li', `permission permission-${permission.state}`);
    item.appendChild(el('strong', null, t(permission.object)));
    item.append(` — ${permission.state === 'ok' ? (LANG === 'fr' ? 'droit accordé' : 'granted') : (LANG === 'fr' ? 'droit manquant' : 'missing right')} · ${permission.probe}`);
    list.appendChild(item);
  });
  box.appendChild(list);
  box.appendChild(el('p', 'advice',
    LANG === 'fr'
      ? 'Un droit manquant vide le résultat sans erreur : l’écran de couverture sonde chaque type d’objet sur un ticket connu pour le dire, au lieu d’afficher un zéro silencieux.'
      : 'A missing right empties the result without an error: the coverage screen probes each object type on a known ticket to say so, instead of showing a silent zero.'));
  root.appendChild(box);
}

function renderTools() {
  const root = document.getElementById('outils-mcp');
  if (!root) return;
  clear(root);
  const table = el('table', 'tools');
  const head = el('tr');
  ['clé / key', 'verbe / verb', 'entrées / inputs', 'retour / output'].forEach((label) => head.appendChild(el('th', null, label)));
  table.appendChild(head);
  D.MCP_TOOLS.forEach((tool) => {
    const row = el('tr');
    row.appendChild(el('td', null, tool.key));
    row.appendChild(el('td', `verb verb-${tool.verb.toLowerCase()}`, tool.verb));
    row.appendChild(el('td', null, tool.input));
    row.appendChild(el('td', null, t(tool.output)));
    table.appendChild(row);
  });
  root.appendChild(table);
}

/* --------------------------------------------------------- Wilson calculator */

function renderGames() {
  const root = document.getElementById('jeux-de-chiffres');
  if (!root) return;
  clear(root);
  const list = el('ul', 'games');
  D.REFERENCE_GAMES.forEach((game) => {
    const stat = D.wilson(game.successes, game.n);
    const item = el('li');
    item.append(`${t(game.label)} : `);
    item.appendChild(el('code', null, `${game.successes}/${game.n}`));
    item.append(` → ${rateWithEvidence(stat)}`);
    list.appendChild(item);
  });
  root.appendChild(list);
}

/** Reads the two inputs and prints the interval; used by the calculator form. */
function computeWilson() {
  const successes = Number(document.getElementById('wilson-succes').value);
  const total = Number(document.getElementById('wilson-total').value);
  const out = document.getElementById('wilson-sortie');
  if (!Number.isFinite(successes) || !Number.isFinite(total) || total <= 0) {
    out.textContent = LANG === 'fr' ? 'effectif invalide' : 'invalid sample size';
    return;
  }
  if (successes < 0 || successes > total) {
    out.textContent = LANG === 'fr' ? 'succès hors bornes' : 'successes out of bounds';
    return;
  }
  const stat = D.wilson(successes, total);
  out.textContent = rateWithEvidence(stat)
    + (stat.n < 20 ? (LANG === 'fr' ? ' — sous le seuil : pas assez de recul' : ' — below the threshold: not enough history') : '');
}

/* ------------------------------------------------------------------- language */

/** Swaps every [data-fr]/[data-en] text and re-renders the dynamic parts. */
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
  renderTicketCard();
  renderMap();
  renderCohort();
  renderCalibration();
  renderEpochs();
  renderCoverage();
  renderTools();
  renderGames();
  computeWilson();
}

function bindSwitch() {
  const button = document.getElementById('bascule-langue');
  if (!button) return;
  button.addEventListener('click', () => {
    LANG = LANG === 'fr' ? 'en' : 'fr';
    button.textContent = LANG === 'fr' ? 'EN' : 'FR';
    applyLanguage();
  });
  const form = document.getElementById('calculette');
  if (form) {
    form.addEventListener('input', computeWilson);
    form.addEventListener('submit', (event) => event.preventDefault());
  }
}

document.addEventListener('DOMContentLoaded', () => {
  bindSwitch();
  applyLanguage();
});
