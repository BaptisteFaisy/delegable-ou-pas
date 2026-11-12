# Plan de validation — les 9 points du §19 et les 16 points de recette du §22

SPEC §19, §22 · DP-18, DP-19. Deux parties : ce qu'il faut **valider sur un vrai
dépôt la première semaine** (les 9 points du §19), et ce qui est **déjà couvert
par un test** (les 16 points de recette du §22).

---

## 1. Les 9 points à valider par un prototype (SPEC §19)

Pour chacun : la question, comment la tester, ce que le code fait déjà, et la
solution de repli si la réponse est mauvaise.

### 1.1 Le champ `message` contient-il le message entier, dernière ligne comprise ?

- **Pourquoi.** Toute la reconnaissance automatique des mentions d'agent repose
  sur la dernière ligne d'un message de commit (`Co-authored-by: …`).
- **Comment tester.** Sur un dépôt relié, lire trois commits dont on connaît le
  message exact, avec une mention en dernière ligne, et comparer octet par
  octet ; vérifier aussi un message de fusion par écrasement (plusieurs lignes).
- **Ce que le code fait déjà.** Le catalogue de motifs est réglable et chaque
  motif vu est compté (`signature_pattern.seen_count`, DP-02) : si la dernière
  ligne est tronquée, l'écran de réglages montre zéro occurrence et l'équipe le
  voit. Les messages ne sont jamais stockés (SPEC §17).
- **Repli.** Déclaration MCP (source 1), champ à la clôture (source 4), compte
  robot (source 2) : les trois autres sources ne dépendent pas du message.

### 1.2 Volume et pagination des requêtes sur le graphe, dans le temps d'une session

- **Pourquoi.** Douze mois d'historique à lire, dans une session de 5 minutes.
- **Comment tester.** Chronométrer la lecture de 1 000 commits paginés, noter le
  nombre d'appels et le temps par page ; répéter à trois heures d'intervalle.
- **Ce que le code fait déjà.** La collecte est découpée en tranches avec un
  curseur repris où il s'est arrêté (DP-18, `graph_cursor`) ; aucune liste sans
  `LIMIT`, aucune requête sans `WHERE` (SPEC §18).
- **Repli.** Tranches plus petites, fenêtre ramenée à six mois.

### 1.3 Le graphe est-il lisible hors ligne, au nom d'un utilisateur ?

- **Pourquoi.** La collecte nocturne tourne sans visiteur.
- **Comment tester.** Déclencher une action hors ligne qui lit le graphe, et
  vérifier le résultat et le journal.
- **Ce que le code fait déjà.** Un droit manquant **vide** le résultat au lieu
  de lever (recette 15) ; l'écran de couverture affiche l'état de chaque droit.
- **Repli.** Collecte à l'ouverture des pages, par tranches.

### 1.4 La relation entre un incident JSM et un ticket est-elle exploitable par requête ?

- **Pourquoi.** La mesure « incident » est un des trois garde-fous et une cause
  d'échec.
- **Comment tester.** Sur un site avec JSM, relier un incident à un ticket et
  vérifier que la requête le remonte, dans les deux sens.
- **Ce que le code fait déjà.** `IssueLink.linkedIsIncident` distingue déjà le
  cas ; le jeu de démonstration porte un incident ouvert (`PROJ-455` lié à
  `PROJ-456`) et la carte refuse « à confier ».
- **Repli.** Les liens Jira entre tickets, déclarés par l'équipe.

### 1.5 Le nombre d'allers-retours de relecture est-il accessible ?

- **Pourquoi.** « Relecture nettement plus lourde » est une des entrées de la
  recommandation.
- **Comment tester.** Comparer, sur dix pull requests, le nombre d'allers-retours
  réels et ce que le graphe expose.
- **Ce que le code fait déjà.** Le graphe ne donne que l'avis **actuel** de
  chaque relecteur : la charge est approchée par les commentaires et les commits
  ajoutés après l'ouverture (`ReviewFact.commentCount`, `commitsAfterOpen`), et
  cette approximation est affichée comme telle.
- **Repli.** Conserver l'approximation, et ne jamais en faire un motif de
  verdict seul.

### 1.6 Fusion par écrasement : la mention survit-elle dans le commit final ?

- **Pourquoi.** Une équipe qui fusionne en écrasant peut perdre toute trace de
  l'agent.
- **Comment tester.** Sur un dépôt de test, fusionner une branche dont un commit
  porte une mention, puis relire le commit de fusion et les commits de la
  branche.
- **Ce que le code fait déjà.** Les commits de la branche restent liés au
  ticket ; la reconnaissance ne dépend pas du seul commit de fusion.
- **Repli.** Déclaration MCP et compte robot.

### 1.7 La taille des tickets est-elle disponible ?

- **Pourquoi.** La taille est une des trois clés d'une cohorte.
- **Comment tester.** Mesurer, sur un projet réel, la part de tickets portant
  des story points.
- **Ce que le code fait déjà.** `IssueClass.sizeEstimated` distingue une taille
  mesurée d'une taille estimée, et l'écran le dit (SPEC §19).
- **Repli.** Taille estimée d'après la durée des tickets semblables.

### 1.8 La qualité du classement de nature est-elle suffisante ?

- **Pourquoi.** La nature est la première clé d'une cohorte.
- **Comment tester.** Classer 50 tickets à la main, comparer avec le classement
  automatique, mesurer l'accord.
- **Ce que le code fait déjà.** Les règles passent d'abord, le modèle ensuite,
  la correction manuelle est conservée avec son empreinte (`classifiedBy`,
  `contentHash`, DP-06).
- **Repli.** Le type de ticket et les étiquettes.

### 1.9 Quels sont les effectifs réels d'une équipe moyenne sur six mois ?

- **Pourquoi.** Tout le produit : sous vingt tickets par bras, l'app ne conclut
  pas.
- **Comment tester.** Compter, sur trois projets réels, les tickets clos par
  cohorte et par bras sur six mois.
- **Ce que le code fait déjà.** Le repli de cohorte (nature · zone · taille →
  nature · taille → nature) est automatique et **visible** (SPEC §7 règle 1) ;
  « on ne sait pas » est une conclusion à part entière. Sur le jeu de
  démonstration, 23 cohortes sur 26 restent grises : c'est l'ordre de grandeur
  attendu d'une équipe réelle.
- **Repli.** Cohortes plus larges, seuil réglable, et « on ne sait pas ».

---

## 2. Les 16 points de recette du §22 et le test qui les couvre

| # | Recette | Test qui la couvre |
|---|---|---|
| 1 | Un ticket dont un commit porte une mention d'agent est classé « avec agent », source « mention de commit » | `tests/domain/involvement.test.ts`, `tests/domain/signatures.test.ts` |
| 2 | Un ticket sans aucun élément est classé « inconnue » et n'entre dans aucun bras | `tests/domain/involvement.test.ts`, `tests/sample/dataset.test.ts` (369 implications inconnues, aucun client ni modèle) |
| 3 | Un ticket clos avant la date d'adoption entre dans le bras « sans agent » | `tests/sample/figures.test.ts` (les 9 tickets d'avant adoption, époque 1) — **à couvrir côté domaine** |
| 4 | Un ticket rouvert sous 30 jours n'est pas une clôture propre | `tests/domain/outcome.test.ts` |
| 5 | Un ticket clos il y a dix jours n'entre pas encore dans le taux | `tests/domain/maturity.test.ts`, `tests/sample/dataset.test.ts` (jugeabilité à la date de référence) |
| 6 | Une cohorte de 12 et 15 tickets affiche « pas assez de recul » | `tests/domain/conclusion.test.ts`, `tests/sample/figures.test.ts` (les cohortes fines restent grises) |
| 7 | Deux bras de composition trop différente affichent « bras déséquilibrés », sans conclusion | `tests/domain/balance.test.ts`, `tests/sample/figures.test.ts` (22 contre 3, `balanced = false`) |
| 8 | Une cohorte à l'écart établi en défaveur des agents produit « à garder pour un humain » | `tests/domain/recommendation.test.ts`, `tests/sample/figures.test.ts` (migration · facturation · époque 2) |
| 9 | Un ticket lié à un incident ouvert ne reçoit jamais « à confier à un agent », et la carte dit pourquoi | `tests/viewmodel/issue-card.test.ts`, `tests/domain/recommendation.test.ts`, `tests/sample/figures.test.ts` (`PROJ-455`) |
| 10 | Aucun écran n'affiche un taux sans son effectif et sa fourchette | `tests/domain/stats.test.ts`, `tests/viewmodel/*.test.ts`, `tests/i18n/parity.test.ts`, `tests/actions/tools.test.ts` |
| 11 | Une cohorte portée par deux personnes est masquée | `tests/domain/privacy.test.ts`, `tests/viewmodel/cohort-detail.test.ts`, `tests/viewmodel/delegation-map.test.ts` |
| 12 | Aucun outil MCP ne renvoie de nom de personne | `tests/actions/privacy-validation.test.ts`, `tests/viewmodel/anonymity.test.ts`, `tests/db/schema.test.ts`, `tests/sample/dataset.test.ts` |
| 13 | `list-delegable-work` ne renvoie que des tickets « à confier » | `tests/actions/privacy-validation.test.ts`, `tests/actions/tools.test.ts`, `tests/viewmodel/sprint.test.ts` |
| 14 | Un changement d'époque sépare les statistiques | `tests/domain/epochs.test.ts`, `tests/actions/tools.test.ts`, `tests/sample/figures.test.ts` (trois époques, une à la fois) |
| 15 | Un droit manquant sur le graphe apparaît à l'écran de couverture, au lieu d'un zéro silencieux | `tests/collect/coverage.test.ts` |
| 16 | Dans un essai, un tirage non respecté sort le ticket de l'essai | `tests/domain/trial.test.ts`, `tests/db/stores-advice.test.ts` |

**À couvrir encore** : la recette 3 côté domaine (le test du jeu la couvre par
la donnée, pas par la règle). Une PR dédiée doit ajouter le cas dans
`tests/domain/involvement.test.ts`.

---

## 3. Ordre de passage conseillé

| Semaine | Ce qui est validé |
|---|---|
| Première semaine | les points 1.1, 1.2, 1.3 (message complet, volume, hors ligne) sur un vrai dépôt |
| Deuxième semaine | les points 1.4, 1.5, 1.6 (incidents, relecture, fusion par écrasement) |
| Troisième semaine | les points 1.7, 1.8, 1.9 (taille, nature, effectifs réels) |
| En continu | les 16 recettes, à chaque PR, par la CI |

Chaque validation produit une note dans `docs/research/` : ce qui est vérifié,
ce qui ne l'est pas, et le repli retenu. Aucune validation n'est considérée
comme acquise parce qu'une source tierce l'affirme (SPEC §19 : « connu par des
sources tierces, à confirmer sur les dépôts de l'équipe »).
