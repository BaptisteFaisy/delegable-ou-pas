/**
 * The three drawings the site needs on top of tables: the survival curves, the
 * reliability curve, and the two notes that must never be missed — how many
 * cells survive the multiplicity correction, and how much of the map is grey.
 *
 * Shared by the screens (`rendu-ecrans.js`) and the feature panels
 * (`rendu-panneaux.js`) so that a chart exists once, not twice.
 * Rule: files < 500 lines, functions < 50 lines. No library: hand-written SVG.
 */
'use strict';

(function () {
  const base = () => window.RENDU_COMMUN;

  /** Round to three decimals for readable SVG coordinates and χ² values. */
  function round3(value) {
    return typeof value === 'number' ? String(Math.round(value * 1000) / 1000) : String(value);
  }

  /** Survival points as [t, S(t)] pairs, from either shape the domain returns. */
  function pointsOf(curve) {
    const points = Array.isArray(curve.points) ? curve.points : [];
    return points
      .map((point) => {
        if (Array.isArray(point)) return [Number(point[0]), Number(point[1])];
        if (point && typeof point === 'object') return [Number(point.t), Number(point.survival)];
        return null;
      })
      .filter((point) => point && Number.isFinite(point[0]) && Number.isFinite(point[1]));
  }

  /** Kaplan-Meier curves for both arms + censored share + log-rank verdict. */
  function drawSurvival(body, survival, helpers) {
    const curves = survival && (survival.curves || []);
    if (!Array.isArray(curves) || !curves.length) return false;
    const common = base();
    const series = [];
    curves.forEach((curve) => {
      const points = pointsOf(curve);
      if (points.length) series.push({ name: common.text(curve.arm || curve.label, helpers.lang()), points });
    });
    if (!series.length) return false;
    body.appendChild(helpers.el('h4', null,
      helpers.lang() === 'fr' ? 'Survie du délai (Kaplan-Meier)' : 'Lead-time survival (Kaplan-Meier)'));
    body.appendChild(common.lineChart(series, {
      yMin: 0, yMax: 1,
      xLabel: { fr: 'heures depuis la mise en cours', en: 'hours since work started' },
    }, helpers));
    body.appendChild(censoredNote(curves, helpers));
    if (survival.logRank) body.appendChild(logRankLine(survival.logRank, helpers));
    return true;
  }

  function censoredNote(curves, helpers) {
    const lang = helpers.lang();
    const parts = curves.map((curve) => {
      const arm = base().text(curve.arm || curve.label, lang);
      const censored = typeof curve.censored === 'number' ? `${curve.censored} ` : '';
      const share = typeof curve.censoredShare === 'number' ? `${Math.round(curve.censoredShare * 100)} %` : '—';
      const median = typeof curve.medianH === 'number'
        ? `${Math.round(curve.medianH)} h`
        : (lang === 'fr' ? 'médiane non atteinte' : 'median not reached');
      return `${arm} : ${censored}${lang === 'fr' ? 'censurés' : 'censored'} (${share}), ${median}`;
    });
    return helpers.el('p', 'note', parts.join(' · '));
  }

  function logRankLine(logRank, helpers) {
    const lang = helpers.lang();
    const p = typeof logRank.pValue === 'number' ? String(Math.round(logRank.pValue * 10000) / 10000) : '—';
    const verdict = logRank.established
      ? (lang === 'fr' ? 'écart établi sur le délai' : 'established gap on lead time')
      : (lang === 'fr' ? 'écart non établi sur le délai' : 'no established gap on lead time');
    return helpers.el('p', 'note', `log-rank χ² = ${round3(logRank.chi2)}, p = ${p} — ${verdict}`);
  }

  /** Reliability curve: the diagonal of a calibrated app against the observed bins. */
  function drawReliability(body, fine, helpers) {
    const bins = fine && (fine.reliability || fine.reliabilityCurve);
    if (!Array.isArray(bins) || !bins.length) return false;
    const common = base();
    const observed = bins
      .filter((bin) => bin.n > 0)
      .map((bin) => [midpoint(bin), observedRate(bin)])
      .filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
    if (!observed.length) return false;
    body.appendChild(helpers.el('h4', null,
      helpers.lang() === 'fr' ? 'Courbe de fiabilité' : 'Reliability curve'));
    const lang = helpers.lang();
    const diagonal = { name: lang === 'fr' ? 'parfaitement calibré' : 'perfectly calibrated', points: [[0, 0], [1, 1]] };
    body.appendChild(common.lineChart([diagonal, { name: lang === 'fr' ? 'observé' : 'observed', points: observed }],
      { yMin: 0, yMax: 1, xLabel: { fr: 'probabilité prédite', en: 'predicted probability' } }, helpers));
    const empty = bins.filter((bin) => !bin.n).length;
    if (empty) {
      body.appendChild(helpers.el('p', 'note', lang === 'fr'
        ? `${empty} bin(s) vide(s) : laissés visibles, un trou est une information.`
        : `${empty} empty bin(s): kept visible, a hole is information.`));
    }
    return true;
  }

  function midpoint(bin) {
    if (typeof bin.predicted === 'number') return bin.predicted;
    const low = Number(bin.predictedLow);
    const high = Number(bin.predictedHigh);
    return Number.isFinite(low) && Number.isFinite(high) ? (low + high) / 2 : NaN;
  }

  function observedRate(bin) {
    if (bin.observed && typeof bin.observed.rate === 'number') return bin.observed.rate;
    return Number(bin.observedRate);
  }

  /** “N cells tested, M survive, X false positives expected” — never optional. */
  function drawMultiplicityNote(body, note, cellCount, helpers) {
    if (!note || typeof note !== 'object') return false;
    const lang = helpers.lang();
    const tested = note.tested !== undefined ? note.tested : cellCount;
    const surviving = note.surviving !== undefined ? note.surviving : '—';
    const expected = note.expectedFalse !== undefined ? note.expectedFalse : '—';
    body.appendChild(helpers.el('p', 'note', lang === 'fr'
      ? `${tested} cases testées · ${surviving} survivent à la correction de Benjamini-Hochberg · ${expected} faux positif(s) attendu(s) par projet. Une case hachurée ne survit pas à la correction.`
      : `${tested} cells tested · ${surviving} survive the Benjamini-Hochberg correction · ${expected} false positive(s) expected per project. A hatched cell does not survive.`));
    return true;
  }

  /** The gadget’s single gauge: how much of the map is still grey, and of how many cells. */
  function drawGreyShare(body, share, helpers, total) {
    if (typeof share !== 'number') return false;
    const gauge = helpers.el('div', 'gauge');
    const fill = helpers.el('span');
    fill.style.width = `${Math.round(Math.min(1, Math.max(0, share)) * 100)}%`;
    gauge.appendChild(fill);
    body.appendChild(gauge);
    const cells = typeof total === 'number'
      ? (helpers.lang() === 'fr' ? ` sur ${total} cases` : ` of ${total} cells`)
      : '';
    body.appendChild(helpers.el('p', 'note', helpers.lang() === 'fr'
      ? `Part de gris : ${Math.round(share * 100)} %${cells} — ce que l'app ne sait pas encore.`
      : `Share of grey: ${Math.round(share * 100)} %${cells} — what the app does not know yet.`));
    return true;
  }

  /** Finds a survival/reliability/multiplicity block anywhere in a panel payload. */
  function findBlock(data, names) {
    if (!data || typeof data !== 'object') return null;
    for (const name of names) {
      if (data[name] && typeof data[name] === 'object') return data[name];
    }
    for (const key of Object.keys(data)) {
      const value = data[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const nested = findBlock(value, names);
        if (nested) return nested;
      }
    }
    return null;
  }

  window.RENDU_GRAPHES = { drawSurvival, drawReliability, drawMultiplicityNote, drawGreyShare, findBlock, pointsOf };
}());
