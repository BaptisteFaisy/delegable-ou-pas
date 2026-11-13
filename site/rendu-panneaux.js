/**
 * The feature panels — every deepening the product carries, visible.
 *
 * Same discipline as the screens: the generic structural renderer shows whatever
 * the generator produced (so no feature can be silently missing from the site),
 * then a few panels add what a table cannot carry: the survival curves, the
 * reliability curve, the multiplicity note, and the verdicts that must be read
 * before the numbers (naive figure contradicted, trial not feasible, cohort
 * masked, advice not informative).
 *
 * The panels the page does not declare in its HTML are built here, from the
 * generated dataset: a panel that exists in the data always exists on the page.
 *
 * Exposed as `window.DEMO_PANNEAUX.mountOne(panel, key, data, helpers)` and
 * `window.DEMO_PANNEAUX.mount(data, helpers)`.
 * Rule: files < 500 lines, functions < 50 lines.
 */
'use strict';

(function () {
  const common = () => window.RENDU_COMMUN;
  const charts = () => window.RENDU_GRAPHES;

  function mountOne(panel, key, data, helpers) {
    const body = panel.querySelector('.panel-body');
    if (!body || !data) return false;
    helpers.clear(body);
    const drawn = common().renderStructural(body, data, helpers);
    addPanelExtras(body, key, data, helpers);
    return drawn;
  }

  function addPanelExtras(body, key, data, helpers) {
    const g = charts();
    if (key === 'survie') {
      const survival = g.findBlock(data, ['curves', 'survival', 'kaplanMeier']) || data;
      g.drawSurvival(body, survival, helpers);
      return;
    }
    if (key === 'calibrationFine') {
      const fine = g.findBlock(data, ['reliability', 'reliabilityCurve']) ? data : null;
      if (fine) g.drawReliability(body, fine, helpers);
      return;
    }
    if (key === 'multiplicite') {
      const cells = Array.isArray(data.cells) ? data.cells.length : countNestedCells(data);
      g.drawMultiplicityNote(body, data.note || g.findBlock(data, ['note']), cells, helpers);
      return;
    }
    if (key === 'ecartEtabli') addCounterExampleNote(body, data, helpers);
    addVerdicts(body, data, helpers);
  }

  function countNestedCells(data) {
    const block = charts().findBlock(data, ['adjusted', 'cells']);
    return Array.isArray(block) ? block.length : '—';
  }

  /**
   * The panel’s whole point, stated before the numbers: two overlapping Wilson
   * intervals can still hide an established difference.
   */
  function addCounterExampleNote(body, data, helpers) {
    const example = data.counterExample || data.contreExemple;
    if (!example) return;
    const lang = helpers.lang();
    const overlapping = example.overlap || example.overlapping;
    const established = example.established !== undefined ? example.established : true;
    if (!overlapping || !established) return;
    body.appendChild(helpers.el('p', 'note strong', lang === 'fr'
      ? 'Contre-exemple : les deux intervalles de Wilson se recouvrent, et pourtant l’intervalle de la différence exclut zéro — l’écart est établi. Conclure « pareil » sur un recouvrement est l’erreur que ce module corrige.'
      : 'Counter-example: the two Wilson intervals overlap, and yet the interval of the difference excludes zero — the gap is established. Concluding “same” from an overlap is the mistake this module fixes.'));
  }

  /** Verdicts that must be read before any figure on the panel. */
  function addVerdicts(body, data, helpers) {
    const lang = helpers.lang();
    const notes = [];
    if (data.contradicts === true) {
      notes.push(lang === 'fr'
        ? 'Le total contredit ses parties : la décomposition par cohorte est obligatoire, le chiffre global seul serait faux.'
        : 'The total contradicts its parts: the per-cohort breakdown is mandatory, the global figure alone would be wrong.');
    }
    if (data.paradox === true || (data.simpson && data.simpson.paradox === true)) {
      notes.push(lang === 'fr'
        ? 'Paradoxe de Simpson : le signe s’inverse une fois les cohortes séparées — c’est le biais de sélection, pas un effet des agents.'
        : 'Simpson’s paradox: the sign flips once cohorts are separated — that is selection bias, not an agent effect.');
    }
    const plan = data.infeasible && data.infeasible.feasible === false ? data.infeasible : (data.plan || data);
    if (plan.feasible === false) {
      notes.push(lang === 'fr'
        ? 'Essai non réalisable : au rythme de tickets de cette équipe, la puissance visée n’est pas atteignable dans la fenêtre. Mieux vaut le dire que lancer un essai sous-puissant.'
        : 'Trial not feasible: at this team’s ticket rate the target power cannot be reached within the window. Better to say so than to run an underpowered trial.');
    }
    if (data.informative === false || (data.verdict && data.verdict.informative === false)) {
      notes.push(lang === 'fr'
        ? 'Les avis n’apportent rien sur ce projet : l’app l’écrit en tête de page et élargit « pas assez de recul ».'
        : 'The advice adds nothing on this project: the app says so at the top of the page and widens “not enough history”.');
    }
    if (data.masked === true || (data.masked && data.masked.masked === true)) {
      notes.push(lang === 'fr'
        ? 'Cohorte masquée : moins de trois personnes distinctes, la statistique serait individuelle. Aucune donnée par personne, jamais.'
        : 'Cohort masked: fewer than three distinct people, the statistic would be individual. No per-person data, ever.');
    }
    notes.forEach((note) => body.appendChild(helpers.el('p', 'note strong', note)));
  }

  /* -------------------------------------------------- the panels built here */

  /** The section id of a feature key, the way the page names its panels. */
  function sectionId(key) {
    return 'feat-' + key.replace(/([A-Z])/g, '-$1').toLowerCase();
  }

  /**
   * Builds the sections the page does not declare, one per feature of the
   * dataset. A panel that exists in the data always exists on the page.
   */
  function ensureSections(features, helpers) {
    const container = document.getElementById('fonctionnalites');
    if (!container) return false;
    let created = false;
    Object.keys(features).forEach((key) => {
      const id = sectionId(key);
      if (document.getElementById(id)) return;
      const panel = buildSection(id, features[key], helpers);
      container.appendChild(panel);
      created = true;
    });
    return created;
  }

  /** One panel section: its heading, its introduction and its body. */
  function buildSection(id, data, helpers) {
    const label = data.label || {};
    const summary = data.summary || {};
    const fr = helpers.lang() === 'fr';
    const panel = document.createElement('section');
    panel.className = 'panel';
    panel.id = id;
    const heading = document.createElement('h3');
    heading.setAttribute('data-fr', label.fr || id);
    heading.setAttribute('data-en', label.en || id);
    heading.textContent = fr ? (label.fr || id) : (label.en || id);
    const intro = document.createElement('p');
    intro.className = 'panel-intro';
    intro.setAttribute('data-fr', summary.fr || '');
    intro.setAttribute('data-en', summary.en || '');
    intro.textContent = fr ? (summary.fr || '') : (summary.en || '');
    const body = document.createElement('div');
    body.className = 'panel-body';
    panel.appendChild(heading);
    panel.appendChild(intro);
    panel.appendChild(body);
    return panel;
  }

  /** Renders every panel of the dataset, declared in the page or built here. */
  function renderDynamic(features, helpers) {
    Object.keys(features).forEach((key) => {
      const panel = document.getElementById(sectionId(key));
      if (!panel) return;
      mountOne(panel, key, features[key], helpers);
    });
  }

  /**
   * The entry point the page calls with the whole dataset: the panels it does
   * not declare are built, then every panel of the dataset is rendered.
   */
  function mount(data, helpers) {
    if (!data || !data.features) return;
    const created = ensureSections(data.features, helpers);
    renderDynamic(data.features, helpers);
    if (!created) return;
    // The table of contents was built before these panels existed: it is
    // rebuilt once, so the new panels are listed too.
    if (typeof window.renderAll === 'function') window.renderAll();
  }

  window.DEMO_PANNEAUX = { mountOne, mount };
}());
