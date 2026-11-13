/**
 * Mapping of the collection family (SPEC §13, SPEC §16.5, SPEC §16.6,
 * SPEC §17, SPEC §19, DP-18, DP-19).
 *
 * `graph_cursor`, `settings` and `coverage`: where a collection stopped, what
 * a project declared, and what the coverage screen shows. The three rows hold
 * their structured parts as stable JSON in `TEXT` columns (SPEC §18), so a
 * round trip loses nothing and an absent payload degrades to `[]` or to the
 * documented fallback (SPEC §20 "données absentes").
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { GraphPermission } from '../types.js';
import type { Coverage, HardenedReview, ProjectSettings } from '../types-advice.js';
import type {
  CoverageRow,
  GraphCursorRow,
  SettingsRow,
} from '../types-persistence.js';
import {
  asNumber,
  asText,
  decodeJsonArray,
  decodeJsonObject,
  encodeJson,
  fromFlag,
  toFlag,
} from './mapping-codec.js';

/** The taxonomy of a project, as one stable JSON payload (SPEC §16.5). */
interface TaxonomyPayload {
  readonly natures: readonly string[];
  readonly zones: readonly string[];
  readonly sizes: readonly string[];
  readonly sensitiveZones: readonly string[];
}

const EMPTY_TAXONOMY: TaxonomyPayload = {
  natures: [],
  zones: [],
  sizes: [],
  sensitiveZones: [],
};

/** The fallback review definition when a project declared none (SPEC §8). */
const FALLBACK_REVIEW: HardenedReview = {
  label: '',
  minReviewers: 2,
  zoneOwnerRequired: false,
  evidencePerCriterion: false,
};

/** Domain -> row: the cursor of one collection, per object type (DP-18). */
export function toGraphCursorRow(cursor: {
  projectId: string;
  objectType: GraphCursorRow['object_type'];
  lastIssueId: string;
  lastRunAt: string;
}): GraphCursorRow {
  return {
    project_id: cursor.projectId,
    object_type: cursor.objectType,
    last_issue_id: cursor.lastIssueId,
    last_run_at: cursor.lastRunAt,
  };
}

/** Row -> domain. */
export function toGraphCursor(row: GraphCursorRow): {
  projectId: string;
  objectType: GraphCursorRow['object_type'];
  lastIssueId: string;
  lastRunAt: string;
} {
  return {
    projectId: asText(row.project_id),
    objectType: row.object_type,
    lastIssueId: asText(row.last_issue_id),
    lastRunAt: asText(row.last_run_at),
  };
}

/** Domain -> row: the declared lists travel as one stable JSON payload. */
export function toSettingsRow(settings: ProjectSettings): SettingsRow {
  const taxonomy: TaxonomyPayload = {
    natures: settings.natures,
    zones: settings.zones,
    sizes: settings.sizes,
    sensitiveZones: settings.sensitiveZones,
  };
  return {
    project_id: settings.projectId,
    project_key: settings.projectKey,
    min_arm_size: settings.minArmSize,
    adoption_date: settings.adoptionDate,
    taxonomy_json: encodeJson(taxonomy),
    hardened_review_json: encodeJson(settings.hardenedReview),
    waiting_statuses_json: encodeJson(settings.waitingStatuses),
    demo: toFlag(settings.demo),
    updated_at: settings.updatedAt,
  };
}

/** Row -> domain: absent payloads mean empty lists and the fallback review. */
export function toProjectSettings(row: SettingsRow): ProjectSettings {
  const taxonomy = decodeJsonObject<TaxonomyPayload>(row.taxonomy_json, EMPTY_TAXONOMY);
  const review = decodeJsonObject<HardenedReview>(row.hardened_review_json, FALLBACK_REVIEW);
  return {
    projectId: asText(row.project_id),
    projectKey: asText(row.project_key),
    minArmSize: asNumber(row.min_arm_size),
    adoptionDate: asText(row.adoption_date),
    natures: taxonomy.natures ?? [],
    zones: taxonomy.zones ?? [],
    sizes: taxonomy.sizes ?? [],
    sensitiveZones: taxonomy.sensitiveZones ?? [],
    hardenedReview: { ...FALLBACK_REVIEW, ...review },
    waitingStatuses: decodeJsonArray<string>(row.waiting_statuses_json),
    demo: fromFlag(asNumber(row.demo)),
    updatedAt: asText(row.updated_at),
  };
}

/** Domain -> row: the state of each graph right travels as JSON (DP-19). */
export function toCoverageRow(coverage: Coverage): CoverageRow {
  return {
    project_id: coverage.projectId,
    known_issues: coverage.knownIssues,
    total_issues: coverage.totalIssues,
    permissions_json: encodeJson(coverage.permissions),
    last_collection_at: coverage.lastCollectionAt,
    last_collection_ok: toFlag(coverage.lastCollectionOk),
    demo: toFlag(coverage.demo),
  };
}

/** Row -> domain: absent permissions mean no right tested yet: `[]`. */
export function toCoverage(row: CoverageRow): Coverage {
  return {
    projectId: asText(row.project_id),
    knownIssues: asNumber(row.known_issues),
    totalIssues: asNumber(row.total_issues),
    permissions: decodeJsonArray<GraphPermission>(row.permissions_json),
    lastCollectionAt: asText(row.last_collection_at),
    lastCollectionOk: fromFlag(asNumber(row.last_collection_ok)),
    demo: fromFlag(asNumber(row.demo)),
  };
}
