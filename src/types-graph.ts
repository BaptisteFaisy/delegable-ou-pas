/**
 * Domain contract — raw collection facts, as read from Jira and the Teamwork
 * Graph (SPEC §5 sources, §6 measures, §17 "quatre chaînes", §19 constraints).
 *
 * These types describe what the adapters bring back, before any interpretation.
 * The app keeps facts and counts, never raw content: a commit message is read,
 * matched against the catalogue, then dropped (SPEC §17, SPEC §20 "Sobriété").
 *
 * A missing right on the graph never raises: it empties the result
 * (SPEC §17 "Ce qu'impose le graphe", SPEC §19, recipe 15).
 */
import type { CommitFact, GraphObjectType, ReviewFact, SignaturePattern } from './types.js';

/* ------------------------------------------------------------------- commits */

/**
 * One commit, as read from the graph (SPEC §19 "Commit dans le graphe").
 *
 * The message is read only to detect a mention, then dropped: it is never
 * stored, never logged (SPEC §17, SPEC §20).
 */
export interface GraphCommit {
  /** Opaque reference of the commit on the graph. */
  ref: string;
  /** Fingerprint of the commit (SPEC §19 "empreinte"). */
  hash: string;
  /** Full message; the collector reads it, matches it, and does not keep it (SPEC §17). */
  message: string;
  /** True when the author is a robot account (SPEC §5, source 2). */
  authorIsBot: boolean;
  /** Account id of the author; used only to detect a robot, never displayed (SPEC §7 rule 8). */
  authorAccountId: string;
  committedAt: string;
  /** Repository the commit belongs to (SPEC §19 "dépôt"). */
  repository: string;
  /** Address of the commit (SPEC §19 "adresse"). */
  url: string;
}

/**
 * One commit fact derived from a graph commit: the message is gone, only
 * "mention found or not" and the agent name remain (SPEC §17, SPEC §18 `commit_fact`).
 */
export type CommitFactFromGraph = CommitFact;

/* ---------------------------------------------------------------- pull requests */

/** The states of a pull request on the graph (SPEC §19 "PR dans le graphe"). */
export type PullRequestState = 'open' | 'merged' | 'declined' | 'draft';

/** The four pull request states, SPEC order (SPEC §19). */
export const PULL_REQUEST_STATES: readonly PullRequestState[] = [
  'open',
  'merged',
  'declined',
  'draft',
];

/**
 * One pull request reached through a commit (SPEC §19).
 *
 * The graph exposes neither a size nor branches, and no relation links a ticket
 * directly to a pull request: the path is ticket → commit, then PR → commit
 * (SPEC §17 "Ce qu'impose le graphe", SPEC §19).
 */
export interface GraphPullRequest {
  ref: string;
  state: PullRequestState;
  /** Reviewers with their current opinion (SPEC §6 "Relecture", SPEC §19). */
  reviewers: readonly GraphReviewer[];
  commentCount: number;
  /** Commits added after the pull request was opened (SPEC §6, SPEC §19). */
  commitsAfterOpen: number;
  openedAt: string;
  /** Empty while the pull request is still open. */
  mergedAt: string;
  /** Author of the pull request; used only to detect a robot, never displayed (SPEC §7 rule 8). */
  authorAccountId: string;
}

/** The current opinion of one reviewer (SPEC §19: "approuvé, à revoir, sans avis"). */
export type ReviewVerdict = 'approved' | 'changes-requested' | 'none';

/** The three verdicts of a reviewer, SPEC order (SPEC §19). */
export const REVIEW_VERDICTS: readonly ReviewVerdict[] = [
  'approved',
  'changes-requested',
  'none',
];

/**
 * One reviewer of a pull request (SPEC §6 "Relecture").
 *
 * The graph gives the *current* opinion of each reviewer, not the number of
 * round trips (SPEC §6, SPEC §19). No name, no ranking: the app never exposes
 * a person (SPEC §7 rule 8, DP-17, recipe 12).
 */
export interface GraphReviewer {
  /** Account id, kept only to count distinct reviewers, never displayed (SPEC §7 rule 8). */
  accountId: string;
  verdict: ReviewVerdict;
}

/**
 * One review fact derived from the graph (SPEC §6, SPEC §18 `review_fact`).
 */
export type ReviewFactFromGraph = ReviewFact;

/* ------------------------------------------------------------- status history */

/** One step of a ticket's status history (SPEC §6 "Délai", "Réouverture"). */
export interface StatusChange {
  from: string;
  to: string;
  at: string;
}

/**
 * The status history of a ticket, as read from Jira (SPEC §6, SPEC §17 "Historique Jira").
 *
 * It feeds three measures: the delay excluding waiting statuses, the reopening
 * within 30 days, and the abandonment (SPEC §6, DP-04).
 */
export interface StatusHistory {
  issueId: string;
  changes: readonly StatusChange[];
  /** True when the ticket is currently in a done status. */
  closed: boolean;
  /** The closure status, empty while open. */
  closedStatus: string;
}

/**
 * One reopening detected in the history (SPEC §6 "Réouverture").
 *
 * Administrative reopenings lasting less than ten minutes are set aside
 * (SPEC §6, "Réouvertures administratives").
 */
export interface ReopeningFact {
  issueId: string;
  reopenedAt: string;
  /** Duration in minutes; below 10 minutes the reopening is administrative (SPEC §6). */
  durationMin: number;
  /** True when the reopening counts, false when it is administrative (SPEC §6). */
  counts: boolean;
}

/* ---------------------------------------------------------------------- links */

/** The link types the app reads between tickets (SPEC §6 "Bug à la suite"). */
export type LinkType = 'caused-by' | 'causes' | 'relates-to' | 'blocks' | 'is-blocked-by';

/** The five link types, SPEC order (SPEC §6). */
export const LINK_TYPES: readonly LinkType[] = [
  'caused-by',
  'causes',
  'relates-to',
  'blocks',
  'is-blocked-by',
];

/** One link between two tickets, as read from Jira (SPEC §6, SPEC §17). */
export interface IssueLink {
  issueId: string;
  linkedIssueId: string;
  type: LinkType;
  /** The linked ticket is an incident (JSM), when the app can tell (SPEC §6 "Incident", SPEC §19). */
  linkedIsIncident: boolean;
  /** The linked ticket is a bug, when the app can tell (SPEC §6 "Bug à la suite"). */
  linkedIsBug: boolean;
  createdAt: string;
}

/**
 * A neighbouring bug: created within 30 days on the same component and quoting
 * the ticket (SPEC §6 "Bug voisin").
 *
 * A weak signal, shown apart, never inside the clean closure (SPEC §6).
 */
export interface NeighborBugFact {
  issueId: string;
  bugIssueId: string;
  component: string;
  createdAt: string;
}

/* ----------------------------------------------------------------- collection */

/** What one collection slice produced, per ticket (SPEC §17 "Graphe", DP-18). */
export interface CollectedTicketFacts {
  issueId: string;
  commits: readonly GraphCommit[];
  commitFacts: readonly CommitFact[];
  pullRequests: readonly GraphPullRequest[];
  reviewFacts: readonly ReviewFact[];
  /** True when the ticket has no commit at all (SPEC §21 "Ticket sans commit"). */
  hasNoCommit: boolean;
  collectedAt: string;
}

/**
 * One slice of collection, so the work fits in a user session and resumes where
 * it stopped (SPEC §17 "Ce qu'impose le graphe", SPEC §19, DP-18).
 */
export interface CollectionSlice {
  projectId: string;
  /** The object type being collected; one right per object type (SPEC §19). */
  objectType: GraphObjectType;
  /** Tickets covered by the slice, in order. */
  issueIds: readonly string[];
  /** The last ticket id reached, used as the resume cursor (SPEC §18 `graph_cursor`). */
  lastIssueId: string;
  startedAt: string;
  finishedAt: string;
  /** True when the slice completed; false when the session ended first (DP-18). */
  complete: boolean;
}

/**
 * What a signature scan found on the team's commits (SPEC §5 "Les mentions de commit", DP-02).
 *
 * The settings screen shows the mentions actually seen, so the team can confirm
 * the catalogue; the messages themselves are never kept (SPEC §17).
 */
export interface SeenSignature {
  patternId: string;
  /** Agent name read in the mention (SPEC §18 `agent_name`). */
  agentName: string;
  /** How many commits carried it (SPEC §18 `seen_count`). */
  seenCount: number;
  lastSeenAt: string;
}

/** The input of a signature scan: the catalogue and one message (SPEC §5). */
export interface SignatureScanInput {
  message: string;
  patterns: readonly SignaturePattern[];
}

/* ---------------------------------------------------------------------- Jira */

/** One node of an Atlassian Document Format tree (SPEC §16, SPEC §15). */
export interface AdfNode {
  type: string;
  /** Text of a leaf node; absent on structural nodes. */
  text?: string;
  attrs?: Readonly<Record<string, unknown>>;
  content?: readonly AdfNode[];
}

/**
 * One ticket, as read from Jira, with only what the app needs
 * (SPEC §6 "Historique du ticket", SPEC §17 "Historique Jira").
 */
export interface JiraTicket {
  id: string;
  key: string;
  projectId: string;
  projectKey: string;
  summary: string;
  /** Description in ADF; null when the ticket has none (SPEC §8 "critères d'acceptation"). */
  description: AdfNode | null;
  status: string;
  issueType: string;
  /** Components of the ticket: they feed the zones and the neighbour bugs (SPEC §6, SPEC §16.5). */
  components: readonly string[];
  labels: readonly string[];
  /** Story points when the project uses them; null otherwise (SPEC §12 "part délégable", DP-24). */
  storyPoints: number | null;
  /** Sprint the ticket belongs to; empty when it is in no sprint (DP-24). */
  sprintId: string;
  createdAt: string;
  updatedAt: string;
  /** Custom fields by field id, as strings (SPEC §16.5, DP-23, DP-25). */
  customFields: Readonly<Record<string, string>>;
}

/** One ticket of a search result, without the description (SPEC §15 `list-delegable-work`). */
export interface JiraTicketSummary {
  id: string;
  key: string;
  summary: string;
  status: string;
  storyPoints: number | null;
}

/* -------------------------------------------------------------------- cursor */

/**
 * Where a collection stopped, per project and per object type, so the next
 * session resumes instead of starting over (SPEC §17, SPEC §18 `graph_cursor`, DP-18).
 */
export interface GraphCursor {
  projectId: string;
  objectType: GraphObjectType;
  /** Last ticket id collected; empty when nothing ran yet. */
  lastIssueId: string;
  lastRunAt: string;
}
