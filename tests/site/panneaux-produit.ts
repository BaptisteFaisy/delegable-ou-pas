/**
 * Panels of the public site that come from the product itself: the eight screens
 * of SPEC §16, the involvement sources, the commit mention catalogue, the epochs,
 * the controlled trial, the anonymity guard, the executable conditions, the
 * prioritised collection and the Jira-only fallback.
 *
 * Same rule as the statistical panels: everything is computed by calling the
 * real modules on the sample dataset (`src/sample/`), so the public site shows
 * exactly what the app would show in demo mode.
 */
import { assessCapabilities, widenThresholdForLevel } from '../../src/domain/degraded-mode.js';
import { cohortMask, PERSON_IDENTIFIER_FIELDS, unknownShare } from '../../src/domain/privacy.js';
import { conditionsFor, checkConditions } from '../../src/domain/conditions.js';
import type { ConditionFact } from '../../src/domain/conditions.js';
import { defaultPatterns, scanMessage } from '../../src/domain/signatures.js';
import { cohortNeeds, explainPriority, prioritise } from '../../src/collect/priority.js';
import { newcombeDifference, tostEquivalence } from '../../src/domain/difference.js';
import { medianDuration, proportion, wilsonInterval } from '../../src/domain/stats.js';
import {
  sampleCards, sampleClasses, sampleCommitFacts, sampleEpochs, sampleInvolvements,
  sampleOutcomes, sampleSettings, sampleTrial, SAMPLE_PROJECT_KEY, SAMPLE_REFERENCE_DATE,
  SAMPLE_WINDOW_END, SAMPLE_WINDOW_START,
} from '../../src/sample/index.js';
import { LEVELS, SOURCES } from '../../src/types.js';
import type { ArmTotals, Panel, SiteTicket } from './site-types.js';
import { armTotals, cohortKeyOf, cohortKeys } from './panneaux-stats.js';

type Colour = 'delegate' | 'review-hardened' | 'keep-human' | 'unknown';

/* ------------------------------------------------------------- the screens */

/** Screen 1: the card on the ticket, exactly as SPEC §8 writes it. */
export function ecranCarteTicket(): Panel {
  const cards = sampleCards();
  const card = cards.find((item) => item.issueKey === 'PROJ-412') || cards[0];
  return {
    label: { fr: 'La carte sur le ticket', en: 'The card on the ticket' },
    summary: {
      fr: 'jira:issuePanel — la recommandation, la cohorte, les deux bras avec effectifs et fourchettes, les tickets de référence, les conditions, la confiance, la décision prise et l’implication relevée avec sa source.',
      en: 'jira:issuePanel — the recommendation, the cohort, both arms with sample sizes and intervals, reference tickets, conditions, confidence, the decision taken and the detected involvement with its source.',
    },
    card,
    tickets: cards.length,
  };
}

/** Screen 2: the delegation map, with a q-value per cell. */
export function ecranCarteDelegation(tickets: readonly SiteTicket[], totals: readonly ArmTotals[]): Panel {
  const natures = distinct(tickets.map((ticket) => ticket.nature));
  const zones = distinct(tickets.map((ticket) => ticket.zone));
  const cells = buildCells(totals, natures, zones);
  const grey = cells.filter((cell) => cell.colour === 'unknown').length;
  return {
    label: { fr: 'La carte de délégation', en: 'The delegation map' },
    summary: {
      fr: 'jira:projectPage — la matrice natures × zones aux quatre couleurs. Le gris a la même dignité que le vert : « on ne sait pas » est une conclusion.',
      en: 'jira:projectPage — the natures × zones matrix in four colours. Grey has the same standing as green: “we do not know” is a conclusion.',
    },
    matrix: { rows: natures, columns: zones, cells },
    greyShare: cells.length ? grey / cells.length : 0,
    cells: cells.length,
  };
}

function buildCells(totals: readonly ArmTotals[], natures: readonly string[], zones: readonly string[]) {
  const cells: { row: number; col: number; colour: Colour; n: number; conclusion: string }[] = [];
  totals.forEach((item) => {
    const [nature, zone] = item.key.split('|');
    const row = natures.indexOf(nature);
    const col = zones.indexOf(zone);
    if (row < 0 || col < 0) return;
    cells.push({
      row, col,
      colour: colourOf(item),
      n: item.agent.total + item.human.total + item.unknown,
      conclusion: conclusionOf(item),
    });
  });
  return cells;
}

/** The four colours, from the SPEC §8 rule table. */
function colourOf(totals: ArmTotals): Colour {
  const conclusion = conclusionOf(totals);
  if (conclusion === 'not-enough-data') return 'unknown';
  if (conclusion === 'better' || conclusion === 'same') return 'delegate';
  const agentFaster = medianOf(totals.agent.leadTimes) < medianOf(totals.human.leadTimes);
  return agentFaster ? 'review-hardened' : 'keep-human';
}

function conclusionOf(totals: ArmTotals): string {
  const agent = wilsonInterval(totals.agent.clean, totals.agent.total);
  const human = wilsonInterval(totals.human.clean, totals.human.total);
  if (totals.agent.total < 20 || totals.human.total < 20) return 'not-enough-data';
  const difference = newcombeDifference(agent, human);
  if (difference.established) return difference.diff > 0 ? 'better' : 'worse';
  return tostEquivalence(agent, human).equivalent ? 'same' : 'not-enough-data';
}

function medianOf(values: readonly number[]): number {
  return values.length ? medianDuration(values).medianH : Number.POSITIVE_INFINITY;
}

function distinct(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

/** Screen 3: one cohort in detail — arms, difference, lead times. */
export function ecranCohorte(totals: readonly ArmTotals[]): Panel {
  const key = totals.find((item) => item.key.includes('data-migration'))?.key || totals[0]?.key || '';
  const found = totals.find((item) => item.key === key);
  const agent = found ? wilsonInterval(found.agent.clean, found.agent.total) : proportion(0, 0);
  const human = found ? wilsonInterval(found.human.clean, found.human.total) : proportion(0, 0);
  return {
    label: { fr: 'Le détail d’une cohorte', en: 'One cohort in detail' },
    summary: {
      fr: 'Les deux bras, leurs effectifs, leurs fourchettes, l’intervalle de la différence, les délais médians et les tickets du fondement.',
      en: 'Both arms, their sample sizes, their intervals, the interval of the difference, the median lead times and the evidence tickets.',
    },
    cohorte: key,
    arms: { agent, human },
    difference: newcombeDifference(agent, human),
    medianLeadH: {
      agent: found ? medianDuration(found.agent.leadTimes) : null,
      human: found ? medianDuration(found.human.leadTimes) : null,
    },
    unknown: found ? found.unknown : 0,
  };
}

/** Screen 4: the sprint breakdown, tickets by recommendation. */
export function ecranSprint(): Panel {
  const cards = sampleCards();
  const counts: Record<string, number> = {};
  cards.forEach((card) => { counts[card.value] = (counts[card.value] || 0) + 1; });
  const delegable = (counts.delegate || 0) + (counts['delegate-with-review'] || 0);
  return {
    label: { fr: 'La répartition du sprint', en: 'The sprint breakdown' },
    summary: {
      fr: 'jira:sprintAction — les tickets par recommandation et la part délégable.',
      en: 'jira:sprintAction — tickets by recommendation and the delegable share.',
    },
    byRecommendation: Object.keys(counts).sort().map((key) => ({ recommendation: key, tickets: counts[key] })),
    delegablePointsShare: cards.length ? delegable / cards.length : 0,
    tickets: cards.length,
  };
}

/** Screen 5: project settings, including the mention catalogue. */
export function ecranReglages(): Panel {
  const patterns = defaultPatterns();
  const facts = sampleCommitFacts();
  const seen = distinct(facts.filter((fact) => fact.hasSignature).map((fact) => fact.agentName).filter(Boolean));
  return {
    label: { fr: 'Les réglages du projet', en: 'Project settings' },
    summary: {
      fr: 'jira:projectSettingsPage — seuil, date d’adoption, natures, zones, tailles, zones sensibles, définition de la relecture renforcée, époques, et le catalogue de mentions avec les mentions réellement vues.',
      en: 'jira:projectSettingsPage — threshold, adoption date, natures, zones, sizes, sensitive zones, the definition of hardened review, epochs, and the mention catalogue with the mentions actually seen.',
    },
    settings: sampleSettings(),
    signaturePatterns: patterns.map((pattern) => ({
      id: pattern.id, agentName: pattern.agentName, enabled: pattern.enabled,
      expression: pattern.expression, seenCount: pattern.seenCount,
      note: 'à confirmer par l’équipe',
    })),
    seenMentions: seen,
  };
}

/** Screen 6: coverage — every graph right, stated. */
export function ecranCouverture(): Panel {
  const permissions = [
    { object: 'jira', granted: true, probed: true },
    { object: 'issue', granted: true, probed: true },
    { object: 'commit', granted: true, probed: true },
    { object: 'pull-request', granted: false, probed: true },
    { object: 'user', granted: false, probed: true },
  ];
  const capability = assessCapabilities(permissions);
  const involvements = sampleInvolvements();
  return {
    label: { fr: 'La couverture', en: 'Coverage' },
    summary: {
      fr: 'Part d’implication connue, état de chaque droit sur le graphe, niveau de capacité, dernière collecte. Un droit manquant est dit, jamais un zéro silencieux.',
      en: 'Share of known involvement, state of every graph permission, capability level, last collection. A missing right is stated, never a silent zero.',
    },
    permissions,
    capability,
    knownInvolvementShare: 1 - unknownShare(involvements).rate,
    unknown: unknownShare(involvements),
    lastCollection: SAMPLE_REFERENCE_DATE,
  };
}

/** Screen 7: “Can you trust this app?” — the SPEC §10 table. */
export function ecranCalibration(tickets: readonly SiteTicket[]): Panel {
  const cards = sampleCards();
  const cleanByIssue = new Map(tickets.map((ticket) => [ticket.issueId, ticket.clean]));
  const rows = ['delegate', 'delegate-with-review', 'keep-human'].map((value) => {
    const selected = cards.filter((card) => card.value === value);
    const clean = selected.filter((card) => cleanByIssue.get(card.issueId) === true).length;
    const stat = proportion(clean, selected.length);
    return { recommendation: value, clean: Math.round(stat.rate * 100), n: stat.n, interval: stat };
  });
  return {
    label: { fr: 'Peut-on croire cette app ?', en: 'Can you trust this app?' },
    summary: {
      fr: 'La justesse des recommandations passées, avec l’effectif et la fourchette de chaque ligne. Si « à confier » ne fait pas nettement mieux que « à garder », l’app l’écrit en tête de page.',
      en: 'The accuracy of past recommendations, with the sample size and interval of every row. If “delegate” does not clearly beat “keep”, the app says so at the top of the page.',
    },
    byRecommendation: rows,
    tickets: cards.length,
  };
}

/** Screen 8: the dashboard gadget — a reduced map and the share of grey. */
export function ecranGadget(totals: readonly ArmTotals[]): Panel {
  const map = ecranCarteDelegation(allTickets(), totals);
  const grey = typeof map.greyShare === 'number' ? map.greyShare : 0;
  return {
    label: { fr: 'Le gadget de tableau de bord', en: 'The dashboard gadget' },
    summary: {
      fr: 'jira:dashboardGadget — la carte réduite et la part de gris comme indicateur principal.',
      en: 'jira:dashboardGadget — the reduced map, with the share of grey as the main indicator.',
    },
    greyShare: grey,
    cells: map.cells,
  };
}

/* ------------------------------------------------------- feature panels */

/** The five sources and the five levels, with the share of unknown. */
export function panneauImplication(): Panel {
  const involvements = sampleInvolvements();
  const share = unknownShare(involvements);
  const bySource = SOURCES.map((source) => ({
    source,
    tickets: involvements.filter((item) => item.source === source).length,
  }));
  return {
    label: { fr: 'Reconnaître le travail d’un agent', en: 'Recognising an agent’s work' },
    summary: {
      fr: 'Cinq sources, de la plus sûre à la moins sûre ; la meilleure disponible est retenue et affichée. L’inconnu n’est jamais compté « sans agent ».',
      en: 'Five sources, from the safest to the least safe; the best available wins and is shown. Unknown is never counted as “without agent”.',
    },
    sources: bySource,
    levels: LEVELS,
    unknownShare: share,
    tickets: involvements.length,
  };
}

/** The mention catalogue, and the mentions actually seen on the team’s commits. */
export function panneauMentions(): Panel {
  const patterns = defaultPatterns();
  const sample = 'feat: migrate amounts to cents\n\nCo-authored-by: Claude <noreply@anthropic.com>';
  const match = scanMessage({ message: sample, patterns });
  const facts = sampleCommitFacts();
  return {
    label: { fr: 'Le catalogue de mentions de commit', en: 'The commit mention catalogue' },
    summary: {
      fr: 'Motifs réglables, chacun marqué « à confirmer par l’équipe ». Du message, l’app ne garde qu’un fait : mention trouvée ou non, et le nom de l’agent — le message n’est jamais stocké.',
      en: 'Adjustable patterns, each marked “to be confirmed by the team”. From a message the app keeps one fact only: whether a mention was found, and the agent name — the message is never stored.',
    },
    patterns: patterns.map((pattern) => ({ id: pattern.id, agentName: pattern.agentName, enabled: pattern.enabled })),
    example: { found: match.found, agentName: match.agentName, patternId: match.patternId },
    commits: facts.length,
    signedShare: facts.length ? facts.filter((fact) => fact.hasSignature).length / facts.length : 0,
  };
}

/** Epochs: one change of tool, model or instructions opens a new one. */
export function panneauEpoques(): Panel {
  return {
    label: { fr: 'Les époques', en: 'The epochs' },
    summary: {
      fr: 'On ne mélange jamais les chiffres de deux époques ; les anciens restent visibles, grisés.',
      en: 'Figures of two epochs are never mixed; the old ones stay visible, greyed out.',
    },
    epochs: sampleEpochs(),
    window: { start: SAMPLE_WINDOW_START, end: SAMPLE_WINDOW_END },
  };
}

/** The controlled trial: the only figure the app calls proven. */
export function panneauEssai(): Panel {
  const trial = sampleTrial();
  return {
    label: { fr: 'L’essai contrôlé', en: 'The controlled trial' },
    summary: {
      fr: 'Le sort décide qui prend le ticket, le tirage est reproductible, un tirage non respecté sort le ticket de l’essai. C’est le seul chiffre qualifié de « prouvé ».',
      en: 'Chance decides who takes the ticket, the draw is reproducible, an unrespected draw removes the ticket from the trial. The only figure called “proven”.',
    },
    trial,
  };
}

/** Anonymity: a cohort carried by fewer than three people is masked. */
export function panneauAnonymat(): Panel {
  return {
    label: { fr: 'Jamais par personne', en: 'Never per person' },
    summary: {
      fr: 'Aucune statistique individuelle, aucun classement. Une cohorte portée par moins de trois personnes est masquée — et le dit.',
      en: 'No individual statistic, no ranking. A cohort carried by fewer than three people is masked — and says so.',
    },
    masked: cohortMask(2),
    notMasked: cohortMask(7),
    forbiddenFields: PERSON_IDENTIFIER_FIELDS,
  };
}

/** Executable conditions: “migration test required” becomes a check. */
export function panneauConditions(): Panel {
  const conditions = conditionsFor('delegate-with-review', ['migration-not-replayable', 'no-migration-test']);
  const facts: readonly ConditionFact[] = [
    { kind: conditions[0]?.kind ?? 'acceptance-criteria', observed: true, detail: '3 critères dans la description' },
    { kind: 'migration-test', observed: null, detail: 'aucun fichier de test visible dans la PR' },
  ];
  const report = checkConditions(conditions, facts, SAMPLE_REFERENCE_DATE);
  return {
    label: { fr: 'Des conditions exécutables', en: 'Executable conditions' },
    summary: {
      fr: 'Les conditions dérivent de la recommandation et des causes d’échec de la cohorte, puis sont vérifiées sur la PR. Non vérifiable vaut null : l’inconnu n’est ni un échec ni une réussite.',
      en: 'Conditions derive from the recommendation and the cohort’s failure causes, then are checked on the pull request. Not verifiable is null: unknown is neither failure nor success.',
    },
    derived: conditions,
    checks: report,
    unknownCount: report.unknownCount,
  };
}

/** Prioritised collection: the slice that takes the map out of grey fastest. */
export function panneauPriorite(tickets: readonly SiteTicket[]): Panel {
  const candidates = tickets.slice(0, 60).map((ticket) => ({
    issueId: ticket.issueId,
    cohortKey: cohortKeyOf(ticket),
    arm: ticket.arm ?? ('unknown' as const),
    closedAt: ticket.closedAt === '' ? null : ticket.closedAt,
    alreadyCollected: false,
    signedCommits: 0,
    commits: 1,
  }));
  const needs = cohortNeeds(candidates, 20);
  const slice = prioritise(candidates, { threshold: 20, budgetMinutes: 4, slicesPerMinute: 1 });
  return {
    label: { fr: 'La collecte par valeur d’information', en: 'Collection by information value' },
    summary: {
      fr: 'Le graphe ne se lit qu’en session utilisateur, par tranches : l’ordre maximise les cases qui sortent du gris, et chaque ticket choisi dit pourquoi.',
      en: 'The graph is read only in a user session, in slices: the order maximises the cells leaving grey, and every chosen ticket says why.',
    },
    needs: needs.slice(0, 8),
    slice: { issueIds: slice.issueIds, budgetMinutes: slice.budgetMinutes },
    rationale: slice.rationale,
    explanation: explainPriority(slice),
  };
}

/** The Jira-only fallback: what the app can still say with no graph right. */
export function panneauJiraSeul(): Panel {
  const none = assessCapabilities([
    { object: 'jira', granted: true, probed: true },
    { object: 'commit', granted: false, probed: true },
    { object: 'pull-request', granted: false, probed: true },
    { object: 'user', granted: false, probed: true },
  ]);
  const full = assessCapabilities([
    { object: 'jira', granted: true, probed: true },
    { object: 'issue', granted: true, probed: true },
    { object: 'commit', granted: true, probed: true },
    { object: 'pull-request', granted: true, probed: true },
    { object: 'user', granted: true, probed: true },
  ]);
  return {
    label: { fr: 'Le repli sans aucun droit sur le graphe', en: 'The fallback with no graph permission' },
    summary: {
      fr: 'Trois niveaux de capacité. Le seuil s’élargit quand la mesure s’appauvrit, et chaque capacité manquante produit une conséquence écrite plutôt qu’un trou silencieux.',
      en: 'Three capability levels. The threshold widens as measurement gets poorer, and every missing capability produces a written consequence instead of a silent hole.',
    },
    levels: [
      { level: full.level, available: full.available.length, unavailable: full.unavailable.length, threshold: widenThresholdForLevel(full.level, 20) },
      { level: none.level, available: none.available, unavailable: none.unavailable, consequences: none.consequences, threshold: widenThresholdForLevel(none.level, 20) },
    ],
    project: SAMPLE_PROJECT_KEY,
  };
}

/** The nine MCP tools and one real call, rendered as an orchestrator receives it. */
export function outilsMcp(tickets: readonly SiteTicket[]): Panel {
  const cards = sampleCards();
  const delegable = cards.filter((card) => card.value === 'delegate').slice(0, 5);
  const card = cards.find((item) => item.issueKey === 'PROJ-412') || cards[0];
  return {
    label: { fr: 'Les neuf outils MCP', en: 'The nine MCP tools' },
    summary: {
      fr: 'Les six premiers sont des GET : une règle d’automatisation peut les appeler. Aucun n’accepte un nom de personne en entrée, aucun n’en renvoie.',
      en: 'The first six are GET: an automation rule can call them. None accepts a person’s name as input, none returns one.',
    },
    sampleCalls: [
      { tool: 'should-delegate', input: { issueKey: card ? card.issueKey : 'PROJ-412' }, output: card },
      { tool: 'list-delegable-work', input: { jql: 'project = PROJ AND status = Ready', limit: 5 }, output: delegable.map((item) => ({ issueKey: item.issueKey, confidence: item.confidence })) },
    ],
    tickets: tickets.length,
  };
}

/** Flat view of every sample ticket, used by several panels. */
export function allTickets(): readonly SiteTicket[] {
  const classes = sampleClasses();
  const involvements = sampleInvolvements();
  const outcomes = sampleOutcomes();
  const levelByIssue = new Map(involvements.map((item) => [item.issueId, item.level]));
  const outcomeByIssue = new Map(outcomes.map((item) => [item.issueId, item]));
  return classes.map((item) => {
    const level = levelByIssue.get(item.issueId) ?? 'unknown';
    const outcome = outcomeByIssue.get(item.issueId);
    return {
      issueId: item.issueId,
      nature: item.nature,
      zone: item.zone,
      size: item.size,
      level,
      arm: level === 'unknown' ? null : (level === 'none' ? 'human' : 'agent'),
      clean: outcome ? outcome.clean : false,
      leadTimeH: outcome ? outcome.leadTimeH : 0,
      closedAt: outcome ? outcome.closedAt : '',
      reopened: outcome ? outcome.reopened : false,
    };
  });
}

/** The cohort totals of the biggest cohorts, shared by the map and the panels. */
export function mainTotals(tickets: readonly SiteTicket[]): readonly ArmTotals[] {
  return cohortKeys(tickets, 12).map((key) => armTotals(tickets, key));
}
