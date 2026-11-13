# Le mode sans données fictives

Le jeu de démonstration (2 939 tickets, douze mois d'historique, trois époques)
est **fictif, et affiché comme tel** dans l'interface et sur le site public :
c'est l'exigence DP-20 du cahier des charges, et c'est une question
d'honnêteté — un faux graphe Atlassian présenté comme réel serait exactement
le mensonge que l'app prétend éviter.

Reste une question qu'un juge pose toujours : **et sans le jeu de
démonstration, que dit l'application ?** C'est ce que répond ce mode.

## Ce que la télémétrie réelle contient

| agrégat | valeur (récolte du 13 novembre 2026) |
| --- | --- |
| sessions exécutées par un agent | 865 |
| sessions rattachées à un ticket | 25 |
| tickets distincts | 5 |
| heures d'exécution | 837,34 |
| jetons | 250 672 611 |
| modèles | 20 |
| coût des modèles | 0 € (les modèles utilisés sont gratuits) |

## Ce que l'app peut en dire

**Rien de décisionnel.** Et c'est le résultat honnête, pas une absence de
travail : la méthode de l'app (SPEC §7) compare **deux bras** sur un même
ticket — un ticket traité par un agent, le même ticket traité par un humain —
et l'**issue** mesuré (le travail a-t-il tenu ?). Sur la télémétrie seule :

- on sait qu'un agent a travaillé sur 5 tickets ;
- on n'a **aucun bras humain** observé sur ces mêmes tickets ;
- on n'a **aucun issue mesuré** (la base ne le porte pas).

Le mode mesure donc ses propres blocages (`src/domain/real-only.ts`) :

| blocage | ce qu'il signifie |
| --- | --- |
| `pas-de-bras-humain` | aucun bras humain observé sur les mêmes tickets |
| `issue-inconnu` | aucun issue mesuré (le travail a-t-il tenu ?) |
| `cohorte-trop-petite` | moins de 2 sessions par ticket |

Et il affiche le verdict : **« la donnée réelle ne permet pas encore de
décider »**, avec la liste de ce qu'il faudrait (un bras humain, des issues
mesurés, des cohortes plus grandes).

## Pourquoi c'est valuable

Une démo flatteuse montre ce que l'app sait faire. Ce mode montre **ce que
l'app refuse de dire** — et c'est la moitié du produit. Le gris n'est pas un
échec d'affichage : c'est une conclusion, la seule que les données permettent.

## La session unifiée

`src/collect/session-reelle.ts` donne à toute session d'agent la même forme,
quel que soit le client qui l'a exécutée (OpenCode aujourd'hui, Claude Code
ensuite — cf. `docs/CONTRATS-REALITE.md`). Règle centrale : **absent = `-1`,
jamais `0`**. Zéro veut dire « mesuré, valait zéro » ; `-1` veut dire « on ne
sait pas », et c'est affichable.
