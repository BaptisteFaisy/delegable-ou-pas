/**
 * The eight screens of SPEC §16, rendered from `demo-data.json`.
 *
 * Deliberately thin: every screen goes through the generic structural renderer
 * (`RENDU_COMMUN.renderStructural`) so that nothing the generator produces can be
 * silently dropped, then adds the drawing that belongs to that screen. All the
 * drawing lives in `rendu-graphes.js`, shared with the feature panels — a chart
 * exists once, not twice.
 *
 * Exposed as `window.DEMO_ECRANS.mountOne(panel, key, data, helpers)`; returning
 * `false` lets `app.js` fall back to the panel label and summary.
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
    addScreenExtras(body, key, data, helpers);
    return drawn;
  }

  /** Per-screen additions: matrix note, survival curves, reliability, grey gauge. */
  function addScreenExtras(body, key, data, helpers) {
    const g = charts();
    if (key === 'carteDelegation' || key === 'gadget') addMapExtras(body, key, data, helpers, g);
    if (key === 'cohorte') {
      const survival = g.findBlock(data, ['survival', 'survie', 'kaplanMeier']);
      if (survival) g.drawSurvival(body, survival, helpers);
    }
    if (key === 'calibration') {
      const fine = g.findBlock(data, ['fine', 'calibrationFine', 'reliability']);
      if (fine) g.drawReliability(body, fine, helpers);
    }
  }

  function addMapExtras(body, key, data, helpers, g) {
    if (key === 'carteDelegation') {
      const note = g.findBlock(data, ['multiplicity', 'note']) || data.multiplicity;
      const cells = countCells(data);
      g.drawMultiplicityNote(body, note && typeof note === 'object' ? note : null, cells, helpers);
      return;
    }
    const share = typeof data.greyShare === 'number'
      ? data.greyShare
      : (data.mini && typeof data.mini.greyShare === 'number' ? data.mini.greyShare : null);
    const cells = Array.isArray(data.cells) ? data.cells.length
      : (data.mini && Array.isArray(data.mini.cells) ? data.mini.cells.length : undefined);
    g.drawGreyShare(body, share, helpers, cells);
  }

  function countCells(data) {
    const matrix = data.matrix || (data.map && data.map.matrix);
    if (matrix && Array.isArray(matrix.cells)) return matrix.cells.length;
    if (Array.isArray(data.cells)) return data.cells.length;
    return '—';
  }

  window.DEMO_ECRANS = { mountOne };
}());
