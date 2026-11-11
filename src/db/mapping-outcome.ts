/**
 * Mapping of the fact family (SPEC §6, SPEC §17, SPEC §18, DP-04, DP-05).
 *
 * `commit_fact`, `review_fact` and `outcome`: what the app keeps of a commit,
 * of a pull request and of what happened afterwards. Booleans travel as 0/1,
 * numbers as numbers, dates as ISO 8601 UTC strings, verbatim.
 *
 * Sobriety (SPEC §17): the commit message is not part of the row and not part
 * of the mapping — only the fact "a mention was found" and the agent name.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { CommitFact, Outcome, ReviewFact } from '../types.js';
import type { CommitFactRow, OutcomeRow, ReviewFactRow } from '../types-persistence.js';
import { asNumber, asText, fromFlag, toFlag } from './mapping-codec.js';

/** Domain -> row: a commit keeps the fact, never the message. */
export function toCommitFactRow(fact: CommitFact): CommitFactRow {
  return {
    issue_id: fact.issueId,
    commit_ref: fact.commitRef,
    has_signature: toFlag(fact.hasSignature),
    agent_name: fact.agentName,
    author_is_bot: toFlag(fact.authorIsBot),
    committed_at: fact.committedAt,
  };
}

/** Row -> domain. */
export function toCommitFact(row: CommitFactRow): CommitFact {
  return {
    issueId: asText(row.issue_id),
    commitRef: asText(row.commit_ref),
    hasSignature: fromFlag(asNumber(row.has_signature)),
    agentName: asText(row.agent_name),
    authorIsBot: fromFlag(asNumber(row.author_is_bot)),
    committedAt: asText(row.committed_at),
  };
}

/** Domain -> row. */
export function toReviewFactRow(fact: ReviewFact): ReviewFactRow {
  return {
    issue_id: fact.issueId,
    pr_ref: fact.prRef,
    reviewer_count: fact.reviewerCount,
    changes_requested: fact.changesRequested,
    comment_count: fact.commentCount,
    commits_after_open: fact.commitsAfterOpen,
    opened_at: fact.openedAt,
    merged_at: fact.mergedAt,
  };
}

/** Row -> domain. */
export function toReviewFact(row: ReviewFactRow): ReviewFact {
  return {
    issueId: asText(row.issue_id),
    prRef: asText(row.pr_ref),
    reviewerCount: asNumber(row.reviewer_count),
    changesRequested: asNumber(row.changes_requested),
    commentCount: asNumber(row.comment_count),
    commitsAfterOpen: asNumber(row.commits_after_open),
    openedAt: asText(row.opened_at),
    mergedAt: asText(row.merged_at),
  };
}

/** Domain -> row: the six flags of the outcome travel as 0/1. */
export function toOutcomeRow(outcome: Outcome): OutcomeRow {
  return {
    issue_id: outcome.issueId,
    closed_at: outcome.closedAt,
    lead_time_h: outcome.leadTimeH,
    reopened: toFlag(outcome.reopened),
    caused_bugs: outcome.causedBugs,
    neighbor_bugs: outcome.neighborBugs,
    incidents: outcome.incidents,
    takeover: toFlag(outcome.takeover),
    abandoned: toFlag(outcome.abandoned),
    clean: toFlag(outcome.clean),
    mature_at: outcome.matureAt,
  };
}

/** Row -> domain. */
export function toOutcome(row: OutcomeRow): Outcome {
  return {
    issueId: asText(row.issue_id),
    closedAt: asText(row.closed_at),
    leadTimeH: asNumber(row.lead_time_h),
    reopened: fromFlag(asNumber(row.reopened)),
    causedBugs: asNumber(row.caused_bugs),
    neighborBugs: asNumber(row.neighbor_bugs),
    incidents: asNumber(row.incidents),
    takeover: fromFlag(asNumber(row.takeover)),
    abandoned: fromFlag(asNumber(row.abandoned)),
    clean: fromFlag(asNumber(row.clean)),
    matureAt: asText(row.mature_at),
  };
}
