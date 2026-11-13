/**
 * Ports: the only boundary between the pure domain and the Forge runtime.
 *
 * The domain (`src/domain/*`) never imports `@forge/*`, never touches the
 * network, never calls `Date.now()`: everything it needs arrives through these
 * interfaces (SPEC §17, SPEC §19). Adapters (`src/db`, `src/collect`,
 * `src/actions`, `src/handlers`) implement them, so the whole decision path is
 * testable with in-memory fakes.
 *
 * The domain imports **types only** — never an adapter, never a Forge module.
 * Frozen contract: see docs/CONTRACTS.md. Rule: files < 500 lines,
 * functions < 50 lines.
 */
import type {
  Arm,
  CohortKey,
  CommitFact,
  Epoch,
  GraphObjectType,
  GraphPermission,
  GraphPermissionState,
  Involvement,
  IssueClass,
  Level,
  Nature,
  Outcome,
  ReviewFact,
  SignaturePattern,
} from './types.js';
import type {
  Calibration,
  CohortStat,
  Coverage,
  Decision,
  DelegationMap,
  ProjectSettings,
  RecommendationCard,
  Trial,
  TrialAssignment,
} from './types-advice.js';
import type {
  AdfNode,
  CollectedTicketFacts,
  CollectionSlice,
  GraphCommit,
  GraphCursor,
  GraphPullRequest,
  GraphReviewer,
  IssueLink,
  JiraTicket,
  JiraTicketSummary,
  NeighborBugFact,
  ReopeningFact,
  SeenSignature,
  StatusHistory,
} from './types-graph.js';

/* --------------------------------------------------------------- primitives */

/** Injectable clock: every timestamp of the app comes from here (SPEC §17). */
export interface Clock {
  /** Current instant, ISO 8601 UTC. */
  now(): string;
}

/** Injectable identifiers, so the tests are deterministic. */
export interface IdGenerator {
  next(prefix: string): string;
}

export interface Logger {
  log(level: 'info' | 'warn' | 'error', message: string, meta?: unknown): void;
}

/**
 * Reproducible randomness, used only by the controlled trial (SPEC §11 step 2).
 *
 * A draw depends on a seed, so re-running a trial never changes an assignment.
 */
export interface Randomness {
  /** A reproducible integer in `[0, maxExclusive)` derived from the seed. */
  nextInt(seed: string, maxExclusive: number): number;
  /** The arm drawn for one ticket of a trial, reproducible from the seed (SPEC §11). */
  drawArm(seed: string, issueId: string): Arm;
}

/* ------------------------------------------------------------------- storage */

/** Involvement of each ticket, with the source kept (SPEC §5, SPEC §18, DP-01). */
export interface InvolvementStore {
  get(issueId: string): Promise<Involvement | null>;
  save(involvement: Involvement): Promise<void>;
  /** Tickets of a project, oldest first, bounded (SPEC §19 "aucune liste sans limite"). */
  listByProject(projectId: string, limit: number): Promise<Involvement[]>;
  /** How many tickets carry a known level; feeds the coverage screen (SPEC §13, DP-19). */
  countKnown(projectId: string): Promise<number>;
  countTotal(projectId: string): Promise<number>;
}

/** The tunable catalogue of commit mentions (SPEC §5, SPEC §18, DP-02). */
export interface SignatureStore {
  list(): Promise<SignaturePattern[]>;
  listEnabled(): Promise<SignaturePattern[]>;
  save(pattern: SignaturePattern): Promise<void>;
  /** Counts a mention actually seen, so the settings screen can show it (DP-02). */
  recordSeen(patternId: string, at: string): Promise<void>;
  /** The mentions really seen on the team's commits (SPEC §5, DP-02). */
  listSeen(limit: number): Promise<SeenSignature[]>;
}

/** Commit facts: a mention found or not, and the agent name — never a message (SPEC §17). */
export interface CommitFactStore {
  listByIssue(issueId: string): Promise<CommitFact[]>;
  saveMany(facts: readonly CommitFact[]): Promise<void>;
  listByProject(projectId: string, limit: number): Promise<CommitFact[]>;
  /** Share of signed commits of a ticket, shown for mixed tickets (SPEC §21). */
  countByIssue(issueId: string): Promise<{ total: number; signed: number }>;
}

/** Review facts, read from the graph (SPEC §6 "Relecture", SPEC §18, DP-05). */
export interface ReviewFactStore {
  listByIssue(issueId: string): Promise<ReviewFact[]>;
  saveMany(facts: readonly ReviewFact[]): Promise<void>;
  listByProject(projectId: string, limit: number): Promise<ReviewFact[]>;
}

/** What happened to each ticket afterwards (SPEC §6, SPEC §18, DP-04). */
export interface OutcomeStore {
  get(issueId: string): Promise<Outcome | null>;
  save(outcome: Outcome): Promise<void>;
  listByProject(projectId: string, limit: number): Promise<Outcome[]>;
  /** Tickets that became judgeable since a date: the nightly job reads these (SPEC §6, SPEC §17). */
  listMaturedSince(projectId: string, since: string, limit: number): Promise<Outcome[]>;
}

/** Nature, zone and size of each ticket, kept by text fingerprint (SPEC §14 DP-06, SPEC §17). */
export interface IssueClassStore {
  get(issueId: string): Promise<IssueClass | null>;
  save(issueClass: IssueClass): Promise<void>;
  listByProject(projectId: string, limit: number): Promise<IssueClass[]>;
  /** Reuses a classification already made for the same text (SPEC §17 "conservées par empreinte"). */
  getByContentHash(projectId: string, contentHash: string): Promise<IssueClass | null>;
}

/** Epochs: one period per agent setup, never mixed in the figures (SPEC §7 rule 6, DP-22). */
export interface EpochStore {
  listByProject(projectId: string): Promise<Epoch[]>;
  save(epoch: Epoch): Promise<void>;
  /** The epoch a date falls in; null before the first one (SPEC §7 rule 6). */
  epochAt(projectId: string, at: string): Promise<Epoch | null>;
}

/** Cohort statistics, cached by the nightly job (SPEC §7, SPEC §17, SPEC §18). */
export interface CohortStatStore {
  /** Both arms of one cohort in one epoch (SPEC §7 rule 3). */
  listByCohort(projectId: string, epochId: string, key: CohortKey): Promise<CohortStat[]>;
  listByProject(projectId: string, epochId: string, limit: number): Promise<CohortStat[]>;
  saveMany(stats: readonly CohortStat[]): Promise<void>;
  /** When the figures were last computed; the screens show the age of the cache (SPEC §20). */
  lastComputedAt(projectId: string): Promise<string>;
}

/** Recommendation cards, cached so a ticket panel answers in under two seconds (SPEC §20, DP-11). */
export interface RecommendationStore {
  get(issueId: string): Promise<RecommendationCard | null>;
  save(card: RecommendationCard): Promise<void>;
  /** Tickets carrying one recommendation, from the most confident down (SPEC §9, recipe 13). */
  listByProject(projectId: string, value: RecommendationCard['value'], limit: number): Promise<RecommendationCard[]>;
}

/** The decision taken on a ticket, followed or not (SPEC §8, SPEC §18, DP-13). */
export interface DecisionStore {
  get(issueId: string): Promise<Decision | null>;
  save(decision: Decision): Promise<void>;
  listByProject(projectId: string, limit: number): Promise<Decision[]>;
}

/** How right the past recommendations were (SPEC §10, SPEC §18, DP-21). */
export interface CalibrationStore {
  listByProject(projectId: string, epochId: string): Promise<Calibration[]>;
  saveMany(rows: readonly Calibration[]): Promise<void>;
}

/** Controlled trials and their draws (SPEC §11, SPEC §18, DP-27). */
export interface TrialStore {
  get(trialId: string): Promise<Trial | null>;
  listByProject(projectId: string): Promise<Trial[]>;
  save(trial: Trial): Promise<void>;
  getAssignment(trialId: string, issueId: string): Promise<TrialAssignment | null>;
  saveAssignment(assignment: TrialAssignment): Promise<void>;
  listAssignments(trialId: string): Promise<TrialAssignment[]>;
}

/** Where a collection stopped, per object type (SPEC §17, SPEC §18 `graph_cursor`, DP-18). */
export interface GraphCursorStore {
  get(projectId: string, objectType: GraphObjectType): Promise<GraphCursor | null>;
  save(cursor: GraphCursor): Promise<void>;
  listByProject(projectId: string): Promise<GraphCursor[]>;
}

/** The settings of a project: threshold, adoption date, taxonomy, epochs (SPEC §16.5, SPEC §13). */
export interface SettingsStore {
  get(projectId: string): Promise<ProjectSettings | null>;
  save(settings: ProjectSettings): Promise<void>;
  /** Projects the app is installed on, bounded (SPEC §19). */
  list(limit: number): Promise<ProjectSettings[]>;
}

/** The coverage screen: known involvement, graph rights, last collection (SPEC §16.6, DP-19). */
export interface CoverageStore {
  get(projectId: string): Promise<Coverage | null>;
  save(coverage: Coverage): Promise<void>;
}

/* ------------------------------------------------------------------ gateways */

/**
 * Reads Jira, and writes back only the two custom fields the app owns
 * (SPEC §17, SPEC §16.5, DP-23, DP-25).
 *
 * A ticket that does not exist, or a field that is empty, is normal: the answer
 * is `null` or an empty list, never an exception (SPEC §20 "données absentes").
 */
export interface JiraGateway {
  getTicket(issueIdOrKey: string): Promise<JiraTicket | null>;
  /** JQL search, bounded: `list-delegable-work` and the sprint view use it (SPEC §15, DP-24). */
  searchJql(jql: string, limit: number): Promise<JiraTicketSummary[]>;
  /** Status history of a ticket: feeds delay, reopening and abandonment (SPEC §6). */
  statusHistory(issueId: string): Promise<StatusHistory>;
  /** Links of a ticket: following bugs, incidents (SPEC §6). */
  links(issueId: string): Promise<IssueLink[]>;
  components(issueId: string): Promise<string[]>;
  labels(issueId: string): Promise<string[]>;
  /** Description in ADF, to detect acceptance criteria (SPEC §8 "garde-fous"). */
  descriptionAdf(issueId: string): Promise<AdfNode | null>;
  /** A custom field as a string; empty when the field is not filled (DP-23, DP-25). */
  readCustomField(issueId: string, fieldId: string): Promise<string>;
  /** Writes one of the two fields the app owns; false when the write was refused. */
  writeCustomField(issueId: string, fieldId: string, value: string): Promise<boolean>;
  /** Tickets of a sprint, for the delegable share (SPEC §12, DP-24). */
  sprintIssues(sprintId: string, limit: number): Promise<JiraTicketSummary[]>;
}

/**
 * Reads the Teamwork Graph (SPEC §17 "Ce qu'impose le graphe", SPEC §19).
 *
 * Three constraints shape this port:
 * - it only reads on behalf of a signed-in user, so collection runs in slices
 *   during a session and resumes where it stopped (DP-18);
 * - a missing right never raises: it empties the result (SPEC §19, recipe 15);
 * - no relation links a ticket to a pull request, so the path is
 *   ticket → commit, then PR → commit (SPEC §17).
 */
export interface GraphGateway {
  /** Commits linked to a ticket; the message is read here and dropped afterwards (SPEC §17). */
  commitsOfIssue(issueId: string): Promise<GraphCommit[]>;
  /** Pull requests reached through a commit (SPEC §17, SPEC §19). */
  pullRequestsOfCommit(commitRef: string): Promise<GraphPullRequest[]>;
  /** Reviewers of a pull request with their current opinion (SPEC §6, SPEC §19). */
  reviewersOfPullRequest(prRef: string): Promise<GraphReviewer[]>;
  /** Number of comments of a pull request (SPEC §6 "Relecture"). */
  commentCountOfPullRequest(prRef: string): Promise<number>;
  /** Whether an account is a robot account (SPEC §5, source 2). */
  botAccount(accountId: string): Promise<boolean>;
  /** The state of one right, per object type (SPEC §19, DP-19). */
  permission(objectType: GraphObjectType): Promise<GraphPermissionState>;
  /**
   * Tests one right on a ticket whose answer is known, so the coverage screen
   * tells "no right" from "no data" (SPEC §17, recipe 15).
   */
  probePermission(objectType: GraphObjectType, knownIssueId: string): Promise<GraphPermission>;
}

/** One classification proposed by the model, never a truth on its own (SPEC §14 DP-06). */
export interface NatureClassification {
  nature: Nature;
  /** One sentence explaining the choice, shown in the settings screen (DP-06). */
  rationale: string;
}

/** One cause of failure, counted across a cohort (SPEC §12, DP-26). */
export interface FailureCause {
  cause: string;
  count: number;
}

/**
 * Text-only model calls (SPEC §17 "Nature", SPEC §12 "Ce qui ferait passer une
 * case du rouge à l'orange", DP-06, DP-26).
 *
 * The model sees a text, the app keeps the result by fingerprint of that text,
 * so the same ticket is never classified twice (SPEC §17).
 */
export interface LlmGateway {
  /** Classifies a ticket among the natures the project declares (DP-06). */
  classifyNature(text: string, natures: readonly Nature[]): Promise<NatureClassification>;
  /** Summarizes why tickets of a cohort failed, from reopening comments (SPEC §12, DP-26). */
  summarizeFailureCauses(comments: readonly string[], limit: number): Promise<FailureCause[]>;
}

/* ------------------------------------------------------- collection plumbing */

/** One collection job, put on the queue by a page or by a trigger (SPEC §17, DP-18). */
export interface CollectionJob {
  projectId: string;
  objectType: GraphObjectType;
  /** Resume cursor: the last ticket already collected; empty to start over (DP-18). */
  fromIssueId: string;
  /** Size of the slice, so the work fits in one user session (SPEC §17, SPEC §19). */
  sliceSize: number;
  enqueuedAt: string;
}

/** Producer side of the queue (SPEC §17 "Graphe : la session d'un utilisateur"). */
export interface Queue {
  publish(job: CollectionJob): Promise<void>;
}

/** Consumer side: works one slice, stores the facts, moves the cursor (DP-18). */
export interface Consumer {
  handle(job: CollectionJob): Promise<CollectionSlice>;
}

/** What one collection slice stored, per ticket (SPEC §17, DP-18). */
export interface CollectionResult {
  slice: CollectionSlice;
  facts: readonly CollectedTicketFacts[];
  /** Reopenings detected in the histories, administrative ones set aside (SPEC §6). */
  reopenings: readonly ReopeningFact[];
  /** Neighbour bugs, a weak signal shown apart (SPEC §6 "Bug voisin"). */
  neighborBugs: readonly NeighborBugFact[];
}

/* ------------------------------------------------------------------ read side */

/**
 * The single path to a recommendation, so the ticket panel, the MCP tool and
 * the delegation map all read the same row (SPEC §16.1, SPEC §15, SPEC §20).
 *
 * Implemented by lot L4 in `src/domain/recommendation.ts`; every other lot calls
 * it instead of recomputing a card in its own corner.
 */
export interface RecommendationEngine {
  /** Recomputes the card of a ticket, stores it, and returns it (SPEC §17 "Statistiques"). */
  compute(issueId: string): Promise<RecommendationCard | null>;
  /** The stored card, without recomputing: the panel answers in under two seconds (SPEC §20). */
  read(issueId: string): Promise<RecommendationCard | null>;
  /** The delegation map of a project, from the cached cohort statistics (SPEC §12, DP-14). */
  map(projectId: string, sprintId: string): Promise<DelegationMap | null>;
}

/** What the ticket panel needs (SPEC §16.1, DP-11, DP-01). */
export interface TicketPanelPort {
  /** The card of one ticket, from cache when it exists (SPEC §16.1). */
  card(issueKey: string): Promise<RecommendationCard | null>;
  /** The involvement detected for the ticket and the source it came from (SPEC §16.1, DP-01). */
  involvement(issueKey: string): Promise<Involvement | null>;
  /** The decision taken, followed or not (SPEC §8 "Un avis, pas un ordre", DP-13). */
  recordDecision(issueKey: string, decision: 'delegate' | 'keep-human', reason: string): Promise<Decision | null>;
  /** The human takeover an agent reports (SPEC §9, SPEC §6 "Reprise humaine"). */
  reportTakeover(issueKey: string, reason: string): Promise<Involvement | null>;
}

/** One level declared by an agent or by a developer at closure (SPEC §5, SPEC §15). */
export interface InvolvementDeclaration {
  issueKey: string;
  level: Level;
  client: string;
  model: string;
  session: string;
}
