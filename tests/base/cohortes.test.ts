/**
 * The cohort floor, traversed on the reference database.
 *
 * Covers: DP-06, DP-07, DP-10, DP-17, DP-22.
 *
 * Nature × zone × size classes of the base, the threshold, the announced
 * fallback, the epochs kept separate, and the edge cohorts of the dataset.
 */
import { describe, expect, it } from 'vitest';
import {
  base,
  cohorte,
  desequilibree,
  epoques,
  grise,
  masquee,
} from '../helpers/base.js';
import {
  cohortKeyString,
  parseCohortKey,
  resolveCohortScope,
  widen,
  groupByCohort,
} from '../../src/domain/cohort.js';
import type { CohortTicket } from '../../src/domain/cohort.js';

describe('les cohortes de la base', () => {
  it('classe nature × zone × taille et conserve les époques séparées', () => {
    const current = base();
    const ids = new Set(epoques().map((epoch) => epoch.id));
    const keysOf: string[] = [];
    for (const ticket of current.tickets) {
      if (!ids.has(ticket.epochId)) continue;
      keysOf.push(cohortKeyString({ level: 'nature-zone-size', nature: ticket.nature, zone: ticket.zone, size: ticket.size }));
    }
    expect(new Set(keysOf).size).toBeGreaterThan(10);
    expect(epoques()).toHaveLength(3);
  });

  it('annonce le repli quand une cohorte est trop petite', () => {
    const key = { level: 'nature-zone-size' as const, nature: 'bugfix', zone: 'web-ui', size: 'L' };
    const tickets = base().tickets
      .filter((ticket) => ticket.epochId === 'epoch-1')
      .map((ticket): CohortTicket => ({
        issueId: ticket.id,
        projectId: base().projectId,
        level: ticket.level,
        issueClass: { issueId: ticket.id, nature: ticket.nature, zone: ticket.zone, size: ticket.size, classifiedBy: 'rules', contentHash: '', sizeEstimated: false },
      }));
    const resolution = resolveCohortScope(key, tickets, 20);
    expect(resolution.fellBack).toBe(true);
    expect(resolution.reason).toContain('remonte');
  });

  it('élargit toujours par la règle de repli et retrouve la clé', () => {
    const key = { level: 'nature-zone-size' as const, nature: 'bugfix', zone: 'billing', size: 'M' };
    const large = widen(key);
    expect(large?.level).toBe('nature-size');
    expect(parseCohortKey(cohortKeyString(key))).toEqual(key);
  });

  it('garde une cohorte verte : mieux clôturé et aussi rapide sous un agent', () => {
    const vert = cohorte('epoch-2|data-migration|data-pipeline|M');
    expect(vert.agent.length).toBeGreaterThanOrEqual(20);
    expect(vert.human.length).toBeGreaterThanOrEqual(20);
    expect(vert.conclusion).toBe('better');
    expect(vert.recommandation).toBe('delegate');
  });

  it('refuse de conclure sur la cohorte grise, faute d’effectif', () => {
    const vue = grise();
    expect(vue.conclusion).toBe('not-enough-data');
    expect(vue.recommandation).toBe('not-enough-data');
    expect(vue.agentStat?.n ?? vue.humanStat?.n ?? 0).toBeLessThan(20);
  });

  it('signale des bras déséquilibrés sans conclure', () => {
    const vue = desequilibree();
    expect(vue.balance.balanced).toBe(false);
    expect(vue.conclusion).toBe('not-enough-data');
    // The volume gap is the flagged criterion (SPEC §7 rule 5).
    expect(vue.balance.signals.some((signal) => signal.criterion === 'volume-gap')).toBe(true);
  });

  it('masque une cohorte portée par moins de trois personnes', () => {
    const vue = masquee();
    expect(vue.peopleCount).toBeLessThan(3);
    expect(vue.masked).toBe(true);
  });

  it('groupe les cohortes de la base par nature, zone et taille', () => {
    const tickets = base().tickets.map((ticket): CohortTicket => ({
      issueId: ticket.id,
      projectId: base().projectId,
      level: ticket.level,
      issueClass: { issueId: ticket.id, nature: ticket.nature, zone: ticket.zone, size: ticket.size, classifiedBy: 'rules', contentHash: '', sizeEstimated: false },
    }));
    const groups = groupByCohort(tickets, 'nature-zone-size');
    // One group per identity, and a group never mixes two natures.
    expect(groups.length).toBeGreaterThan(10);
    for (const group of groups) {
      const natures = new Set(group.tickets.map((ticket) => ticket.issueClass.nature));
      expect(natures.size).toBe(1);
    }
  });
});