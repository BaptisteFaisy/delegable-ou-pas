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
| FIG-01 | tickets du projet `PROJ` | 2939 |
| FIG-02 | faits de commit | 5815 |
| FIG-03 | faits de relecture (pull requests) | 1930 |
| FIG-04 | liens entre tickets | 454 |
| FIG-05 | époques | 3 |
| FIG-06 | implications inconnues | 1199 |
| FIG-07 | part d'implication inconnue | 41 % |
| FIG-08 | tickets fermés | 2815 |
| FIG-09 | tickets encore ouverts | 124 |
| FIG-10 | clôtures propres | 2544 |
| FIG-11 | réouvertures | 52 |
| FIG-12 | cohortes (nature · zone · taille · époque) | 36 |
| FIG-13 | cohortes où l'app dit « on ne sait pas » | 25 |
| FIG-14 | cartes de recommandation produites | 8 |
| FIG-15 | essai contrôlé en cours | 1 |
| FIG-16 | sprints couverts | 25 |

Les cinq niveaux d'implication et les cinq sources apparaissent tous dans le jeu
(SPEC §5) : `none` 805, `assisted` 182, `driven` 620, `autonomous` 133,
`unknown` 1199 ; `adoption-date` 1208, `closure-field` 1017, `mcp-declaration` 249,
`bot-author` 236, `commit-mention` 229.

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
| `scenarios.ts` | le tableau des scénarios : la seule source de vérité du jeu |
| `cas-limites.ts` | les cas limites nommés du SPEC §21 et §22 |
| `issues.ts` | la forme d'une graine et le catalogue des familles |
| `builder.ts` | scénarios → graines (le générateur) |
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
| FIG-26 | tests · web-ui · M · époque 2 | avec agent | 88 | 89 % | [80 ; 94] | 40 h |
| FIG-27 | tests · web-ui · M · époque 2 | sans agent | 82 | 76 % | [65 ; 84] | 54 h |
| FIG-28 | data-migration · data-pipeline · M · époque 2 | avec agent | 36 | 83 % | [68 ; 93] | 32 h |
| FIG-29 | data-migration · data-pipeline · M · époque 2 | sans agent | 34 | 59 % | [42 ; 74] | 60 h |
| FIG-30 | external-integration · api · L · époque 2 | avec agent | 22 | 86 % | [66 ; 96] | 60 h |
| FIG-31 | external-integration · api · L · époque 2 | sans agent | 3 | 67 % | [20 ; 94] | 96 h |

Lecture :

- **FIG-20/21** — le couple du SPEC §7 : « Clôture propre : 83 % avec agent
  (41 tickets, entre 69 et 91 %), 86 % sans (37 tickets, entre 72 et 94 %) ».
  Écart **non établi** → « on ne sait pas ».
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
40 % contre 86 %, écart établi) à **gris** (époque 3, 69 % contre 87 %, écart
non établi) — voir la divergence annoncée au §6.

## 4. Ce que le jeu démontre, écran par écran

| Écran | Ce que le juge voit avec le jeu |
|---|---|
| Carte sur le ticket (`PROJ-412`) | la cohorte, les deux bras avec effectifs et fourchettes, les délais médians, les causes d'échec, les tickets de référence, la confiance, le bandeau de démo |
| Carte de délégation | la matrice natures × zones : une case verte, une orange, une rouge, et beaucoup de gris honnête (25 cohortes sur 36) ; le filtre par époque |
| Détail de cohorte | les deux bras, l'écart et son intervalle, la composition comparée, les causes d'échec, le cas « bras déséquilibrés » |
| Calibration | les recommandations données et les clôtures propres observées ensuite (SPEC §10) |
| Couverture | les droits sur le graphe ; sur le site de démo, aucun dépôt → ni commit ni PR (SPEC §24) |
| Essai contrôlé | un essai `running` sur `external-integration · api · M` (époque 3), là où l'app ne savait pas conclure |
| Outils MCP | `should-delegate` sur `PROJ-412`, `list-delegable-work` sur le sprint 42 (35 tickets, 63 points) |

Les cinq garde-fous et cas limites sont portés par des tickets nommés :

| Ticket | Cas démontré |
|---|---|
| `PROJ-412` | la carte du SPEC §8, migration non rejouable |
| `PROJ-207`, `PROJ-233`, `PROJ-301` | les tickets de référence de cette carte |
| `PROJ-455` | ticket lié à un **incident ouvert** → garde-fou `open-incident` |
| `PROJ-456` | l'incident ouvert lui-même |
| `PROJ-457` | ticket en **zone sensible** (`data-pipeline`) → garde-fou `sensitive-zone` |
| `PROJ-458` | ticket **sans critères d'acceptation** → garde-fou `missing-acceptance-criteria` |
| `PROJ-459`, `PROJ-950` | tickets **sans commit** (`no-code`) : hors des cohortes de code (SPEC §21) |
| `PROJ-460` | ticket de l'**essai contrôlé** en cours |

Les dix-huit cas limites du SPEC §21 et §22 ont, eux aussi, un ticket nommé
(SPEC §24.1 : une clé ne bouge jamais) :

| Ticket | Cas démontré |
|---|---|
| `PROJ-118` | clos **avant la date d'adoption** : bras « sans agent » |
| `PROJ-509` | lié à un **incident ouvert** : jamais « à confier à un agent » |
| `PROJ-517` | en **zone sensible** : garde-fou |
| `PROJ-523` | **sans critères d'acceptation** : garde-fou |
| `PROJ-531` | **commits mêlés**, signés et non signés : niveau `assisted` |
| `PROJ-540` | **agent muet** : ni signature ni déclaration, donc inconnu — et jamais compté « sans agent » |
| `PROJ-548` | **réouverture administrative de 8 minutes** : écartée, elle n'invalide pas la clôture propre |
| `PROJ-555` | **bug voisin** : signal faible, hors de la clôture propre |
| `PROJ-562` | bug relié par « est causé par » : pas une clôture propre |
| `PROJ-571` | rouvert sous 30 jours : pas une clôture propre |
| `PROJ-611` | **déplacé de projet** : il change de cohorte, il garde son implication et son résultat |
| `PROJ-701` | dans l'**essai contrôlé**, tirage respecté : il y reste |
| `PROJ-706` | dans l'essai, **tirage non respecté** : il en sort avec le motif |
| `PROJ-812` | **reprise humaine** déclarée : aucun nom de personne |
| `PROJ-820` | **abandon** après démarrage |
| `PROJ-902` | clos **il y a 10 jours** : pas encore mûr |

## 5. Refaire les chiffres chez soi

```bash
npx vitest run tests/sample
```

- `tests/sample/base-scenarios.test.ts` — les dix scénarios de la base : les
  effectifs, les clôtures propres, les délais médians, le paradoxe de Simpson.
- `tests/sample/spec-8.test.ts` — la carte de `PROJ-412`, chiffre par chiffre.
- `tests/sample/cas-limites.test.ts` — les dix-huit cas limites, un test par
  ticket nommé.
- `tests/sample/coherence.test.ts` — la cohérence (chaque fait pointe un ticket
  existant, aucune date hors des douze mois), le marquage de démonstration,
  l'absence de personne.
- `tests/sample/determinisme.test.ts` — deux appels au constructeur rendent le
  même jeu, et le tirage de l'essai rejouable depuis sa graine.
- `tests/sample/couverture-fonctionnalites.test.ts` — la matière des huit
  écrans, des neuf outils MCP et des seize panneaux du site.
- `tests/sample/docs.test.ts` — ce document : chaque ligne `FIG-nn` est
  recalculée depuis le jeu.

## 6. Divergences assumées entre le SPEC et le domaine mergé
Le jeu reste fidèle au **domaine mergé** : il n'invente pas un avis que l'app ne
donnerait pas. Deux écarts avec la prose du SPEC sont signalés ici et dans la
PR (ils relèvent d'une PR `CONTRACT-CHANGE`, pas de ce lot) :

1. **La carte de PROJ-412 sort « pas assez de recul » (gris), pas « agent,
   relecture renforcée » (orange).** Le tableau du §8 prévoit la ligne « délai
   meilleur, mais clôture propre en retrait ou relecture nettement plus lourde →
   agent, relecture renforcée ». `recommendFrom` (L1–L4) rend
   `not-enough-data` dès que l'écart n'est ni établi ni équivalent : avec
   69 % [50 ; 84] contre 87 % [71 ; 95], la différence n'est pas établie mais
   n'est pas non plus équivalente à 10 points près. Même cause pour la phrase du
   §12 : la case « migrations de données » de l'époque 3 sort **grise** et non
   orange. `CONTRACT-NEEDED: src/domain/recommendation.ts.recommendFrom`.
2. **La borne haute de la cohorte de PROJ-412 s'affiche 83 %, le §8 écrit 84.**
   `wilsonInterval(18, 26)` donne 0,834989 et `percent()` arrondit à 83. Le jeu
   affiche ce que l'app affiche.
3. **Trois scénarios de la base ne donnent pas la couleur annoncée par le
   brief.** Les cohortes `bugfix · api · S` (55 propres sur 60 contre 47 sur 55),
   `tests · web-ui · M` (44 sur 48 contre 38 sur 42) et `ui-change ·
   data-pipeline · M` (22 sur 34 contre 24 sur 30) portent des écarts qui ne
   sont ni établis ni équivalents à dix points : le domaine répond « on ne sait
   pas » là où le brief attend « verte » ou « orange ». Les effectifs sont
   ceux du brief, au chiffre près ; c'est la règle d'arbitrage du domaine
   (SPEC §7 règle 4) qui décide de la couleur. `CONTRACT-NEEDED:
   src/domain/recommendation.ts` — même cause que la divergence 1.

## 7. La télémétrie réelle : les sessions OpenCode récoltées

À côté du jeu d'exemple, le dépôt versionne une **récolte réelle** : les
sessions d'agent de code qu'un poste de travail a réellement exécutées
(`src/sample/opencode-real.json`, produit par le lot O1). Le site public la
publie sous la mention **« données réelles, anonymisées »**.

Ce qui est publié : des **agrégats seulement**. La récolte a déjà effacé le
titre, le chemin et l'identifiant de chaque session ; le panneau ne publie que
ce que le domaine calcule (`src/collect/opencode.ts`, `summarise`).

| Agrégat | Valeur | Ce qu'il dit |
|---|---|---|
| Sessions | 854 | le volume réel de travail d'agent observé |
| Coût | 0 € | les modèles utilisés étaient gratuits : la base locale n'enregistre aucun coût |
| Jetons | 250 513 633 | le volume de tokens réellement brûlés |
| Heures | 837,05 h | la durée cumulée des sessions |
| Modèles | 19 | la répartition par modèle est affichée avec sa part |
| Sessions rattachées à un ticket | 14 | les sessions du bac à sable OpenCode, où un agent a réellement travaillé sur les tickets `PROJ-101` à `PROJ-105` |

Deux règles tiennent ici comme partout ailleurs (DP-17, SPEC §20) : **aucune
donnée par personne**, et **une donnée absente reste absente** — le chiffre des
sessions rattachées à un ticket compte celles que la récolte a vraiment
retrouvées, ni plus ni moins.

## 8. Les panneaux du site public

Le site public (`site/`) rend le jeu ci-dessus : huit écrans et vingt-sept
panneaux de fonctionnalités. Tous sont produits par le **vrai domaine** appelé
sur le jeu d'exemple — aucun chiffre n'est écrit à la main — et
`site/demo-data.json` est régénéré par `MAJ_DEMO=1 npx vitest run tests/site`,
puis vérifié frais par un second passage.

Les dix panneaux ajoutés par le lot E11b, un par module du domaine :

| Panneau | Module appelé | Ce qu'il montre |
|---|---|---|
| `simulation` | `src/domain/simulation.ts` | la règle rejouée sous une autre variante, cohorte par cohorte, et le balayage des seuils |
| `inferenceCausale` | `src/domain/causal.ts` | l'E-value de l'écart observé, la borne de Rosenbaum de l'appariement, et la readiness qui dit toujours « pas causal » |
| `pooling` | `src/domain/pooling.ts` | chaque cohorte rapprochée du prior de sa nature, avec la force empruntée |
| `incertitude` | `src/domain/uncertainty.ts` | l'implication inconnue mesurée en bits, le nombre de tickets à lever, la probabilité de bascule |
| `preuve` | `src/domain/proof.ts` | les empreintes d'une décision, et le rejeu qui dit quelle valeur a bougé |
| `cout` | `src/domain/cost.ts` | le coût des deux options par cohorte, sur le modèle d'hypothèses affiché |
| `fraicheur` | `src/domain/freshness.ts` | l'âge de chaque lecture, son état, et ce que la prochaine collecte prend d'abord |
| `signauxFaibles` | `src/domain/signals.ts` | la précision de chaque signal mesurée sur les tickets étiquetés, et le plan de collecte |
| `coordinateur` | `src/domain/coordinator.ts` | la file de nuit (ce qui part, ce qui reste, et pourquoi) et le bilan du matin |
| `apiKit` | `src/mcp/schema.ts` | la version du schéma, les versions encore supportées, le verdict de compatibilité |

Le onzième panneau, `donneesReelles`, lit la récolte du §7 et affiche la
mention « données réelles, anonymisées ».
