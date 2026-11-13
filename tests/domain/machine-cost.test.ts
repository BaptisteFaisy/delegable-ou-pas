/**
 * Tests du **coût machine** sur la donnée RÉELLE (lot « un coût réel »).
 *
 * Le point du module : le coût LLM vaut 0 € sur les 865 sessions récoltées
 * (tous les modèles utilisés sont gratuits), donc la seule dépense mesurable
 * est le **temps machine**. Ces tests ne construisent pas de fixture : ils
 * lisent `src/sample/opencode-real.json` et assertent les chiffres réels —
 * 865 sessions, 837,34 heures cumulées, 250 672 611 jetons, 25 sessions
 * rattachées à un ticket, 0 € de coût modèle. Une récolte périmée ou
 * tronquée ferait rougir cette suite, ce qui est exactement le but.
 *
 * Aucun réseau, aucune base vivante ici : le test porte sur le fichier
 * versionné. La preuve en direct est dans `tools/prove-real.mjs`.
 *
 * Règle : fichiers < 500 lignes, fonctions < 50 lignes.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseDataset } from '../../src/collect/opencode.js';
import type { OpenCodeSession } from '../../src/collect/opencode.js';
import {
  coutMachineParJour,
  coutMachineParModele,
  coutMachineParProjet,
  coutMachineParTicket,
  coutMachineTotal,
  coutSession,
  etiquetteModele,
  rapportCoutMachine,
} from '../../src/domain/machine-cost.js';
import type { SessionCoutable, TauxMachine } from '../../src/domain/machine-cost.js';

const JEU = fileURLToPath(new URL('../../src/sample/opencode-real.json', import.meta.url));

/** Le taux horaire de la machine est une HYPOTHÈSE de travail, pas une mesure. */
const TAUX: TauxMachine = { eurosParHeure: 0.05 };

/** Les sessions réelles du jeu versionné. */
function sessionsReelles(): readonly OpenCodeSession[] {
  const brut = readFileSync(JEU, 'utf8');
  return parseDataset(JSON.parse(brut)).sessions;
}

/** Adapte une session de collecte au type que le domaine attend. */
function coutable(session: OpenCodeSession): SessionCoutable {
  return {
    id: session.id,
    projet: session.project,
    modele: { provider: session.model.provider, id: session.model.id },
    coutEuros: session.costEuros,
    jetonsEntree: session.tokensIn,
    jetonsSortie: session.tokensOut,
    dureeMs: session.durationMs,
    debut: session.startedAt,
    cleTicket: session.issueKey,
  };
}

/** Les sessions réelles, transposées pour le domaine. */
function jeuCoutable(): readonly SessionCoutable[] {
  return sessionsReelles().map(coutable);
}

/** La somme des heures d'une liste de groupes. */
function sommeHeures(groups: readonly { readonly heures: number }[]): number {
  return Math.round(groups.reduce((total, group) => total + group.heures, 0) * 100) / 100;
}

describe('coût machine — le volume réel', () => {
  it('compte les 865 sessions récoltées', () => {
    expect(jeuCoutable().length).toBe(865);
    expect(coutMachineTotal(jeuCoutable()).sessions).toBe(865);
  });

  it('cumule 837,34 heures d’exécution sur le poste', () => {
    expect(coutMachineTotal(jeuCoutable()).heures).toBe(837.34);
  });

  it('cumule 250 672 611 jetons', () => {
    expect(coutMachineTotal(jeuCoutable()).jetons).toBe(250672611);
  });

  it('rattache 25 sessions à un ticket, sur 865', () => {
    const total = coutMachineTotal(jeuCoutable());
    expect(total.partTicket.n).toBe(865);
    expect(total.partTicket.rate).toBeCloseTo(25 / 865, 6);
    const sessionsRattachees = jeuCoutable().filter((session) => session.cleTicket !== null);
    expect(sessionsRattachees.length).toBe(25);
  });

  it('annonce les 3 sessions à durée nulle comme des durées inconnues', () => {
    const total = coutMachineTotal(jeuCoutable());
    expect(total.sessionsDureeInconnue).toBe(3);
    expect(total.partDureeInconnue.n).toBe(865);
    expect(total.dureeMediane.n).toBe(862);
  });
});

describe('coût machine — le coût modèle reste visible et vaut 0 €', () => {
  it('affiche un coût LLM total de 0 € — mesuré, pas caché', () => {
    expect(coutMachineTotal(jeuCoutable()).coutModeleEuros).toBe(0);
  });

  it('affiche 0 € pour chaque modèle, sans remplacer la machine', () => {
    const parModele = coutMachineParModele(jeuCoutable(), TAUX);
    expect(parModele.length).toBe(20);
    for (const modele of parModele) {
      expect(modele.coutModeleEuros).toBe(0);
      expect(modele.coutMachineEuros).toBeGreaterThanOrEqual(0);
    }
  });

  it('garde les deux coûts côte à côte dans le rapport', () => {
    const rapport = rapportCoutMachine(jeuCoutable(), TAUX);
    expect(rapport.total.coutModeleEuros).toBe(0);
    expect(rapport.total.coutMachineEuros).toBeGreaterThan(0);
  });
});

describe('coût machine — les agrégats', () => {
  it('répartit les 865 sessions par projet sans en perdre', () => {
    const parProjet = coutMachineParProjet(jeuCoutable(), TAUX);
    expect(parProjet.reduce((total, projet) => total + projet.sessions, 0)).toBe(865);
    expect(sommeHeures(parProjet)).toBe(837.34);
  });

  it('répartit les 865 sessions par modèle, 20 modèles distincts', () => {
    const parModele = coutMachineParModele(jeuCoutable(), TAUX);
    expect(parModele.length).toBe(20);
    expect(parModele.reduce((total, modele) => total + modele.sessions, 0)).toBe(865);
  });

  it('répartit les sessions par jour, du plus ancien au plus récent', () => {
    const parJour = coutMachineParJour(jeuCoutable(), TAUX);
    expect(parJour.length).toBe(39);
    const cles = parJour.map((jour) => jour.cle);
    expect(cles).toEqual([...cles].sort());
    expect(parJour.reduce((total, jour) => total + jour.sessions, 0)).toBe(865);
  });

  it('agrège les 25 sessions à ticket en 5 tickets', () => {
    const parTicket = coutMachineParTicket(jeuCoutable(), TAUX);
    expect(parTicket.length).toBe(5);
    expect(parTicket.reduce((total, ticket) => total + ticket.sessions, 0)).toBe(25);
    for (const ticket of parTicket) {
      expect(ticket.ticket).toMatch(/^PROJ-\d+$/);
      expect(ticket.coutModeleEuros).toBe(0);
      expect(ticket.coutMachineEuros).toBeGreaterThanOrEqual(0);
    }
  });

  it('nomme les modèles « fournisseur/identifiant »', () => {
    expect(etiquetteModele({ provider: 'opencode', id: 'space-bunny-free' }))
      .toBe('opencode/space-bunny-free');
    expect(etiquetteModele({ provider: '', id: '' })).toBe('modèle inconnu');
  });
});

describe('coût machine — le taux horaire est une hypothèse, pas une constante', () => {
  it('chiffre le coût machine quand le taux est fourni', () => {
    const total = coutMachineTotal(jeuCoutable(), TAUX);
    expect(total.tauxFourni).toBe(true);
    expect(total.coutMachineEuros).toBeCloseTo(41.8668, 4);
    expect(total.sessionsCoutInconnu).toBe(3);
  });

  it('donne un résultat INCONNU — jamais zéro — quand le taux manque', () => {
    const total = coutMachineTotal(jeuCoutable());
    expect(total.tauxFourni).toBe(false);
    expect(total.coutMachineEuros).toBe(-1);
    expect(total.sessionsCoutInconnu).toBe(865);
    // Le coût modèle reste affiché : 0 € mesuré, à côté d'un coût inconnu.
    expect(total.coutModeleEuros).toBe(0);
    expect(total.heures).toBe(837.34);
  });

  it('refuse un taux négatif : un coût ne se déduit pas d’une hypothèse absurde', () => {
    const total = coutMachineTotal(jeuCoutable(), { eurosParHeure: -1 });
    expect(total.coutMachineEuros).toBe(-1);
    expect(total.tauxFourni).toBe(false);
  });
});

describe('coût machine — les cas limites', () => {
  it('déclare le coût d’une session à durée nulle inconnu, pas nul', () => {
    const nulle = jeuCoutable().find((session) => session.dureeMs <= 0);
    expect(nulle).toBeDefined();
    const cout = coutSession(nulle as SessionCoutable, TAUX);
    expect(cout.heures).toBe(-1);
    expect(cout.coutMachineEuros).toBe(-1);
    expect(cout.coutConnu).toBe(false);
  });

  it('déclare le coût d’une session à durée négative inconnu', () => {
    const negative: SessionCoutable = {
      id: 'session-negative',
      projet: 'projet',
      modele: { provider: 'opencode', id: 'modele-gratuit' },
      coutEuros: 0,
      jetonsEntree: 10,
      jetonsSortie: 5,
      dureeMs: -1,
      debut: '2026-11-01T09:00:00.000Z',
      cleTicket: null,
    };
    const cout = coutSession(negative, TAUX);
    expect(cout.coutMachineEuros).toBe(-1);
    expect(cout.coutModeleEuros).toBe(0);
  });

  it('renvoie un total neutre sur une liste vide', () => {
    const total = coutMachineTotal([], TAUX);
    expect(total.sessions).toBe(0);
    expect(total.heures).toBe(0);
    expect(total.coutMachineEuros).toBe(0);
    expect(total.partTicket.n).toBe(0);
    expect(total.partTicket.ciHigh).toBe(1);
    expect(coutMachineParProjet([], TAUX)).toEqual([]);
    expect(coutMachineParTicket([], TAUX)).toEqual([]);
  });
});
