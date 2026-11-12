# Le jeu de données de démonstration — `src/sample/**`

SPEC §13, §24 · DP-20. Ce document décrit le jeu d'exemple : ce qu'il contient,
comment le charger, ce qu'il démontre écran par écran, et les chiffres attendus.

**Règle du lot** : les chiffres de ce document ne sont pas écrits à la main. Ils
sont ceux que le jeu produit, et `tests/sample/docs.test.ts` les recalcule à
chaque exécution : une ligne de ce document qui ne correspond plus au jeu fait
rougir la CI.

## 1. Ce que contient le jeu

Un projet Jira fictif `PROJ`, douze mois d'historique (du 1ᵉʳ décembre 2025 au
30 novembre 2026), trois époques, et un graphe de travail complet : chaque
ticket a son historique de statuts, ses commits (certains portant une mention
d'agent), ses pull requests avec relecteurs et avis, ses liens (bug causé, bug
voisin, incident), son classement et son résultat.

| Clé | Ce que le jeu contient | Valeur |
|---|---|---|
| FIG-01 | tickets du projet `PROJ` | 882 |
| FIG-02 | faits de commit | 1715 |
| FIG-03 | faits de relecture (pull requests) | 566 |
| FIG-04 | liens entre tickets | 144 |
| FIG-05 | époques | 3 |
| FIG-06 | implications inconnues | 369 |
| FIG-07 | part d'implication inconnue | 42 % |
| FIG-08 | tickets fermés | 877 |
| FIG-09 | tickets encore ouverts | 5 |
| FIG-10 | clôtures propres | 768 |
| FIG-11 | réouvertures | 29 |
| FIG-12 | cohortes (nature · zone · taille · époque) | 26 |
| FIG-13 | cohortes où l'app dit « on ne sait pas » | 21 |
| FIG-14 | cartes de recommandation produites | 5 |
| FIG-15 | essai contrôlé en cours | 1 |
| FIG-16 | sprints couverts | 25 |

Les cinq niveaux d'implication et les cinq sources apparaissent tous dans le jeu
(SPEC §5) : `none` 246, `assisted` 62, `driven` 174, `autonomous` 31,
`unknown` 369 ; `adoption-date` 378, `closure-field` 297, `mcp-declaration` 75,
`bot-author` 69, `commit-mention` 63.

Aucune personne n'apparaît : des rôles et un compte robot `agent-bot-1`
(SPEC §18, DP-17). Le jeu est marqué comme démonstration partout : `demo: true`
dans les réglages, l'étiquette `demo-dataset` dans le champ
`customfield_10022` de chaque ticket, l'étiquette `demo` sur chaque ticket, le
bandeau `DÉMO — données fictives / DEMO — fictional dataset`, et
`SAMPLE_IS_MARKED_AS_DEMO` (SPEC §13, DP-20).

## 2. Comment le charger

Le jeu est du **domaine pur** : aucun `@forge/*`, aucune base, aucune horloge.
La date de référence est fixée (`SAMPLE_NOW`, 30 novembre 2026 à midi UTC), donc
les chiffres sont les mêmes à chaque exécution.

```ts
import {
  sampleCards, sampleClasses, sampleCommitFacts, sampleEpochs, sampleHistories,
  sampleInvolvements, sampleLinks, sampleOutcomes, sampleReviewFacts,
  sampleSeeds, sampleSettings, sampleTickets, sampleTrial,
} from './src/sample/index.js';
```

Le mode démonstration (lot L7) branche ces fonctions à la place des passerelles
Forge : mêmes types de sortie, mêmes stores, aucun réseau. Les écrans lisent le
cache comme en production ; seul l'alimentateur change.

| Module | Rôle |
|---|---|
| `project.ts` | identité, réglages, calendrier fixé, helpers de dates |
| `epochs.ts` | les trois époques (SPEC §4, §12) |
| `issues.ts` | le catalogue des familles et la forme d'une graine |
| `builder.ts` | familles → graines (le générateur) |
| `history.ts` | ticket Jira, classement, implication, historique, réouvertures |
| `commits.ts` | faits de commit et catalogue de mentions |
| `pull-requests.ts` | faits de relecture |
| `outcomes.ts` | résultats et liens entre tickets |
| `index.ts` | API publique, cartes de recommandation, essai contrôlé |

**Zéro duplication** : les fourchettes, les conclusions, l'équilibre des bras,
les recommandations et la date de jugeabilité viennent du domaine déjà mergé
(`stats`, `conclusion`, `balance`, `recommendation`, `maturity`). Le jeu ne
réimplémente aucune règle.

## 3. Les chiffres que le jeu doit produire

### 3.1 Les cohortes citées par le SPEC

| Clé | Cohorte (nature · zone · taille · époque) | Bras | Effectif | Clôture propre | Fourchette | Délai médian |
|---|---|---|---|---|---|---|
| FIG-20 | bugfix · api · M · époque 2 | avec agent | 41 | 83 % | [68 ; 92] | 30 h |
| FIG-21 | bugfix · api · M · époque 2 | sans agent | 37 | 86 % | [72 ; 95] | 44 h |
| FIG-22 | data-migration · billing · M · époque 2 | avec agent | 20 | 40 % | [21 ; 62] | 36 h |
| FIG-23 | data-migration · billing · M · époque 2 | sans agent | 21 | 86 % | [65 ; 96] | 72 h |
| FIG-24 | data-migration · billing · M · époque 3 | avec agent | 26 | 69 % | [50 ; 84] | 36 h |
| FIG-25 | data-migration · billing · M · époque 3 | sans agent | 31 | 87 % | [71 ; 95] | 72 h |
| FIG-26 | tests · web-ui · M · époque 2 | avec agent | 40 | 85 % | [70 ; 93] | 40 h |
| FIG-27 | tests · web-ui · M · époque 2 | sans agent | 40 | 60 % | [44 ; 74] | 56 h |
| FIG-28 | data-migration · data-pipeline · M · époque 2 | avec agent | 36 | 83 % | [68 ; 93] | 32 h |
| FIG-29 | data-migration · data-pipeline · M · époque 2 | sans agent | 34 | 59 % | [42 ; 74] | 60 h |
| FIG-30 | external-integration · api · L · époque 2 | avec agent | 22 | 86 % | [66 ; 96] | 60 h |
| FIG-31 | external-integration · api · L · époque 2 | sans agent | 3 | 67 % | [20 ; 94] | 96 h |

Lecture :

- **FIG-20/21** — le couple du SPEC §7 : « Clôture propre : 83 % avec agent
  (41 tickets, entre 68 et 92 %), 86 % sans (37 tickets, entre 72 et 95 %) ».
  Écart **non établi** → « pareil » ; le délai est meilleur (30 h contre 44 h)
  → « agent, relecture renforcée » (SPEC §8, ligne 2).
- **FIG-22/23** — la case **rouge** : écart établi en défaveur des agents →
  `keep-human` (SPEC §8, recette 8).
- **FIG-24/25** — la cohorte de **PROJ-412**, la carte que montre la vidéo :
  26 avec agent, 31 sans, 1,5 jour contre 3 jours de délai médian, 5
  réouvertures sur 8 pour une migration non rejouable, tickets de référence
  PROJ-207, PROJ-233, PROJ-301.
- **FIG-26/27** — la case **verte** : écart établi en faveur des agents, aucun
  garde-fou → `delegate`.
- **FIG-28/29** — la case **orange** : écart établi en faveur des agents, mais
  la zone `data-pipeline` est sensible → garde-fou → `delegate-with-review`.
- **FIG-30/31** — le cas « **bras déséquilibrés** » : 22 contre 3, l'écart de
  volume dépasse la tolérance, l'app ne conclut pas (SPEC §7 règle 5, DP-10).

### 3.2 Les époques (SPEC §12)

| Époque | Début | Étiquette | Ce qui change |
|---|---|---|---|
| `epoch-1` | 2025-12-01 | outils initiaux, consignes v1 | avant l'adoption (2026-01-12), tout est « sans agent » |
| `epoch-2` | 2026-04-06 | consignes partagées v2 | mêmes outils, nouvelles consignes |
| `epoch-3` | 2026-09-14 | nouveau modèle, 14 septembre | nouveau modèle `model-b-2026` |

La migration de données de la zone `billing` passe de **rouge** (époque 2,
40 % contre 86 %, écart établi) à **orange** (époque 3, 69 % contre 87 %,
écart non établi → « pareil », délai meilleur → « agent, relecture
renforcée » : la carte du SPEC §8).

## 4. Ce que le jeu démontre, écran par écran

| Écran | Ce que le juge voit avec le jeu |
|---|---|
| Carte sur le ticket (`PROJ-412`) | la cohorte, les deux bras avec effectifs et fourchettes, les délais médians, les causes d'échec, les tickets de référence, la confiance, le bandeau de démo |
| Carte de délégation | la matrice natures × zones : une case verte, des cases orange, une rouge, et beaucoup de gris honnête (21 cohortes sur 26) ; le filtre par époque |
| Détail de cohorte | les deux bras, l'écart et son intervalle, la composition comparée, les causes d'échec, le cas « bras déséquilibrés » |
| Calibration | les recommandations données et les clôtures propres observées ensuite (SPEC §10) |
| Couverture | les droits sur le graphe ; sur le site de démo, aucun dépôt → ni commit ni PR (SPEC §24) |
| Essai contrôlé | un essai `running` sur `external-integration · api · M` (époque 3), là où l'app ne savait pas conclure |
| Outils MCP | `should-delegate` sur `PROJ-412`, `list-delegable-work` sur le sprint 42 (10 tickets, 12 points) |

Les cinq garde-fous et cas limites sont portés par des tickets nommés :

| Ticket | Cas démontré |
|---|---|
| `PROJ-412` | la carte du SPEC §8, migration non rejouable |
| `PROJ-207`, `PROJ-233`, `PROJ-301` | les tickets de référence de cette carte |
| `PROJ-455` | ticket lié à un **incident ouvert** → garde-fou `open-incident` |
| `PROJ-456` | l'incident ouvert lui-même |
| `PROJ-457` | ticket en **zone sensible** (`data-pipeline`) → garde-fou `sensitive-zone` |
| `PROJ-458` | ticket **sans critères d'acceptation** → garde-fou `missing-acceptance-criteria` |
| `PROJ-459` | ticket **sans commit** (`no-code`) : hors des cohortes de code (SPEC §21) |
| `PROJ-460` | ticket de l'**essai contrôlé** en cours |

## 5. Refaire les chiffres chez soi

```bash
npx vitest run tests/sample
```

- `tests/sample/figures.test.ts` — les trois jeux de chiffres du SPEC §7/§8,
  les quatre couleurs de la carte, les époques, l'essai, les garde-fous.
- `tests/sample/dataset.test.ts` — la cohérence (chaque fait pointe un ticket
  existant, aucune date hors des douze mois), le marquage de démonstration,
  l'absence de personne.
- `tests/sample/docs.test.ts` — ce document : chaque ligne `FIG-nn` est
  recalculée depuis le jeu.

## 6. Divergences résolues à l'intégration (lot L10)

Les deux divergences signalées par le lot L9 sont résolues en faveur du SPEC
(voir `docs/CONTRACTS.md`, « Écarts constatés à l'intégration ») :

1. **La carte de PROJ-412 sort « agent, relecture renforcée » (orange),
   exactement comme au SPEC §8.** `conclude` arbitre sur l'intervalle de la
   différence (Newcombe) : écart établi → `better`/`worse` ; écart **non
   établi** → `same` (« pareil », SPEC §7 règle 4) ; « on ne sait pas » est
   réservé aux cas de la ligne 4 du §8 (effectif sous le seuil, bras
   déséquilibrés). Avec le délai meilleur (1,5 jour contre 3 jours), la
   recommandation est « agent, relecture renforcée », confiance moyenne.
2. **La borne haute de la cohorte de PROJ-412 s'affiche 84 %, comme au §8.**
   Les bornes d'intervalle sont rendues de façon conservatrice : borne basse
   arrondie au plancher, borne haute au plafond (`percentFloor`/`percentCeil`,
   `src/domain/stats.ts`) — l'intervalle affiché ne revendique jamais plus que
   l'intervalle calculé.
