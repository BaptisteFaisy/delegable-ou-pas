# Méthode — la statistique opposable de « Délégable ou pas ? »

Ce document dit **comment** l'app calcule, et pourquoi ces choix-là. Il est
opposable : un chiffre affiché sans ce qu'il demande ici est un défaut, pas un
détail. Le « quoi » est dans le [cahier des charges](CAHIER-DES-CHARGES.md)
(cité `SPEC §n`), le « qui possède quoi » dans
[CONTRACTS.md](CONTRACTS.md).

> Règle unique qui tient tout le reste : **aucun taux sans son effectif, aucun
> taux sans sa fourchette, aucune durée sans dire que c'est une médiane.**
> (SPEC §7 règle 3, §20 ; recette 10.)

## 1. L'intervalle de Wilson, z = 1,96

Une proportion mesurée sur un échantillon n'est pas la proportion vraie. On
donne donc une fourchette : celle dans laquelle la valeur vraie tombe avec une
confiance de 95 %.

**L'intervalle de score de Wilson** (1927), pour `x` succès sur `n` essais,
`p̂ = x / n` et `z = 1,96` :

```text
        p̂ + z²/(2n)          z            ┌ p̂(1 − p̂)     z²  ┐
centre = ────────────    demi = ─────── ×  │ ────────  + ────── │
          1 + z²/n              1 + z²/n   └     n        4n²  ┘

Wilson = [ centre − demi ; centre + demi ],  écrêté à [0 ; 1]
```

Ce n'est pas un détail d'implémentation : c'est le seul estimateur qui redonne
les trois exemples du cahier des charges (§2). L'intervalle de Wald
(`p̂ ± z·√(p̂(1−p̂)/n)`), le plus répandu, ne les redonne pas.

## 2. La démonstration chiffrée : Wilson est le bon estimateur

Les trois jeux du SPEC, recalculés à la main avec la formule ci-dessus
(`z = 1,96`, `z² = 3,8416`).

### 34 succès sur 41 — SPEC §7 règle 3, l'exemple de la comparaison

```text
p̂ = 34/41 = 0,8293
dénominateur = 1 + 3,8416/41 = 1,0937
centre = (0,8293 + 3,8416/82) / 1,0937 = (0,8293 + 0,04685) / 1,0937 = 0,8011
demi   = (1,96 / 1,0937) × √(0,8293×0,1707/41 + 3,8416/(4×1681))
       = 1,7921 × √(0,003453 + 0,000571) = 1,7921 × 0,06344 = 0,1137
Wilson = [0,6874 ; 0,9148]  →  [69 % ; 91 %]
Wald   = 0,8293 ± 1,96×√(0,8293×0,1707/41) = [0,7141 ; 0,9444]  →  [71 % ; 94 %]
```

Le SPEC écrit **« entre 69 et 91 % »**. Wilson tombe juste ; Wald donne
71–94 %, hors du texte.

### 32 succès sur 37 — SPEC §7 règle 3, le bras sans agent

```text
p̂ = 32/37 = 0,8649
centre = (0,8649 + 3,8416/74) / (1 + 3,8416/37) = (0,8649 + 0,05191) / 1,1038 = 0,8305
demi   = (1,96 / 1,1038) × √(0,8649×0,1351/37 + 3,8416/(4×1369)) = 0,1103
Wilson = [0,7202 ; 0,9408]  →  [72 % ; 94 %]        ✔ SPEC
Wald   = [0,7547 ; 0,9750]  →  [76 % ; 98 %]        ✘
```

### 18 succès sur 26 — SPEC §8, la carte de PROJ-412

```text
p̂ = 18/26 = 0,6923
centre = (0,6923 + 3,8416/52) / (1 + 3,8416/26) = (0,6923 + 0,07388) / 1,1478 = 0,6676
demi   = (1,96 / 1,1478) × √(0,6923×0,3077/26 + 3,8416/(4×676)) = 0,1674
Wilson = [0,5002 ; 0,8350]  →  [50 % ; 84 %]        ✔ SPEC
Wald   = [0,5149 ; 0,8697]  →  [51 % ; 87 %]        ✘
```

### Ce que la comparaison prouve

| Jeu du SPEC | SPEC affiche | Wilson | Wald |
|---|---|---|---|
| 34 / 41 | [69 % ; 91 %] | **[69 ; 91]** ✔ | [71 ; 94] ✘ |
| 32 / 37 | [72 % ; 94 %] | **[72 ; 94]** ✔ | [76 ; 98] ✘ |
| 18 / 26 | [50 % ; 84 %] | **[50 ; 84]** ✔ | [51 ; 87] ✘ |

Trois exemples sur trois, Wilson seul les retrouve. C'est la raison du choix, et
pourquoi le test `tests/domain/stats.test.ts` les vérifie nommément : si un lot
« améliore » la formule, ces trois tests virent au rouge.

**Propriétés utiles de Wilson**, qui comptent pour ce produit :

- il reste dans `[0 ; 1]` et ne s'effondre pas à `0 %` ou `100 %` — contrairement
  à Wald, qui rend une fourchette de largeur nulle sur `0/20` ou `20/20` (donc
  « certitude » sur rien) ;
- il est asymétrique près des bornes, ce qui est le cas normal d'une clôture
  propre (souvent 70–90 %, parfois 0 sur 12) ;
- il est calculable sans table, sans dépendance : `z = 1,96` en constante,
  quelques opérations.

**Règle d'affichage** : un taux sort **toujours** accompagné de `n`, `ciLow` et
`ciHigh` (type `ProportionStat`, `src/types.ts`). Quand `n = 0`, la fourchette
est `[0 ; 1]` : l'app dit « pas de données », elle n'affiche pas `0 %`.

## 3. Les durées : médianes, en heures, hors attente

**Jamais de moyenne sur une durée.** Une seule PR oubliée trois semaines
suffit à déplacer une moyenne et à faire dire au produit l'inverse de la
vérité ; la médiane, non (SPEC §6, cas limite §21 « ticket resté ouvert trois
mois : la médiane l'absorbe »).

- unité : **heures** (`Outcome.leadTimeH`, `DurationStat.medianH`) ;
- point de départ : le **premier** passage du ticket en « En cours » ;
- point d'arrivée : la clôture ;
- les **statuts d'attente** (attente client, attente fournisseur, à arbitrer…)
  sont retirés : ils ne mesurent pas le travail. La liste est réglable par
  projet (`ProjectSettings.waitingStatuses`, SPEC §16.5) ;
- un ticket encore ouvert n'entre dans aucun délai ;
- nombre pair de valeurs : moyenne des deux centrales — c'est la seule moyenne
  autorisée du produit, et elle porte sur deux nombres ;
- toute durée s'affiche avec son `n` (`DurationStat`), comme un taux.

La relecture suit la même logique : `reviewLoad` (relecteurs, demandes de
changement, commentaires) est un **chargement**, comparé entre deux bras,
jamais un score par personne (SPEC §6, DP-17).

## 4. Le seuil d'effectif : 20 par bras, réglable

- **Vingt tickets par bras par défaut** (`DEFAULT_MIN_ARM_SIZE = 20`,
  `ProjectSettings.minArmSize`), réglable par projet.
- Sous le seuil, pour **l'un** des deux bras : la conclusion est
  `not-enough-data`, et l'app n'affiche **pas** un chiffre nu. Elle propose de
  remonter d'un niveau de cohorte (SPEC §7 règle 1 : nature et taille, toutes
  zones) — et si ça ne suffit toujours pas, elle le dit.
- Le seuil ne descend pas sous 10 : en dessous, l'intervalle de Wilson est plus
  large que l'écart qu'on prétend mesurer. Un réglage à 3 est une faute de
  méthode, pas une préférence.
- Recette 6 : une cohorte de 12 et 15 tickets affiche « pas assez de recul ».

## 5. La maturité : 30 jours pour la réouverture, 60 pour la clôture propre

Un ticket clos hier ne peut pas être jugé : le bug qui le suivra n'existe pas
encore.

| Fenêtre | Durée | Ce qu'elle mesure |
|---|---|---|
| Réouverture | **30 jours** | retour d'un statut terminé vers un statut ouvert |
| Clôture propre | **60 jours** | ni réouverture, ni bug causé, ni incident |

- Un ticket non mûr **sort du taux** : il n'est pas compté « propre » par
  défaut, il n'est pas compté du tout (recette 5, `maturity.ts`).
- La réouverture administrative (moins de dix minutes) est écartée : elle ne
  dit rien du travail (SPEC §6).
- Le **bug voisin** (même composant, sous 30 jours, citant le ticket) est
  affiché **à part** et n'entre jamais dans la clôture propre : signal faible
  (SPEC §6).
- L'écran de couverture signale une équipe qui ne relie jamais ses bugs : la
  clôture propre repose alors sur les réouvertures et les incidents, et l'app
  le dit au lieu de laisser croire à une mesure complète (cas limite §21).

## 6. Les quatre conclusions, dont « on ne sait pas »

Une comparaison rend une valeur parmi **quatre** (SPEC §7 règle 4), dans cet
ordre d'arbitrage :

| Conclusion | Quand | Ce que l'app affiche |
|---|---|---|
| `not-enough-data` | un bras sous le seuil, ou absent ; ou bras déséquilibrés | « pas assez de recul », les effectifs et **pas** de verdict |
| `better` | fourchettes **disjointes**, celle de l'agent au-dessus | « plus de clôtures propres avec agent », écart établi |
| `worse` | fourchettes **disjointes**, celle de l'agent en dessous | « à garder pour un humain », écart établi |
| `same` | fourchettes qui se **recouvrent** | « écart non établi » |

« On ne sait pas » n'est **pas** une absence de réponse : c'est une conclusion,
affichée comme les autres, avec les chiffres qui la fondent. Un gris honnête
vaut mieux qu'un vert faux (SPEC §26). Conséquence directe : le gris est une
couleur de la carte de délégation au même titre que le vert, l'orange et le
rouge (SPEC §12).

La règle du recouvrement est volontairement **sévère** : deux fourchettes qui se
touchent, même de peu, ne font pas un écart. C'est ce qui distingue « constaté »
de « établi » (§9).

## 7. L'alerte « bras déséquilibrés »

Les cohortes réduisent le biais de sélection, elles ne l'éliminent pas : on a
confié aux agents les tickets faciles. La taille et la nature sont dans la
cohorte ; la **composition** des deux bras est comparée (SPEC §7 règle 5,
DP-10).

- critères comparés : part des tailles, part des natures, écart de volume ;
- seuil : **20 points de pourcentage** d'écart par défaut
  (`DEFAULT_BALANCE_TOLERANCE = 0.20`), paramétrable par projet ;
- au-delà : `balanced = false`, l'app affiche **« bras déséquilibrés »** et
  **interdit de conclure** — la conclusion forcée est `not-enough-data`
  (recette 7), quels que soient les taux.

Le cas limite « la cohorte où tout est désormais confié aux agents » (plus de
bras humain) tombe ici : l'app compare à l'époque précédente et propose un
essai contrôlé (SPEC §21, §11).

## 8. Les époques : on ne mélange jamais deux époques

Une **époque** est une période pendant laquelle les agents de l'équipe n'ont pas
changé : même outil, même modèle, mêmes consignes (SPEC §4, DP-22).

- un changement d'outil, de modèle ou de version de consignes **ouvre** une
  époque (`opensNewEpoch`, `src/domain/epochs.ts`) ;
- aucun agrégat ne traverse deux époques : les chiffres d'une cohorte sont
  toujours calculés **époque par époque** (recette 14) ;
- les époques passées restent **visibles, grisées** — on ne réécrit pas
  l'histoire, on la date. L'écran dit par exemple : « depuis l'époque 3
  (nouveau modèle, 14 septembre), les migrations de données sont passées du
  rouge à l'orange » (SPEC §12).

Un total qui mélangerait deux époques serait un faux : c'est pourquoi la clé
d'une statistique de cohorte contient toujours `epochId`
(`CohortKey`, `CohortStat.epochId`).

## 9. L'anonymat : la condition d'acceptabilité du produit

Ce n'est pas une politesse, c'est ce qui empêche l'app d'être un outil de
notation des personnes (SPEC §20 « Pas un outil de notation »).

- **aucune statistique par personne** : ni par développeur, ni par relecteur,
  ni par auteur de commit ;
- une cohorte portée par **moins de trois personnes** est **masquée**
  (`MIN_PEOPLE = 3`, `maskCohort`) : l'app ne montre ni taux, ni effectif
  détaillé (recette 11) ;
- `peopleCount` ne sert **qu'à** masquer : c'est la seule colonne de personne
  tolérée, et elle est un compte, jamais un identifiant (SPEC §18 dernière
  ligne) ;
- aucun écran, aucun export, aucun outil MCP ne rend un nom (recette 12) ;
- les identifiants de compte lus sur le graphe (`authorAccountId`,
  `GraphReviewer.accountId`) servent uniquement à **compter des distincts** ou à
  détecter un compte robot ; ils ne sont jamais affichés ni stockés dans une
  table de statistiques.

Corollaire : une équipe de trois personnes verra la plupart de ses cohortes
masquées. L'app ne le déplore pas, elle l'explique et ne montre que le niveau du
projet (cas limite §21).

## 10. Le vocabulaire opposable

Trois mots, trois niveaux de certitude. Les employer à mauvais escient est un
défaut de recette, pas une nuance de rédaction.

| Mot | Ce qu'il exige | Où il s'emploie |
|---|---|---|
| **« constaté »** | un fait, une mesure, sans inférence : « 83 % de clôtures propres avec agent sur 41 tickets » | partout, avec `n` et fourchette |
| **« écart établi »** | les deux fourchettes sont **disjointes** ; la conclusion est `better` ou `worse` | comparaison de cohorte |
| **« écart non établi »** | les fourchettes se recouvrent, ou l'effectif manque : on ne tranche pas | comparaison de cohorte |
| **« prouvé »** | **réservé à l'essai contrôlé** (SPEC §11) : tirage au sort, bras comparables par construction, aucun biais de sélection possible | uniquement pour un résultat d'essai |

Aucun autre usage de « prouvé » n'est admis — pas dans un écran, pas dans un
document, pas dans une réponse d'agent Rovo. Une corrélation constatée n'est pas
une cause ; l'app le dit avec ces trois mots, et se tait le reste du temps.

## 11. Les huit règles du SPEC §7 et le module qui les applique

Les huit règles sont « appliquées partout » (SPEC §7). Chacune a **un** endroit
où elle vit, ce qui évite qu'elle soit réimplémentée — et oubliée — ailleurs.

| # | Règle (SPEC §7) | Module qui l'applique | Exigence |
|---|---|---|---|
| 1 | on compare dans une cohorte ; trop petite → on remonte d'un niveau, et on le dit | `src/domain/cohort.ts` (`cohortKeyOf`, `widen`) | DP-07 |
| 2 | effectif minimal de 20 par bras, réglable ; en dessous « pas assez de recul » | `src/domain/stats.ts` + `src/domain/conclusion.ts` | DP-08 |
| 3 | jamais un taux sans effectif ni fourchette | `src/domain/stats.ts` (`wilsonInterval`, `proportion`) | DP-08 |
| 4 | quatre conclusions, dont « on ne sait pas » | `src/domain/conclusion.ts` (`conclude`) | DP-09 |
| 5 | biais de sélection traité puis signalé : « bras déséquilibrés » interdit de conclure | `src/domain/balance.ts` (`compareBalance`) | DP-10 |
| 6 | une époque à la fois | `src/domain/epochs.ts` (`epochAt`, `isOutdated`) | DP-22 |
| 7 | aucun chiffre global sans sa décomposition | `src/domain/recommendation.ts` + `src/viewmodel/map.ts` | DP-14 |
| 8 | jamais par personne ; cohorte sous trois personnes masquée | `src/domain/privacy.ts` (`maskCohort`) | DP-17 |

Trois règles méritent un mot de plus, parce qu'elles se perdent facilement dans
un écran :

- **règle 3** : le type `ProportionStat` porte `n`, `rate`, `ciLow`, `ciHigh`
  ensemble — il n'existe pas de type « taux seul » dans le contrat. C'est
  volontaire.
- **règle 7** : un total peut contredire toutes ses parties (cas limite §21).
  L'app n'affiche jamais « les agents font mieux » sans la carte par cohorte.
- **règle 8** : le masquage est une **suppression**, pas un floutage : le
  chiffre n'existe pas dans la réponse (recette 11, recette 12).

## 12. La calibration : l'app se note elle-même

Une app qui recommande doit montrer si ses avis valent quelque chose (SPEC §10,
DP-21).

- chaque recommandation donnée est rapprochée de ce qui est **réellement arrivé**
  au ticket (clôture propre constatée) ;
- même un avis ignoré entre dans le calcul : « recommandation ignorée, bon
  résultat » compte comme le reste (cas limite §21) ;
- la comparaison décisive est « à confier » contre « à garder » : si leurs
  fourchettes **se recouvrent**, l'app écrit en tête de page que ses avis
  n'apportent rien sur ce projet et **élargit** « pas assez de recul »
  (`adviceAddsNothing`, `src/domain/calibration.ts`) ;
- l'écran s'appelle « Peut-on croire cette app ? » et est accessible à tous
  (SPEC §10, §16.7).

## 13. L'essai contrôlé : le seul chiffre « prouvé »

Les cohortes réduisent le biais de sélection ; seul le hasard l'écarte
(SPEC §11, DP-27).

1. l'équipe choisit une cohorte où la conclusion est `not-enough-data` ;
2. pendant quatre semaines, chaque ticket admissible (prêt, non urgent, hors
   zone sensible) reçoit un **tirage** reproductible — même graine, même
   ticket, même bras — affiché sur le ticket ;
3. un tirage non respecté **sort** le ticket de l'essai, avec son motif
   (recette 16) ;
4. l'essai s'arrête sur écart établi, à la date prévue, ou si un bras accumule
   les réouvertures ;
5. le résultat porte la mention « essai » : c'est le seul que l'app qualifie de
   **prouvé** (§10).

L'essai se décide en équipe, et tout ticket peut en être retiré. Un essai dont
le tirage n'est pas respecté ne prouve rien : il est compté, puis exclu.

## 14. Ce que la méthode interdit, en une liste

À vérifier avant de livrer un module ou un écran :

- un taux sans `n` → interdit (règle 3) ;
- un taux sans fourchette → interdit (règle 3, recette 10) ;
- une moyenne de durées → interdite (§3) ;
- un délai en jours flottants → à proscrire, l'unité est l'heure (§3) ;
- une conclusion globale sans décomposition → interdite (règle 7) ;
- une comparaison entre deux époques → interdite (règle 6) ;
- une statistique par personne → interdite (règle 8, recette 11) ;
- l'usage de « prouvé » hors essai contrôlé → interdit (§10) ;
- conclure malgré des bras déséquilibrés → interdit (règle 5, recette 7) ;
- compter un ticket non mûr comme propre → interdit (§5, recette 5) ;
- compter `unknown` comme « sans agent » → interdit (DP-03, recette 2).

Ces interdits sont couverts par des tests nommés d'après le comportement, dans
`tests/domain/` et `tests/acceptance/` (recettes 1 à 16, SPEC §22).
