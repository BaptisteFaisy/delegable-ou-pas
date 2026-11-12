/**
 * The coverage matrix of the 31 requirements of SPEC §14, over the base.
 *
 * Covers: DP-01 … DP-31 (the matrix itself).
 *
 * Every mandatory requirement (M) must have a test on the reference database;
 * the test fails when one has none. The desirable (S) and the later (C)
 * requirements that no base test covers are listed as assumed, with the reason:
 * no gap is silent.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** One requirement of SPEC §14, with the priority the SPEC gives it. */
interface Exigence {
  readonly id: string;
  readonly priorite: 'M' | 'S' | 'C';
  readonly libelle: string;
  /** The file of `tests/base/` that covers it, empty when it is assumed. */
  readonly fichier: string;
  /** Why the requirement is assumed, when it is. */
  readonly raison: string;
}

/** The 31 requirements of SPEC §14, in the order of the SPEC. */
const EXIGENCES: readonly Exigence[] = [
  { id: 'DP-01', priorite: 'M', libelle: 'Relever l’implication d’agent de chaque ticket et afficher la source', fichier: 'implication.test.ts', raison: '' },
  { id: 'DP-02', priorite: 'M', libelle: 'Catalogue réglable des mentions de commit et liste des mentions vues', fichier: 'implication.test.ts', raison: '' },
  { id: 'DP-03', priorite: 'M', libelle: 'État « inconnue » distinct, jamais compté comme « sans agent »', fichier: 'implication.test.ts', raison: '' },
  { id: 'DP-04', priorite: 'M', libelle: 'Mesurer délai, réouverture, bug à la suite, incident et abandon', fichier: 'collecte.test.ts', raison: '' },
  { id: 'DP-05', priorite: 'M', libelle: 'Mesures de relecture d’après le graphe', fichier: 'collecte.test.ts', raison: '' },
  { id: 'DP-06', priorite: 'M', libelle: 'Classer la nature de chaque ticket et conserver le résultat', fichier: 'cohortes.test.ts', raison: '' },
  { id: 'DP-07', priorite: 'M', libelle: 'Cohortes nature × zone × taille, avec repli au niveau supérieur', fichier: 'cohortes.test.ts', raison: '' },
  { id: 'DP-08', priorite: 'M', libelle: 'Taux avec fourchette, effectif affiché, seuil réglable', fichier: 'statistique.test.ts', raison: '' },
  { id: 'DP-09', priorite: 'M', libelle: 'Quatre conclusions par cohorte, dont « on ne sait pas »', fichier: 'statistique.test.ts', raison: '' },
  { id: 'DP-10', priorite: 'M', libelle: 'Alerte « bras déséquilibrés »', fichier: 'cohortes.test.ts', raison: '' },
  { id: 'DP-11', priorite: 'M', libelle: 'Carte de recommandation sur le ticket', fichier: 'recommandation.test.ts', raison: '' },
  { id: 'DP-12', priorite: 'M', libelle: 'Garde-fous : incident ouvert, zone sensible, critères absents', fichier: 'recommandation.test.ts', raison: '' },
  { id: 'DP-13', priorite: 'M', libelle: 'Enregistrer la décision prise et la rapprocher du résultat', fichier: 'persistance.test.ts', raison: '' },
  { id: 'DP-14', priorite: 'M', libelle: 'Carte de délégation et détail d’une cohorte', fichier: 'ecrans.test.ts', raison: '' },
  { id: 'DP-15', priorite: 'M', libelle: 'Outils MCP du SPEC §15', fichier: 'mcp.test.ts', raison: '' },
  { id: 'DP-16', priorite: 'M', libelle: 'Agent Rovo « Conseiller de délégation » et skill', fichier: 'mcp.test.ts', raison: '' },
  { id: 'DP-17', priorite: 'M', libelle: 'Aucune statistique par personne ; cohortes masquées sous trois personnes', fichier: 'cohortes.test.ts', raison: '' },
  { id: 'DP-18', priorite: 'M', libelle: 'Collecte du graphe en session, reprise sur curseur', fichier: 'collecte.test.ts', raison: '' },
  { id: 'DP-19', priorite: 'M', libelle: 'Écran de couverture : implication connue et droits', fichier: 'ecrans.test.ts', raison: '' },
  { id: 'DP-20', priorite: 'M', libelle: 'Jeu de données d’exemple et mode démonstration', fichier: 'site.test.ts', raison: '' },
  { id: 'DP-21', priorite: 'S', libelle: 'Calibration et écran « Peut-on croire cette app ? »', fichier: 'ecrans.test.ts', raison: '' },
  { id: 'DP-22', priorite: 'S', libelle: 'Époques', fichier: 'cohortes.test.ts', raison: '' },
  { id: 'DP-23', priorite: 'S', libelle: 'Champ « Implication d’agent » à la clôture, prérempli', fichier: 'implication.test.ts', raison: '' },
  { id: 'DP-24', priorite: 'S', libelle: 'Part délégable d’un sprint, depuis l’action de sprint', fichier: 'ecrans.test.ts', raison: '' },
  { id: 'DP-25', priorite: 'S', libelle: 'Champ « Recommandation » et fonction JQL delegable()', fichier: '', raison: 'Le champ et la fonction JQL sont des points d’entrée Forge ; le jeu de démonstration n’en fournit pas la surface, la fonction ne s’exerce que dans Jira.' },
  { id: 'DP-26', priorite: 'S', libelle: 'Causes d’échec par cohorte, résumées d’après les réouvertures', fichier: 'recommandation.test.ts', raison: '' },
  { id: 'DP-27', priorite: 'S', libelle: 'Essai contrôlé', fichier: 'essai.test.ts', raison: '' },
  { id: 'DP-28', priorite: 'S', libelle: 'Collecte en arrière-plan, sans visiteur', fichier: '', raison: 'Le graphe se lit en session d’un utilisateur connecté : une collecte sans visiteur n’existe pas dans le produit, il n’y a donc rien à exercer sur la base.' },
  { id: 'DP-29', priorite: 'C', libelle: 'Comparaison par outil et par modèle, sur décision de l’équipe', fichier: '', raison: 'Exigence postérieure au hackathon : la base n’a qu’un modèle et un outil par cohorte, la comparaison n’a pas de matière.' },
  { id: 'DP-30', priorite: 'C', libelle: 'Coût rapporté au résultat', fichier: '', raison: 'Exigence postérieure au hackathon : le jeu de démonstration ne porte aucune donnée de coût.' },
  { id: 'DP-31', priorite: 'C', libelle: 'Comparaison anonymisée entre équipes', fichier: '', raison: 'Exigence postérieure au hackathon : la base ne porte qu’une équipe, il n’y a rien à comparer.' },
];

/** The files of the base floor, read from the disk. */
function fichiersDeLaBase(): readonly string[] {
  return readdirSync(join(process.cwd(), 'tests', 'base'))
    .filter((name) => name.endsWith('.test.ts'))
    .sort();
}

describe('la matrice des 31 exigences du SPEC §14 sur la base', () => {
  it('couvre les 31 exigences, chacune avec sa priorité et son fichier', () => {
    expect(EXIGENCES).toHaveLength(31);
    expect(new Set(EXIGENCES.map((exigence) => exigence.id)).size).toBe(31);
    for (const exigence of EXIGENCES) {
      expect(exigence.libelle.length).toBeGreaterThan(0);
      if (exigence.fichier !== '') expect(exigence.raison).toBe('');
      else expect(exigence.raison.length).toBeGreaterThan(0);
    }
  });

  it('donne à chaque exigence M un test sur la base', () => {
    const fichiers = new Set(fichiersDeLaBase());
    const sansTest = EXIGENCES
      .filter((exigence) => exigence.priorite === 'M' && exigence.fichier === '')
      .map((exigence) => exigence.id);
    expect(sansTest).toEqual([]);
    for (const exigence of EXIGENCES) {
      if (exigence.fichier === '') continue;
      expect(fichiers.has(exigence.fichier)).toBe(true);
    }
  });

  it('donne à chaque exigence S ou C soit un test, soit une raison d’assomption', () => {
    const sansTestNiRaison = EXIGENCES
      .filter((exigence) => exigence.priorite !== 'M')
      .filter((exigence) => exigence.fichier === '' && exigence.raison === '')
      .map((exigence) => exigence.id);
    expect(sansTestNiRaison).toEqual([]);
  });

  it('nomme dans chaque fichier de test les exigences qu’il couvre', () => {
    for (const exigence of EXIGENCES) {
      if (exigence.fichier === '') continue;
      const source = readFileSync(join(process.cwd(), 'tests', 'base', exigence.fichier), 'utf8');
      expect(source).toContain(exigence.id);
    }
  });

  it('couvre toutes les exigences M sans doublon de fichier inutilisé', () => {
    const couvertes = new Set(EXIGENCES.filter((exigence) => exigence.fichier !== '').map((exigence) => exigence.fichier));
    const fichiers = fichiersDeLaBase().filter((name) => name !== 'exigences.test.ts');
    // Every floor file of the base earns its place in the matrix.
    for (const fichier of fichiers) {
      expect(couvertes.has(fichier)).toBe(true);
    }
  });
});