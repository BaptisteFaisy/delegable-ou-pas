# `src/sample/**` — le jeu de données de démonstration

SPEC §13, §24 · DP-20. Le jeu d'exemple du projet « Délégable ou pas ? » :
douze mois d'historique, trois époques, un projet Jira fictif `PROJ`, et tout ce
que l'app mesure — commits, pull requests, résultats, implications,
classements, cartes de recommandation, essai contrôlé.

**Ce module est du domaine pur** : aucun `@forge/*`, aucune base, aucune
horloge. La date de référence est fixée dans `project.ts`, donc les chiffres
sont identiques à chaque exécution. Le mode démonstration (lot L7) branche ces
fonctions à la place des passerelles Forge.

## Les modules

| Fichier | Rôle |
|---|---|
| `project.ts` | identité du projet, réglages, calendrier fixé, helpers de dates, clés réservées |
| `epochs.ts` | les trois époques (SPEC §4, §12) : la troisième s'ouvre sur un nouveau modèle |
| `issues.ts` | le **catalogue des familles** (la source unique des chiffres) et la forme d'une graine |
| `builder.ts` | le générateur : familles → graines (`ticketSeeds()`) |
| `history.ts` | la vie d'un ticket : `JiraTicket`, `IssueClass`, `Involvement`, historique de statuts, réouvertures |
| `commits.ts` | les faits de commit et le catalogue de mentions (DP-02) |
| `pull-requests.ts` | les faits de relecture |
| `outcomes.ts` | les résultats et les liens entre tickets |
| `index.ts` | **l'API publique**, les cartes de recommandation, l'essai contrôlé |

## L'API publique

```ts
import {
  SAMPLE_IS_MARKED_AS_DEMO, SAMPLE_PROJECT_KEY,
  sampleSettings, sampleEpochs, sampleTickets, sampleCommitFacts,
  sampleReviewFacts, sampleOutcomes, sampleInvolvements, sampleClasses,
  sampleCards, sampleTrial,
} from './index.js';
```

S'y ajoutent, pour les écrans et les tests : `sampleSeeds()`, `sampleHistories()`,
`sampleReopenings()`, `sampleLinks()`, `sampleSignaturePatterns()`.

## Comment les chiffres sont produits

1. `issues.ts` déclare des **familles** paramétrables : une cohorte
   (nature · zone · taille), une époque, deux bras (avec agent, sans agent), un
   nombre d'implications inconnues, une fenêtre de dates, et un plan d'échecs
   compact (`FailurePlan`). Aucune copie de 300 tickets littéraux.
2. `builder.ts` étale les tickets dans la fenêtre, distribue les échecs, fait
   tourner les niveaux et les sources, et donne les clés : les tickets cités par
   le SPEC gardent une clé **fixe** (`SAMPLE_PINS`).
3. `history.ts`, `commits.ts`, `pull-requests.ts` et `outcomes.ts` transforment
   chaque graine en faits stockés.
4. `index.ts` fait calculer les cartes par le **domaine mergé** : `wilsonInterval`
   et `median` (`domain/stats`), `conclude` et `wording` (`domain/conclusion`),
   `compareBalance` et `composition` (`domain/balance`), `recommendFrom`,
   `guardrails`, `confidenceOf` et `conditionsFor` (`domain/recommendation`),
   `judgeableAt` (`domain/maturity`). **Aucune règle n'est réimplémentée ici.**

## Les invariants du jeu

- une famille déclare autant d'échecs que de tickets non propres
  (`count - clean = reopened + causedBugs + abandoned`) — un test le vérifie ;
- les incidents et les reprises sont des **modificateurs** d'un échec, pas des
  échecs supplémentaires ;
- aucune date hors des douze mois de la fenêtre ;
- aucun nom de personne : des rôles et le compte robot `agent-bot-1` (DP-17) ;
- une implication inconnue ne porte ni client, ni modèle, ni session (DP-03) ;
- le jeu est marqué comme démonstration partout : `demo: true`, étiquette
  `demo-dataset` dans `customfield_10022`, étiquette `demo` sur chaque ticket,
  bandeau, `SAMPLE_IS_MARKED_AS_DEMO`.

## Où sont les chiffres attendus

`docs/DEMO-DATA.md` les liste (tableaux `FIG-nn`) et `tests/sample/docs.test.ts`
les recalcule depuis le jeu : modifier une famille sans mettre le document à
jour fait rougir la CI. Les trois jeux de chiffres du SPEC §7/§8 et les quatre
couleurs de la carte de délégation sont vérifiés par `tests/sample/figures.test.ts`.
