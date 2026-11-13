/**
 * The card of `PROJ-412` — SPEC §8, locked to the digit.
 *
 * The SPEC §8 describes the card the video shows: 26 tickets with an agent
 * against 31 without, 69 % [50 ; 84] against 87 % [71 ; 95], one day and a half
 * against three days, five reopenings out of eight for a migration that cannot
 * be replayed, the past tickets PROJ-207, PROJ-233 and PROJ-301, and the
 * advice "agent, reinforced review" with a medium confidence.
 *
 * The six figures come out exactly as the SPEC writes them: the recommendation
 * is "agent, reinforced review" with a medium confidence, because the gap on
 * the clean closure is not established ("same", SPEC §7 rule 4) while the
 * median delay is better with the agent (SPEC §8 row 2).
 */
import { describe, expect, it } from 'vitest';
import { percent } from '../../src/domain/stats.js';
import { sampleCards, sampleSeeds } from '../../src/sample/index.js';
import { boundsOf, figuresOf } from './fixtures.js';

const CARDS = sampleCards();
const CARD = CARDS.find((card) => card.issueKey === 'PROJ-412');
const FIGURES = figuresOf(sampleSeeds().filter((seed) =>
  seed.nature === 'data-migration' && seed.zone === 'billing' && seed.size === 'M' &&
  seed.epochId === 'epoch-3'));

/** A median delay in days, the way the SPEC writes it. */
function days(hours: number | undefined): number {
  return (hours ?? 0) / 24;
}

describe('SPEC §8 — la carte de PROJ-412', () => {
  it('la carte existe et porte la cohorte de la SPEC', () => {
    expect(CARD).toBeDefined();
    expect(CARD?.cohort).toEqual({
      level: 'nature-zone-size', nature: 'data-migration', zone: 'billing', size: 'M',
    });
    expect(CARD?.epochId).toBe('epoch-3');
    expect(CARD?.demo).toBe(true);
  });

  it('26 tickets avec agent, 31 sans', () => {
    expect(CARD?.agent?.n).toBe(26);
    expect(CARD?.human?.n).toBe(31);
    expect(CARD?.reasons[0]).toContain('26 tickets avec agent, 31 sans');
  });

  it('clôture propre : 69 % [50 ; 84] avec agent, 87 % [71 ; 95] sans', () => {
    expect(CARD?.agent?.rate).toBeCloseTo(18 / 26, 10);
    expect(CARD?.human?.rate).toBeCloseTo(27 / 31, 10);
    expect(percent(CARD?.agent?.rate ?? 0)).toBe('69 %');
    expect(percent(CARD?.human?.rate ?? 0)).toBe('87 %');
    expect(boundsOf(CARD?.agent ?? { n: 0, rate: 0, ciLow: 0, ciHigh: 0 })).toEqual([50, 84]);
    expect(boundsOf(CARD?.human ?? { n: 0, rate: 0, ciLow: 0, ciHigh: 0 })).toEqual([71, 95]);
  });

  it('délai médian : 1,5 jour avec agent, 3 jours sans', () => {
    expect(CARD?.agentLeadTime?.medianH).toBe(36);
    expect(CARD?.humanLeadTime?.medianH).toBe(72);
    expect(days(CARD?.agentLeadTime?.medianH)).toBe(1.5);
    expect(days(CARD?.humanLeadTime?.medianH)).toBe(3);
    expect(FIGURES.agentLead?.medianH).toBe(36);
    expect(FIGURES.humanLead?.medianH).toBe(72);
  });

  it('ce qui a mal tourné : 5 réouvertures sur 8 pour une migration non rejouable', () => {
    expect(CARD?.failureCauses).toEqual(['5 réouvertures sur 8 pour une migration non rejouable']);
    const agent = FIGURES.agentTickets;
    expect(agent.filter((seed) => seed.failure.reopened).length).toBe(5);
    expect(agent.filter((seed) => seed.failure.reopened || seed.failure.causedBugs > 0 ||
      seed.failure.incidents > 0 || seed.failure.abandoned).length).toBe(8);
  });

  it('tickets de référence : PROJ-207, PROJ-233, PROJ-301', () => {
    expect(CARD?.referenceIssueKeys).toEqual(['PROJ-207', 'PROJ-233', 'PROJ-301']);
  });

  it('la recommandation : agent, relecture renforcée, confiance moyenne', () => {
    expect(CARD?.value).toBe('delegate-with-review');
    expect(CARD?.conclusion).toBe('same');
    expect(CARD?.confidence).toBe('medium');
    expect(CARD?.guardrails).toEqual([]);
    expect(CARD?.conditions).toContain('relecture renforcée : au moins 2 relecteurs');
  });
});
