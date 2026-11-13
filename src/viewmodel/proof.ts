/**
 * The reproducible proof of a decision, as a screen shows it (SPEC §7, §20;
 * DP-21).
 *
 * Why: the app says "the gap is established". An auditor must be able to check
 * that claim on the pieces, not trust it: the rule that produced it (policy
 * version), the data it was computed on (data fingerprint), the random draw it
 * used (seed), and the fingerprint of the answer itself. When a replay does
 * not give the same answer, the screen must say **what** differs, not merely
 * that it differs.
 *
 * The viewmodel computes nothing: `src/domain/proof.ts` owns the hashes, the
 * canonical form and the path-by-path differences. This module only projects
 * them.
 *
 * Pure module: no `@forge/*`, no clock, no randomness.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { DecisionProof, ReplayVerdict } from '../domain/proof.js';
import { decisionProof, replayDecision } from '../domain/proof.js';
import type { Bilingual } from './common.js';

/** The title of the screen, in both languages (SPEC §16). */
const TITLE: Bilingual = {
  fr: 'La preuve reproductible',
  en: 'The reproducible proof',
};

/** The line that says what a fingerprint is. */
const FINGERPRINT: Bilingual = {
  fr: 'Empreinte des données',
  en: 'Data fingerprint',
};

/** The line that says what the output fingerprint is. */
const OUTPUT_FINGERPRINT: Bilingual = {
  fr: 'Empreinte du résultat',
  en: 'Output fingerprint',
};

/** The line that names the version of the policy. */
const POLICY: Bilingual = {
  fr: 'Version de la règle',
  en: 'Policy version',
};

/** The line that names the random draw. */
const SEED: Bilingual = {
  fr: 'Graine',
  en: 'Seed',
};

/** The line that says whether the replay gave the same answer. */
const REPLAY_SAME: Bilingual = {
  fr: 'Rejouée à l’identique',
  en: 'Replayed identically',
};

/** The line that says the replay differs, and where. */
const REPLAY_DIFFERS: Bilingual = {
  fr: 'Le rejeu diffère — voici ce qui a bougé',
  en: 'The replay differs — here is what moved',
};

/** What the screen needs to know to build a proof. */
export interface ProofViewInput {
  /** The ticket the decision is about. */
  readonly issueKey: string;
  /** Version of the rule that produced it. */
  readonly policy: string;
  /** The random draw the decision used, when it used one. */
  readonly seed: string;
  /** The data the decision was computed on. */
  readonly data: unknown;
  /** The answer the decision produced. */
  readonly output: unknown;
  /** When the decision was computed (given: the clock is injected). */
  readonly computedAt: string;
}

/** The proof of one decision, ready to be rendered. */
export interface ProofView {
  readonly title: Bilingual;
  /** The ticket the proof is about. */
  readonly issueKey: string;
  /** The version of the rule, as a label + a value. */
  readonly policyLabel: Bilingual;
  readonly policyVersion: string;
  /** The fingerprint of the data, as a label + a value. */
  readonly dataLabel: Bilingual;
  readonly dataFingerprint: string;
  /** The seed, as a label + a value. */
  readonly seedLabel: Bilingual;
  readonly seed: string;
  /** The fingerprint of the answer, as a label + a value. */
  readonly outputLabel: Bilingual;
  readonly outputFingerprint: string;
  /** When the decision was computed. */
  readonly computedAt: string;
  /** True when a replay of the same input gives the same answer. */
  readonly reproducible: boolean;
  /** What the proof means, in both languages. */
  readonly note: Bilingual;
}

/** The replay of a proof, ready to be rendered. */
export interface ReplayView {
  /** True when the replay gave the same answer. */
  readonly same: boolean;
  /** The paths that differ, dotted, so an auditor can point at the figure. */
  readonly mismatches: readonly string[];
  /** The line that says the replay matched. */
  readonly sameLine: Bilingual;
  /** The line that says the replay differs, or `null` when it matched. */
  readonly differsLine: Bilingual | null;
}

/**
 * Projects the proof of a decision.
 *
 * The hashes come from the domain: this module never hashes anything itself.
 */
export function proofView(input: ProofViewInput): ProofView {
  const proof: DecisionProof = decisionProof({
    issueKey: input.issueKey,
    policy: input.policy,
    seed: input.seed,
    data: input.data,
    output: input.output,
    computedAt: input.computedAt,
  });
  return {
    title: TITLE,
    issueKey: proof.issueKey,
    policyLabel: POLICY,
    policyVersion: proof.policyVersion,
    dataLabel: FINGERPRINT,
    dataFingerprint: proof.dataFingerprint,
    seedLabel: SEED,
    seed: proof.seed,
    outputLabel: OUTPUT_FINGERPRINT,
    outputFingerprint: proof.outputFingerprint,
    computedAt: proof.computedAt,
    reproducible: proof.reproducible,
    note: proof.note,
  };
}

/**
 * Projects the replay of a proof: the same answer, or the paths that differ.
 *
 * The mismatches are the domain's, path by path: the viewmodel only decides
 * which line to show (SPEC §20 — a difference is always named).
 */
export function replayView(input: {
  readonly proof: DecisionProof;
  readonly data: unknown;
  readonly output: unknown;
  readonly expectedData?: unknown;
  readonly expectedOutput?: unknown;
}): ReplayView {
  const verdict: ReplayVerdict = replayDecision(input);
  return {
    same: verdict.same,
    mismatches: verdict.mismatches,
    sameLine: REPLAY_SAME,
    differsLine: verdict.same ? null : REPLAY_DIFFERS,
  };
}
