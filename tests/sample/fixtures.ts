/**
 * Shared fixtures of the demo tests — DP-20, SPEC §7, §24.
 *
 * One place computes the figures of a cohort, with the merged domain functions:
 * neither the dataset nor the tests reimplement a rate, an interval or a
 * conclusion (zero duplication).
 */
import type { Arm, Balance, CohortKey, Conclusion, DurationStat, ProportionStat } from '../../src/types.js';
import type { Confidence, Guardrail, Recommendation } from '../../src/types-advice.js';
import type { Seed } from '../../src/sample/issues.js';
import { compareBalance, composition } from '../../src/domain/balance.js';
import { conclude } from '../../src/domain/conclusion.js';
import { confidenceOf, guardrails, recommendFrom } from '../../src/domain/recommendation.js';
import { median, wilsonInterval } from '../../src/domain/stats.js';
import { cleanOf } from '../../src/sample/outcomes.js';
import { sampleSeeds } from '../../src/sample/index.js';
import { SAMPLE_MIN_ARM_SIZE, SAMPLE_SENSITIVE_ZONES } from '../../src/sample/project.js';

/** The seeds of the demo dataset, built once for every test. */
export const SEEDS: readonly Seed[] = sampleSeeds();

/** The figures of one cohort, arm by arm (SPEC §7). */
export interface CohortFigures {
  readonly key: CohortKey;
  readonly agent: ProportionStat | null;
  readonly human: ProportionStat | null;
  readonly agentLead: DurationStat | null;
  readonly humanLead: DurationStat | null;
  readonly agentTickets: readonly Seed[];
  readonly humanTickets: readonly Seed[];
  readonly unknownTickets: readonly Seed[];
}

/** The tickets of one cohort: same nature, same zone, same size, same epoch. */
export function cohort(nature: string, zone: string, size: string, epochId: string): readonly Seed[] {
  return SEEDS.filter((seed) =>
    seed.nature === nature && seed.zone === zone && seed.size === size && seed.epochId === epochId);
}

/** The rate and the delay of one arm (SPEC §6, SPEC §7 rule 3). */
function armFigures(arm: readonly Seed[]): { rate: ProportionStat | null; lead: DurationStat | null } {
  if (arm.length === 0) return { rate: null, lead: null };
  const clean = arm.filter((seed) => cleanOf(seed)).length;
  const leads = arm.filter((seed) => seed.closedAt !== '').map((seed) => seed.leadTimeH);
  return {
    rate: wilsonInterval(clean, arm.length),
    lead: leads.length === 0 ? null : { n: leads.length, medianH: median(leads) },
  };
}

/** The figures of a list of tickets, split in the three arms (DP-03). */
export function figuresOf(tickets: readonly Seed[], key?: CohortKey): CohortFigures {
  const closed = tickets.filter((seed) => seed.closedAt !== '');
  const agentTickets = closed.filter((seed) => seed.arm === 'agent');
  const humanTickets = closed.filter((seed) => seed.arm === 'human');
  const agent = armFigures(agentTickets);
  const human = armFigures(humanTickets);
  return {
    key: key ?? { level: 'nature-zone-size', nature: '', zone: null, size: null },
    agent: agent.rate,
    human: human.rate,
    agentLead: agent.lead,
    humanLead: human.lead,
    agentTickets,
    humanTickets,
    unknownTickets: closed.filter((seed) => seed.arm === 'unknown'),
  };
}

/** The composition balance of the two arms (SPEC §7 rule 5, DP-10). */
export function balanceOf(figures: CohortFigures): Balance {
  const mix = (arm: readonly Seed[]) => {
    const sizes: Record<string, number> = {};
    const natures: Record<string, number> = {};
    for (const seed of arm) {
      sizes[seed.size] = (sizes[seed.size] ?? 0) + 1;
      natures[seed.nature] = (natures[seed.nature] ?? 0) + 1;
    }
    return composition(arm.length, sizes, natures);
  };
  return compareBalance(mix(figures.agentTickets), mix(figures.humanTickets));
}

/** The conclusion of one cohort, by the domain (SPEC §7 rule 4). */
export function conclusionOf(figures: CohortFigures, balance: Balance = balanceOf(figures)): Conclusion {
  return conclude(figures.agent, figures.human, SAMPLE_MIN_ARM_SIZE, balance);
}

/** True when the agent arm is faster than the human arm (SPEC §6). */
export function delayBetterOf(figures: CohortFigures): boolean {
  return (
    figures.agentLead !== null &&
    figures.humanLead !== null &&
    figures.agentLead.medianH < figures.humanLead.medianH
  );
}

/** The guardrails of one ticket (SPEC §8, DP-12). */
export function guardrailsOf(seed: Seed, openIncident = false): readonly Guardrail[] {
  return guardrails(openIncident, seed.zone, SAMPLE_SENSITIVE_ZONES, seed.hasDescription);
}

/** The recommendation the domain gives for one cohort and one ticket. */
export function recommendationOf(
  figures: CohortFigures,
  seed: Seed,
  openIncident = false,
): Recommendation {
  const balance = balanceOf(figures);
  return recommendFrom(
    conclusionOf(figures, balance),
    balance,
    guardrailsOf(seed, openIncident),
    delayBetterOf(figures),
  );
}

/** The confidence of one cohort (SPEC §8 "Confiance"). */
export function confidenceOfCohort(figures: CohortFigures): Confidence {
  return confidenceOf(figures.agent, figures.human, conclusionOf(figures));
}

/** The bounds of an interval, as the app renders them: the lower bound is
 * rounded down, the upper bound up, so the displayed interval never claims
 * more than the computed one (SPEC §8 card: 18/26 reads [50 ; 84]). */
export function boundsOf(stat: ProportionStat): readonly [number, number] {
  return [Math.floor(stat.ciLow * 100 + 1e-9), Math.ceil(stat.ciHigh * 100 - 1e-9)];
}

/** The arm a level belongs to, as the domain reads it (DP-03). */
export function armOfSeed(seed: Seed): Arm | null {
  return seed.arm === 'unknown' ? null : seed.arm;
}
