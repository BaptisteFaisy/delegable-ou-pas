/**
 * Le **coût machine** : ce qu'une session d'agent a réellement occupé.
 *
 * Pourquoi ce module existe : sur la donnée réelle, tous les modèles utilisés
 * sont gratuits — le coût LLM mesuré vaut 0 €. Comparer 0 € à 0 € ne dit rien.
 * La vraie dépense, elle, est mesurable : 837,34 heures d'exécution cumulées
 * sur le poste, 250 672 611 jetons. Ce module rend cette dépense lisible, à
 * côté du coût modèle — jamais à sa place.
 *
 * Deux règles tenent :
 *
 * 1. **Le taux horaire est un paramètre**, jamais une constante cachée. Il
 *    s'agit d'une *hypothèse* (amortissement et électricité du poste), pas
 *    d'une mesure. Sans taux fourni, le coût machine est **inconnu** (`-1`),
 *    jamais `0` : confondre « pas de prix » et « gratuit » serait exactement
 *    le mensonge que ce projet combat.
 * 2. **Absent = `-1`, jamais `0`** (CONTRATS-REALITE §1). Une session dont la
 *    durée est nulle ou négative a un coût *inconnu* : sa durée n'a pas été
 *    mesurée, elle n'a pas valu zéro.
 *
 * Le domaine est pur : aucun `fs`, aucun réseau, aucune horloge non injectée.
 * Les entrées arrivent en paramètres, le jour se déduit de la donnée
 * (`debut`), jamais de l'heure du système.
 *
 * Les fourchettes viennent de `src/domain/stats.ts` (Wilson, médiane) : on ne
 * réimplémente pas une formule déjà écrite.
 *
 * Règle : fichiers < 500 lignes, fonctions < 50 lignes.
 */
import { medianInterval, proportion } from './stats.js';
import type { DurationInterval } from './stats.js';
import type { ProportionStat } from '../types.js';

const MS_PAR_HEURE = 3_600_000;

/** Valeur sentinelle d'une grandeur *inconnue* (CONTRATS-REALITE §1). */
export const INCONNU = -1;

/**
 * Une session réelle, vue par ses seuls champs de coût.
 *
 * Ce type est un sous-ensemble de la `SessionReelle` du contrat gelé
 * (CONTRATS-REALITE §1) : les champs portent les mêmes noms, donc une
 * session du contrat s'y branche sans adaptation.
 */
export interface SessionCoutable {
  readonly id: string;
  /** Projet relatif, jamais un chemin absolu. */
  readonly projet: string;
  readonly modele: { readonly provider: string; readonly id: string };
  /** Coût réel du modèle, mesuré : `0` quand le modèle est gratuit. */
  readonly coutEuros: number;
  readonly jetonsEntree: number;
  readonly jetonsSortie: number;
  /** Durée réelle d'exécution, en millisecondes ; `-1` quand elle est inconnue. */
  readonly dureeMs: number;
  /** Début ISO 8601 : c'est de là que vient le jour, jamais de l'horloge. */
  readonly debut: string;
  /** Clé de ticket rattachée (`PROJ-101`), `null` quand elle est inconnue. */
  readonly cleTicket: string | null;
}

/**
 * Le taux horaire de la machine, en euros par heure.
 *
 * C'est une **hypothèse** posée par l'équipe, pas une mesure : le module la
 * reçoit en paramètre et ne l'invente jamais.
 */
export interface TauxMachine {
  readonly eurosParHeure: number;
}

/** Le coût d'une session : la machine à côté du modèle. */
export interface CoutSession {
  readonly sessionId: string;
  /** Durée en heures ; `-1` quand la durée est inconnue ou nulle. */
  readonly heures: number;
  /** Coût machine en euros ; `-1` quand il est inconnu. */
  readonly coutMachineEuros: number;
  /** Coût modèle mesuré (0 € pour un modèle gratuit) — jamais remplacé. */
  readonly coutModeleEuros: number;
  readonly jetons: number;
  /** Vrai quand le coût machine est calculable (durée connue *et* taux fourni). */
  readonly coutConnu: boolean;
}

/** Un groupe de sessions : par projet, par modèle ou par jour. */
export interface CoutGroupe {
  readonly cle: string;
  readonly sessions: number;
  /** Sessions dont la durée n'a pas été mesurée. */
  readonly sessionsDureeInconnue: number;
  /** Sessions au coût machine inconnu (durée inconnue, ou taux non fourni). */
  readonly sessionsCoutInconnu: number;
  /** Heures cumulées des sessions à durée connue. */
  readonly heures: number;
  /** Coût machine cumulé ; `-1` quand le taux n'a pas été fourni. */
  readonly coutMachineEuros: number;
  /** Coût modèle cumulé (0 € pour les modèles gratuits). */
  readonly coutModeleEuros: number;
  readonly jetons: number;
}

/** Le coût d'un ticket, sessions rattachées confondues. */
export interface CoutTicket {
  readonly ticket: string;
  readonly sessions: number;
  readonly heures: number;
  /** Coût machine cumulé ; `-1` quand le taux n'a pas été fourni. */
  readonly coutMachineEuros: number;
  /** Coût modèle cumulé (0 € pour les modèles gratuits). */
  readonly coutModeleEuros: number;
  readonly jetons: number;
}

/** Le total, avec son effectif et ses fourchettes. */
export interface CoutMachineTotal {
  readonly sessions: number;
  /** Sessions dont la durée n'a pas été mesurée (durée nulle ou négative). */
  readonly sessionsDureeInconnue: number;
  /** Sessions au coût machine inconnu (durée inconnue, ou taux non fourni). */
  readonly sessionsCoutInconnu: number;
  /** Vrai quand un taux horaire a été fourni : le coût machine est chiffré. */
  readonly tauxFourni: boolean;
  /** Heures cumulées des sessions à durée connue. */
  readonly heures: number;
  /** Coût machine total ; `-1` quand le taux n'a pas été fourni. */
  readonly coutMachineEuros: number;
  /** Coût modèle total, mesuré : 0 € quand tous les modèles sont gratuits. */
  readonly coutModeleEuros: number;
  readonly jetons: number;
  /** Part des sessions rattachées à un ticket, avec son intervalle de Wilson. */
  readonly partTicket: ProportionStat;
  /** Part des sessions à durée inconnue, avec son intervalle de Wilson. */
  readonly partDureeInconnue: ProportionStat;
  /** Médiane des durées connues, avec son intervalle distribution-free. */
  readonly dureeMediane: DurationInterval;
}

/** Le rapport complet : total, par projet, par modèle, par jour, par ticket. */
export interface RapportCoutMachine {
  readonly total: CoutMachineTotal;
  readonly parProjet: readonly CoutGroupe[];
  readonly parModele: readonly CoutGroupe[];
  readonly parJour: readonly CoutGroupe[];
  readonly parTicket: readonly CoutTicket[];
}

/** Étiquette d'un modèle : `fournisseur/identifiant`, jamais de barre orpheline. */
export function etiquetteModele(modele: { readonly provider: string; readonly id: string }): string {
  const id = modele.id.trim();
  const provider = modele.provider.trim();
  if (id !== '' && provider !== '') return `${provider}/${id}`;
  if (id !== '') return id;
  if (provider !== '') return provider;
  return 'modèle inconnu';
}

/** Durée en heures, ou `-1` quand la durée n'a pas été mesurée. */
function heuresConnues(dureeMs: number): number {
  if (!Number.isFinite(dureeMs) || dureeMs <= 0) return INCONNU;
  return dureeMs / MS_PAR_HEURE;
}

/** Le coût machine d'une durée, ou `-1` quand il est inconnu. */
function coutMachine(heures: number, taux?: TauxMachine | null): number {
  if (heures < 0) return INCONNU;
  if (!taux || !Number.isFinite(taux.eurosParHeure) || taux.eurosParHeure < 0) return INCONNU;
  return arrondirEuros(heures * taux.eurosParHeure);
}

/** Vrai quand le taux fourni permet de chiffrer une durée. */
function tauxUtilisable(taux?: TauxMachine | null): boolean {
  return Boolean(taux) && Number.isFinite(taux?.eurosParHeure ?? Number.NaN) && (taux?.eurosParHeure ?? 0) >= 0;
}

/** Arrondi au centième de centime : un coût ne s'affiche jamais en flottant nu. */
function arrondirEuros(valeur: number): number {
  return Math.round(valeur * 1e4) / 1e4;
}

/** Arrondi à l'heure centième : une durée s'exprime en heures. */
function arrondirHeures(valeur: number): number {
  return Math.round(valeur * 100) / 100;
}

/**
 * Le coût d'une session : la machine à côté du modèle.
 *
 * Sans taux, le coût machine est *inconnu* (`-1`) : le modèle reste à 0 €,
 * affiché tel quel, pour qu'on ne confonde pas « gratuit » et « non chiffré ».
 */
export function coutSession(session: SessionCoutable, taux?: TauxMachine | null): CoutSession {
  const heures = heuresConnues(session.dureeMs);
  const cout = coutMachine(heures, taux);
  return {
    sessionId: session.id,
    heures: heures < 0 ? INCONNU : arrondirHeures(heures),
    coutMachineEuros: cout,
    coutModeleEuros: session.coutEuros,
    jetons: session.jetonsEntree + session.jetonsSortie,
    coutConnu: cout >= 0,
  };
}

/** Regroupe les sessions par une clé (projet, modèle, jour, ticket). */
function regrouper(
  sessions: readonly SessionCoutable[],
  cle: (session: SessionCoutable) => string,
): Map<string, SessionCoutable[]> {
  const groupes = new Map<string, SessionCoutable[]>();
  for (const session of sessions) {
    const nom = cle(session);
    const liste = groupes.get(nom) ?? [];
    liste.push(session);
    groupes.set(nom, liste);
  }
  return groupes;
}

/** Agrège un groupe de sessions : effectif, heures, machine, modèle. */
function agregerGroupe(
  cle: string,
  sessions: readonly SessionCoutable[],
  taux?: TauxMachine | null,
): CoutGroupe {
  let heures = 0;
  let dureeInconnue = 0;
  let coutModele = 0;
  let jetons = 0;
  for (const session of sessions) {
    const h = heuresConnues(session.dureeMs);
    if (h < 0) dureeInconnue += 1;
    else heures += h;
    coutModele += session.coutEuros;
    jetons += session.jetonsEntree + session.jetonsSortie;
  }
  const cout = coutMachine(heures, taux);
  const coutInconnu = tauxUtilisable(taux) ? dureeInconnue : sessions.length;
  return {
    cle,
    sessions: sessions.length,
    sessionsDureeInconnue: dureeInconnue,
    sessionsCoutInconnu: coutInconnu,
    heures: arrondirHeures(heures),
    coutMachineEuros: cout,
    coutModeleEuros: arrondirEuros(coutModele),
    jetons,
  };
}

/** Trie les groupes : le plus lourd en heures d'abord, puis par clé. */
function parHeuresDecroissantes(a: CoutGroupe, b: CoutGroupe): number {
  return b.heures - a.heures || (a.cle < b.cle ? -1 : 1);
}

/** Le jour d'une session, déduit de son `debut` ISO — jamais de l'horloge. */
function jourDe(session: SessionCoutable): string {
  return typeof session.debut === 'string' && session.debut.length >= 10
    ? session.debut.slice(0, 10)
    : 'date inconnue';
}

/** Le cumul des sessions : heures, coûts, jetons, tickets. */
interface Cumul {
  heures: number;
  dureeInconnue: number;
  coutModele: number;
  jetons: number;
  avecTicket: number;
  heuresParSession: number[];
}

/** Parcourt les sessions et cumule ce qu'un total doit dire. */
function cumuler(sessions: readonly SessionCoutable[]): Cumul {
  const cumul: Cumul = {
    heures: 0,
    dureeInconnue: 0,
    coutModele: 0,
    jetons: 0,
    avecTicket: 0,
    heuresParSession: [],
  };
  for (const session of sessions) {
    const h = heuresConnues(session.dureeMs);
    if (h < 0) cumul.dureeInconnue += 1;
    else {
      cumul.heures += h;
      cumul.heuresParSession.push(h);
    }
    cumul.coutModele += session.coutEuros;
    cumul.jetons += session.jetonsEntree + session.jetonsSortie;
    if (session.cleTicket !== null && session.cleTicket !== '') cumul.avecTicket += 1;
  }
  return cumul;
}

/**
 * Le total : effectif, heures, coût machine, coût modèle, fourchettes.
 *
 * Les deux coûts sont toujours présents et jamais confondus : le modèle à
 * côté de la machine, même quand il vaut 0 €.
 */
export function coutMachineTotal(
  sessions: readonly SessionCoutable[],
  taux?: TauxMachine | null,
): CoutMachineTotal {
  const cumul = cumuler(sessions);
  const cout = coutMachine(cumul.heures, taux);
  return {
    sessions: sessions.length,
    sessionsDureeInconnue: cumul.dureeInconnue,
    sessionsCoutInconnu: tauxUtilisable(taux) ? cumul.dureeInconnue : sessions.length,
    tauxFourni: tauxUtilisable(taux),
    heures: arrondirHeures(cumul.heures),
    coutMachineEuros: cout,
    coutModeleEuros: arrondirEuros(cumul.coutModele),
    jetons: cumul.jetons,
    partTicket: proportion(cumul.avecTicket, sessions.length),
    partDureeInconnue: proportion(cumul.dureeInconnue, sessions.length),
    dureeMediane: medianInterval(cumul.heuresParSession),
  };
}

/** Le coût machine par projet. */
export function coutMachineParProjet(
  sessions: readonly SessionCoutable[],
  taux?: TauxMachine | null,
): CoutGroupe[] {
  const groupes = regrouper(sessions, (session) => session.projet);
  return [...groupes.entries()]
    .map(([cle, liste]) => agregerGroupe(cle, liste, taux))
    .sort(parHeuresDecroissantes);
}

/** Le coût machine par modèle, avec le coût modèle en face. */
export function coutMachineParModele(
  sessions: readonly SessionCoutable[],
  taux?: TauxMachine | null,
): CoutGroupe[] {
  const groupes = regrouper(sessions, (session) => etiquetteModele(session.modele));
  return [...groupes.entries()]
    .map(([cle, liste]) => agregerGroupe(cle, liste, taux))
    .sort(parHeuresDecroissantes);
}

/** Le coût machine par jour de début, du plus ancien au plus récent. */
export function coutMachineParJour(
  sessions: readonly SessionCoutable[],
  taux?: TauxMachine | null,
): CoutGroupe[] {
  const groupes = regrouper(sessions, jourDe);
  return [...groupes.entries()]
    .map(([cle, liste]) => agregerGroupe(cle, liste, taux))
    .sort((a, b) => (a.cle < b.cle ? -1 : 1));
}

/** Le coût machine par ticket : les sessions rattachées, regroupées. */
export function coutMachineParTicket(
  sessions: readonly SessionCoutable[],
  taux?: TauxMachine | null,
): CoutTicket[] {
  const rattachees = sessions.filter(
    (session) => session.cleTicket !== null && session.cleTicket !== '',
  );
  const groupes = regrouper(rattachees, (session) => session.cleTicket as string);
  const tickets = [...groupes.entries()].map(([ticket, liste]) => {
    const groupe = agregerGroupe(ticket, liste, taux);
    return {
      ticket,
      sessions: groupe.sessions,
      heures: groupe.heures,
      coutMachineEuros: groupe.coutMachineEuros,
      coutModeleEuros: groupe.coutModeleEuros,
      jetons: groupe.jetons,
    };
  });
  return tickets.sort((a, b) => b.heures - a.heures || (a.ticket < b.ticket ? -1 : 1));
}

/** Le rapport complet : tout ce que l'écran aura à afficher. */
export function rapportCoutMachine(
  sessions: readonly SessionCoutable[],
  taux?: TauxMachine | null,
): RapportCoutMachine {
  return {
    total: coutMachineTotal(sessions, taux),
    parProjet: coutMachineParProjet(sessions, taux),
    parModele: coutMachineParModele(sessions, taux),
    parJour: coutMachineParJour(sessions, taux),
    parTicket: coutMachineParTicket(sessions, taux),
  };
}
