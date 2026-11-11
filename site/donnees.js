/**
 * Demo dataset for the public site — the same figures as the specification.
 *
 * Everything here is sample data, clearly labelled as such in the UI (SPEC §13,
 * §20, DP-20). No real ticket, no real person: roles (`dev-1`…) and bot
 * accounts only (DP-17). Figures are reproduced from the specification so a
 * visitor can check them by hand: §7 rule 3, §8 (PROJ-412), §10 (calibration).
 *
 * The site renders this with `app.js`; there is no build step and no network
 * call. Rule: files < 500 lines, functions < 50 lines.
 */
'use strict';

/** Wilson score interval, z = 1.96 — the only interval this app ever shows. */
function wilson(successes, n) {
  if (n <= 0) return { n: 0, rate: 0, ciLow: 0, ciHigh: 1 };
  const z = 1.96;
  const p = successes / n;
  const z2 = z * z;
  const denominator = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denominator;
  const spread = Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  const margin = (z / denominator) * spread;
  return {
    n,
    rate: p,
    ciLow: Math.max(0, centre - margin),
    ciHigh: Math.min(1, centre + margin),
  };
}

/** The three games of figures the specification states, verifiable here. */
const REFERENCE_GAMES = [
  { id: 'regle3-avec', label: { en: 'Clean close, with agent (§7 rule 3)', fr: 'Clôture propre, avec agent (§7 règle 3)' }, successes: 34, n: 41 },
  { id: 'regle3-sans', label: { en: 'Clean close, without agent (§7 rule 3)', fr: 'Clôture propre, sans agent (§7 règle 3)' }, successes: 32, n: 37 },
  { id: 'proj412-avec', label: { en: 'PROJ-412 cohort, with agent (§8)', fr: 'Cohorte PROJ-412, avec agent (§8)' }, successes: 18, n: 26 },
  { id: 'proj412-sans', label: { en: 'PROJ-412 cohort, without agent (§8)', fr: 'Cohorte PROJ-412, sans agent (§8)' }, successes: 27, n: 31 },
];

/** The card a developer reads on PROJ-412, word for word as specified (§8). */
const TICKET_CARD = {
  key: 'PROJ-412',
  title: {
    en: 'Migrate the “amount” field to cents',
    fr: 'Migration du champ « montant » en centimes',
  },
  recommendation: 'review-hardened',
  cohort: {
    nature: { en: 'data migration', fr: 'migration de données' },
    zone: { en: 'billing', fr: 'facturation' },
    size: 'M',
    armAgent: wilson(18, 26),
    armHuman: wilson(27, 31),
  },
  cleanClose: {
    agent: wilson(18, 26),
    human: wilson(27, 31),
  },
  medianLead: { agentDays: 1.5, humanDays: 3 },
  whatWentWrong: {
    en: '5 reopenings out of 8, for a migration that cannot be replayed',
    fr: '5 réouvertures sur 8 pour une migration non rejouable',
  },
  references: ['PROJ-207', 'PROJ-233', 'PROJ-301'],
  conditions: {
    en: ['Acceptance criteria present', 'Migration test required'],
    fr: ['Critères d’acceptation présents', 'Test de migration exigé'],
  },
  confidence: { en: 'medium', fr: 'moyenne' },
  involvement: {
    level: { en: 'driven', fr: 'pilotée' },
    source: { en: 'commit mention', fr: 'mention de commit' },
  },
  decision: {
    followed: false,
    text: {
      en: 'Handed to an agent anyway · hardened review announced',
      fr: 'Confié à un agent quand même · relecture renforcée annoncée',
    },
  },
};

/** Delegation map: natures × zones, four colours, grey included (§12). */
const MAP_NATURES = [
  { id: 'fix', label: { en: 'Bug fix', fr: 'Correctif' } },
  { id: 'ui', label: { en: 'Interface change', fr: 'Évolution d’interface' } },
  { id: 'migration', label: { en: 'Data migration', fr: 'Migration de données' } },
  { id: 'refactor', label: { en: 'Refactoring', fr: 'Refonte' } },
  { id: 'tests', label: { en: 'Tests', fr: 'Tests' } },
  { id: 'config', label: { en: 'Configuration', fr: 'Configuration' } },
  { id: 'integration', label: { en: 'External integration', fr: 'Intégration externe' } },
];

const MAP_ZONES = [
  { id: 'billing', label: { en: 'billing', fr: 'facturation' } },
  { id: 'api', label: { en: 'public API', fr: 'API publique' } },
  { id: 'front', label: { en: 'web front', fr: 'front web' } },
  { id: 'data', label: { en: 'data pipeline', fr: 'chaîne de données' } },
  { id: 'infra', label: { en: 'infra', fr: 'infra' } },
];

/**
 * `colour`: delegate (green), review-hardened (orange), keep-human (red),
 * unknown (grey). `n` is the sample size of both arms together: a cell with no
 * sample size would be a rate with no evidence, which this app never shows.
 */
const MAP_CELLS = [
  { nature: 'fix', zone: 'billing', colour: 'review-hardened', n: 57 },
  { nature: 'fix', zone: 'api', colour: 'delegate', n: 84 },
  { nature: 'fix', zone: 'front', colour: 'delegate', n: 96 },
  { nature: 'fix', zone: 'data', colour: 'unknown', n: 18 },
  { nature: 'fix', zone: 'infra', colour: 'unknown', n: 11 },
  { nature: 'ui', zone: 'billing', colour: 'delegate', n: 62 },
  { nature: 'ui', zone: 'api', colour: 'unknown', n: 9 },
  { nature: 'ui', zone: 'front', colour: 'delegate', n: 143 },
  { nature: 'ui', zone: 'data', colour: 'review-hardened', n: 38 },
  { nature: 'ui', zone: 'infra', colour: 'unknown', n: 6 },
  { nature: 'migration', zone: 'billing', colour: 'review-hardened', n: 57 },
  { nature: 'migration', zone: 'api', colour: 'keep-human', n: 44 },
  { nature: 'migration', zone: 'front', colour: 'review-hardened', n: 31 },
  { nature: 'migration', zone: 'data', colour: 'keep-human', n: 52 },
  { nature: 'migration', zone: 'infra', colour: 'unknown', n: 14 },
  { nature: 'refactor', zone: 'billing', colour: 'keep-human', n: 41 },
  { nature: 'refactor', zone: 'api', colour: 'review-hardened', n: 66 },
  { nature: 'refactor', zone: 'front', colour: 'review-hardened', n: 58 },
  { nature: 'refactor', zone: 'data', colour: 'keep-human', n: 37 },
  { nature: 'refactor', zone: 'infra', colour: 'unknown', n: 12 },
  { nature: 'tests', zone: 'billing', colour: 'delegate', n: 73 },
  { nature: 'tests', zone: 'api', colour: 'delegate', n: 88 },
  { nature: 'tests', zone: 'front', colour: 'delegate', n: 101 },
  { nature: 'tests', zone: 'data', colour: 'delegate', n: 47 },
  { nature: 'tests', zone: 'infra', colour: 'review-hardened', n: 29 },
  { nature: 'config', zone: 'billing', colour: 'unknown', n: 15 },
  { nature: 'config', zone: 'api', colour: 'review-hardened', n: 33 },
  { nature: 'config', zone: 'front', colour: 'delegate', n: 42 },
  { nature: 'config', zone: 'data', colour: 'unknown', n: 10 },
  { nature: 'config', zone: 'infra', colour: 'keep-human', n: 26 },
  { nature: 'integration', zone: 'billing', colour: 'keep-human', n: 24 },
  { nature: 'integration', zone: 'api', colour: 'review-hardened', n: 51 },
  { nature: 'integration', zone: 'front', colour: 'review-hardened', n: 29 },
  { nature: 'integration', zone: 'data', colour: 'unknown', n: 13 },
  { nature: 'integration', zone: 'infra', colour: 'unknown', n: 8 },
];

/** Cohort detail behind one cell: both arms, sizes, intervals (§16 screen 3). */
const COHORT_DETAIL = {
  nature: 'migration',
  zone: 'billing',
  size: 'M',
  epoch: { en: 'epoch 3 — new model, 14 September', fr: 'époque 3 — nouveau modèle, 14 septembre' },
  fellBack: false,
  arms: {
    agent: wilson(18, 26),
    human: wilson(27, 31),
  },
  medianLeadH: { agent: 36, human: 72 },
  reviewLoad: { agent: 4.2, human: 2.1 },
  conclusion: 'worse',
  conclusionText: {
    en: 'Established gap, against agents: clean close clearly lower',
    fr: 'Écart établi, en défaveur des agents : clôture propre nettement plus basse',
  },
  balance: { ok: true },
  peopleCount: 7,
  causes: {
    en: ['Migration not replayable (5 of 8 reopenings)', 'No migration test', 'Vague acceptance criteria'],
    fr: ['Migration non rejouable (5 réouvertures sur 8)', 'Aucun test de migration', 'Critères d’acceptation flous'],
  },
  tickets: ['PROJ-207', 'PROJ-233', 'PROJ-301', 'PROJ-318', 'PROJ-355', 'PROJ-412'],
};

/** “Can you trust this app?” — calibration, SPEC §10. */
const CALIBRATION = [
  { recommendation: 'delegate', clean: 88, n: 112 },
  { recommendation: 'review-hardened', clean: 74, n: 63 },
  { recommendation: 'keep-human-overridden', clean: 52, n: 21 },
];

const CALIBRATION_VERDICT = {
  ok: true,
  text: {
    en: '“Delegate” does clearly better than “keep with a human”: the advice carries information on this project.',
    fr: '« À confier » fait nettement mieux que « à garder » : les avis apportent quelque chose sur ce projet.',
  },
};

/** Coverage screen: what a missing graph permission looks like (DP-19). */
const COVERAGE = {
  knownInvolvementShare: 0.59,
  lastCollection: { en: 'today, 09:12 — slice 7 of 9', fr: 'aujourd’hui, 09 h 12 — tranche 7 sur 9' },
  permissions: [
    { object: { en: 'issues', fr: 'tickets' }, state: 'ok', probe: 'PROJ-412 → 6 commits' },
    { object: { en: 'commits', fr: 'commits' }, state: 'ok', probe: 'a1b2c3d → message read, then dropped' },
    { object: { en: 'pull requests', fr: 'pull requests' }, state: 'missing', probe: '0 result on a known PR' },
    { object: { en: 'users', fr: 'utilisateurs' }, state: 'missing', probe: 'bot account not resolved' },
  ],
};

/** Epochs: one change of tool, model or instructions opens a new one (§7 rule 6). */
const EPOCHS = [
  { label: { en: 'epoch 1 — before adoption', fr: 'époque 1 — avant adoption' }, from: '2025-11-20', note: { en: 'no agent: everything counts as “without”', fr: 'aucun agent : tout compte « sans »' } },
  { label: { en: 'epoch 2 — first assistant', fr: 'époque 2 — premier assistant' }, from: '2026-03-02', note: { en: 'completion only, commits co-signed', fr: 'complétion seulement, commits co-signés' } },
  { label: { en: 'epoch 3 — new model', fr: 'époque 3 — nouveau modèle' }, from: '2026-09-14', note: { en: 'data migrations moved from red to orange', fr: 'les migrations de données passent du rouge à l’orange' } },
];

/** The nine MCP tools (§15). Reads are GET so an automation can call them. */
const MCP_TOOLS = [
  { key: 'should-delegate', verb: 'GET', input: 'issueKey', output: { en: 'recommendation, reasons, conditions, confidence', fr: 'recommandation, raisons, conditions, confiance' } },
  { key: 'list-delegable-work', verb: 'GET', input: 'jql, limit', output: { en: '“delegate” tickets, safest first', fr: 'tickets « à confier », du plus sûr au moins sûr' } },
  { key: 'get-delegation-evidence', verb: 'GET', input: 'issueKey', output: { en: 'cohort, sample sizes, intervals, reference tickets', fr: 'cohorte, effectifs, fourchettes, tickets de référence' } },
  { key: 'get-delegation-map', verb: 'GET', input: 'projectKey', output: { en: 'summarised matrix, share of grey', fr: 'matrice résumée, part de gris' } },
  { key: 'get-cohort', verb: 'GET', input: 'projectKey, nature, zone, size', output: { en: 'cohort detail, epoch by epoch', fr: 'détail de la cohorte, époque par époque' } },
  { key: 'get-calibration', verb: 'GET', input: 'projectKey', output: { en: 'accuracy of past recommendations', fr: 'justesse des recommandations passées' } },
  { key: 'record-involvement', verb: 'CREATE', input: 'issueKey, level, client, model, session', output: { en: 'involvement recorded', fr: 'implication enregistrée' } },
  { key: 'record-decision', verb: 'CREATE', input: 'issueKey, decision, reason', output: { en: 'decision matched to the recommendation', fr: 'décision rapprochée de la recommandation' } },
  { key: 'report-takeover', verb: 'UPDATE', input: 'issueKey, reason', output: { en: 'human takeover recorded', fr: 'reprise humaine enregistrée' } },
];

/** The eight rules of honest comparison (§7) — the site states them plainly. */
const HONESTY_RULES = [
  { en: 'Compare inside a cohort: same nature, same zone, same size. Too small → fall back one level, and say so.', fr: 'Comparer dans une cohorte : même nature, même zone, même taille. Trop petite → on remonte d’un niveau, et on le dit.' },
  { en: 'A minimum sample size: 20 tickets per arm, adjustable. Below that: “not enough history”.', fr: 'Un effectif minimal : 20 tickets par bras, réglable. En dessous : « pas assez de recul ».' },
  { en: 'Never a rate without its sample size and its interval.', fr: 'Jamais un taux sans son effectif et sa fourchette.' },
  { en: 'Four possible conclusions: better, same, worse, we do not know. The last one is a conclusion in its own right.', fr: 'Quatre conclusions possibles : mieux, pareil, moins bien, on ne sait pas. La dernière est une conclusion à part entière.' },
  { en: 'Selection bias is handled, then flagged: if the two arms differ too much, “unbalanced arms” and no conclusion.', fr: 'Le biais de sélection est traité, puis signalé : si les bras diffèrent trop, « bras déséquilibrés » et aucune conclusion.' },
  { en: 'One epoch at a time: a change of tool, model or instructions opens a new epoch. Figures are never mixed.', fr: 'Une époque à la fois : un changement d’outil, de modèle ou de consignes ouvre une nouvelle époque. On ne mélange pas les chiffres.' },
  { en: 'No global figure without its breakdown: a total can contradict all of its parts.', fr: 'Aucun chiffre global sans sa décomposition : un total peut contredire toutes ses parties.' },
  { en: 'Never per person: no statistic, no ranking. A cohort carried by fewer than three people is masked.', fr: 'Jamais par personne : aucune statistique, aucun classement. Une cohorte portée par moins de trois personnes est masquée.' },
];

if (typeof window !== 'undefined') {
  window.DONNEES = {
    wilson,
    REFERENCE_GAMES,
    TICKET_CARD,
    MAP_NATURES,
    MAP_ZONES,
    MAP_CELLS,
    COHORT_DETAIL,
    CALIBRATION,
    CALIBRATION_VERDICT,
    COVERAGE,
    EPOCHS,
    MCP_TOOLS,
    HONESTY_RULES,
  };
}
