/**
 * Le mode « sans données fictives » : ce que l'app dit quand la seule source
 * est la télémétrie réelle du poste.
 *
 * Les tests jouent sur la **donnée réelle versionnée** (865 sessions récoltées
 * le 13 novembre 2026) et sur le bac à sable (5 sessions). Les chiffres
 * assertés sont des valeurs dorées : ils disent ce que la donnée dit, pas ce
 * qu'on voudrait qu'elle dise.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseDataset } from '../../src/collect/opencode.js';
import { depuisOpenCode } from '../../src/collect/session-reelle.js';
import type { SessionReelle } from '../../src/collect/session-reelle.js';
import { bilanRealOnly, besoinsPourDecider } from '../../src/domain/real-only.js';
import type { SessionVerifiable } from '../../src/domain/real-only.js';

const JEU = fileURLToPath(new URL('../../src/sample/opencode-real.json', import.meta.url));

/** Les sessions réelles récoltées, converties dans la forme unifiée. */
function sessionsReelles(): SessionReelle[] {
  return parseDataset(JSON.parse(readFileSync(JEU, 'utf8'))).sessions.map(depuisOpenCode);
}

/** Les mêmes sessions, avec l'issue qu'on ne connaît pas. */
function sessionsVerifiables(): SessionVerifiable[] {
  return sessionsReelles().map((session) => ({ ...session, issue: 'inconnu' as const }));
}

describe('mode réel — la donnée telle qu’elle est', () => {
  it('compte ce que la télémétrie contient vraiment', () => {
    const bilan = bilanRealOnly(sessionsVerifiables());
    expect(bilan.sessions).toBe(865);
    expect(bilan.sessionsAvecTicket).toBe(25);
    expect(bilan.tickets).toBe(5);
    expect(bilan.ticketsObservables).toBe(5);
  });

  it('ne décide de rien : la comparaison est impossible sur cette donnée', () => {
    const bilan = bilanRealOnly(sessionsVerifiables());
    expect(bilan.ticketsDecidables).toBe(0);
    expect(bilan.conclusion).toBe('insuffisant');
    expect(bilan.blocages).toContain('pas-de-bras-humain');
    expect(bilan.blocages).toContain('issue-inconnu');
  });

  it('dit ce qu’il faudrait pour décider', () => {
    const besoins = besoinsPourDecider(bilanRealOnly(sessionsVerifiables()));
    expect(besoins.join(' ')).toContain('bras humain');
    expect(besoins.join(' ')).toContain('issue');
  });

  it('ne confond pas « mesuré à zéro » et « on ne sait pas »', () => {
    const sessions = sessionsReelles();
    const sansDiff = sessions.filter((session) => session.ajouts === -1);
    expect(sansDiff.length).toBe(865);
    expect(sessions.every((session) => session.ajouts !== 0)).toBe(true);
  });
});

describe('mode réel — les cas où l’app déciderait', () => {
  it('décide quand la comparaison est là : deux sessions, un issue connu, un bras humain', () => {
    const sessions: SessionVerifiable[] = [
      { ...uneSession('a'), agent: 'build', issue: 'propre' },
      { ...uneSession('b'), agent: '', issue: 'repris' },
    ];
    const bilan = bilanRealOnly(sessions);
    expect(bilan.ticketsDecidables).toBe(1);
    expect(bilan.conclusion).toBe('exploitable');
  });

  it('ne décide pas d’une cohorte d’une seule session', () => {
    const bilan = bilanRealOnly([{ ...uneSession('a'), agent: 'build', issue: 'propre' }]);
    expect(bilan.ticketsDecidables).toBe(0);
    expect(bilan.blocages).toContain('cohorte-trop-petite');
  });

  it('reste partiel quand un seul ticket est décidable', () => {
    const sessions: SessionVerifiable[] = [
      { ...uneSession('a'), agent: 'build', issue: 'propre' },
      { ...uneSession('b'), agent: '', issue: 'repris' },
      { ...uneSession('c'), agent: 'build', issue: 'propre', cleTicket: 'PROJ-999' },
    ];
    const bilan = bilanRealOnly(sessions);
    expect(bilan.tickets).toBe(2);
    expect(bilan.ticketsDecidables).toBe(1);
    expect(bilan.conclusion).toBe('partiel');
  });
});

/** Une session minimale, pour les cas limites. */
function uneSession(suffixe: string): SessionReelle {
  return {
    id: `oc_test${suffixe}00000000`,
    client: 'opencode',
    projet: 'lab',
    titre: 'un titre',
    agent: 'build',
    modele: { provider: 'opencode', id: 'test' },
    coutEuros: 0,
    jetonsEntree: 100,
    jetonsSortie: 50,
    ajouts: -1,
    suppressions: -1,
    fichiersTouches: -1,
    dureeMs: 60_000,
    debut: '2026-11-01T10:00:00.000Z',
    fin: '2026-11-01T10:01:00.000Z',
    cleTicket: 'PROJ-101',
    attribution: 'aucune',
  };
}
