# CONTRAT — « Délégable ou pas ? » (domaine, lots L1 à L4)

> Document **gelé**, écrit par le lot L0b. Neuf lots codent contre lui **sans se
> parler**. Il se modifie seulement par une PR dédiée dont le corps contient la
> ligne `CONTRACT-CHANGE`.
>
> **Découpage** : ce fichier couvre le **domaine** (lots L1 à L4). Les
> **adaptateurs** (lots L5 à L9 : base, collecte, outils MCP, écrans, démo)
> sont dans [`CONTRACTS-ADAPTATEURS.md`](CONTRACTS-ADAPTATEURS.md). Les deux
> fichiers se lisent ensemble : mêmes règles, même vocabulaire.
>
> Le « quoi » est dans le [cahier des charges](CAHIER-DES-CHARGES.md) (cité
> `SPEC §n`) et [METHODE.md](METHODE.md) donne la statistique opposable.

## 0. Règles valables pour tout le dépôt

- **fichier < 500 lignes**, **fonction < 50 lignes** — au-delà, on découpe ;
- **zéro duplication** : un helper existe une fois ; on cherche l'existant
  (`src/domain/stats.ts`, `tests/helpers/`) avant d'écrire ;
- le domaine (`src/domain/**`) est **pur** : jamais d'import `@forge/*`, ni
  `node:fs`, ni réseau, ni `Date.now()` — l'horloge entre par `Clock`
  (`src/ports.ts`) ;
- **imports avec extension `.js`** : `from './types.js'`, `from './stats.js'` —
  jamais sans extension, jamais un chemin sans `.js` ;
- données absentes = normales : `null` / `[]`, jamais une exception « pas encore
  là » (SPEC §20) ;
- tout taux sort avec son effectif et sa fourchette (SPEC §7 règle 3) ; toute
  durée est une **médiane**, en heures (SPEC §6, METHODE.md §3) ;
- aucun module ne rend un nom de personne (SPEC §7 règle 8, DP-17) ;
- chaque module cite en tête les `SPEC §n` et `DP-nn` qu'il réalise.

### Deux familles de types

1. **Types gelés** — `src/types*.ts` et `src/ports.ts`. On les importe, on ne
   les touche jamais (§6).
2. **Types de module** — un module peut exporter ses propres types auxiliaires.
   Quand ce document en cite un, c'est que **plusieurs lots s'y engagent** : sa
   forme est alors gelée aussi, au même titre qu'un type de `src/types.ts`.

## 1. Fichiers de types (gelés)

| Fichier | Contenu | Consommateurs |
|---|---|---|
| `src/types.ts` (432 l.) | le vocabulaire mesuré : `Level`, `Source`, `Involvement`, `SignaturePattern`, `CommitFact`, `ReviewFact`, `Outcome`, `Nature`, `IssueClass`, `CohortKey`, `Arm`, `ProportionStat`, `DurationStat`, `Conclusion`, `Balance`, `Epoch`, `GraphPermission`, et leurs tables de constantes (`LEVELS`, `SOURCES`, `ARMS`, `COHORT_FALLBACK`…) | tous les lots |
| `src/types-advice.ts` (400 l.) | ce que l'app **décide** : `Recommendation`, `Confidence`, `Guardrail`, `MapColor`, `CohortStat`, `RecommendationCard`, `Decision`, `Calibration`, `Trial`, `TrialAssignment`, `Coverage`, `ProjectSettings`, `HardenedReview`, `DelegationMap` (SPEC §8, §10, §11, §12, §16) | L4, L5, L7, L8 |
| `src/types-graph.ts` (299 l.) | les **faits bruts** de collecte : `GraphCommit`, `GraphPullRequest`, `GraphReviewer`, `StatusHistory`, `ReopeningFact`, `IssueLink`, `NeighborBugFact`, `CollectedTicketFacts`, `CollectionSlice`, `SeenSignature`, `JiraTicket`, `GraphCursor` (SPEC §5, §6, §17, §19) | L2, L6, L9 |
| `src/types-mcp.ts` (325 l.) | entrées et sorties des **neuf outils** : `McpToolKey`, `McpResult<T>`, `ShouldDelegateInput`/`Output`, `GetCohortOutput`, `RecordInvolvementInput`… (SPEC §15) | L7, L8 |
| `src/types-persistence.ts` (308 l.) | une ligne par table du SPEC §18 : `InvolvementRow`, `OutcomeRow`, `CohortStatRow`… + `TableName` | L5 |
| `src/ports.ts` (371 l.) | les **interfaces** entre domaine pur et runtime : `Clock`, `Randomness`, `JiraGateway`, `GraphGateway`, `LlmGateway`, les `*Store`, `RecommendationEngine`, `TicketPanelPort`, `Queue`/`Consumer` | L5, L6, L7, L8 |

**Règle d'import** : `import type { Outcome } from './types.js';` — l'extension
`.js` est obligatoire (le `tsconfig` est en `ES2022`/`bundler`, la CI compile
sans émetteur). Un module qui importe un autre module du domaine fait de même :
`from './stats.js'`.

## 2. Les lots, leurs fichiers, leurs exigences

| Lot | Fichiers (strictement) | Exigences |
|---|---|---|
| L1 `stats-honnetes` | `src/domain/{stats,conclusion,balance,maturity,privacy}.ts` | DP-08, DP-09, DP-10, DP-17 |
| L2 `implication` | `src/domain/{involvement,signatures,outcome,review}.ts` | DP-01…DP-05 |
| L3 `cohortes` | `src/domain/{nature,cohort,epochs}.ts` | DP-06, DP-07, DP-22 |
| L4 `recommandation` | `src/domain/{recommendation,decision,calibration,trial}.ts` | DP-11, DP-12, DP-13, DP-21, DP-27 |
| L5 `persistance` | `src/db/**` | SPEC §18, DP-13, DP-18, DP-19 |
| L6 `collecte` | `src/collect/**` | DP-01, DP-04, DP-05, DP-06, DP-18, DP-19 |
| L7 `mcp-handlers` | `src/actions/**`, `src/handlers/**`, `src/index.ts`, `src/deps.ts` | DP-15, DP-16, DP-25 |
| L8 `ecrans` | `src/viewmodel/**`, `src/ui/**`, `src/i18n/**` | DP-11, DP-14, DP-19, DP-21, DP-24 |
| L9 `demo-docs` | `src/sample/**`, `static/**`, docs de démo | DP-16, DP-20 |

**Vagues** : A = L1, L2, L3, L5, L9 (n'importent que `types*`/`ports`) ;
B = L4, L6 (importent la vague A) ; C = L7, L8 (tout le domaine) ; D = L10.

---

## L1 — `src/domain/stats.ts`, `conclusion.ts`, `balance.ts`, `maturity.ts`, `privacy.ts`

Le lot de la **statistique honnête**. Personne d'autre ne recalcule une
fourchette : tous les lots appellent ces fonctions (METHODE.md).

### `src/domain/stats.ts` — DP-08, DP-09 · SPEC §7 règle 3, §20

```ts
export const Z_95: number;                              // 1.96, METHODE.md §1
export const DEFAULT_MIN_ARM_SIZE: number;              // 20 (SPEC §7 règle 2)
export function wilsonInterval(successes: number, n: number): ProportionStat;
export function proportion(successes: number, n: number): ProportionStat;
export function median(values: readonly number[]): number;
export function medianDuration(hours: readonly number[]): DurationStat;
export function share(part: number, whole: number): number;   // [0,1], 0 si whole = 0
export function percent(value: number): string;               // "83 %" — formatage, jamais un taux seul
```

- `wilsonInterval` : score de Wilson, `z = 1,96`, bornes écrêtées à `[0, 1]`.
  Rend **toujours** `{ n, rate, ciLow, ciHigh }` ; `n = 0` → `{ 0, 0, 0, 1 }`
  (aucun taux sans effectif, recette 10).
- Les trois jeux du SPEC tombent juste : 34/41 → 69–91 %, 32/37 → 72–94 %,
  18/26 → 50–84 % (METHODE.md §2, preuve que c'est Wilson et pas Wald).
- `median` : médiane, jamais de moyenne ; tableau vide → `0` ; nombre pair →
  moyenne des deux centraux (c'est la seule moyenne autorisée, et elle porte sur
  deux valeurs).
- Cas limites §21 : « ticket resté ouvert trois mois » — la médiane l'absorbe ;
  c'est la raison d'être de `medianDuration`.

### `src/domain/conclusion.ts` — DP-09 · SPEC §7 règle 4, §21

```ts
export function belowThreshold(stat: ProportionStat | null, minArmSize: number): boolean;
export function intervalsOverlap(a: ProportionStat, b: ProportionStat): boolean;
export function conclude(
  agent: ProportionStat | null,
  human: ProportionStat | null,
  minArmSize: number,
  balance: Balance,
): Conclusion;
```

- Ordre d'arbitrage, non négociable : **effectif** (un bras sous le seuil, ou
  absent → `not-enough-data`) → **bras déséquilibrés** (`balance.balanced =
  false` → `not-enough-data`, SPEC §7 règle 5) → **recouvrement des
  fourchettes** : recouvrement → `same` ; disjointes, `agent.rate` plus haute →
  `better` ; disjointes, plus basse → `worse`.
- `not-enough-data` est une **conclusion à part entière** : elle s'affiche comme
  les autres, jamais un chiffre seul (SPEC §7 règle 4, §20).
- Cas limites §21 : « total favorable, cohortes défavorables » — la conclusion
  est toujours **par cohorte**, jamais globale (règle 7, appliquée par ce
  module qui ne prend qu'un couple de bras).

### `src/domain/balance.ts` — DP-10 · SPEC §7 règle 5, recette 7

```ts
export interface ArmComposition {
  readonly total: number;
  readonly sizes: Readonly<Record<Size, number>>;    // effectif par taille
  readonly natures: Readonly<Record<Nature, number>>; // effectif par nature
}
export function composition(n: number, sizes: Readonly<Record<Size, number>>,
  natures: Readonly<Record<Nature, number>>): ArmComposition;
export function compareBalance(agent: ArmComposition, human: ArmComposition,
  tolerance: number): Balance;
export const DEFAULT_BALANCE_TOLERANCE: number;      // 0.20
```

- Compare les parts (`BalanceSignal.agentShare` / `humanShare` / `difference`)
  sur les trois critères de `BALANCE_CRITERIA` — `size-mix`, `nature-mix`,
  `volume-gap` — et rend `balanced = false` dès qu'un écart dépasse `tolerance`.
- Écart de volume : `|agent.total − human.total| / max(total)` ; c'est lui qui
  attrape « la cohorte où tout est désormais confié aux agents » (§21).
- Cas limites §21 : plus de bras humain → `balanced = false` et l'app renvoie
  vers l'époque précédente et l'essai (module `epochs.ts` + `trial.ts`).

### `src/domain/maturity.ts` — DP-04 · SPEC §6, recette 5

```ts
export const REOPENING_WINDOW_DAYS: number;   // 30
export const CLEAN_WINDOW_DAYS: number;       // 60
export function maturityDate(closedAt: string): string;            // closedAt + 60 j
export function isMature(outcome: Outcome, now: string): boolean;
export function judgeable(outcomes: readonly Outcome[], now: string): readonly Outcome[];
```

- Un ticket clos hier n'est pas jugeable : il sort du taux (recette 5). La
  fenêtre de clôture propre est 60 jours, celle de réouverture 30.
- Cas limites §21 : ticket toujours ouvert (`closedAt` vide) → jamais jugeable.

### `src/domain/privacy.ts` — DP-17 · SPEC §7 règle 8, recette 11

```ts
export const MIN_PEOPLE: number;                              // 3
export function maskCohort(peopleCount: number): boolean;      // < 3 → masquée
export function reportablePeopleCount(peopleCount: number): number; // 0 si masquée
export function unknownShare(involvements: readonly Involvement[]): ProportionStat;
```

- Moins de trois personnes → cohorte masquée : aucun chiffre, `peopleCount`
  rendu à `0` (SPEC §18 : `people_count` ne sert **qu'à** masquer).
- `unknownShare` sert au bandeau « 41 % des tickets sont d'implication
  inconnue » (SPEC §5) ; `unknown` n'est jamais compté dans un bras (DP-03).

---

## L2 — `src/domain/involvement.ts`, `signatures.ts`, `outcome.ts`, `review.ts`

Les **faits mesurés**. Ce lot ne décide rien : il produit des `Involvement`,
`CommitFact`, `ReviewFact`, `Outcome` conformes.

### `src/domain/involvement.ts` — DP-01, DP-03 · SPEC §5, recettes 1, 2, 3

```ts
export function fromDeclaration(decl: InvolvementDeclaration, at: string): SourceCandidate;
export function fromBotAuthor(facts: readonly CommitFact[]): SourceCandidate | null;
export function fromCommitMention(facts: readonly CommitFact[], at: string): SourceCandidate | null;
export function fromClosureField(value: string): SourceCandidate | null;
export function fromAdoptionDate(closedAt: string, adoptionDate: string): SourceCandidate;
export function bestCandidate(candidates: readonly SourceCandidate[]): SourceCandidate | null;
export function resolveInvolvement(issueId: string, candidates: readonly SourceCandidate[],
  decidedAt: string, client: string, model: string, sessionRef: string): Involvement | null;
export function signedShare(facts: readonly CommitFact[]): number;
```

- `bestCandidate` retient la source la **plus sûre** disponible
  (`SOURCE_ORDER` : déclaration MCP 1 → compte robot 2 → mention 3 → champ de
  clôture 4 → date d'adoption 5) et l'expose : la source retenue est toujours
  affichée (DP-01).
- Aucune source → `null` : l'appelant écrit `level: 'unknown'`, jamais
  `'none'` (DP-03, recette 2). Un ticket clos **avant** la date d'adoption
  tombe dans le bras « sans agent » (recette 3).
- Cas limites §21 : commits mêlés → niveau déclaré s'il existe, sinon
  `assisted`, avec `signedShare` affichée ; agent muet et non signataire →
  `unknown` ; ticket sans commit → nature `NATURE_NO_CODE`, hors cohortes de code.

### `src/domain/signatures.ts` — DP-02 · SPEC §5 « Les mentions de commit »

```ts
export function defaultPatterns(): readonly SignaturePattern[];
export function normalizeMessage(message: string): string;   // NFC, fins de ligne unifiées
export function scanMessage(input: SignatureScanInput): SignatureMatch;
export function matchesAny(message: string, patterns: readonly SignaturePattern[]): SignatureMatch;
```

- Catalogue **réglable** (table `signature_pattern`) : une expression, un nom
  d'agent, `enabled`, `seenCount`. `scanMessage` applique seulement les motifs
  `enabled`, du plus spécifique au plus général, et rend le premier `match`.
- Le message est lu puis **jeté** : rien de son texte n'est stocké ni journalisé
  (SPEC §17 « Ce que l'app conserve »). Motif invalide → ignoré, jamais une
  exception.
- `seenCount` est incrémenté par l'adaptateur (`SignatureStore.recordSeen`),
  pas ici : le domaine reste pur.

### `src/domain/outcome.ts` — DP-04 · SPEC §6, recettes 4, 5

```ts
export function leadTimeHours(history: StatusHistory, waiting: readonly string[]): number;
export function hadReopening(reopenings: readonly ReopeningFact[], closedAt: string): boolean;
export function countCausedBugs(links: readonly IssueLink[], closedAt: string): number;
export function countIncidents(links: readonly IssueLink[]): number;
export function isClean(reopened: boolean, causedBugs: number, incidents: number): boolean;
export function computeOutcome(issueId: string, history: StatusHistory,
  links: readonly IssueLink[], reopenings: readonly ReopeningFact[],
  waiting: readonly string[]): Outcome;
```

- Délai : du **premier** passage « En cours » à la clôture, **heures**, statuts
  d'attente retirés (paramètre `waiting`, réglable par projet).
- Réouverture sous 30 jours, **hors** réouvertures administratives
  (`ReopeningFact.counts === false` quand elles durent moins de dix minutes) ;
  une réouverture exclut la clôture propre (recette 4).
- `clean` = ni réouverture, ni bug causé, ni incident dans les 60 jours ; le
  **bug voisin** (`neighborBugs`) n'entre **jamais** dans `clean` (SPEC §6).
- Cas limites §21 : équipe qui ne relie jamais ses bugs → `clean` repose sur
  réouvertures et incidents ; l'écran de couverture le signale (L8).

### `src/domain/review.ts` — DP-05 · SPEC §6 « Relecture »

```ts
export function changesRequested(reviewers: readonly GraphReviewer[]): number;
export function reviewFact(issueId: string, pr: GraphPullRequest): ReviewFact;
export function reviewLoad(facts: readonly ReviewFact[]): number;
```

- Le graphe ne donne que l'**avis actuel** de chaque relecteur : on compte les
  `changes-requested` et on approxime les allers-retours par les commentaires et
  les commits ajoutés après l'ouverture (SPEC §6, §19).
- `reviewLoad` = moyenne de `reviewerCount + changesRequested + commentCount` ;
  affiché à côté du taux, jamais utilisé seul pour conclure.
- Aucun identifiant de relecteur ne sort : `GraphReviewer.accountId` ne sert
  qu'à **compter des distincts** (DP-17, recette 12).

---

## L3 — `src/domain/nature.ts`, `cohort.ts`, `epochs.ts`

La **comparabilité** : même nature, même zone, même taille (règle 1), une
époque à la fois (règle 6).

### `src/domain/nature.ts` — DP-06 · SPEC §14 DP-06, §17, §19

```ts
export function contentHash(text: string): string;
export function natureFromLabels(labels: readonly string[], issueType: string): Nature | null;
export function classifyByRules(ticket: JiraTicket): IssueClass | null;
export function classifyWithModel(ticket: JiraTicket, proposal: NatureClassification,
  contentHash: string): IssueClass;
export function sizeFromStoryPoints(storyPoints: number | null,
  sizes: readonly Size[]): { readonly size: Size; readonly estimated: boolean };
export function zoneOf(ticket: JiraTicket): Zone;
```

- **Règles d'abord**, modèle ensuite, résultat **conservé** par empreinte du
  texte (`contentHash` → `IssueClassStore.getByContentHash`, DP-06) : un même
  texte n'est jamais classé deux fois.
- `classifiedBy` vaut `'rules' | 'model' | 'manual'` ; l'écran de réglages
  affiche `rationale` du modèle.
- `sizeFromStoryPoints` : taille absente → estimée (`estimated = true`), ce que
  le SPEC §19 autorise explicitement ; `storyPoints` nul ne casse rien.
- Cas limites §21 : ticket sans commit (configuration, doc) →
  `NATURE_NO_CODE`, hors des cohortes de code.

### `src/domain/cohort.ts` — DP-07 · SPEC §7 règle 1, §4 « Cohorte »

```ts
export function cohortKeyOf(issueClass: IssueClass, level: CohortLevel): CohortKey;
export function widen(key: CohortKey): CohortKey | null;      // via COHORT_FALLBACK
export function armOf(level: Level): Arm | null;               // 'unknown' → null
export function cohortKeyString(key: CohortKey): string;       // sérialisation stable
export function parseCohortKey(value: string): CohortKey | null;
export function isInCohort(key: CohortKey, issueClass: IssueClass): boolean;
```

- `armOf` est le garde-fou de DP-03 : `unknown` rend `null` et le ticket **sort**
  des deux bras ; il n'est jamais rangé du côté humain.
- `widen` remonte d'un niveau (`nature-zone-size` → `nature-size` → `nature`)
  quand la cohorte est trop petite, et **le dit** : le niveau fait partie de la
  clé, donc l'élargissement est visible, pas silencieux (règle 1).
- `cohortKeyString` / `parseCohortKey` sont le format de la colonne
  `cohort_key` (SPEC §18) : L5 et L8 en dépendent, leur sortie doit rester
  stable (ordre des champs : niveau, nature, zone, taille ; `null` → `-`).

### `src/domain/epochs.ts` — DP-22 · SPEC §7 règle 6, recette 14

```ts
export function epochAt(epochs: readonly Epoch[], at: string): Epoch | null;
export function currentEpoch(epochs: readonly Epoch[]): Epoch | null;
export function isOutdated(epoch: Epoch, current: Epoch | null): boolean;
export function opensNewEpoch(previous: Epoch, client: string, model: string,
  instructionsVersion: string): boolean;
```

- `epochAt` : la dernière époque dont `startsAt <= at` ; avant la première →
  `null` (les chiffres restent visibles, grisés).
- `opensNewEpoch` : un changement d'**outil**, de **modèle** ou de **version de
  consignes** ouvre une époque (recette 14) ; on ne recalcule jamais un agrégat
  à cheval sur deux époques.
- Cas limites §21 : changement de modèle en cours de fenêtre → nouvelle époque,
  anciens chiffres conservés et grisés (`CohortEpoch.outdated`).

---

## L4 — `src/domain/recommendation.ts`, `decision.ts`, `calibration.ts`, `trial.ts`

### `src/domain/recommendation.ts` — DP-11, DP-12 · SPEC §8

```ts
export function guardrails(hasOpenIncident: boolean, zone: Zone,
  sensitiveZones: readonly Zone[], hasAcceptanceCriteria: boolean): readonly Guardrail[];
export function recommendFrom(conclusion: Conclusion, balance: Balance,
  guardrails: readonly Guardrail[], delayBetter: boolean): Recommendation;
export function confidenceOf(agent: ProportionStat | null, human: ProportionStat | null,
  conclusion: Conclusion): Confidence;
export function conditionsFor(value: Recommendation, settings: ProjectSettings): readonly string[];
export interface RecommendationDeps {
  readonly settings: SettingsStore; readonly epochs: EpochStore;
  readonly cohorts: CohortStatStore; readonly classes: IssueClassStore;
  readonly outcomes: OutcomeStore; readonly involvements: InvolvementStore;
  readonly recommendations: RecommendationStore; readonly decisions: DecisionStore;
  readonly reviews: ReviewFactStore; readonly clock: Clock;
}
export function createRecommendationEngine(deps: RecommendationDeps): RecommendationEngine;
```

- `recommendFrom` applique la **table du SPEC §8** : conclusion `better`/`same`
  et délai au moins égal → `delegate` ; délai meilleur mais clôture en retrait
  ou relecture plus lourde → `delegate-with-review` ; `worse` **établi** →
  `keep-human` ; sous le seuil, bras déséquilibrés ou `not-enough-data` →
  `not-enough-data`. Un `guardrails` non vide **interdit `delegate`** : au mieux
  `delegate-with-review` (DP-12, recette 9).
- `createRecommendationEngine` est **le point de passage unique** (interface
  `RecommendationEngine`, `src/ports.ts`) : la carte du ticket, l'outil MCP et
  la carte de délégation lisent la **même** ligne (SPEC §20, §16.1).
- Aucun écran ne recalcule une recommandation : il appelle
  `deps.<engine>.read(key)`.
- Cas limites §21 : recommandation ignorée et bon résultat → comptée dans la
  calibration comme le reste (`decision.ts`).

### `src/domain/decision.ts` — DP-13 · SPEC §8 « Un avis, pas un ordre »

```ts
export function followed(card: RecommendationCard | null,
  taken: 'delegate' | 'keep-human'): boolean;
export function recordDecision(issueId: string, taken: 'delegate' | 'keep-human',
  reason: string, card: RecommendationCard | null, actualLevel: Level, at: string): Decision;
```

- Enregistre la décision **et** si elle a suivi l'avis ; `followed` est `true`
  quand `delegate` suit `delegate`/`delegate-with-review`, ou que `keep-human`
  suit `keep-human`/`not-enough-data`.
- La décision ne bloque rien, ne note personne : elle nourrit la calibration.
- Carte absente (`null`) → `followed = false` et la décision est quand même
  conservée (données absentes = normales).

### `src/domain/calibration.ts` — DP-21 · SPEC §10

```ts
export function calibrate(projectId: string, epochId: string, value: Recommendation,
  cleanCount: number, n: number): Calibration;
export function adviceAddsNothing(rows: readonly Calibration[]): boolean;
export function confidenceGap(delegate: ProportionStat, keep: ProportionStat): number;
```

- Une ligne par recommandation donnée, avec `{ n, clean }` — donc effectif et
  fourchette (SPEC §10).
- `adviceAddsNothing` : `true` quand « à confier » ne bat **pas nettement**
  « à garder » (fourchettes qui se recouvrent) ; l'écran « Peut-on croire cette
  app ? » l'affiche en tête et l'app élargit `not-enough-data` (SPEC §10).

### `src/domain/trial.ts` — DP-27 · SPEC §11, recette 16

```ts
export function isEligible(hasAcceptanceCriteria: boolean, zone: Zone,
  sensitiveZones: readonly Zone[], urgent: boolean): boolean;
export function draw(trial: Trial, issueId: string, randomness: Randomness): TrialAssignment;
export function enforceCompliance(assignment: TrialAssignment, actualArm: Arm): TrialAssignment;
export function stopReason(trial: Trial, now: string, gapEstablished: boolean,
  reopenings: Readonly<Record<Arm, number>>): string;
```

- `draw` est **reproductible** : même `trial.seed` + même `issueId` → même bras
  (`Randomness` est injecté, `src/ports.ts`). Le tirage s'affiche sur le ticket.
- `enforceCompliance` : tirage non respecté → `complied = false`,
  `excludedReason` renseigné, le ticket **sort** de l'essai (recette 16).
- `stopReason` : écart établi, date prévue atteinte, ou un bras qui accumule
  les réouvertures (seuil paramétré) ; chaîne vide = l'essai continue. Seul
  chiffre qualifié de « prouvé » : celui de l'essai (SPEC §7, METHODE.md §9).

---

## 3. Ce que les lots L1–L4 reçoivent des autres

| Besoin | Fourni par | Gestuelle |
|---|---|---|
| toute proportion, toute médiane | L1 `stats.ts` | `proportion`, `medianDuration` |
| toute comparaison de deux bras | L1 `conclusion.ts` | `conclude` |
| déséquilibre de composition | L1 `balance.ts` | `compareBalance` |
| jugeabilité d'un ticket | L1 `maturity.ts` | `isMature`, `judgeable` |
| masquage des cohortes étroites | L1 `privacy.ts` | `maskCohort` |
| implication d'un ticket | L2 `involvement.ts` | `resolveInvolvement`, `bestCandidate` |
| mentions de commit | L2 `signatures.ts` | `scanMessage` |
| résultat d'un ticket | L2 `outcome.ts` | `computeOutcome` |
| relecture | L2 `review.ts` | `reviewFact`, `reviewLoad` |
| nature, zone, taille | L3 `nature.ts` | `classifyByRules`, `classifyWithModel` |
| clé de cohorte, élargissement | L3 `cohort.ts` | `cohortKeyOf`, `widen`, `armOf`, `cohortKeyString` |
| époque d'une date | L3 `epochs.ts` | `epochAt`, `isOutdated` |
| carte d'un ticket | L4 `recommendation.ts` | `createRecommendationEngine` → `compute` / `read` / `map` |
| décision prise | L4 `decision.ts` | `recordDecision` |
| justesse de l'app | L4 `calibration.ts` | `calibrate`, `adviceAddsNothing` |
| essai contrôlé | L4 `trial.ts` | `draw`, `enforceCompliance` |

Un besoin qui ne figure pas ici ne s'invente pas dans un lot : il se signale
en `CONTRACT-NEEDED: <module>.<fonction>` dans la réponse de l'agent (§6).

## 4. Conventions de test (tous les lots)

- `tests/<zone>/<module>.test.ts`, miroir exact de `src/` ;
- fakes partagés dans `tests/helpers/` (`fakeClock`, `fakeStore`, `fakeJira`,
  `fakeGraph`) : on les **utilise**, on ne les recopie pas ;
- horloge et aléa injectés : aucun test ne dépend de `Date.now()` ;
- les trois jeux de Wilson (34/41, 32/37, 18/26) ont un test nommé d'après le
  comportement, dans `tests/domain/stats.test.ts` ;
- un test par point de recette du SPEC §22 concerné, nommé `recette-01` …
  `recette-16`.

## 5. Règle de gel — à lire avant d'écrire une ligne

**Aucun lot ne modifie `src/types.ts`, `src/types-advice.ts`,
`src/types-graph.ts`, `src/types-mcp.ts`, `src/types-persistence.ts` ni
`src/ports.ts`.** Un besoin nouveau (un champ, un port, une constante) se
signale en `CONTRACT-NEEDED: <fichier>.<symbole> — <raison>` dans la réponse
finale de l'agent ; il est ensuite traité par une PR dédiée dont le corps porte
`CONTRACT-CHANGE`. En attendant, le lot travaille avec les types existants, ou
déclare son type auxiliaire **dans son propre module** (famille 2, §0).
