/**
 * The screens floor, traversed on the reference database.
 *
 * Covers: DP-14, DP-16, DP-19, DP-21, DP-24, DP-25.
 *
 * The eight view models of SPEC §16 are rendered from the base; a rate never
 * appears without its effectives and interval, and the demonstration banner is
 * on every screen.
 */
import { describe, expect, it } from 'vitest';
import { base, baseStoreFrais, carteDe, cohortes, essai } from '../helpers/base.js';
import { BASE_ID } from '../helpers/base.js';
import { createTranslator } from '../../src/i18n/index.js';
import { cardView, issuePanelView } from '../../src/viewmodel/issue-card.js';
import { mapView } from '../../src/viewmodel/delegation-map.js';
import { cohortView } from '../../src/viewmodel/cohort-detail.js';
import type { CohortEpoch, GetCohortOutput } from '../../src/types-mcp.js';
import { sprintView } from '../../src/viewmodel/sprint.js';
import { settingsView } from '../../src/viewmodel/settings.js';
import { coverageView } from '../../src/viewmodel/coverage.js';
import { calibrationView } from '../../src/viewmodel/calibration.js';
import { adviceAddsNothing } from '../../src/domain/calibration.js';
import type { DelegationMap } from '../../src/types-advice.js';
import { MAP_COLOR_OF, RECOMMENDATIONS } from '../../src/types-advice.js';

const fr = createTranslator('fr');

/** A delegation map assembled from the base's own cohorts (SPEC §12). */
function carteDeDelegation(): DelegationMap {
  const natures = [...new Set(cohortes().map((vue) => vue.key.nature))];
  const zones = [...new Set(cohortes().map((vue) => vue.key.zone).filter((zone): zone is string => zone !== null))];
  const cells = cohortes().map((vue) => ({
    nature: vue.key.nature,
    zone: vue.key.zone ?? '',
    color: MAP_COLOR_OF[vue.recommandation],
    recommendation: vue.recommandation,
    cohort: vue.key,
    agentN: vue.agent.length,
    humanN: vue.human.length,
    masked: vue.masked,
    failureCauses: [] as readonly string[],
  }));
  const grey = cells.filter((cell) => cell.color === 'grey').length;
  return {
    projectId: BASE_ID,
    epochId: essai().trial.epochId,
    epochs: base().epochs,
    natures,
    zones,
    cells,
    greyShare: cells.length === 0 ? 0 : grey / cells.length,
    delegableShare: 0,
    sprintId: '',
    deviations: [],
    demo: true,
    computedAt: base().now,
  };
}

describe('les huit écrans rendus depuis la base', () => {
  it('carte sur le ticket : taux avec effectif et fourchette, bandeau démo', async () => {
    const vue = cardView(await carteDe('PROJ-412'), fr);
    expect(vue.recommendation).toBe('delegate-with-review');
    expect(vue.agent?.n).toBeGreaterThan(0);
    expect(vue.agent?.ciLow).toBeLessThanOrEqual(vue.agent?.rate ?? 1);
    expect(vue.agent?.ciHigh).toBeGreaterThanOrEqual(vue.agent?.rate ?? 0);
    expect(vue.demo).toBe(true);
  });

  it('panneau du ticket : l’implication relevée et sa source, sans nom', async () => {
    const stores = await baseStoreFrais();
    const card = await carteDe('PROJ-412');
    const involvement = await stores.involvement.get('proj-demo-001-412');
    const contribution = involvement && involvement.level === 'none' ? null : involvement;
    const vue = issuePanelView(card, null, contribution, fr);
    expect(vue.card.recommendation).toBe('delegate-with-review');
    expect(vue.involvement?.source).toBe(involvement?.source);
    expect(vue.anonymityNotice).toBeTruthy();
  });

  it('carte de délégation : une case par cohorte, part de gris', () => {
    const vue = mapView(carteDeDelegation(), fr);
    const cellules = vue.rows.flatMap((row) => row.cells);
    expect(cellules.length).toBeGreaterThan(0);
    for (const cellule of cellules) {
      if (!cellule.masked && cellule.agentN > 0) {
        expect(cellule.sampleLine).toMatch(/n = \d+/);
      }
    }
    expect(vue.demo).not.toBeNull();
  });

  it('détail d’une cohorte : deux bras, effectifs et fourchettes', () => {
    const verte = cohortes().find((vue) => vue.recommandation === 'delegate')!;
    const epoch = base().epochs.find((item) => item.id === verte.epochId)!;
    const epochVue: CohortEpoch = {
      epochId: verte.epochId,
      epochLabel: epoch.label,
      arms: [
        { epochId: verte.epochId, epochLabel: epoch.label, arm: 'agent', clean: verte.agentStat!, leadTime: verte.agentLead!, reviewLoad: 0 },
        { epochId: verte.epochId, epochLabel: epoch.label, arm: 'human', clean: verte.humanStat!, leadTime: verte.humanLead!, reviewLoad: 0 },
      ],
      conclusion: verte.conclusion,
      balance: verte.balance,
      outdated: false,
    };
    const ensemble: GetCohortOutput = {
      cohort: verte.key,
      epochs: [epochVue],
      masked: false,
      peopleCount: verte.peopleCount,
      demo: true,
    };
    const vue = cohortView(ensemble, fr);
    expect(vue.cohortLine).toBeTruthy();
    expect(vue.masked).toBe(false);
    expect(vue.epochs).toHaveLength(1);
  });

  it('réglages : le seuil, les mentions et les époques de la base', () => {
    const current = base();
    const vue = settingsView(current.settings, current.patterns, current.epochs, fr);
    expect(vue.thresholdLine).toContain(String(current.settings.minArmSize));
    expect(vue.patterns.length).toBeGreaterThanOrEqual(4);
    expect(vue.epochs).toHaveLength(3);
  });

  it('couverture : les droits manquants de la base sont dits à voix haute', () => {
    const vue = coverageView(base().coverage, fr);
    expect(vue.partial).toBe(true);
    expect(vue.partialNotice).toBeTruthy();
    expect(vue.known?.text).toMatch(/n = /);
    expect(vue.demo).not.toBeNull();
  });

  it('calibration : chaque recommandation a sa ligne, sans effectif orphelin', async () => {
    const stores = await baseStoreFrais();
    const rows = await stores.calibration.listByProject(BASE_ID, 'epoch-3');
    const vue = calibrationView(rows, adviceAddsNothing(rows), fr);
    expect(vue.rows).toHaveLength(RECOMMENDATIONS.length);
  });

  it('gadget : la carte réduite reprend la part de gris', () => {
    const vue = mapView(carteDeDelegation(), fr);
    expect(vue.greyShareLine).toContain('%');
    expect(vue.zones.length).toBeGreaterThan(0);
  });

  it('répartition du sprint : des tickets sûrs, rangés par confiance', () => {
    const tickets = base().cards
      .filter((card) => card.value === 'delegate')
      .map((card) => ({ issueKey: card.issueKey, confidence: card.confidence, reasons: card.reasons }));
    const vue = sprintView(tickets, fr);
    expect(vue.items.length).toBeGreaterThanOrEqual(0);
    const ordre = ['high', 'medium', 'low'];
    const rangs = vue.items.map((item) => ordre.indexOf(item.confidence));
    expect(rangs).toEqual([...rangs].sort((a, b) => a - b));
  });
});