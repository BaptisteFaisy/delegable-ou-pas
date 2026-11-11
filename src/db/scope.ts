/**
 * Scope of a project, in the tables that have no `project_id` column
 * (SPEC §18, SPEC §19, DP-19).
 *
 * Seven tables of SPEC §18 carry a `project_id`: `epoch`, `cohort_stat`,
 * `calibration`, `trial`, `graph_cursor`, plus the two added by the screens,
 * `settings` and `coverage`. The others are keyed by ticket only:
 * `involvement`, `commit_fact`, `review_fact`, `outcome`, `issue_class`,
 * `recommendation` and `decision`.
 *
 * The convention of this layer closes the gap: **a ticket identifier is the
 * Jira issue key, `PROJ-412`, and the project identifier is the project key,
 * `PROJ`**. A ticket key starts with the key of its project, so a
 * project-scoped read filters on that prefix and stays indexed (the primary
 * key of those tables starts with `issue_id`).
 *
 * SPEC §21 ("ticket déplacé de projet"): the row keeps its key, so it keeps
 * its involvement and its outcome, and the cohort of the ticket changes with
 * its new classification. Nothing is ever deleted (SPEC §20).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */

/** The `LIKE` pattern that scopes a read to one project. */
export function projectScope(projectId: string): string {
  return `${projectId}-%`;
}
