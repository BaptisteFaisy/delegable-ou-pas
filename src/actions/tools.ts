/**
 * The nine MCP tools of SPEC §15 — frozen signatures of docs/CONTRACTS.md §L7.
 *
 * One file per tool lives next door (zero duplication: this module only
 * re-exports the exact signatures the contract freezes). Every tool returns
 * `McpResult<T>`: `ok`, a short typed `error`, `data` or `null` — never an
 * exception (SPEC §20), never a person name in or out (recipe 12, DP-17).
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
export { shouldDelegate } from './should-delegate.js';
export { listDelegableWork } from './list-delegable-work.js';
export { getDelegationEvidence } from './get-delegation-evidence.js';
export { getDelegationMap } from './get-delegation-map.js';
export { getCohort } from './get-cohort.js';
export { getCalibration } from './get-calibration.js';
export { recordInvolvement } from './record-involvement.js';
export { recordDecision } from './record-decision.js';
export { reportTakeover } from './report-takeover.js';
