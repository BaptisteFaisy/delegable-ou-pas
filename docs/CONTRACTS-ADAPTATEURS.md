# CONTRAT — « Délégable ou pas ? » (adaptateurs, lots L5 à L9)

> Document **gelé**, écrit par le lot L0b. Suite de
> [`CONTRACTS.md`](CONTRACTS.md), qui couvre le **domaine** (lots L1 à L4) et
> donne les règles communes. Ce fichier couvre les **adaptateurs** : base,
> collecte, outils MCP et déclencheurs, écrans et messages, jeu de démonstration.
>
> Les deux fichiers se lisent ensemble : mêmes règles, même vocabulaire, même
> règle de gel. Le « quoi » est dans le
> [cahier des charges](CAHIER-DES-CHARGES.md) (`SPEC §n`) ; la statistique
> opposable dans [METHODE.md](METHODE.md).

## 0. Rappel des règles qui pèsent le plus sur ces lots

- **un fichier < 500 lignes, une fonction < 50 lignes** ;
- **zéro duplication** : un adaptateur n'implémente pas la logique métier, il
  appelle le domaine (L1–L4). Un calcul qui existe dans `src/domain/` ne se
  réécrit **jamais** dans `src/collect/`, `src/db/` ou `src/viewmodel/` ;
- **imports avec extension `.js`** (`from '../types.js'`) ;
- **données absentes = normales** : `null` / `[]`, jamais d'exception « pas
  encore là » ; un droit manquant sur le graphe **vide** le résultat au lieu de
  lever (SPEC §19, recette 15) ;
- **aucune personne** : aucun écran, aucun outil, aucune table de statistiques
  ne contient ou ne rend un identifiant de personne (SPEC §18 dernière ligne,
  DP-17, recette 12) ;
- **aucune liste sans `LIMIT`**, aucune requête sans `WHERE` (SPEC §18, §19 :
  5 s par SELECT, 1 Gio par installation) ;
- le domaine est le seul endroit du calcul : ces lots **orchestrent**.

## 1. Ce que les lots L5–L9 n'ont pas le droit de changer

`src/types.ts`, `src/types-advice.ts`, `src/types-graph.ts`,
`src/types-mcp.ts`, `src/types-persistence.ts`, `src/ports.ts` : **gelés**.
Un besoin nouveau se signale en `CONTRACT-NEEDED: <fichier>.<symbole> —
<raison>` et attend une PR dédiée `CONTRACT-CHANGE`.

---

## L5 — `src/db/**` · persistance Forge SQL (SPEC §18, §17 ; DP-13, DP-18, DP-19)

Le seul lot qui écrit du SQL. Écrans et outils lisent la base **par ces
fabriques**, jamais par une requête écrite ailleurs.

### `src/db/schema.ts` — DDL, SPEC §18

```ts
export const DDL: readonly string[];                  // une instruction par table
export function ddlFor(table: TableName): string;     // instruction de création
```

- Crée les **seize** tables de `TABLE_NAMES` : les quatorze du SPEC §18, plus
  `settings` (SPEC §16.5) et `coverage` (SPEC §16.6, DP-19), déclarées dans
  `src/types-persistence.ts`.
- Colonnes identiques aux lignes de `src/types-persistence.ts`, `snake_case`,
  JSON en `TEXT` ; `ddlFor` est idempotent (`IF NOT EXISTS`) pour que le
  démarrage puisse le rejouer.
- Aucune colonne ne contient un identifiant de personne, ni dans
  `cohort_stat` (`people_count` ne sert qu'à masquer), ni ailleurs.

### `src/db/sql-client.ts` — façade Forge SQL

```ts
export interface SqlClient {
  execute(statement: string, parameters?: readonly unknown[]): Promise<void>;
  query<T>(statement: string, parameters?: readonly unknown[]): Promise<T[]>;
}
export interface DdlRunner {
  ensureSchema(ddl: readonly string[]): Promise<void>;
}
export function createSqlClient(deps: { readonly sql: unknown }): SqlClient;
```

- Seul point d'entrée du SQL : les fabriques reçoivent un `SqlClient`, jamais
  `@forge/api` directement — c'est ce qui rend la persistance testable hors
  Forge (fakes dans `tests/helpers/`).
- `@forge/api` n'apparaît **que** dans ce fichier pour la couche SQL.

### `src/db/rows.ts` — lecture bornée

```ts
export const DEFAULT_LIMIT: number;                            // 200
export function selectList<T>(client: SqlClient, statement: string,
  parameters: readonly unknown[], limit: number): Promise<T[]>;
```

- Refuse (erreur de développement, pas de production) une requête sans `LIMIT`
  et applique `DEFAULT_LIMIT` quand l'appelant n'en donne pas.

### `src/db/mapping.ts` + `src/db/mapping-*.ts` — aller-retour ligne ↔ objet

```ts
export function toInvolvement(row: InvolvementRow): Involvement;
export function toOutcomeRow(outcome: Outcome): OutcomeRow;
export function toCohortStat(row: CohortStatRow): CohortStat;      // clé incluse
export function encodeEvidence(evidence: readonly string[]): string;  // JSON stable
export function decodeEvidence(json: string): readonly string[];
```

- Un fichier de mapping par famille, pour rester sous 500 lignes
  (`mapping-involvement.ts`, `mapping-outcome.ts`, `mapping-stats.ts`,
  `mapping-advice.ts`, `mapping-collection.ts`), et **un seul** helper de
  décodage JSON partagé.
- Booléens stockés en `0`/`1`, dates en ISO 8601 UTC, `null`/vide préservé à
  l'identique : un aller-retour ne perd rien (propriété testée).

### Fabriques de magasins — une par port de `src/ports.ts`

```ts
export function createInvolvementStore(client: SqlClient): InvolvementStore;
export function createSignatureStore(client: SqlClient): SignatureStore;
export function createCommitFactStore(client: SqlClient): CommitFactStore;
export function createReviewFactStore(client: SqlClient): ReviewFactStore;
export function createOutcomeStore(client: SqlClient): OutcomeStore;
export function createIssueClassStore(client: SqlClient): IssueClassStore;
export function createEpochStore(client: SqlClient): EpochStore;
export function createCohortStatStore(client: SqlClient): CohortStatStore;
export function createRecommendationStore(client: SqlClient): RecommendationStore;
export function createDecisionStore(client: SqlClient): DecisionStore;
export function createCalibrationStore(client: SqlClient): CalibrationStore;
export function createTrialStore(client: SqlClient): TrialStore;
export function createGraphCursorStore(client: SqlClient): GraphCursorStore;
export function createSettingsStore(client: SqlClient): SettingsStore;
export function createCoverageStore(client: SqlClient): CoverageStore;
export function createStores(client: SqlClient): Stores;   // l'objet complet
```

- Chaque fabrique rend **exactement** le port correspondant, ni plus ni moins :
  c'est le contrat que le domaine consomme. `createStores` assemble l'ensemble
  (`Stores`, type du module, un champ par port, même nom en `camelCase`).
- `CohortStatStore.listByCohort` rend **les deux bras** d'une cohorte pour une
  époque ; `lastComputedAt` alimente « âge du cache » (SPEC §20).
- `selectList` + `LIMIT` partout ; les `COUNT` de `InvolvementStore.countKnown`
  / `countTotal` sont des agrégats sans identifiant.
- Cas limites §21 : « ticket déplacé de projet » → `issue_id` reste la clé, la
  cohorte change ; `IssueClassStore.getByContentHash` évite de reclasser.

### `src/db/repo.ts`

```ts
export function createRepository(client: SqlClient): Promise<Stores>;
```

- `ensureSchema` puis `createStores` ; appelé une fois par `src/deps.ts` (L7).

---

## L6 — `src/collect/**` · les quatre chaînes de collecte (SPEC §17, §19)

Ce lot est le **seul** autorisé à importer `@forge/api` et `@forge/llm`. Il
produit des faits bruts (`src/types-graph.ts`) et laisse tout calcul au domaine.

### `src/collect/jira.ts` — chaîne « Historique Jira »

```ts
export function createJiraGateway(api: unknown): JiraGateway;
```

- Implémente `JiraGateway` (`src/ports.ts`) : tickets, historique de statuts,
  liens, composants, étiquettes, description ADF, champs personnalisés, tickets
  de sprint. Un ticket absent → `null` ; un champ vide → `''`.
- Écrit seulement les **deux** champs que l'app possède (SPEC §17, DP-23,
  DP-25) ; un refus d'écriture rend `false`, jamais une exception.
- Toute recherche passe par `searchJql(jql, limit)` : `limit` obligatoire.

### `src/collect/graph.ts` — chaîne « Graphe » (session d'un utilisateur)

```ts
export function createGraphGateway(api: unknown): GraphGateway;
export function createCollector(deps: CollectorDeps): Consumer;
export interface CollectorDeps {
  readonly graph: GraphGateway; readonly jira: JiraGateway;
  readonly signatures: SignatureStore; readonly commits: CommitFactStore;
  readonly reviews: ReviewFactStore; readonly cursors: GraphCursorStore;
  readonly clock: Clock;
}
```

- Le graphe ne se lit qu'au nom d'un utilisateur : `createCollector` travaille
  **par tranches** (`CollectionJob.sliceSize`), enregistre le curseur
  (`GraphCursorStore`) et reprend là où il s'est arrêté (DP-18).
- Un droit manquant **vide** les listes au lieu de lever (SPEC §19) ;
  `probePermission` teste un ticket dont la réponse est connue, pour distinguer
  « pas de droit » de « pas de données » (recette 15).
- Le message de commit est lu, passé à `scanMessage` (L2), puis **jeté** : seul
  `CommitFact` (mention trouvée ou non, nom d'agent) est stocké (SPEC §17).
- Chemin imposé : ticket → commit → PR → relecteurs ; aucune relation directe
  ticket → PR n'existe (SPEC §17).

### `src/collect/nature.ts` — chaîne « Nature »

```ts
export function createNatureClassifier(deps: NatureClassifierDeps): NatureClassifier;
export interface NatureClassifierDeps {
  readonly llm: LlmGateway; readonly classes: IssueClassStore;
  readonly settings: SettingsStore;
}
export interface NatureClassifier {
  classify(ticket: JiraTicket): Promise<IssueClass>;
}
```

- Règles d'abord (`classifyByRules`, L3), modèle ensuite
  (`classifyWithModel`), résultat conservé par `contentHash` : un ticket déjà
  classé n'appelle **jamais** le modèle deux fois (DP-06, SPEC §17).

### `src/collect/llm.ts`

```ts
export function createLlmGateway(llm: unknown): LlmGateway;
```

- Deux appels seulement : `classifyNature` (DP-06) et
  `summarizeFailureCauses` (SPEC §12, DP-26). Le modèle voit un texte, l'app
  garde un résultat ; aucun texte de ticket n'est journalisé.

### `src/collect/outcomes.ts` — chaîne « Résultats »

```ts
export function createOutcomeCollector(deps: OutcomeCollectorDeps): OutcomeCollector;
export interface OutcomeCollectorDeps {
  readonly jira: JiraGateway; readonly outcomes: OutcomeStore;
  readonly clock: Clock;
}
export interface OutcomeCollector {
  refresh(issueIds: readonly string[]): Promise<readonly Outcome[]>;
}
```

- Appelle `computeOutcome` (L2) — il ne recalcule **rien** lui-même — puis
  enregistre ; `matureAt` vient de `maturityDate` (L1).

---

## L7 — `src/actions/**`, `src/handlers/**`, `src/index.ts`, `src/deps.ts`

### `src/deps.ts` — le graphe de dépendances

```ts
export interface Deps {
  readonly stores: Stores; readonly jira: JiraGateway; readonly graph: GraphGateway;
  readonly llm: LlmGateway; readonly engine: RecommendationEngine;
  readonly settings: SettingsStore; readonly clock: Clock;
  readonly random: Randomness; readonly logger: Logger; readonly ids: IdGenerator;
}
export function buildDeps(runtime: unknown): Promise<Deps>;
```

- **Un seul** assemblage : tout handler reçoit `Deps`, rien ne s'instancie
  ailleurs. C'est ce qui rend les tests d'actions possibles sans Forge.
- `engine` vient de `createRecommendationEngine` (L4) : point de passage unique.

### `src/actions/tools.ts` — les neuf outils du SPEC §15

```ts
export function shouldDelegate(deps: Deps, input: ShouldDelegateInput): Promise<McpResult<ShouldDelegateOutput>>;
export function listDelegableWork(deps: Deps, input: ListDelegableWorkInput): Promise<McpResult<ListDelegableWorkOutput>>;
export function getDelegationEvidence(deps: Deps, input: GetDelegationEvidenceInput): Promise<McpResult<GetDelegationEvidenceOutput>>;
export function getDelegationMap(deps: Deps, input: GetDelegationMapInput): Promise<McpResult<GetDelegationMapOutput>>;
export function getCohort(deps: Deps, input: GetCohortInput): Promise<McpResult<GetCohortOutput>>;
export function getCalibration(deps: Deps, input: GetCalibrationInput): Promise<McpResult<GetCalibrationOutput>>;
export function recordInvolvement(deps: Deps, input: RecordInvolvementInput): Promise<McpResult<RecordInvolvementOutput>>;
export function recordDecision(deps: Deps, input: RecordDecisionInput): Promise<McpResult<RecordDecisionOutput>>;
export function reportTakeover(deps: Deps, input: ReportTakeoverInput): Promise<McpResult<ReportTakeoverOutput>>;
```

- Chaque outil rend `McpResult<T>` : `ok`, `error` court, `data` ou `null`.
  Jamais d'exception qui sorte (SPEC §20).
- **Aucun** outil n'accepte ni ne rend un nom de personne (recette 12) ;
  `listDelegableWork` ne rend **que** des `delegate`, du plus sûr au moins sûr
  (recette 13).
- Les lectures délèguent à `deps.engine` (`read` / `map`) : elles ne
  recalculent rien, elles lisent le cache (SPEC §20 « moins de 2 s »).

### `src/actions/dispatch.ts` — `rovo:mcp` et `action`

```ts
export function createDispatch(deps: Deps): (payload: unknown) => Promise<unknown>;
```

- Un seul résolveur `@forge/resolver` pour les neuf outils, routé par
  `McpToolKey` ; `MCP_TOOL_VERBS` fixe le verbe (`GET` lecture, `CREATE` /
  `UPDATE` écriture) — un agent lancé par automatisation n'appelle que des
  `GET` (SPEC §19 « Action »).

### `src/handlers/*.ts` — déclencheurs

```ts
export function onIssueCreated(deps: Deps, event: unknown): Promise<void>;   // avi:jira:created:issue
export function onIssueUpdated(deps: Deps, event: unknown): Promise<void>;   // avi:jira:updated:issue
export function onScheduled(deps: Deps): Promise<void>;                      // résultats mûrs, cohortes
export function onSprintAction(deps: Deps, payload: unknown): Promise<unknown>;
export function resolveIssuePanel(deps: Deps, payload: unknown): Promise<unknown>;
export function resolveProjectPage(deps: Deps, payload: unknown): Promise<unknown>;
export function resolveSettingsPage(deps: Deps, payload: unknown): Promise<unknown>;
```

- Planifié : recalcule cohortes, conclusions, recommandations, calibration —
  puis met le cache à jour (`lastComputedAt`). Sous 900 s (SPEC §19).
- Événements : rafraîchissent l'implication et le résultat du ticket touché,
  sans jamais bloquer l'édition de l'utilisateur.
- Un écran qui n'a pas encore de chiffres rend un état vide explicite
  (« pas encore de données »), jamais une erreur.

### `src/index.ts`

```ts
export const handler: (event: unknown) => Promise<unknown>;
export default handler;
```

- Câblage Forge : instancie `Deps` et route vers `src/handlers/` et
  `src/actions/dispatch.ts`. Aucune logique métier ici.

---

## L8 — `src/viewmodel/**`, `src/ui/**`, `src/i18n/**` (SPEC §16, recette 10)

### `src/viewmodel/*.ts` — pur, testable sans rendu

```ts
export interface CardView {
  readonly title: string; readonly recommendation: Recommendation;
  readonly cohortLine: string; readonly cell: MapColor;
  readonly agent: ProportionStat | null; readonly human: ProportionStat | null;
  readonly medianLine: string; readonly referenceKeys: readonly string[];
  readonly conditions: readonly string[]; readonly confidence: Confidence;
  readonly guardrails: readonly Guardrail[]; readonly demo: boolean;
}
export function cardView(card: RecommendationCard | null, t: Translate): CardView;
export function mapView(map: DelegationMap, t: Translate): MapView;
export function coverageView(coverage: Coverage | null, t: Translate): CoverageView;
export function calibrationView(rows: readonly Calibration[], adviceAddsNothing: boolean,
  t: Translate): CalibrationView;
export function sprintView(items: readonly DelegableWorkItem[], t: Translate): SprintView;
```

- Chaque vue est une **projection** : elle ne calcule ni taux ni médiane, elle
  formate ce que le domaine a produit. `null` → vue vide explicite.
- `Translate` est le type de `src/i18n/index.ts` (§ ci-dessous) : toutes les
  chaînes visibles viennent de là, en anglais **et** en français (SPEC §20).
- Recette 10 : aucun `CardView` ne peut être construit sans `agent`/`human`
  portant `n` et fourchette — le type l'impose, les tests le vérifient.

### `src/i18n/index.ts` et `src/i18n/{en,fr}.ts`

```ts
export type Lang = 'en' | 'fr';
export type Translate = (key: MessageKey, params?: Readonly<Record<string, string | number>>) => string;
export type MessageKey = keyof typeof MESSAGES_EN;
export const MESSAGES_EN: Readonly<Record<string, string>>;
export const MESSAGES_FR: Readonly<Record<string, string>>;
export function translate(lang: Lang, key: MessageKey, params?: Readonly<Record<string, string | number>>): string;
export function createTranslator(lang: Lang): Translate;
```

- **Toute** chaîne visible existe dans les deux dictionnaires : un test compare
  les clés de `MESSAGES_EN` et `MESSAGES_FR` et échoue sur la différence
  (SPEC §20). Une clé manquante rend la clé, jamais `undefined`.
- Les quatre conclusions et les quatre recommandations ont chacune leur
  libellé, y compris « on ne sait pas » / « we don't know » (SPEC §7 règle 4).

### `src/ui/*.tsx` — composants `@forge/react`

```ts
export function RecommendationCardView(props: { readonly view: CardView }): unknown;
export function DelegationMapView(props: { readonly view: MapView }): unknown;
export function CoverageView(props: { readonly view: CoverageView }): unknown;
export function CalibrationView(props: { readonly view: CalibrationView }): unknown;
export function SprintView(props: { readonly view: SprintView }): unknown;
```

- Composants **muets** : ils affichent une vue, ils ne décident rien. Un
  fichier par écran, sous 500 lignes ; un composant réutilisé (`StatLine`,
  `GreyBadge`) vit une seule fois.
- Le mode démonstration est visible partout (`demo: true` → bandeau), DP-20.

---

## L9 — `src/sample/**` · jeu de démonstration (SPEC §13, §24, DP-20)

```ts
export const SAMPLE_PROJECT_KEY: string;          // 'PROJ'
export function sampleSettings(): ProjectSettings;
export function sampleEpochs(): readonly Epoch[];
export function sampleTickets(): readonly JiraTicket[];
export function sampleCommitFacts(): readonly CommitFact[];
export function sampleReviewFacts(): readonly ReviewFact[];
export function sampleOutcomes(): readonly Outcome[];
export function sampleInvolvements(): readonly Involvement[];
export function sampleClasses(): readonly IssueClass[];
export function sampleCards(): readonly RecommendationCard[];
export function sampleTrial(): Trial;
export const SAMPLE_IS_MARKED_AS_DEMO: true;      // DEMO_FLAG / DEMO_DATASET_LABEL
```

- Douze mois, trois époques, un projet peuplé de tickets : les juges doivent
  voir la carte du ticket, la carte de délégation, le détail des cohortes et la
  calibration (SPEC §24).
- Les chiffres du jeu sont la **source unique** des nombres cités dans les
  documents de démo : aucun nombre n'est écrit à la main dans un document, les
  tests comparent le document au jeu.
- Les tickets du jeu ne portent **aucun nom de personne** ; les cohortes
  portées par moins de trois personnes sont déjà masquées (DP-17).
- Le mode démonstration est reconnaissable partout : `demo: true`, bandeau,
  `SAMPLE_IS_MARKED_AS_DEMO` (DP-20).

---

## 2. Ordre de dépendance entre ces lots

| Lot | Peut importer | Ne peut pas importer |
|---|---|---|
| L5 | `types*`, `ports` | `src/domain/**` (la logique reste chez L1–L4) |
| L6 | `types*`, `ports`, L2, L3 | UI, actions |
| L7 | tout le domaine (L1–L4), L5, L6 | UI |
| L8 | `types*`, `ports`, `viewmodel` | `src/db/**` direct, `src/collect/**` |
| L9 | `types*` | Forge, base, UI |

Un lot qui a besoin d'un symbole absent d'un autre lot ne l'importe pas : il
rend la donnée brute et signale `CONTRACT-NEEDED: <module>.<fonction>`.

## 3. Tests attendus de ces lots

- `tests/db/**` : aller-retour mapping, `ddlFor` idempotent, refus d'une liste
  sans `LIMIT` ;
- `tests/collect/**` : aucun réseau (fakes), curseur repris, droit manquant →
  liste vide et non exception, message de commit absent du stockage ;
- `tests/actions/**` : les neuf outils rendent `McpResult`, aucun nom de
  personne en sortie, `list-delegable-work` ne rend que des `delegate` ;
- `tests/ui/**` et `tests/i18n/**` : parité des clés en/fr, aucune vue sans
  `n` et fourchette ;
- `tests/sample/**` : les chiffres du document de démo viennent du jeu.

## 4. Rappel final — le gel

Aucun de ces lots ne modifie `src/types*.ts` ni `src/ports.ts`. Un besoin
nouveau se signale en `CONTRACT-NEEDED: <fichier>.<symbole> — <raison>` et se
traite dans une PR dédiée dont le corps porte `CONTRACT-CHANGE`.
