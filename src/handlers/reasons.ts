/**
 * The plain-words reasons behind a recommendation — SPEC §8 "Pourquoi",
 * SPEC §20; DP-11.
 *
 * The card is stored once and read by screens in both languages, so each
 * reason line carries the English and the French wording (visible strings in
 * English AND French). Every rate line keeps its sample size and its interval
 * (recipe 10) through the frozen L6 viewmodel helpers — zero duplication.
 *
 * Rule: files < 500 lines, functions < 50 lines.
 */
import type { Conclusion, DurationStat, ProportionStat } from '../types.js';
import type { Confidence, Guardrail } from '../types-advice.js';
import { gapEstablished } from '../domain/conclusion.js';
import type { MessageKey, MessageParams, Translate } from '../i18n/index.js';
import { createTranslator } from '../i18n/index.js';
import { medianText, rateText } from '../viewmodel/common.js';

const EN: Translate = createTranslator('en');
const FR: Translate = createTranslator('fr');

/** One bilingual line: English first, French second (SPEC §20). */
export function bilingual(key: MessageKey, params?: MessageParams): string {
  return `${EN(key, params)} / ${FR(key, params)}`;
}

/** The arm lines: rate with sample size and interval, and the median delay. */
function armLines(agent: ProportionStat | null, human: ProportionStat | null): string[] {
  const lines: string[] = [];
  if (agent !== null) lines.push(`${rateText(agent, EN)} / ${rateText(agent, FR)}`);
  if (human !== null) lines.push(`${rateText(human, EN)} / ${rateText(human, FR)}`);
  return lines;
}

function leadLine(agentLead: DurationStat | null, humanLead: DurationStat | null): string | null {
  if (agentLead === null || humanLead === null) return null;
  return bilingual('card.median', {
    agent: `${medianText(agentLead, EN)} (${medianText(agentLead, FR)})`,
    human: `${medianText(humanLead, EN)} (${medianText(humanLead, FR)})`,
  });
}

function guardrailLines(fired: readonly Guardrail[]): string[] {
  return fired.map((guardrail) => bilingual(`guardrail.${guardrail}` as MessageKey));
}

/**
 * The reasons of one card: the comparison result, the gap wording, the arm
 * figures with their sizes and intervals, the confidence, and every guardrail
 * that fired (SPEC §8, recipe 10).
 */
export function bilingualReasons(
  conclusion: Conclusion,
  confidence: Confidence,
  fired: readonly Guardrail[],
  agent: ProportionStat | null,
  human: ProportionStat | null,
  agentLead: DurationStat | null = null,
  humanLead: DurationStat | null = null,
): readonly string[] {
  const lines = [
    bilingual('card.conclusion', { conclusion: bilingual(`conclusion.${conclusion}` as MessageKey) }),
    bilingual(gapEstablished(conclusion) ? 'gap.established' : 'gap.not-established'),
    ...armLines(agent, human),
  ];
  const lead = leadLine(agentLead, humanLead);
  if (lead !== null) lines.push(lead);
  lines.push(bilingual('card.confidence', { level: bilingual(`confidence.${confidence}` as MessageKey) }));
  lines.push(...guardrailLines(fired));
  return lines;
}
