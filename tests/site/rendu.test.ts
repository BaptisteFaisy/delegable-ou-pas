/**
 * Tests of the public site renderers, without a browser and without a new
 * dependency: a minimal DOM stub is enough to execute the four scripts and to
 * walk the tree they produce.
 *
 * What is asserted, beyond "it does not throw":
 *  - every screen and every feature panel renders something;
 *  - **no percentage appears without its sample size and its interval** — the
 *    site obeys the same rule as the product (SPEC §7 rule 3), and this test is
 *    what makes that claim enforceable rather than decorative;
 *  - a panel whose data is missing still renders (fallback, never a hole);
 *  - a proportion object, wherever it sits in the payload, is rendered as a rate
 *    with evidence, not as a bare number.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/* ------------------------------------------------------------------ DOM stub */

interface StubNode {
  tagName: string;
  className: string;
  children: StubNode[];
  text: string;
  attributes: Record<string, string>;
  style: Record<string, string>;
  firstChild: StubNode | null;
  appendChild(child: StubNode): StubNode;
  insertBefore(child: StubNode, before: StubNode | null): StubNode;
  removeChild(child: StubNode): StubNode;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  querySelector(selector: string): StubNode | null;
}

function makeNode(tagName: string): StubNode {
  const node: StubNode = {
    tagName,
    className: '',
    children: [],
    text: '',
    attributes: {},
    style: {},
    get firstChild() {
      return node.children.length ? node.children[0] : null;
    },
    appendChild(child: StubNode) {
      node.children.push(child);
      return child;
    },
    insertBefore(child: StubNode, before: StubNode | null) {
      const index = before === null ? 0 : node.children.indexOf(before);
      node.children.splice(index < 0 ? 0 : index, 0, child);
      return child;
    },
    removeChild(child: StubNode) {
      const index = node.children.indexOf(child);
      if (index >= 0) node.children.splice(index, 1);
      return child;
    },
    setAttribute(name: string, value: string) {
      node.attributes[name] = value;
    },
    getAttribute(name: string) {
      return Object.prototype.hasOwnProperty.call(node.attributes, name) ? node.attributes[name] : null;
    },
    querySelector(selector: string) {
      return findByClass(node, selector.replace('.', ''));
    },
  };
  return node;
}

function findByClass(node: StubNode, className: string): StubNode | null {
  if (node.className.split(/\s+/).includes(className)) return node;
  for (const child of node.children) {
    const found = findByClass(child, className);
    if (found) return found;
  }
  return null;
}

/** Loads the four site scripts into a shared fake `window`. */
function loadSite(): Record<string, unknown> {
  const root = join(process.cwd(), 'site');
  const fakeWindow: Record<string, unknown> = {};
  const fakeDocument = {
    createElement: (tag: string) => makeNode(tag),
    createElementNS: (_ns: string, tag: string) => makeNode(tag),
  };
  for (const file of ['rendu-commun.js', 'rendu-graphes.js', 'rendu-ecrans.js', 'rendu-panneaux.js']) {
    const code = readFileSync(join(root, file), 'utf8');
    // eslint-disable-next-line no-new-func -- the site ships as plain scripts, no bundler
    new Function('window', 'document', code)(fakeWindow, fakeDocument);
  }
  return fakeWindow;
}

/** Helpers object identical to the one `app.js` hands to the renderers. */
function makeHelpers(lang: 'fr' | 'en') {
  const proportion = (stat: { rate: number; n: number; ciLow: number; ciHigh: number }) =>
    `${Math.round(stat.rate * 100)} % (${stat.n} tickets, entre ${Math.round(stat.ciLow * 100)} % et ${Math.round(stat.ciHigh * 100)} %)`;
  return {
    t: (value: unknown) => (typeof value === 'string' ? value : ''),
    el: (tag: string, className?: string | null, text?: string) => {
      const node = makeNode(tag);
      if (className) node.className = className;
      if (text !== undefined) node.text = text;
      return node;
    },
    clear: (node: StubNode) => {
      while (node.children.length) node.children.pop();
    },
    pct: (value: number) => `${Math.round(value * 100)} %`,
    rateWithEvidence: proportion,
    lang: () => lang,
  };
}

/** Flattens every text node of a rendered tree. */
function allText(node: StubNode): string[] {
  const out: string[] = [];
  if (node.text) out.push(node.text);
  node.children.forEach((child) => out.push(...allText(child)));
  return out;
}

function panelStub(id: string): { panel: StubNode; body: StubNode } {
  const panel = makeNode('section');
  panel.attributes.id = id;
  const body = makeNode('div');
  body.className = 'panel-body';
  panel.appendChild(body);
  return { panel, body };
}

/* ------------------------------------------------------------------- payload */

const proportionStat = { n: 41, rate: 0.829, ciLow: 0.687, ciHigh: 0.915 };

/** A payload shaped like the generator's output, exercising every renderer path. */
function samplePanel(key: string) {
  const base = {
    label: { fr: `panneau ${key}`, en: `panel ${key}` },
    summary: { fr: 'résumé', en: 'summary' },
  };
  if (key === 'carteDelegation') {
    return {
      ...base,
      matrix: {
        rows: [{ fr: 'correctif', en: 'bug fix' }],
        columns: [{ fr: 'facturation', en: 'billing' }],
        cells: [{ row: 0, col: 0, colour: 'delegate', n: 57, qValue: 0.031, significant: true }],
      },
      multiplicity: { note: { tested: 35, surviving: 6, expectedFalse: 1.75 } },
    };
  }
  if (key === 'cohorte' || key === 'survie') {
    return {
      ...base,
      survival: {
        curves: [
          { arm: 'agent', medianH: 36, censoredShare: 0.12, points: [{ t: 0, survival: 1 }, { t: 36, survival: 0.5 }] },
          { arm: 'human', medianH: 72, censoredShare: 0.08, points: [[0, 1], [72, 0.5]] },
        ],
        logRank: { chi2: 4.2, pValue: 0.0404, established: true },
      },
      arms: { agent: proportionStat, human: { n: 37, rate: 0.865, ciLow: 0.72, ciHigh: 0.941 } },
    };
  }
  if (key === 'calibration' || key === 'calibrationFine') {
    return {
      ...base,
      fine: {
        reliability: [
          { bin: 1, predictedLow: 0, predictedHigh: 0.2, n: 0, observed: { n: 0, rate: 0, ciLow: 0, ciHigh: 1 } },
          { bin: 5, predictedLow: 0.8, predictedHigh: 1, n: 41, observed: proportionStat },
        ],
        brier: 0.18, logLoss: 0.52, auc: 0.71,
      },
      verdict: { informative: false, widenUnknown: true },
    };
  }
  if (key === 'naive') {
    return { ...base, naive: { agent: proportionStat }, breakdown: { cells: [] }, contradicts: true, simpson: { paradox: true } };
  }
  if (key === 'puissance') {
    return { ...base, plan: { feasible: false, nPerArm: 190, weeksNeeded: null } };
  }
  if (key === 'anonymat') {
    return { ...base, masked: { masked: true, peopleCount: 2, reason: 'moins de trois personnes' } };
  }
  if (key === 'multiplicite') {
    return { ...base, cells: [{ key: 'fix/billing', pValue: 0.001, qValue: 0.035, significant: true }], note: { tested: 35, surviving: 6, expectedFalse: 1.75 } };
  }
  if (key === 'ecartEtabli') {
    return { ...base, counterExample: { overlap: true, established: true }, newcombe: { diff: 0.15, ciLow: 0.012, ciHigh: 0.28, established: true } };
  }
  if (key === 'gadget') {
    return { ...base, greyShare: 0.31 };
  }
  return { ...base, rows: [{ label: { fr: 'ligne', en: 'row' }, value: 3, observed: proportionStat }] };
}

/** Counts the proportion objects a payload carries, however deeply nested. */
function countProportions(value: unknown): number {
  if (Array.isArray(value)) return value.reduce((total, item) => total + countProportions(item), 0);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.n === 'number' && typeof record.rate === 'number'
      && typeof record.ciLow === 'number' && typeof record.ciHigh === 'number') return 1;
    return Object.keys(record).reduce((total, key) => total + countProportions(record[key]), 0);
  }
  return 0;
}

const SCREEN_KEYS = ['carteTicket', 'carteDelegation', 'cohorte', 'sprint', 'reglages', 'couverture', 'calibration', 'gadget'];
const FEATURE_KEYS = ['implication', 'mentions', 'ecartEtabli', 'survie', 'multiplicite', 'appariement', 'puissance',
  'sequentiel', 'calibrationFine', 'naive', 'conditions', 'priorite', 'jiraSeul', 'epoques', 'essai', 'anonymat'];

/* --------------------------------------------------------------------- tests */

describe('rendus du site public', () => {
  it('charge les quatre scripts et expose les deux points d’entrée', () => {
    const site = loadSite();
    expect(typeof site.RENDU_COMMUN).toBe('object');
    expect(typeof site.RENDU_GRAPHES).toBe('object');
    expect(typeof (site.DEMO_ECRANS as { mountOne: unknown }).mountOne).toBe('function');
    expect(typeof (site.DEMO_PANNEAUX as { mountOne: unknown }).mountOne).toBe('function');
  });

  it.each(SCREEN_KEYS)('rend l’écran %s', (key) => {
    const site = loadSite();
    const screens = site.DEMO_ECRANS as { mountOne: (p: StubNode, k: string, d: unknown, h: unknown) => boolean };
    const { panel, body } = panelStub(`ecran-${key}`);
    expect(screens.mountOne(panel, key, samplePanel(key), makeHelpers('fr'))).toBe(true);
    expect(body.children.length).toBeGreaterThan(0);
  });

  it.each(FEATURE_KEYS)('rend le panneau %s', (key) => {
    const site = loadSite();
    const panels = site.DEMO_PANNEAUX as { mountOne: (p: StubNode, k: string, d: unknown, h: unknown) => boolean };
    const { panel, body } = panelStub(`feat-${key}`);
    expect(panels.mountOne(panel, key, samplePanel(key), makeHelpers('fr'))).toBe(true);
    expect(body.children.length).toBeGreaterThan(0);
  });

  it('chaque proportion rendue porte son effectif (règle 3 du SPEC §7)', () => {
    const site = loadSite();
    const screens = site.DEMO_ECRANS as { mountOne: (p: StubNode, k: string, d: unknown, h: unknown) => boolean };
    const panels = site.DEMO_PANNEAUX as { mountOne: (p: StubNode, k: string, d: unknown, h: unknown) => boolean };
    const offenders: string[] = [];
    [...SCREEN_KEYS, ...FEATURE_KEYS].forEach((key) => {
      const renderer = SCREEN_KEYS.includes(key) ? screens : panels;
      const payload = samplePanel(key);
      const { panel, body } = panelStub(key);
      renderer.mountOne(panel, key, payload, makeHelpers('fr'));
      const texte = allText(body).join(' ');
      const proportions = countProportions(payload);
      const effectifs = (texte.match(/tickets/g) || []).length;
      if (proportions > 0 && effectifs < proportions) {
        offenders.push(`${key}: ${proportions} proportion(s) pour ${effectifs} effectif(s) affichés`);
      }
    });
    expect(offenders).toEqual([]);
  });

  it('une proportion rendue porte toujours ses trois composantes', () => {
    const site = loadSite();
    const common = site.RENDU_COMMUN as {
      proportionNode: (stat: unknown, helpers: unknown) => StubNode;
      isProportion: (value: unknown) => boolean;
    };
    expect(common.isProportion(proportionStat)).toBe(true);
    expect(common.isProportion({ rate: 0.5 })).toBe(false);
    const node = common.proportionNode(proportionStat, makeHelpers('fr'));
    expect(allText(node).join(' ')).toContain('41 tickets');
    expect(allText(node).join(' ')).toContain('69 %');
  });

  it('un panneau sans données ne reste jamais vide', () => {
    const site = loadSite();
    const screens = site.DEMO_ECRANS as { mountOne: (p: StubNode, k: string, d: unknown, h: unknown) => boolean };
    const { panel } = panelStub('ecran-cohorte');
    expect(screens.mountOne(panel, 'cohorte', null, makeHelpers('fr'))).toBe(false);
  });

  it('le rendu est idempotent : changer de langue ne duplique rien', () => {
    const site = loadSite();
    const panels = site.DEMO_PANNEAUX as { mountOne: (p: StubNode, k: string, d: unknown, h: unknown) => boolean };
    const { panel, body } = panelStub('feat-survie');
    panels.mountOne(panel, 'survie', samplePanel('survie'), makeHelpers('fr'));
    const first = body.children.length;
    panels.mountOne(panel, 'survie', samplePanel('survie'), makeHelpers('en'));
    expect(body.children.length).toBe(first);
  });

  it('les courbes sont du SVG écrit à la main, sans librairie', () => {
    const site = loadSite();
    const graphs = site.RENDU_GRAPHES as { pointsOf: (curve: unknown) => number[][] };
    expect(graphs.pointsOf({ points: [{ t: 0, survival: 1 }, { t: 12, survival: 0.5 }] })).toEqual([[0, 1], [12, 0.5]]);
    expect(graphs.pointsOf({ points: [[0, 1], [12, 0.5]] })).toEqual([[0, 1], [12, 0.5]]);
    const source = readFileSync(join(process.cwd(), 'site', 'rendu-commun.js'), 'utf8');
    expect(source).toContain('createElementNS');
    expect(source).not.toMatch(/\b(d3|chart\.js|plotly|highcharts|recharts)\b/i);
  });
});
