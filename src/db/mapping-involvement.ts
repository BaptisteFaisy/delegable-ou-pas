/**
 * Mapping of the involvement family (SPEC §5, SPEC §18, DP-01, DP-02).
 *
 * `involvement` and `signature_pattern` rows, to and from their domain
 * objects, without loss: evidence keys go through the shared stable JSON
 * codec, the `enabled` boolean through the shared 0/1 flag codec.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { Involvement, SignaturePattern } from '../types.js';
import type { SeenSignature } from '../types-graph.js';
import type { InvolvementRow, SignaturePatternRow } from '../types-persistence.js';
import {
  asNumber,
  asText,
  decodeEvidence,
  encodeEvidence,
  fromFlag,
  toFlag,
} from './mapping-codec.js';

/** Domain -> row: the evidence list becomes stable JSON (SPEC §17). */
export function toInvolvementRow(involvement: Involvement): InvolvementRow {
  return {
    issue_id: involvement.issueId,
    level: involvement.level,
    source: involvement.source,
    client: involvement.client,
    model: involvement.model,
    session_ref: involvement.sessionRef,
    evidence_json: encodeEvidence(involvement.evidence),
    decided_at: involvement.decidedAt,
  };
}

/** Row -> domain: absent evidence JSON means no evidence, `[]` (SPEC §20). */
export function toInvolvement(row: InvolvementRow): Involvement {
  return {
    issueId: asText(row.issue_id),
    level: row.level,
    source: row.source,
    client: asText(row.client),
    model: asText(row.model),
    sessionRef: asText(row.session_ref),
    evidence: decodeEvidence(asText(row.evidence_json)),
    decidedAt: asText(row.decided_at),
  };
}

/** Domain -> row: the `enabled` boolean becomes 0/1. */
export function toSignaturePatternRow(pattern: SignaturePattern): SignaturePatternRow {
  return {
    id: pattern.id,
    expression: pattern.expression,
    agent_name: pattern.agentName,
    enabled: toFlag(pattern.enabled),
    seen_count: pattern.seenCount,
  };
}

/** Row -> domain. */
export function toSignaturePattern(row: SignaturePatternRow): SignaturePattern {
  return {
    id: asText(row.id),
    expression: asText(row.expression),
    agentName: asText(row.agent_name),
    enabled: fromFlag(asNumber(row.enabled)),
    seenCount: asNumber(row.seen_count),
  };
}

/**
 * A catalogue row plus the date of the last commit that carried the mention
 * becomes a `SeenSignature` (SPEC §5, DP-02). The date comes from
 * `commit_fact`, the only place a "seen" instant is stored.
 */
export function toSeenSignature(row: SignaturePatternRow, lastSeenAt: string): SeenSignature {
  return {
    patternId: asText(row.id),
    agentName: asText(row.agent_name),
    seenCount: asNumber(row.seen_count),
    lastSeenAt,
  };
}
