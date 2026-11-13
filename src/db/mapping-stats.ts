/**
 * Mapping of the statistics family (SPEC §7, SPEC §14, SPEC §18, DP-06,
 * DP-07, DP-08, DP-21, DP-22).
 *
 * `issue_class`, `epoch`, `cohort_stat` and `calibration`: the classification
 * of a ticket, the periods of the team's setup, and the cached figures.
 *
 * Anonymity (DP-17, SPEC §18 last line): a statistics row carries no person
 * identifier. `people_count` is a number of people, used only to mask a
 * cohort carried by too few of them (SPEC §7 rule 8) — never a name.
 *
 * The cohort key is flattened into `nature`, `zone` and `size`: a cohort level
 * that ignores a zone or a size stores an empty string, and the empty string
 * comes back as `null` — the round trip keeps the difference between "no
 * zone" and "the zone named empty".
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { CohortKey, Epoch, IssueClass } from '../types.js';
import type { Calibration, CohortStat } from '../types-advice.js';
import type {
  CalibrationRowDb,
  CohortStatRow,
  EpochRow,
  IssueClassRow,
} from '../types-persistence.js';
import { asNumber, asText, fromFlag, toFlag } from './mapping-codec.js';

/** Domain -> row: the fingerprint of the text keeps the classification. */
export function toIssueClassRow(issueClass: IssueClass): IssueClassRow {
  return {
    issue_id: issueClass.issueId,
    nature: issueClass.nature,
    zone: issueClass.zone,
    size: issueClass.size,
    classified_by: issueClass.classifiedBy,
    content_hash: issueClass.contentHash,
    size_estimated: toFlag(issueClass.sizeEstimated),
  };
}

/** Row -> domain. */
export function toIssueClass(row: IssueClassRow): IssueClass {
  return {
    issueId: asText(row.issue_id),
    nature: asText(row.nature),
    zone: asText(row.zone),
    size: asText(row.size),
    classifiedBy: row.classified_by,
    contentHash: asText(row.content_hash),
    sizeEstimated: fromFlag(asNumber(row.size_estimated)),
  };
}

/** Domain -> row: an epoch is a period with a stable setup (SPEC §7 rule 6). */
export function toEpochRow(epoch: Epoch): EpochRow {
  return {
    id: epoch.id,
    project_id: epoch.projectId,
    starts_at: epoch.startsAt,
    label: epoch.label,
    client: epoch.client,
    model: epoch.model,
    instructions_version: epoch.instructionsVersion,
  };
}

/** Row -> domain. */
export function toEpoch(row: EpochRow): Epoch {
  return {
    id: asText(row.id),
    projectId: asText(row.project_id),
    startsAt: asText(row.starts_at),
    label: asText(row.label),
    client: asText(row.client),
    model: asText(row.model),
    instructionsVersion: asText(row.instructions_version),
  };
}

/**
 * Domain -> row: the cohort key is flattened, and the proportions become
 * their four numbers (`n`, rate and the interval).
 */
export function toCohortStatRow(stat: CohortStat): CohortStatRow {
  return {
    project_id: stat.projectId,
    epoch_id: stat.epochId,
    nature: stat.key.nature,
    zone: stat.key.zone ?? '',
    size: stat.key.size ?? '',
    arm: stat.arm,
    n: stat.clean.n,
    clean_rate: stat.clean.rate,
    ci_low: stat.clean.ciLow,
    ci_high: stat.clean.ciHigh,
    median_lead_h: stat.medianLeadH,
    review_load: stat.reviewLoad,
    people_count: stat.peopleCount,
    conclusion: stat.conclusion,
    computed_at: stat.computedAt,
  };
}

/**
 * Row -> domain: the cohort key is rebuilt, the two arms of a cohort are read
 * one row each (SPEC §7 rule 3).
 *
 * The row carries no `level` column: the level is exactly the depth of the
 * key, so it is derived from what the key holds — a zone and a size, a size
 * only, or neither (SPEC §7 rule 1). The derivation is the inverse of the
 * flattening above, so the round trip loses nothing.
 */
export function toCohortStat(row: CohortStatRow): CohortStat {
  const zone = asText(row.zone) === '' ? null : asText(row.zone);
  const size = asText(row.size) === '' ? null : asText(row.size);
  const level = zone !== null && size !== null
    ? 'nature-zone-size'
    : size !== null
      ? 'nature-size'
      : 'nature';
  const key: CohortKey = { level, nature: asText(row.nature), zone, size };
  return {
    projectId: asText(row.project_id),
    epochId: asText(row.epoch_id),
    key,
    arm: row.arm,
    clean: {
      n: asNumber(row.n),
      rate: asNumber(row.clean_rate),
      ciLow: asNumber(row.ci_low),
      ciHigh: asNumber(row.ci_high),
    },
    medianLeadH: asNumber(row.median_lead_h),
    reviewLoad: asNumber(row.review_load),
    peopleCount: asNumber(row.people_count),
    conclusion: row.conclusion,
    computedAt: asText(row.computed_at),
  };
}

/** Domain -> row: the calibration keeps the count and the interval. */
export function toCalibrationRow(calibration: Calibration): CalibrationRowDb {
  return {
    project_id: calibration.projectId,
    epoch_id: calibration.epochId,
    value: calibration.value,
    n: calibration.clean.n,
    clean_rate: calibration.clean.rate,
    ci_low: calibration.clean.ciLow,
    ci_high: calibration.clean.ciHigh,
  };
}

/** Row -> domain. */
export function toCalibration(row: CalibrationRowDb): Calibration {
  return {
    projectId: asText(row.project_id),
    epochId: asText(row.epoch_id),
    value: row.value,
    clean: {
      n: asNumber(row.n),
      rate: asNumber(row.clean_rate),
      ciLow: asNumber(row.ci_low),
      ciHigh: asNumber(row.ci_high),
    },
  };
}
