/**
 * Shared renderers for the public site — no dependency, no CDN, no framework.
 *
 * The dataset (`demo-data.json`) is produced by the real domain code, so its
 * exact shape is not known here at design time. These helpers therefore render
 * **any** JSON structure: objects become definition lists, arrays of objects
 * become tables, arrays of scalars become lists, and any `{n, rate, ciLow,
 * ciHigh}` object — wherever it appears — is rendered as a rate **with its
 * sample size and its interval**, because the site obeys the same rule as the
 * product (SPEC §7 rule 3): never a bare rate.
 *
 * Named blocks get a dedicated renderer: the delegation matrix, the survival
 * curve, the reliability curve. Rule: files < 500 lines, functions < 50 lines.
 */
'use strict';

(function () {
  /** Bilingual labels for the keys the domain produces. Unknown keys pass through. */
  const KEY_LABELS = {
    n: { fr: 'effectif', en: 'sample size' }, rate: { fr: 'taux', en: 'rate' },
    ciLow: { fr: 'borne basse', en: 'lower bound' }, ciHigh: { fr: 'borne haute', en: 'upper bound' },
    diff: { fr: 'différence', en: 'difference' }, established: { fr: 'écart établi', en: 'gap established' },
    equivalent: { fr: 'équivalence établie', en: 'equivalence established' },
    margin: { fr: 'marge', en: 'margin' }, conclusion: { fr: 'conclusion', en: 'conclusion' },
    recommendation: { fr: 'recommandation', en: 'recommendation' },
    confidence: { fr: 'confiance', en: 'confidence' }, level: { fr: 'niveau', en: 'level' },
    source: { fr: 'source', en: 'source' }, arm: { fr: 'bras', en: 'arm' },
    agent: { fr: 'avec agent', en: 'with agent' }, human: { fr: 'sans agent', en: 'without agent' },
    medianH: { fr: 'médiane (h)', en: 'median (h)' }, medianDays: { fr: 'médiane (j)', en: 'median (d)' },
    leadTimeH: { fr: 'délai (h)', en: 'lead time (h)' }, censored: { fr: 'censurés', en: 'censored' },
    censoredShare: { fr: 'part censurée', en: 'censored share' }, chi2: { fr: 'χ²', en: 'χ²' },
    pValue: { fr: 'p-valeur', en: 'p-value' }, qValue: { fr: 'q-valeur', en: 'q-value' },
    significant: { fr: 'significatif', en: 'significant' }, tested: { fr: 'testées', en: 'tested' },
    surviving: { fr: 'survivantes', en: 'surviving' }, expectedFalse: { fr: 'faux positifs attendus', en: 'expected false positives' },
    matchedShare: { fr: 'part appariée', en: 'matched share' }, pairs: { fr: 'paires', en: 'pairs' },
    balanced: { fr: 'équilibré', en: 'balanced' }, before: { fr: 'avant', en: 'before' },
    after: { fr: 'après', en: 'after' }, feasible: { fr: 'réalisable', en: 'feasible' },
    nPerArm: { fr: 'effectif par bras', en: 'sample size per arm' },
    detectableEffect: { fr: 'effet détectable', en: 'detectable effect' },
    power: { fr: 'puissance', en: 'power' }, weeksNeeded: { fr: 'semaines nécessaires', en: 'weeks needed' },
    baselineRate: { fr: 'taux de référence', en: 'baseline rate' }, alpha: { fr: 'alpha', en: 'alpha' },
    brier: { fr: 'score de Brier', en: 'Brier score' }, logLoss: { fr: 'log-loss', en: 'log loss' },
    auc: { fr: 'AUC', en: 'AUC' }, informative: { fr: 'avis utiles', en: 'informative' },
    widenUnknown: { fr: 'élargit « pas assez de recul »', en: 'widens “not enough history”' },
    clean: { fr: 'clôture propre', en: 'clean close' }, reopened: { fr: 'réouvert', en: 'reopened' },
    unknownShare: { fr: 'part d’implication inconnue', en: 'share of unknown involvement' },
    greyShare: { fr: 'part de gris', en: 'share of grey' }, budgetMinutes: { fr: 'budget (min)', en: 'budget (min)' },
    threshold: { fr: 'seuil', en: 'threshold' }, peopleCount: { fr: 'personnes distinctes', en: 'distinct people' },
    masked: { fr: 'masquée', en: 'masked' }, reason: { fr: 'raison', en: 'reason' },
    epoch: { fr: 'époque', en: 'epoch' }, fellBack: { fr: 'repli', en: 'fell back' },
    satisfied: { fr: 'satisfaite', en: 'satisfied' }, verifiable: { fr: 'vérifiable', en: 'verifiable' },
    capability: { fr: 'capacité', en: 'capability' }, granted: { fr: 'accordé', en: 'granted' },
    object: { fr: 'objet', en: 'object' }, state: { fr: 'état', en: 'state' },
    tickets: { fr: 'tickets', en: 'tickets' }, issueId: { fr: 'ticket', en: 'ticket' },
    cohortKey: { fr: 'cohorte', en: 'cohort' }, policyVersion: { fr: 'version de politique', en: 'policy version' },
    predictedProbability: { fr: 'probabilité prédite', en: 'predicted probability' },
    observed: { fr: 'observé', en: 'observed' }, bin: { fr: 'bin', en: 'bin' },
    zBoundary: { fr: 'frontière z', en: 'z boundary' }, informationFraction: { fr: 'fraction d’information', en: 'information fraction' },
    alphaSpent: { fr: 'alpha dépensé', en: 'alpha spent' }, stop: { fr: 'arrêt', en: 'stop' },
    key: { fr: 'case', en: 'cell' }, colour: { fr: 'couleur', en: 'colour' }, color: { fr: 'couleur', en: 'color' },
    nature: { fr: 'nature', en: 'nature' }, zone: { fr: 'zone', en: 'zone' }, size: { fr: 'taille', en: 'size' },
    references: { fr: 'tickets de référence', en: 'reference tickets' },
    conditions: { fr: 'conditions', en: 'conditions' }, causes: { fr: 'causes d’échec', en: 'failure causes' },
    label: { fr: 'libellé', en: 'label' }, summary: { fr: 'résumé', en: 'summary' },
    value: { fr: 'valeur', en: 'value' }, detail: { fr: 'détail', en: 'detail' },
    explanation: { fr: 'explication', en: 'explanation' }, paradox: { fr: 'paradoxe de Simpson', en: 'Simpson’s paradox' },
    contradicts: { fr: 'contredit ses parties', en: 'contradicts its parts' },
    compliant: { fr: 'tirage respecté', en: 'draw respected' }, seed: { fr: 'graine', en: 'seed' },
  };

  const RECO_LABEL = {
    delegate: { fr: 'à confier à un agent', en: 'delegate to an agent' },
    'review-hardened': { fr: 'agent, relecture renforcée', en: 'agent, hardened review' },
    'keep-human': { fr: 'à garder pour un humain', en: 'keep with a human' },
    'not-enough-data': { fr: 'pas assez de recul', en: 'not enough history' },
  };

  const CONCLUSION_LABEL = {
    better: { fr: 'mieux avec agent', en: 'better with agent' },
    same: { fr: 'pareil', en: 'same' },
    worse: { fr: 'moins bien avec agent', en: 'worse with agent' },
    'not-enough-data': { fr: 'on ne sait pas', en: 'we do not know' },
  };

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  /** True for the only shape that must never be printed as a bare number. */
  function isProportion(value) {
    return isPlainObject(value) && typeof value.n === 'number'
      && typeof value.rate === 'number' && typeof value.ciLow === 'number'
      && typeof value.ciHigh === 'number';
  }

  function label(key, lang) {
    const entry = KEY_LABELS[key];
    if (!entry) return String(key);
    return entry[lang] || entry.en || String(key);
  }

  /** Localises any value: {fr,en}, a known enum, or the value itself. */
  function text(value, lang) {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'boolean') return value ? (lang === 'fr' ? 'oui' : 'yes') : (lang === 'fr' ? 'non' : 'no');
    if (typeof value === 'string') {
      if (RECO_LABEL[value]) return (RECO_LABEL[value][lang] || value);
      if (CONCLUSION_LABEL[value]) return (CONCLUSION_LABEL[value][lang] || value);
      return value;
    }
    if (isPlainObject(value) && (value.fr || value.en)) return value[lang] || value.en || value.fr || '';
    if (Array.isArray(value)) return value.map((item) => text(item, lang)).join(', ');
    return String(value);
  }

  /** Integer percentage, exactly like `percent()` in src/domain/stats.ts. */
  function pct(value) {
    if (typeof value !== 'number' || Number.isNaN(value)) return '—';
    return `${Math.round(value * 100)} %`;
  }

  /** The only authorised rendering of a proportion: rate + n + interval. */
  function proportionNode(stat, helpers) {
    const lang = helpers.lang();
    const node = helpers.el('span', 'rate');
    node.appendChild(helpers.el('strong', null, pct(stat.rate)));
    const suffix = lang === 'fr'
      ? ` (${stat.n} tickets, entre ${pct(stat.ciLow)} et ${pct(stat.ciHigh)})`
      : ` (${stat.n} tickets, between ${pct(stat.ciLow)} and ${pct(stat.ciHigh)})`;
    node.appendChild(helpers.el('span', 'n', suffix));
    return node;
  }

  function scalarNode(value, helpers) {
    if (isProportion(value)) return proportionNode(value, helpers);
    const lang = helpers.lang();
    if (typeof value === 'number' && Number.isInteger(value)) return helpers.el('span', null, String(value));
    if (typeof value === 'number') return helpers.el('span', null, String(Math.round(value * 1000) / 1000));
    return helpers.el('span', null, text(value, lang));
  }

  function isScalar(value) {
    return value === null || ['string', 'number', 'boolean'].includes(typeof value)
      || (isPlainObject(value) && Boolean(value.fr || value.en));
  }

  /** Definition list for an object; skips the panel chrome already rendered. */
  function objectNode(object, helpers, skip) {
    const list = helpers.el('dl', 'kv');
    Object.keys(object).forEach((key) => {
      if (skip && skip.includes(key)) return;
      const value = object[key];
      if (value === undefined) return;
      list.appendChild(helpers.el('dt', null, label(key, helpers.lang())));
      const dd = helpers.el('dd');
      dd.appendChild(valueNode(key, value, helpers));
      list.appendChild(dd);
    });
    return list;
  }

  /** Table for an array of objects; plain list for an array of scalars. */
  function arrayNode(rows, helpers) {
    if (!rows.length) return helpers.el('p', 'pending', helpers.lang() === 'fr' ? 'vide' : 'empty');
    if (rows.every(isScalar)) {
      const list = helpers.el('ul', 'plain');
      rows.forEach((row) => list.appendChild(helpers.el('li', null, text(row, helpers.lang()))));
      return list;
    }
    const columns = [];
    rows.forEach((row) => {
      if (!isPlainObject(row)) return;
      Object.keys(row).forEach((key) => { if (!columns.includes(key)) columns.push(key); });
    });
    const table = helpers.el('table', 'data');
    const head = helpers.el('tr');
    columns.forEach((key) => head.appendChild(helpers.el('th', null, label(key, helpers.lang()))));
    table.appendChild(head);
    rows.slice(0, 60).forEach((row) => table.appendChild(rowNode(row, columns, helpers)));
    if (rows.length > 60) {
      const caption = helpers.el('caption', 'truncated',
        helpers.lang() === 'fr' ? `… ${rows.length} lignes au total` : `… ${rows.length} rows in total`);
      table.insertBefore(caption, table.firstChild);
    }
    return table;
  }

  function rowNode(row, columns, helpers) {
    const tr = helpers.el('tr');
    columns.forEach((key) => {
      const td = helpers.el('td');
      const value = isPlainObject(row) ? row[key] : row;
      if (typeof value === 'string' && /^(delegate|review-hardened|keep-human|unknown|ok|missing|masked|efficacy|futility|safety|continue)$/.test(value)) {
        td.appendChild(helpers.el('span', `badge badge-${value}`, text(value, helpers.lang())));
      } else {
        td.appendChild(scalarNode(value, helpers));
      }
      tr.appendChild(td);
    });
    return tr;
  }

  /** Dispatches any value to the right renderer. */
  function valueNode(key, value, helpers) {
    if (value === null || value === undefined) return helpers.el('span', null, '—');
    if (isProportion(value)) return proportionNode(value, helpers);
    if (Array.isArray(value)) return arrayNode(value, helpers);
    if (isPlainObject(value)) {
      if (key === 'matrix' || key === 'cells') return matrixNode(value, helpers);
      return objectNode(value, helpers);
    }
    return scalarNode(value, helpers);
  }

  /** The delegation map: natures × zones, four colours, q-value per cell. */
  function matrixNode(matrix, helpers) {
    const rows = matrix.rows || matrix.natures || [];
    const cols = matrix.columns || matrix.cols || matrix.zones || [];
    const cells = matrix.cells || [];
    if (!rows.length || !cols.length || !cells.length) return objectNode(matrix, helpers);
    const table = helpers.el('table', 'matrix');
    const head = helpers.el('tr');
    head.appendChild(helpers.el('th', null, helpers.lang() === 'fr' ? 'nature ↓ / zone →' : 'nature ↓ / zone →'));
    cols.forEach((col) => head.appendChild(helpers.el('th', null, text(col, helpers.lang()))));
    table.appendChild(head);
    rows.forEach((row, rowIndex) => {
      const tr = helpers.el('tr');
      tr.appendChild(helpers.el('th', null, text(row, helpers.lang())));
      cols.forEach((col, colIndex) => {
        const cell = cells.find((c) => sameAxis(c.row, rowIndex, row) && sameAxis(c.col, colIndex, col));
        tr.appendChild(matrixCell(cell, helpers));
      });
      table.appendChild(tr);
    });
    return table;
  }

  function sameAxis(value, index, fallback) {
    if (value === undefined || value === null) return false;
    return value === index || value === fallback || text(value, 'fr') === text(fallback, 'fr');
  }

  function matrixCell(cell, helpers) {
    if (!cell) return helpers.el('td', 'cell cell-unknown', '·');
    const colour = cell.colour || cell.color || 'unknown';
    const td = helpers.el('td', `cell cell-${colour}`);
    td.title = `${text(colour, helpers.lang())}${cell.qValue !== undefined ? ` · q = ${round3(cell.qValue)}` : ''}`;
    td.appendChild(helpers.el('span', null, cell.n !== undefined ? String(cell.n) : '·'));
    if (cell.qValue !== undefined) td.appendChild(helpers.el('small', null, `q ${round3(cell.qValue)}`));
    if (cell.significant === false) td.className += ' cell-flag';
    return td;
  }

  function round3(value) {
    return typeof value === 'number' ? String(Math.round(value * 1000) / 1000) : String(value);
  }

  /** Hand-written SVG line chart: survival curves, reliability curve. */
  function lineChart(series, options, helpers) {
    const opts = options || {};
    const width = 560;
    const height = 220;
    const pad = { top: 12, right: 12, bottom: 28, left: 44 };
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('class', 'chart');
    svg.setAttribute('role', 'img');
    const xs = [];
    const ys = [];
    series.forEach((line) => line.points.forEach((point) => { xs.push(point[0]); ys.push(point[1]); }));
    const xMax = Math.max(1, ...xs);
    const yMin = opts.yMin === undefined ? Math.min(0, ...ys) : opts.yMin;
    const yMax = opts.yMax === undefined ? Math.max(1, ...ys) : opts.yMax;
    const x = (v) => pad.left + ((v / xMax) * (width - pad.left - pad.right));
    const y = (v) => height - pad.bottom - (((v - yMin) / (yMax - yMin || 1)) * (height - pad.top - pad.bottom));
    svg.appendChild(axisLine(pad, width, height, x(0), y(yMin)));
    series.forEach((line, index) => svg.appendChild(pathFor(line, index, x, y)));
    svg.appendChild(axisLabel(width, height, opts, helpers));
    return svg;
  }

  function axisLine(pad, width, height, x0, y0) {
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    [[pad.left, pad.top, pad.left, height - pad.bottom], [pad.left, y0, width - pad.right, y0]]
      .forEach((coords) => {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', coords[0]); line.setAttribute('y1', coords[1]);
        line.setAttribute('x2', coords[2]); line.setAttribute('y2', coords[3]);
        line.setAttribute('class', 'axis');
        group.appendChild(line);
      });
    return group;
  }

  function pathFor(line, index, x, y) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const d = line.points.map((point, i) => `${i === 0 ? 'M' : 'L'}${round3(x(point[0]))} ${round3(y(point[1]))}`).join(' ');
    path.setAttribute('d', d);
    path.setAttribute('class', index === 0 ? 'curve-agent' : 'curve-human');
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = line.name || `series ${index + 1}`;
    path.appendChild(title);
    return path;
  }

  function axisLabel(width, height, opts, helpers) {
    const label0 = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label0.setAttribute('x', String(width / 2));
    label0.setAttribute('y', String(height - 6));
    label0.setAttribute('text-anchor', 'middle');
    label0.textContent = text(opts.xLabel || (helpers.lang() === 'fr' ? 'heures' : 'hours'), helpers.lang());
    return label0;
  }

  /** Generic panel body: label, summary, then every key the data carries. */
  function renderStructural(body, data, helpers) {
    body.appendChild(helpers.el('p', 'demo-flag-inline',
      helpers.lang() === 'fr' ? 'données d’exemple' : 'sample data'));
    if (!data) return false;
    if (data.label) body.appendChild(helpers.el('p', 'panel-label', text(data.label, helpers.lang())));
    if (data.summary) body.appendChild(helpers.el('p', 'panel-summary', text(data.summary, helpers.lang())));
    Object.keys(data).forEach((key) => {
      if (['label', 'summary'].includes(key)) return;
      const value = data[key];
      if (value === null || value === undefined) return;
      const block = helpers.el('div', 'block');
      block.appendChild(helpers.el('h4', null, label(key, helpers.lang())));
      block.appendChild(valueNode(key, value, helpers));
      body.appendChild(block);
    });
    return true;
  }

  window.RENDU_COMMUN = {
    KEY_LABELS, RECO_LABEL, CONCLUSION_LABEL,
    isPlainObject, isProportion, label, text, pct,
    proportionNode, scalarNode, objectNode, arrayNode, valueNode,
    matrixNode, lineChart, renderStructural,
  };
}());
